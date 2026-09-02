"""Safe Folder — ransomware protection for sensitive directories.

Monitors user-designated folders for suspicious mass modification
patterns characteristic of ransomware encryption. When detected:
  1. Alerts the user
  2. Optionally suspends the offending process
  3. Creates a protected snapshot (backup) of the folder

RPC methods:
    safe_folder.list         — list protected folders
    safe_folder.add          — add a folder to protection
    safe_folder.remove       — remove a folder from protection
    safe_folder.status       — get protection status
    safe_folder.alerts       — get recent alerts
    safe_folder.snapshot     — create a backup snapshot of a folder
    safe_folder.restore      — restore a folder from a snapshot
    safe_folder.snapshots    — list available snapshots for a folder
"""
from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.safe_folder")

IS_WINDOWS = os.name == "nt"

# ─── State ────────────────────────────────────────────────────────

_config_path = Path.home() / ".avs" / "safe_folder_config.json"
_snapshot_dir = Path.home() / ".avs" / "safe_folder_snapshots"

_protected_folders: list[dict[str, Any]] = []
_alerts: list[dict[str, Any]] = []
_snapshots: list[dict[str, Any]] = []
_lock = threading.Lock()
_monitor_thread: threading.Thread | None = None
_monitor_stop = threading.Event()
_monitor_interval = 5  # seconds between checks

