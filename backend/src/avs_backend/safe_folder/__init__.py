"""Safe Folder — ransomware protection for sensitive directories.

Monitors user-selected folders for suspicious file activity that indicates
ransomware behavior:
  - Rapid mass file modification (many files changed in a short window)
  - File extension changes (e.g., .docx -> .encrypted)
  - Mass file creation with unusual extensions
  - Mass file deletion

When suspicious activity is detected, the service:
  1. Logs the event with the responsible process (if identifiable)
  2. Emits an alert via the RPC status endpoint
  3. Optionally terminates the offending process (if kill_process is enabled)

RPC methods:
    safe_folder.list           — list protected folders
    safe_folder.add            — add a folder to protection
    safe_folder.remove         — remove a folder from protection
    safe_folder.status         — get protection status and recent alerts
    safe_folder.start          — start monitoring
    safe_folder.stop           — stop monitoring
    safe_folder.alerts         — get recent alerts
    safe_folder.clear_alerts   — clear alert history
    safe_folder.configure      — update settings (kill_process, sensitivity)
"""

from __future__ import annotations

import logging
import os
import platform
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.safe_folder")

IS_WINDOWS = platform.system() == "Windows"

# ── Configuration ──────────────────────────────────────────────────────────

# Ransomware detection thresholds
_RAPID_CHANGE_WINDOW = 10.0  # seconds — count events within this window
_RAPID_CHANGE_THRESHOLD = 50  # events — if this many file changes happen in the window, alert
_EXTENSION_CHANGE_THRESHOLD = 20  # extension changes in window -> alert
_MASS_DELETE_THRESHOLD = 30  # deletions in window -> alert

# Known ransomware-style extensions (non-standard file extensions)
_SUSPICIOUS_EXTENSIONS = {
    ".encrypted", ".locked", ".crypto", ".crypt", ".enc", ".crypted",
    ".locky", ".zepto", ".cerber", ".cancer", ".aaa", ".abc",
    ".xyz", ".zzz", ".xxx", ".encrypted", ".pay", ".ransom",
    ".ryk", ".ryuk", ".lalo", ".mamba", ".thor", ".lock",
}

# ── State ──────────────────────────────────────────────────────────────────

_lock = threading.Lock()
_protected_folders: list[dict[str, Any]] = []
_monitoring = False
_monitor_thread: threading.Thread | None = None
_stop_event = threading.Event()
_alerts: deque[dict[str, Any]] = deque(maxlen=200)
_settings: dict[str, Any] = {
    "kill_process": False,  # Pro only — terminate offending process
    "sensitivity": "medium",  # low, medium, high
}

# File change events for rapid-change detection
_change_events: deque[dict[str, Any]] = deque(maxlen=500)


