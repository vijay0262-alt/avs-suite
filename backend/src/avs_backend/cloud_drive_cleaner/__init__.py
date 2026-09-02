"""Cloud Drive Cleaner — scan local cloud sync folders for large, old, and duplicate files.

Detects Google Drive and OneDrive sync folders on the local machine and analyzes
them for:
  - Large files (configurable threshold, default 100 MB)
  - Old files (not modified in N days, default 90)
  - Duplicate files (by content hash)

This scans the LOCAL sync copies — no OAuth or API calls required. Files deleted
through this module are deleted from the local sync folder; the cloud provider's
sync client will then propagate the deletion to the cloud.

RPC methods:
    cloud_drive.detect       — detect installed cloud sync folders
    cloud_drive.scan         — scan for large/old/duplicate files
    cloud_drive.status       — get scan status
    cloud_drive.clean        — delete selected files (Pro only)
"""

from __future__ import annotations

import hashlib
import logging
import os
import platform
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.cloud_drive")

IS_WINDOWS = platform.system() == "Windows"

# Scan state
_scan_lock = threading.Lock()
_scan_state: dict[str, Any] = {
    "scanning": False,
    "progress": 0,
    "found": 0,
    "bytes": 0,
    "lastScan": None,
}


def _get_cloud_folders() -> list[dict[str, str]]:
    """Detect cloud sync folders on the system."""
    folders: list[dict[str, str]] = []
    if not IS_WINDOWS:
        return folders

    home = Path.home()

    # OneDrive — multiple possible locations
    onedrive_paths = [
        home / "OneDrive",
        home / "OneDrive - Personal",
        Path(os.environ.get("OneDrive", "")),
    ]
    for p in onedrive_paths:
        try:
            if p.exists() and p.is_dir() and str(p) not in [f["path"] for f in folders if f["provider"] == "onedrive"]:
                folders.append({"provider": "onedrive", "name": "OneDrive", "path": str(p)})
        except (OSError, ValueError):
            pass

    # Google Drive
    gdrive_paths = [
        home / "Google Drive",
        home / "My Drive",
        home / "GoogleDrive",
        Path(os.environ.get("GoogleDrive", "")),
    ]
    for p in gdrive_paths:
        try:
            if p.exists() and p.is_dir() and str(p) not in [f["path"] for f in folders if f["provider"] == "google_drive"]:
                folders.append({"provider": "google_drive", "name": "Google Drive", "path": str(p)})
        except (OSError, ValueError):
            pass

    # Dropbox
    dropbox_path = home / "Dropbox"
    if dropbox_path.exists() and dropbox_path.is_dir():
        folders.append({"provider": "dropbox", "name": "Dropbox", "path": str(dropbox_path)})

    return folders


def _hash_file(path: Path, chunk_size: int = 65536) -> str | None:
    """Compute SHA-256 hash of a file. Returns None on error."""
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except (OSError, PermissionError):
        return None


