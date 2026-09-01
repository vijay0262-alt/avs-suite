"""AI Duplicate Intelligence — smart duplicate resolution with context awareness.

Finds duplicate files and intelligently recommends which copy to keep based on:
  - File location (prefer organized locations over temp/downloads)
  - File age (prefer newer copies)
  - File path depth (prefer shallower, more accessible locations)
  - File name quality (prefer descriptive names over random/temp names)
  - Whether the file is in a user folder vs system/temp folder
  - Whether the file appears to be an original vs a copy

Each duplicate group gets a "keep" recommendation with a confidence score
and reasoning, so the user can make informed decisions.

Data is stored in ~/.avs/duplicate_intel_data.json.

RPC methods:
    duplicate_intel.scan           — scan for duplicates in specified paths
    duplicate_intel.status         — get scan status and stats
    duplicate_intel.listGroups     — list duplicate groups with recommendations
    duplicate_intel.dismissGroup   — dismiss a duplicate group
    duplicate_intel.deleteFile     — delete a specific duplicate file (Pro only)
    duplicate_intel.deleteRecommended — delete all recommended-for-deletion files (Pro only)
    duplicate_intel.clearAll       — clear all results
    duplicate_intel.configure      — update config (Pro only)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.duplicate_intel")

_DATA_PATH = os.path.join(os.path.expanduser("~"), ".avs", "duplicate_intel_data.json")

_DEFAULT_CONFIG = {
    "enabled": True,
    "minFileSizeKB": 1,  # Skip files smaller than 1 KB
    "maxFileSizeMB": 500,  # Skip files larger than 500 MB
    "scanPaths": [],  # Empty = scan user folders (Documents, Downloads, Desktop, Pictures, Videos, Music)
    "excludePaths": ["\\AppData\\", "\\Windows\\", "\\Program Files", "\\.git\\"],
    "hashAlgorithm": "md5",  # md5 (fast) or sha256 (thorough)
    "maxGroups": 500,  # Max duplicate groups to store
}

# Path priority — lower is better (more likely to be the "original")
_PATH_PRIORITY = [
    ("\\Documents\\", 1),    # Organized user content — highest priority
    ("\\Desktop\\", 2),      # User workspace
    ("\\Pictures\\", 3),     # Media libraries
    ("\\Videos\\", 3),
    ("\\Music\\", 3),
    ("\\Downloads\\", 5),    # Downloads — likely a copy
    ("\\AppData\\", 8),      # App data — likely cache/temp
    ("\\Temp\\", 9),         # Temp — lowest priority
    ("\\temp\\", 9),
]

# Bad name patterns (less likely to be the original)
_BAD_NAME_PATTERNS = ["copy", "copy(", " - copy", "_copy", " (1)", " (2)", " - copy(", "duplicate", "backup"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_DATA_PATH), exist_ok=True)


def _load_data() -> dict[str, Any]:
    if not os.path.isfile(_DATA_PATH):
        return {"groups": [], "config": _DEFAULT_CONFIG.copy(), "stats": {"totalScans": 0, "totalGroups": 0, "totalFilesDeleted": 0, "totalBytesFreed": 0}}
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "groups" not in data:
            data["groups"] = []
        if "config" not in data:
            data["config"] = _DEFAULT_CONFIG.copy()
        if "stats" not in data:
            data["stats"] = {"totalScans": 0, "totalGroups": 0, "totalFilesDeleted": 0, "totalBytesFreed": 0}
        return data
    except (ValueError, OSError):
        return {"groups": [], "config": _DEFAULT_CONFIG.copy(), " stats": {"totalScans": 0, "totalGroups": 0, "totalFilesDeleted": 0, "totalBytesFreed": 0}}


def _save_data(data: dict[str, Any]) -> bool:
    _ensure_dirs()
    try:
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save duplicate intelligence data: %s", e)
        return False


def _get_default_scan_paths() -> list[str]:
    """Get default user folders to scan."""
    home = os.path.expanduser("~")
    candidates = ["Documents", "Downloads", "Desktop", "Pictures", "Videos", "Music"]
    paths = []
    for c in candidates:
        p = os.path.join(home, c)
        if os.path.isdir(p):
            paths.append(p)
    return paths


def _hash_file(path: str, algorithm: str = "md5", max_bytes: int = 1024 * 1024 * 500) -> str | None:
    """Hash a file using the specified algorithm. Returns None on error."""
    try:
        if algorithm == "sha256":
            h = hashlib.sha256()
        else:
            h = hashlib.md5()

        with open(path, "rb") as f:
            bytes_read = 0
            while bytes_read < max_bytes:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
                bytes_read += len(chunk)
        return h.hexdigest()
    except (OSError, PermissionError):
        return None


def _is_excluded(path: str, exclude_paths: list[str]) -> bool:
    """Check if a path should be excluded from scanning."""
    path_lower = path.lower()
    for excl in exclude_paths:
        if excl.lower() in path_lower:
            return True
    return False


def _score_file(path: str, name: str, mtime: float, size: int) -> dict[str, Any]:
    """Score a file for keep recommendation. Lower score = more likely to keep."""
    path_lower = path.lower()
    name_lower = name.lower()

    # Path priority (1-9, lower is better)
    path_score = 5  # Default
    path_reason = "Standard location"
    for pattern, priority in _PATH_PRIORITY:
        if pattern.lower() in path_lower:
            path_score = priority
            path_reason = f"Located in {pattern.strip(chr(92))}"
            break

    # Name quality (0 = good name, 5 = bad name)
    name_score = 0
    name_reason = "Descriptive name"
    for bad in _BAD_NAME_PATTERNS:
        if bad.lower() in name_lower:
            name_score = 5
            name_reason = f"Name contains '{bad.strip()}' (likely a copy)"
            break

    # Path depth (shallower = better, 0-5 range)
    depth = path.count(os.sep)
    depth_score = min(5, depth // 3)

    # Age score (newer = better, 0-3 range)
    age_years = (time.time() - mtime) / (365.25 * 24 * 3600)
    if age_years < 0.1:
        age_score = 0
        age_reason = "Very recent file"
    elif age_years < 1:
        age_score = 1
        age_reason = "Less than 1 year old"
    elif age_years < 3:
        age_score = 2
        age_reason = f"{age_years:.1f} years old"
    else:
        age_score = 3
        age_reason = f"{age_years:.1f} years old (older)"

    # Total score (lower = more likely to keep)
    total = path_score + name_score + depth_score + age_score

    return {
        "path": path,
        "name": name,
        "size": size,
        "mtime": mtime,
        "score": total,
        "factors": {
            "pathScore": path_score,
            "pathReason": path_reason,
            "nameScore": name_score,
            "nameReason": name_reason,
            "depthScore": depth_score,
            "ageScore": age_score,
            "ageReason": age_reason,
        },
    }


def _scan_directory(path: str, config: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Scan a directory for files. Returns dict of hash -> list of file infos."""
    min_size = config.get("minFileSizeKB", 1) * 1024
    max_size = config.get("maxFileSizeMB", 500) * 1024 * 1024
    exclude_paths = config.get("excludePaths", [])
    algorithm = config.get("hashAlgorithm", "md5")

    hash_map: dict[str, list[dict[str, Any]]] = {}

    try:
        for root, dirs, files in os.walk(path):
            # Skip excluded directories
            if _is_excluded(root, exclude_paths):
                dirs.clear()
                continue

            for filename in files:
                filepath = os.path.join(root, filename)

                if _is_excluded(filepath, exclude_paths):
                    continue

                try:
                    stat = os.stat(filepath)
                    size = stat.st_size

                    if size < min_size or size > max_size:
                        continue

                    file_hash = _hash_file(filepath, algorithm)
                    if file_hash is None:
                        continue

                    file_info = {
                        "path": filepath,
                        "name": filename,
                        "size": size,
                        "mtime": stat.st_mtime,
                    }

                    if file_hash not in hash_map:
                        hash_map[file_hash] = []
                    hash_map[file_hash].append(file_info)

                except (OSError, PermissionError):
                    continue
    except (OSError, PermissionError) as e:
        log.error("Failed to scan directory %s: %s", path, e)

    return hash_map