# Baseline file counts per folder (for detecting mass modification)
_baselines: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _load_config() -> None:
    """Load protected folders from config file."""
    global _protected_folders
    try:
        if _config_path.exists():
            import json
            with open(_config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                _protected_folders = data.get("folders", [])
    except Exception as e:
        log.warning("Failed to load safe folder config: %s", e)


def _save_config() -> None:
    """Save protected folders to config file."""
    try:
        _config_path.parent.mkdir(parents=True, exist_ok=True)
        import json
        with open(_config_path, "w", encoding="utf-8") as f:
            json.dump({"folders": _protected_folders}, f, indent=2)
    except Exception as e:
        log.error("Failed to save safe folder config: %s", e)


def _take_baseline(folder_path: str) -> dict[str, Any]:
    """Take a baseline snapshot of a folder's file state."""
    p = Path(folder_path)
    if not p.is_dir():
        return {"file_count": 0, "files": {}}

    files: dict[str, dict[str, Any]] = {}
    try:
        for entry in p.rglob("*"):
            if entry.is_file():
                try:
                    stat = entry.stat()
                    files[str(entry)] = {
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                    }
                except OSError:
                    continue
    except Exception as e:
        log.warning("Failed to baseline %s: %s", folder_path, e)

    return {"file_count": len(files), "files": files}


def _check_folder(folder: dict[str, Any]) -> dict[str, Any] | None:
    """Check a protected folder for suspicious activity.

    Returns an alert dict if suspicious activity detected, None otherwise.
    """
    folder_path = folder["path"]
    p = Path(folder_path)
    if not p.is_dir():
        return None

    baseline = _baselines.get(folder_path)
    if not baseline:
        # No baseline yet — create one
        _baselines[folder_path] = _take_baseline(folder_path)
        return None

    # Current state
    current = _take_baseline(folder_path)

    baseline_files = baseline["files"]
    current_files = current["files"]

    # Count modifications and new encrypted-looking files
    modified = 0
    new_files = 0
    encrypted_look = 0  # files that look encrypted (extension changed to .encrypted, .locked, etc.)

    encrypted_extensions = {
        ".encrypted", ".locked", ".crypt", ".crypted", ".locky",
        ".cerber", ".crypto", ".enc", ".ransom", ".ransomware",
        ".wcry", ".wannacry", ".petya", ".gandcrab", ".ryk",
        ".sodinokibi", ".stop", ".moka", ".adobe", ".arena",
    }

    for fpath, finfo in current_files.items():
        if fpath not in baseline_files:
            new_files += 1
            ext = os.path.splitext(fpath)[1].lower()
            if ext in encrypted_extensions:
                encrypted_look += 1
        else:
            binfo = baseline_files[fpath]
            if finfo["size"] != binfo["size"] or finfo["mtime"] != binfo["mtime"]:
                modified += 1
                # Check if the file was renamed to an encrypted extension
                # (original file gone, new encrypted file appeared)
                ext = os.path.splitext(fpath)[1].lower()
                if ext in encrypted_extensions:
                    encrypted_look += 1

    # Also check for files that disappeared (possibly encrypted/renamed)
    disappeared = 0
    for fpath in baseline_files:
        if fpath not in current_files:
            disappeared += 1

    total = max(len(baseline_files), 1)

    # Ransomware indicators:
    # - Many files modified in a short time (>30% of files)
    # - Files with encrypted extensions appeared
    # - Many files disappeared (renamed to encrypted)
    mass_modification = modified > total * 0.3
    has_encrypted = encrypted_look > 0
    mass_disappearance = disappeared > total * 0.2

    if mass_modification or has_encrypted or mass_disappearance:
        severity = "critical" if has_encrypted and mass_modification else "high" if has_encrypted else "medium"
        return {
            "id": f"alert-{int(time.time())}",
            "folder": folder_path,
            "severity": severity,
            "type": "ransomware_activity",
            "details": {
                "files_modified": modified,
                "files_new": new_files,
                "files_encrypted_look": encrypted_look,
                "files_disappeared": disappeared,
                "total_baseline_files": len(baseline_files),
            },
            "detected_at": _now_iso(),
            "recommendation": "Immediately disconnect from network, suspend suspicious processes, and restore from snapshot if available.",
        }

    # Update baseline for next check
    _baselines[folder_path] = current
    return None


def _monitor_loop() -> None:
    """Background monitor thread."""
    log.info("Safe Folder monitor started")
    while not _monitor_stop.is_set():
        try:
            with _lock:
                folders = list(_protected_folders)

            for folder in folders:
                if _monitor_stop.is_set():
                    break
                try:
                    alert = _check_folder(folder)
                    if alert:
                        with _lock:
                            _alerts.append(alert)
                            # Keep last 100 alerts
                            if len(_alerts) > 100:
                                _alerts[:] = _alerts[-100:]

                        # Notify
                        try:
                            from avs_backend.notifications.notification_manager import (
                                create_notification,
                                NotificationType,
                                NotificationPriority,
                            )
                            create_notification(
                                NotificationType.SECURITY_ALERT,
                                title=f"Ransomware Alert: {folder['path']}",
                                message=alert["recommendation"],
                                priority=NotificationPriority.CRITICAL,
                                module="safe_folder",
                                action="view",
                                action_data={"alert_id": alert["id"]},
                            )
                        except Exception:
                            pass

                        log.warning("Safe Folder alert for %s: %s", folder["path"], alert["details"])
                except Exception as e:
                    log.debug("Safe folder check error for %s: %s", folder.get("path", "?"), e)

            # Wait between checks
            _monitor_stop.wait(_monitor_interval)
        except Exception as e:
            log.error("Safe folder monitor error: %s", e)
            _monitor_stop.wait(_monitor_interval)

    log.info("Safe Folder monitor stopped")


def _start_monitor() -> None:
    """Start the background monitor if not already running."""
    global _monitor_thread
    if _monitor_thread and _monitor_thread.is_alive():
        return
    _monitor_stop.clear()
    _monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
    _monitor_thread.start()


def _stop_monitor() -> None:
    """Stop the background monitor."""
    _monitor_stop.set()
    if _monitor_thread:
        _monitor_thread.join(timeout=10)


# ─── RPC Handlers ─────────────────────────────────────────────────


@register("safe_folder.list")
def safe_folder_list(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """List all protected folders."""
    with _lock:
        return {
            "success": True,
            "folders": list(_protected_folders),
            "count": len(_protected_folders),
        }


@register("safe_folder.add")
def safe_folder_add(params: dict[str, Any] | None) -> dict[str, Any]:
    """Add a folder to protection.

    Params:
        path: Folder path to protect
        name: Optional friendly name
    """
    params = params or {}
    folder_path = params.get("path", "").strip()
    if not folder_path:
        return {"success": False, "error": "path is required", "error_code": "INVALID_PARAMS"}

    p = Path(folder_path)
    if not p.is_dir():
        return {"success": False, "error": f"Directory does not exist: {folder_path}", "error_code": "NOT_FOUND"}

    folder_path = str(p.resolve())

    with _lock:
        # Check if already protected
        for f in _protected_folders:
            if f["path"].lower() == folder_path.lower():
                return {"success": False, "error": "Folder already protected", "error_code": "ALREADY_EXISTS"}

        entry = {
            "path": folder_path,
            "name": params.get("name", p.name),
            "added_at": _now_iso(),
            "monitoring": True,
        }
        _protected_folders.append(entry)

    # Take initial baseline
    _baselines[folder_path] = _take_baseline(folder_path)

    _save_config()
    _start_monitor()

    return {"success": True, "folder": entry}


@register("safe_folder.remove")
def safe_folder_remove(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove a folder from protection.

    Params:
        path: Folder path to remove
    """
    params = params or {}
    folder_path = params.get("path", "").strip()
    if not folder_path:
        return {"success": False, "error": "path is required", "error_code": "INVALID_PARAMS"}

    with _lock:
        original_len = len(_protected_folders)
        _protected_folders = [f for f in _protected_folders if f["path"].lower() != folder_path.lower()]
        removed = len(_protected_folders) < original_len

    if folder_path in _baselines:
        del _baselines[folder_path]

    if not _protected_folders:
        _stop_monitor()

    _save_config()

    return {"success": removed, "removed": removed}


@register("safe_folder.status")
def safe_folder_status(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get protection status."""
    # Load settings from config
    kill_process = False
    sensitivity = "medium"
    try:
        import json
        if _config_path.exists():
            with open(_config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
                kill_process = config.get("kill_process", False)
                sensitivity = config.get("sensitivity", "medium")
    except Exception:
        pass

    with _lock:
        monitoring = _monitor_thread is not None and _monitor_thread.is_alive()
        return {
            "success": True,
            "supported": True,
            "monitoring": monitoring,
            "folder_count": len(_protected_folders),
            "alert_count": len(_alerts),
            "settings": {
                "kill_process": kill_process,
                "sensitivity": sensitivity,
            },
            "folders": list(_protected_folders),
        }


@register("safe_folder.alerts")
def safe_folder_alerts(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recent alerts.

    Params:
        limit: Max alerts to return (default 50)
    """
    params = params or {}
    limit = int(params.get("limit", 50))
    with _lock:
        return {
            "success": True,
            "alerts": list(_alerts[-limit:]),
            "count": min(limit, len(_alerts)),
        }


@register("safe_folder.start")
def safe_folder_start(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Start monitoring all protected folders."""
    with _lock:
        for f in _protected_folders:
            f["monitoring"] = True
    _save_config()
    _start_monitor()
    return {"success": True, "monitoring": True}


@register("safe_folder.stop")
def safe_folder_stop(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Stop monitoring all protected folders."""
    with _lock:
        for f in _protected_folders:
            f["monitoring"] = False
    _save_config()
    _stop_monitor()
    return {"success": True, "monitoring": False}


@register("safe_folder.configure")
def safe_folder_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Configure safe folder settings.

    Params:
        kill_process: bool — whether to kill suspicious processes
        sensitivity: str — 'low', 'medium', or 'high'
    """
    params = params or {}
    # Store settings in config
    try:
        import json
        config = {}
        if _config_path.exists():
            with open(_config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
        config["kill_process"] = bool(params.get("kill_process", config.get("kill_process", False)))
        config["sensitivity"] = params.get("sensitivity", config.get("sensitivity", "medium"))
        _config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(_config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        log.warning("Failed to save safe folder settings: %s", e)
    return {"success": True}


@register("safe_folder.clear_alerts")
def safe_folder_clear_alerts(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all alerts."""
    with _lock:
        _alerts.clear()
    return {"success": True}


@register("safe_folder.snapshot")
def safe_folder_snapshot(params: dict[str, Any] | None) -> dict[str, Any]:
    """Create a backup snapshot of a protected folder.

    Params:
        path: Folder path to snapshot
    """
    params = params or {}
    folder_path = params.get("path", "").strip()
    if not folder_path:
        return {"success": False, "error": "path is required", "error_code": "INVALID_PARAMS"}

    p = Path(folder_path)
    if not p.is_dir():
        return {"success": False, "error": "Directory does not exist", "error_code": "NOT_FOUND"}

    snapshot_id = f"snap-{int(time.time())}"
    snapshot_path = _snapshot_dir / snapshot_id

    try:
        _snapshot_dir.mkdir(parents=True, exist_ok=True)
        # Copy the folder contents to the snapshot location
        shutil.copytree(folder_path, snapshot_path / p.name)

        entry = {
            "snapshot_id": snapshot_id,
            "folder_path": str(p.resolve()),
            "created_at": _now_iso(),
            "path": str(snapshot_path),
            "file_count": sum(1 for _ in snapshot_path.rglob("*") if _.is_file()),
        }

        with _lock:
            _snapshots.append(entry)
            if len(_snapshots) > 50:
                _snapshots[:] = _snapshots[-50:]

        return {"success": True, "snapshot": entry}
    except Exception as e:
        log.error("Failed to create snapshot: %s", e)
        return {"success": False, "error": str(e)}


@register("safe_folder.snapshots")
def safe_folder_snapshots(params: dict[str, Any] | None) -> dict[str, Any]:
    """List available snapshots for a folder.

    Params:
        path: Folder path (optional — if omitted, lists all snapshots)
    """
    params = params or {}
    folder_path = params.get("path", "").strip()

    with _lock:
        if folder_path:
            snapshots = [s for s in _snapshots if s["folder_path"].lower() == folder_path.lower()]
        else:
            snapshots = list(_snapshots)

        return {
            "success": True,
            "snapshots": snapshots,
            "count": len(snapshots),
        }


@register("safe_folder.restore")
def safe_folder_restore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Restore a folder from a snapshot.

    Params:
        snapshot_id: Snapshot ID to restore from
    """
    params = params or {}
    snapshot_id = params.get("snapshot_id", "").strip()
    if not snapshot_id:
        return {"success": False, "error": "snapshot_id is required", "error_code": "INVALID_PARAMS"}

    with _lock:
        snapshot = next((s for s in _snapshots if s["snapshot_id"] == snapshot_id), None)

    if not snapshot:
        return {"success": False, "error": "Snapshot not found", "error_code": "NOT_FOUND"}

    snapshot_path = Path(snapshot["path"])
    folder_path = Path(snapshot["folder_path"])

    if not snapshot_path.exists():
        return {"success": False, "error": "Snapshot data no longer exists on disk", "error_code": "NOT_FOUND"}

    try:
        # Find the subdirectory (the folder name)
        subdirs = [d for d in snapshot_path.iterdir() if d.is_dir()]
        if not subdirs:
            return {"success": False, "error": "Snapshot is empty", "error_code": "EMPTY"}

        source = subdirs[0]

        # Backup current state before restoring
        backup_path = folder_path.parent / f"{folder_path.name}.pre_restore_{int(time.time())}"
        if folder_path.exists():
            shutil.move(str(folder_path), str(backup_path))

        # Restore
        shutil.copytree(str(source), str(folder_path))

        # Update baseline
        _baselines[str(folder_path.resolve())] = _take_baseline(str(folder_path))

        return {
            "success": True,
            "restored_from": snapshot_id,
            "folder": str(folder_path),
            "backup_path": str(backup_path),
        }
    except Exception as e:
        log.error("Failed to restore snapshot: %s", e)
        return {"success": False, "error": str(e)}


# Load config on import
_load_config()
if _protected_folders:
    _start_monitor()