@register("cloud_drive.detect")
def cloud_drive_detect(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Detect installed cloud sync folders."""
    folders = _get_cloud_folders()
    return {
        "supported": IS_WINDOWS,
        "folders": folders,
        "count": len(folders),
    }


@register("cloud_drive.scan")
def cloud_drive_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan cloud sync folders for large, old, and duplicate files.

    Params:
        large_threshold_mb: int — files larger than this are "large" (default 100)
        old_days: int — files not modified in this many days are "old" (default 90)
        find_duplicates: bool — whether to hash files for duplicate detection (default true)
        max_files: int — safety limit to prevent scanning millions of files (default 50000)
    """
    if not IS_WINDOWS:
        return {"supported": False, "message": "Only available on Windows"}

    with _scan_lock:
        if _scan_state["scanning"]:
            return {"error": "A scan is already in progress"}
        _scan_state.update({"scanning": True, "progress": 0, "found": 0, "bytes": 0})

    try:
        opts = params or {}
        large_threshold = int(opts.get("large_threshold_mb", 100)) * 1024 * 1024
        old_days = int(opts.get("old_days", 90))
        find_dups = bool(opts.get("find_duplicates", True))
        max_files = int(opts.get("max_files", 50000))

        folders = _get_cloud_folders()
        if not folders:
            _scan_state.update({"scanning": False, "progress": 100})
            return {
                "supported": True,
                "folders": [],
                "large_files": [],
                "old_files": [],
                "duplicate_groups": [],
                "summary": {"total_files": 0, "large_count": 0, "old_count": 0, "duplicate_count": 0, "duplicate_bytes": 0},
                "message": "No cloud sync folders detected",
            }

        large_files: list[dict[str, Any]] = []
        old_files: list[dict[str, Any]] = []
        hash_map: dict[str, list[dict[str, Any]]] = {}
        total_files = 0
        total_bytes = 0
        now = time.time()
        old_cutoff = now - (old_days * 86400)

        for folder in folders:
            folder_path = Path(folder["path"])
            for root, dirs, files in os.walk(folder_path):
                if total_files >= max_files:
                    break
                for fname in files:
                    if total_files >= max_files:
                        break
                    fpath = Path(root) / fname
                    try:
                        stat = fpath.stat()
                        total_files += 1
                        total_bytes += stat.st_size
                        file_info = {
                            "path": str(fpath),
                            "name": fname,
                            "size": stat.st_size,
                            "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                            "provider": folder["provider"],
                        }
                        if stat.st_size >= large_threshold:
                            large_files.append(file_info)
                        if stat.st_mtime < old_cutoff:
                            old_files.append(file_info)
                        if find_dups and stat.st_size > 0:
                            # Only hash files > 1KB to avoid overhead on tiny files
                            if stat.st_size > 1024:
                                h = _hash_file(fpath)
                                if h:
                                    hash_map.setdefault(h, []).append(file_info)
                    except (OSError, PermissionError):
                        continue

                _scan_state["progress"] = min(95, int((total_files / max(max_files, 1)) * 100))

        # Build duplicate groups (only groups with >1 file)
        duplicate_groups: list[dict[str, Any]] = []
        duplicate_bytes = 0
        for h, files in hash_map.items():
            if len(files) > 1:
                group_bytes = sum(f["size"] for f in files[1:])  # keep first, rest are duplicates
                duplicate_groups.append({
                    "hash": h[:16],  # truncated for display
                    "files": files,
                    "count": len(files),
                    "waste_bytes": group_bytes,
                })
                duplicate_bytes += group_bytes

        # Sort large files by size descending
        large_files.sort(key=lambda x: x["size"], reverse=True)
        # Sort old files by modification date ascending (oldest first)
        old_files.sort(key=lambda x: x["modified"])
        # Sort duplicate groups by waste descending
        duplicate_groups.sort(key=lambda x: x["waste_bytes"], reverse=True)

        result = {
            "supported": True,
            "folders": folders,
            "large_files": large_files[:500],  # limit results
            "old_files": old_files[:500],
            "duplicate_groups": duplicate_groups[:200],
            "summary": {
                "total_files": total_files,
                "total_bytes": total_bytes,
                "large_count": len(large_files),
                "old_count": len(old_files),
                "duplicate_count": len(duplicate_groups),
                "duplicate_bytes": duplicate_bytes,
                "large_bytes": sum(f["size"] for f in large_files),
            },
        }

        _scan_state.update({
            "scanning": False,
            "progress": 100,
            "found": len(large_files) + len(old_files) + len(duplicate_groups),
            "bytes": duplicate_bytes + sum(f["size"] for f in large_files),
            "lastScan": datetime.now(timezone.utc).isoformat(),
        })

        return result

    except Exception as e:
        log.error("Cloud drive scan failed: %s", e)
        _scan_state.update({"scanning": False, "progress": 0})
        return {"error": str(e)}


@register("cloud_drive.status")
def cloud_drive_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current scan status."""
    return dict(_scan_state)


@register("cloud_drive.clean")
@require_feature("cloud_drive.clean")
def cloud_drive_clean(params: dict[str, Any] | None) -> dict[str, Any]:
    """Delete selected files from cloud sync folders.

    Pro only. Files are deleted from the local sync folder; the cloud
    provider's sync client will propagate deletions to the cloud.

    Params:
        files: list[str] — absolute paths of files to delete
    """
    if not IS_WINDOWS:
        return {"supported": False, "message": "Only available on Windows"}

    if not params or "files" not in params:
        return {"error": "Missing 'files' parameter"}

    files_to_delete = params["files"]
    if not isinstance(files_to_delete, list) or not files_to_delete:
        return {"error": "'files' must be a non-empty list"}

    # Safety: only allow deleting files within detected cloud folders
    cloud_folders = _get_cloud_folders()
    allowed_roots = [Path(f["path"]).resolve() for f in cloud_folders]

    deleted = 0
    failed = 0
    bytes_freed = 0

    for fpath_str in files_to_delete:
        try:
            fpath = Path(fpath_str).resolve()
            # Verify the file is inside a cloud folder
            if not any(fpath.is_relative_to(root) for root in allowed_roots):
                log.warning("Skipping file outside cloud folders: %s", fpath_str)
                failed += 1
                continue
            if not fpath.exists() or not fpath.is_file():
                failed += 1
                continue
            size = fpath.stat().st_size
            fpath.unlink()
            deleted += 1
            bytes_freed += size
        except (OSError, PermissionError) as e:
            log.error("Failed to delete %s: %s", fpath_str, e)
            failed += 1

    return {
        "success": True,
        "deleted": deleted,
        "failed": failed,
        "bytes_freed": bytes_freed,
    }