# ─── RPC Methods ────────────────────────────────────────────────────

@register("duplicate_intel.scan")
def duplicate_intel_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan for duplicate files with intelligent analysis.

    Params (optional):
        paths: list[str] — directories to scan (default: user folders)
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "Duplicate intelligence is disabled", "groups": [], "count": 0}

    scan_paths = params.get("paths", []) if params else []
    if not scan_paths:
        scan_paths = config.get("scanPaths", []) or _get_default_scan_paths()

    if not scan_paths:
        return {"success": False, "message": "No scan paths available", "groups": [], "count": 0}

    # Scan all paths
    all_hashes: dict[str, list[dict[str, Any]]] = {}
    total_files = 0

    for path in scan_paths:
        if not os.path.isdir(path):
            continue
        hash_map = _scan_directory(path, config)
        for h, files in hash_map.items():
            if h not in all_hashes:
                all_hashes[h] = []
            all_hashes[h].extend(files)
            total_files += len(files)

    # Build duplicate groups (only hashes with >1 file)
    groups: list[dict[str, Any]] = []
    total_duplicate_bytes = 0

    for file_hash, files in all_hashes.items():
        if len(files) < 2:
            continue

        # Score each file
        scored_files = []
        for f in files:
            scored = _score_file(f["path"], f["name"], f["mtime"], f["size"])
            scored_files.append(scored)

        # Sort by score (lowest = best to keep)
        scored_files.sort(key=lambda x: x["score"])

        # The first file is the recommendation to keep
        keep_file = scored_files[0]
        delete_files = scored_files[1:]

        # Calculate wasted bytes
        wasted_bytes = sum(f["size"] for f in delete_files)

        # Determine file type
        ext = os.path.splitext(keep_file["name"])[1].lower()
        file_type = ext.lstrip(".") or "unknown"

        group = {
            "id": f"dup_{file_hash[:12]}",
            "hash": file_hash,
            "fileType": file_type,
            "fileCount": len(scored_files),
            "fileSize": keep_file["size"],
            "wastedBytes": wasted_bytes,
            "keepFile": {
                "path": keep_file["path"],
                "name": keep_file["name"],
                "score": keep_file["score"],
                "reasons": [keep_file["factors"]["pathReason"], keep_file["factors"]["nameReason"], keep_file["factors"]["ageReason"]],
            },
            "deleteFiles": [
                {
                    "path": f["path"],
                    "name": f["name"],
                    "score": f["score"],
                    "reasons": [f["factors"]["pathReason"], f["factors"]["nameReason"], f["factors"]["ageReason"]],
                }
                for f in delete_files
            ],
            "timestamp": _now_iso(),
            "dismissed": False,
        }
        groups.append(group)
        total_duplicate_bytes += wasted_bytes

    # Sort groups by wasted bytes (largest first)
    groups.sort(key=lambda g: g["wastedBytes"], reverse=True)

    # Limit groups
    max_groups = config.get("maxGroups", 500)
    groups = groups[:max_groups]

    # Save
    data["groups"] = groups
    data["stats"]["totalScans"] = data["stats"].get("totalScans", 0) + 1
    data["stats"]["totalGroups"] = len(groups)
    _save_data(data)

    return {
        "success": True,
        "groups": groups[:20],  # Return top 20
        "count": len(groups),
        "totalFilesScanned": total_files,
        "totalDuplicateBytes": total_duplicate_bytes,
        "totalWastedBytes": sum(g["wastedBytes"] for g in groups),
        "message": f"Found {len(groups)} duplicate group(s) across {total_files} files",
    }