def _sensitivity_thresholds() -> tuple[int, int, int]:
    """Get thresholds based on sensitivity setting."""
    sens = _settings.get("sensitivity", "medium")
    if sens == "low":
        return (_RAPID_CHANGE_THRESHOLD * 2, _EXTENSION_CHANGE_THRESHOLD * 2, _MASS_DELETE_THRESHOLD * 2)
    if sens == "high":
        return (_RAPID_CHANGE_THRESHOLD // 2, _EXTENSION_CHANGE_THRESHOLD // 2, _MASS_DELETE_THRESHOLD // 2)
    return (_RAPID_CHANGE_THRESHOLD, _EXTENSION_CHANGE_THRESHOLD, _MASS_DELETE_THRESHOLD)


def _emit_alert(alert_type: str, message: str, folder: str, details: dict[str, Any] | None = None) -> None:
    """Emit a security alert."""
    alert = {
        "type": alert_type,
        "message": message,
        "folder": folder,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": details or {},
    }
    with _lock:
        _alerts.append(alert)
    log.warning("Safe Folder alert: %s — %s (folder: %s)", alert_type, message, folder)


def _monitor_folder(folder_path: str, stop_event: threading.Event) -> None:
    """Monitor a single folder for file changes using os.walk polling.

    This is a polling-based approach that compares file listings between
    intervals. It's less efficient than ReadDirectoryChangesW but works
    reliably across all Windows versions and doesn't require ctypes.
    """
    p = Path(folder_path)
    if not p.exists():
        return

    poll_interval = 2.0  # seconds
    prev_files: dict[str, float] = {}

    # Initial snapshot
    try:
        for root, dirs, files in os.walk(p):
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    prev_files[fpath] = os.path.getmtime(fpath)
                except OSError:
                    pass
    except OSError:
        return

    while not stop_event.is_set():
        stop_event.wait(poll_interval)
        if stop_event.is_set():
            break

        current_files: dict[str, float] = {}
        deleted_files: list[str] = []
        modified_files: list[str] = []
        new_files: list[str] = []
        ext_changes: list[tuple[str, str, str]] = []

        try:
            for root, dirs, files in os.walk(p):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    try:
                        mtime = os.path.getmtime(fpath)
                        current_files[fpath] = mtime
                        if fpath in prev_files:
                            if mtime != prev_files[fpath]:
                                modified_files.append(fpath)
                        else:
                            new_files.append(fpath)
                            # Check for suspicious extension
                            ext = os.path.splitext(fname)[1].lower()
                            if ext in _SUSPICIOUS_EXTENSIONS:
                                ext_changes.append((fpath, "", ext))
                    except OSError:
                        pass
        except OSError as e:
            log.error("Safe Folder monitor error for %s: %s", folder_path, e)
            continue

        # Detect deleted files
        for fpath in prev_files:
            if fpath not in current_files:
                deleted_files.append(fpath)

        # Detect extension changes (file deleted + new file with same base name but different ext)
        if deleted_files:
            deleted_bases = {os.path.splitext(f)[0] for f in deleted_files}
            for new_f in new_files:
                new_base = os.path.splitext(new_f)[0]
                if new_base in deleted_bases:
                    old_ext = os.path.splitext(
                        next((f for f in deleted_files if os.path.splitext(f)[0] == new_base), "")
                    )[1]
                    new_ext = os.path.splitext(new_f)[1]
                    if old_ext != new_ext:
                        ext_changes.append((new_f, old_ext, new_ext))

        # Record events for rapid-change detection
        now = time.monotonic()
        for f in modified_files + new_files:
            _change_events.append({"time": now, "type": "change", "folder": folder_path})
        for f in deleted_files:
            _change_events.append({"time": now, "type": "delete", "folder": folder_path})

        # Clean old events
        while _change_events and _change_events[0]["time"] < now - _RAPID_CHANGE_WINDOW:
            _change_events.popleft()

        # Check thresholds
        rapid_thresh, ext_thresh, del_thresh = _sensitivity_thresholds()

        recent_changes = sum(1 for e in _change_events if e["type"] == "change")
        recent_deletes = sum(1 for e in _change_events if e["type"] == "delete")

        if recent_changes >= rapid_thresh:
            _emit_alert(
                "rapid_modification",
                f"Rapid file modification detected: {recent_changes} files changed in {_RAPID_CHANGE_WINDOW}s",
                folder_path,
                {"change_count": recent_changes, "window_seconds": _RAPID_CHANGE_WINDOW},
            )
            if _settings.get("kill_process"):
                _try_kill_suspicious_process(folder_path)

        if len(ext_changes) >= ext_thresh:
            _emit_alert(
                "extension_change",
                f"Suspicious file extension changes: {len(ext_changes)} files renamed",
                folder_path,
                {"changes": [{"file": f, "from": old, "to": new} for f, old, new in ext_changes[:10]]},
            )
            if _settings.get("kill_process"):
                _try_kill_suspicious_process(folder_path)

        if recent_deletes >= del_thresh:
            _emit_alert(
                "mass_deletion",
                f"Mass file deletion detected: {recent_deletes} files deleted in {_RAPID_CHANGE_WINDOW}s",
                folder_path,
                {"delete_count": recent_deletes, "window_seconds": _RAPID_CHANGE_WINDOW},
            )
            if _settings.get("kill_process"):
                _try_kill_suspicious_process(folder_path)

        prev_files = current_files


def _try_kill_suspicious_process(folder_path: str) -> None:
    """Try to identify and kill the process modifying the protected folder."""
    if not IS_WINDOWS:
        return
    try:
        import psutil
        for proc in psutil.process_iter(["pid", "name", "open_files"]):
            try:
                files = proc.info.get("open_files") or []
                for f in files:
                    if folder_path.lower() in str(f.path).lower():
                        log.warning("Killing suspicious process: %s (PID %s)", proc.info["name"], proc.info["pid"])
                        proc.kill()
                        _emit_alert(
                            "process_killed",
                            f"Terminated suspicious process: {proc.info['name']} (PID {proc.info['pid']})",
                            folder_path,
                            {"pid": proc.info["pid"], "process": proc.info["name"]},
                        )
                        return
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as e:
        log.error("Failed to kill suspicious process: %s", e)


def _monitor_loop() -> None:
    """Main monitoring loop — spawns a thread per protected folder."""
    folder_threads: list[threading.Thread] = []
    folder_stop_events: list[threading.Event] = []

    while not _stop_event.is_set():
        with _lock:
            folders = [f["path"] for f in _protected_folders]

        # Start threads for new folders
        for fpath in folders:
            already_monitoring = any(
                t.is_alive() and getattr(t, "_folder", None) == fpath
                for t in folder_threads
            )
            if not already_monitoring:
                fe = threading.Event()
                folder_stop_events.append(fe)
                t = threading.Thread(target=_monitor_folder, args=(fpath, fe), daemon=True)
                t._folder = fpath
                t.start()
                folder_threads.append(t)
                log.info("Started monitoring: %s", fpath)

        # Clean up dead threads
        folder_threads = [t for t in folder_threads if t.is_alive()]
        _stop_event.wait(5.0)

    # Stop all folder monitors
    for fe in folder_stop_events:
        fe.set()


# ── RPC Methods ────────────────────────────────────────────────────────────

@register("safe_folder.list")
def safe_folder_list(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List all protected folders."""
    with _lock:
        return {"folders": list(_protected_folders), "count": len(_protected_folders)}


@register("safe_folder.add")
@require_feature("safe_folder.add")
def safe_folder_add(params: dict[str, Any] | None) -> dict[str, Any]:
    """Add a folder to the protected list. Pro only.

    Params:
        path: str — absolute path to the folder to protect
        name: str — optional friendly name
    """
    if not IS_WINDOWS:
        return {"supported": False, "message": "Only available on Windows"}

    if not params or "path" not in params:
        return {"error": "Missing 'path' parameter"}

    folder_path = params["path"]
    name = params.get("name", os.path.basename(folder_path))

    p = Path(folder_path)
    if not p.exists() or not p.is_dir():
        return {"error": f"Folder does not exist: {folder_path}"}

    with _lock:
        # Check for duplicate
        for f in _protected_folders:
            if f["path"] == folder_path:
                return {"error": "Folder already protected"}
        entry = {
            "path": folder_path,
            "name": name,
            "added_at": datetime.now(timezone.utc).isoformat(),
        }
        _protected_folders.append(entry)
        return {"success": True, "folder": entry}


@register("safe_folder.remove")
@require_feature("safe_folder.remove")
def safe_folder_remove(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove a folder from protection. Pro only.

    Params:
        path: str — path of the folder to remove
    """
    if not params or "path" not in params:
        return {"error": "Missing 'path' parameter"}

    folder_path = params["path"]
    with _lock:
        for i, f in enumerate(_protected_folders):
            if f["path"] == folder_path:
                _protected_folders.pop(i)
                return {"success": True, "removed": folder_path}
        return {"error": "Folder not in protected list"}


@register("safe_folder.status")
def safe_folder_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get protection status."""
    with _lock:
        return {
            "supported": IS_WINDOWS,
            "monitoring": _monitoring,
            "folder_count": len(_protected_folders),
            "alert_count": len(_alerts),
            "settings": dict(_settings),
            "folders": list(_protected_folders),
        }


@register("safe_folder.start")
@require_feature("safe_folder.start")
def safe_folder_start(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Start monitoring protected folders. Pro only."""
    global _monitor_thread, _monitoring

    if not IS_WINDOWS:
        return {"supported": False, "message": "Only available on Windows"}

    with _lock:
        if _monitoring:
            return {"success": True, "message": "Already monitoring"}
        if not _protected_folders:
            return {"error": "No protected folders configured"}
        _monitoring = True

    _stop_event.clear()
    _monitor_thread = threading.Thread(target=_monitor_loop, daemon=True, name="safe-folder-monitor")
    _monitor_thread.start()
    log.info("Safe Folder monitoring started")
    return {"success": True, "monitoring": True}


@register("safe_folder.stop")
def safe_folder_stop(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Stop monitoring."""
    global _monitoring
    _stop_event.set()
    _monitoring = False
    log.info("Safe Folder monitoring stopped")
    return {"success": True, "monitoring": False}


@register("safe_folder.alerts")
def safe_folder_alerts(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recent alerts.

    Params:
        limit: int — max alerts to return (default 50)
    """
    limit = 50
    if params and "limit" in params:
        limit = int(params["limit"])
    with _lock:
        alerts = list(_alerts)
    return {"alerts": alerts[-limit:], "count": len(alerts)}


@register("safe_folder.clear_alerts")
def safe_folder_clear_alerts(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all alerts."""
    with _lock:
        _alerts.clear()
    return {"success": True}


@register("safe_folder.configure")
@require_feature("safe_folder.configure")
def safe_folder_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update Safe Folder settings. Pro only.

    Params:
        kill_process: bool — whether to kill suspicious processes
        sensitivity: str — "low", "medium", or "high"
    """
    if not params:
        return {"error": "No parameters provided"}

    with _lock:
        if "kill_process" in params:
            _settings["kill_process"] = bool(params["kill_process"])
        if "sensitivity" in params:
            sens = params["sensitivity"]
            if sens in ("low", "medium", "high"):
                _settings["sensitivity"] = sens
            else:
                return {"error": "sensitivity must be 'low', 'medium', or 'high'"}
        return {"success": True, "settings": dict(_settings)}