@register("duplicate_intel.status")
def duplicate_intel_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get duplicate intelligence status and statistics."""
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())
    stats = data.get("stats", {})
    groups = data.get("groups", [])

    active = [g for g in groups if not g.get("dismissed", False)]
    total_wasted = sum(g["wastedBytes"] for g in active)

    # Count by file type
    by_type: dict[str, int] = {}
    for g in active:
        ft = g.get("fileType", "unknown")
        by_type[ft] = by_type.get(ft, 0) + 1

    return {
        "enabled": config.get("enabled", True),
        "config": config,
        "stats": {
            "totalScans": stats.get("totalScans", 0),
            "totalGroups": stats.get("totalGroups", 0),
            "totalFilesDeleted": stats.get("totalFilesDeleted", 0),
            "totalBytesFreed": stats.get("totalBytesFreed", 0),
            "activeGroups": len(active),
            "totalWastedBytes": total_wasted,
            "byFileType": by_type,
        },
        "supported": True,
    }


@register("duplicate_intel.listGroups")
def duplicate_intel_list_groups(params: dict[str, Any] | None) -> dict[str, Any]:
    """List duplicate groups with recommendations.

    Params (optional):
        limit: int — max groups to return (default 50)
        dismissed: bool — include dismissed groups (default false)
        fileType: str — filter by file type
    """
    data = _load_data()
    groups = data.get("groups", [])

    include_dismissed = params.get("dismissed", False) if params else False
    file_type_filter = params.get("fileType") if params else None

    filtered = []
    for g in groups:
        if not include_dismissed and g.get("dismissed", False):
            continue
        if file_type_filter and g.get("fileType", "") != file_type_filter:
            continue
        filtered.append(g)

    limit = 50
    if params and "limit" in params:
        limit = min(200, max(1, int(params["limit"])))

    filtered = filtered[:limit]

    return {
        "groups": filtered,
        "count": len(filtered),
        "totalActive": len([g for g in groups if not g.get("dismissed", False)]),
    }


@register("duplicate_intel.dismissGroup")
def duplicate_intel_dismiss_group(params: dict[str, Any] | None) -> dict[str, Any]:
    """Dismiss a duplicate group by ID.

    Params:
        id: str — group ID to dismiss
    """
    if not params or "id" not in params:
        return {"success": False, "message": "id parameter is required"}

    group_id = params["id"]
    data = _load_data()
    groups = data.get("groups", [])

    found = False
    for g in groups:
        if g["id"] == group_id:
            g["dismissed"] = True
            found = True
            break

    if not found:
        return {"success": False, "message": "Group not found"}

    _save_data(data)
    return {"success": True, "message": "Group dismissed"}


@register("duplicate_intel.deleteFile")
@require_feature("duplicate_intel.deleteFile")
def duplicate_intel_delete_file(params: dict[str, Any] | None) -> dict[str, Any]:
    """Delete a specific duplicate file. Pro only.

    Params:
        path: str — file path to delete
    """
    if not params or "path" not in params:
        return {"success": False, "message": "path parameter is required"}

    file_path = params["path"]

    if not os.path.isfile(file_path):
        return {"success": False, "message": "File not found"}

    try:
        file_size = os.path.getsize(file_path)
        os.remove(file_path)
    except (OSError, PermissionError) as e:
        return {"success": False, "message": f"Failed to delete: {e}"}

    data = _load_data()
    data["stats"]["totalFilesDeleted"] = data["stats"].get("totalFilesDeleted", 0) + 1
    data["stats"]["totalBytesFreed"] = data["stats"].get("totalBytesFreed", 0) + file_size
    _save_data(data)

    return {
        "success": True,
        "message": f"Deleted '{os.path.basename(file_path)}'",
        "bytesFreed": file_size,
    }


@register("duplicate_intel.deleteRecommended")
@require_feature("duplicate_intel.deleteRecommended")
def duplicate_intel_delete_recommended(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Delete all recommended-for-deletion files. Pro only.

    Deletes all files marked as "deleteFiles" in non-dismissed groups.
    """
    data = _load_data()
    groups = data.get("groups", [])

    deleted_count = 0
    failed_count = 0
    total_freed = 0

    for g in groups:
        if g.get("dismissed", False):
            continue

        for df in g.get("deleteFiles", []):
            file_path = df["path"]
            try:
                if os.path.isfile(file_path):
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    deleted_count += 1
                    total_freed += file_size
                else:
                    failed_count += 1
            except (OSError, PermissionError):
                failed_count += 1

    data["stats"]["totalFilesDeleted"] = data["stats"].get("totalFilesDeleted", 0) + deleted_count
    data["stats"]["totalBytesFreed"] = data["stats"].get("totalBytesFreed", 0) + total_freed
    _save_data(data)

    return {
        "success": deleted_count > 0,
        "deletedCount": deleted_count,
        "failedCount": failed_count,
        "bytesFreed": total_freed,
        "message": f"Deleted {deleted_count} file(s), {failed_count} failed",
    }


@register("duplicate_intel.clearAll")
def duplicate_intel_clear_all(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all duplicate scan results."""
    data = _load_data()
    data["groups"] = []
    _save_data(data)

    return {"success": True, "message": "All results cleared"}


@register("duplicate_intel.configure")
@require_feature("duplicate_intel.configure")
def duplicate_intel_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update duplicate intelligence configuration. Pro only.

    Params (all optional):
        enabled: bool
        minFileSizeKB: int
        maxFileSizeMB: int
        scanPaths: list[str]
        excludePaths: list[str]
        hashAlgorithm: str — md5 or sha256
        maxGroups: int
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "minFileSizeKB" in params:
            config["minFileSizeKB"] = max(0, int(params["minFileSizeKB"]))
        if "maxFileSizeMB" in params:
            config["maxFileSizeMB"] = max(1, int(params["maxFileSizeMB"]))
        if "scanPaths" in params and isinstance(params["scanPaths"], list):
            config["scanPaths"] = params["scanPaths"]
        if "excludePaths" in params and isinstance(params["excludePaths"], list):
            config["excludePaths"] = params["excludePaths"]
        if "hashAlgorithm" in params:
            algo = params["hashAlgorithm"]
            if algo in ("md5", "sha256"):
                config["hashAlgorithm"] = algo
        if "maxGroups" in params:
            config["maxGroups"] = max(10, int(params["maxGroups"]))

    data["config"] = config
    _save_data(data)

    return {
        "success": True,
        "config": config,
        "message": "Duplicate intelligence configuration updated",
    }
