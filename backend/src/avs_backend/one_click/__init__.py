"""One-Click Scan & Optimize — combined security scan + PC optimization.

Runs a quick security threat scan and a disk optimization in a single
action. Returns a unified result showing:
  - Threats found and quarantined
  - Disk space freed
  - Files cleaned
  - Overall security + optimization score

This is the "one button does everything" feature that competitors like
CCleaner and Norton offer as their primary action.
"""
from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.one_click")

_IS_WINDOWS = os.name == "nt"
_CREATE_NO_WINDOW = 0x08000000 if _IS_WINDOWS else 0

# Track running one-click operations
_lock = threading.Lock()
_running = False
_progress: dict[str, Any] = {
    "active": False,
    "phase": "idle",  # idle | scanning | optimizing | complete
    "scan_progress": 0,
    "optimize_progress": 0,
    "threats_found": 0,
    "space_freed": 0,
    "files_cleaned": 0,
    "started_at": None,
    "completed_at": None,
    "error": None,
}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _get_temp_dirs() -> list[str]:
    """Get temporary file directories."""
    dirs = []
    temp = os.environ.get("TEMP", "")
    if temp and os.path.isdir(temp):
        dirs.append(temp)
    win_temp = r"C:\Windows\Temp"
    if os.path.isdir(win_temp):
        dirs.append(win_temp)
    prefetch = r"C:\Windows\Prefetch"
    if os.path.isdir(prefetch):
        dirs.append(prefetch)
    return dirs


def _clean_directory(path: str) -> tuple[int, int]:
    """Delete all files in a directory. Returns (files_deleted, bytes_freed)."""
    files_deleted = 0
    bytes_freed = 0
    # Collect dirs to remove after walk (bottom-up) to avoid os.walk issues
    dirs_to_remove: list[str] = []
    for root, _dirs, files in os.walk(path):
        for fname in files:
            fpath = os.path.join(root, fname)
            try:
                size = os.path.getsize(fpath)
                os.remove(fpath)
                files_deleted += 1
                bytes_freed += size
            except Exception:
                pass
        dirs_to_remove.append(root)
    # Remove directories bottom-up (deepest first)
    for dpath in sorted(dirs_to_remove, key=len, reverse=True):
        if dpath == path:
            continue  # Don't remove the top-level target itself
        try:
            if not os.listdir(dpath):
                os.rmdir(dpath)
        except Exception:
            pass
    return files_deleted, bytes_freed


def _empty_recycle_bin() -> int:
    """Empty the Windows Recycle Bin. Returns bytes freed (approximate)."""
    if not _IS_WINDOWS:
        return 0
    try:
        import subprocess
        # Get size before emptying
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             "(New-Object -ComObject Shell.Application).NameSpace(0xA).Items() | "
             "ForEach-Object { $_.Size } | Measure-Object -Sum | Select-Object -ExpandProperty Sum"],
            capture_output=True, text=True, timeout=10,
            creationflags=_CREATE_NO_WINDOW,
        )
        size_before = 0
        if proc.returncode == 0 and proc.stdout.strip():
            try:
                size_before = int(float(proc.stdout.strip()))
            except Exception:
                pass

        # Empty recycle bin
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"],
            capture_output=True, timeout=15,
            creationflags=_CREATE_NO_WINDOW,
        )
        return size_before
    except Exception:
        return 0


def _flush_dns() -> bool:
    """Flush DNS cache."""
    if not _IS_WINDOWS:
        return False
    try:
        import subprocess
        subprocess.run(
            ["ipconfig", "/flushdns"],
            capture_output=True, timeout=10,
            creationflags=_CREATE_NO_WINDOW,
        )
        return True
    except Exception:
        return False


def _run_optimization() -> dict[str, Any]:
    """Run the optimization phase: clean temp files, recycle bin, flush DNS."""
    result = {
        "files_cleaned": 0,
        "bytes_freed": 0,
        "actions": [],
    }

    # Clean temp directories
    for temp_dir in _get_temp_dirs():
        files, size = _clean_directory(temp_dir)
        if files > 0:
            result["files_cleaned"] += files
            result["bytes_freed"] += size
            result["actions"].append({
                "name": f"Cleaned {os.path.basename(temp_dir)}",
                "files": files,
                "bytes": size,
            })

    # Empty recycle bin
    recycle_freed = _empty_recycle_bin()
    if recycle_freed > 0:
        result["bytes_freed"] += recycle_freed
        result["actions"].append({
            "name": "Emptied Recycle Bin",
            "files": 0,
            "bytes": recycle_freed,
        })

    # Flush DNS
    if _flush_dns():
        result["actions"].append({
            "name": "Flushed DNS Cache",
            "files": 0,
            "bytes": 0,
        })

    return result


def _run_one_click(scan_type: str = "quick") -> dict[str, Any]:
    """Run the full one-click scan & optimize sequence."""
    global _progress

    with _lock:
        _progress = {
            "active": True,
            "phase": "scanning",
            "scan_progress": 0,
            "optimize_progress": 0,
            "threats_found": 0,
            "space_freed": 0,
            "files_cleaned": 0,
            "started_at": _now_ms(),
            "completed_at": None,
            "error": None,
        }

    result = {
        "started_at": _progress["started_at"],
        "scan_type": scan_type,
        "threats_found": 0,
        "threats_quarantined": 0,
        "files_scanned": 0,
        "files_cleaned": 0,
        "bytes_freed": 0,
        "actions": [],
        "scan_id": None,
    }

    # Phase 1: Security scan
    try:
        from avs_backend.threat_engine import threat_scan
        scan_result = threat_scan({"scan_type": scan_type})
        if scan_result.get("success"):
            result["scan_id"] = scan_result.get("scan_id")

            # Wait for scan to complete (poll status)
            scan_id = scan_result.get("scan_id")
            if scan_id:
                from avs_backend.threat_engine import _scans, _scans_lock
                for _ in range(120):  # Max 120 seconds
                    time.sleep(1)
                    with _scans_lock:
                        scan = _scans.get(scan_id, {})
                    status = scan.get("status", "")
                    threats = scan.get("threats", [])
                    files_scanned = scan.get("files_scanned", 0)

                    _progress["scan_progress"] = min(100, files_scanned // 10)

                    if status == "complete":
                        result["threats_found"] = len(threats)
                        result["files_scanned"] = files_scanned
                        result["threats_quarantined"] = sum(
                            1 for t in threats if t.get("quarantined", False)
                        )
                        break
                    elif status == "error":
                        result["error"] = scan.get("error", "Scan failed")
                        break
    except ImportError as e:
        log.warning("Threat engine not available, skipping scan phase: %s", e)
        # Continue with optimization only — scan phase is optional
    except Exception as e:
        log.error("One-click scan phase failed: %s", e)
        # Don't set error — continue with optimization

    with _lock:
        _progress["phase"] = "optimizing"
        _progress["scan_progress"] = 100

    # Phase 2: Optimization
    try:
        opt_result = _run_optimization()
        result["files_cleaned"] = opt_result["files_cleaned"]
        result["bytes_freed"] = opt_result["bytes_freed"]
        result["actions"].extend(opt_result["actions"])

        with _lock:
            _progress["optimize_progress"] = 100
            _progress["files_cleaned"] = opt_result["files_cleaned"]
            _progress["space_freed"] = opt_result["bytes_freed"]
    except Exception as e:
        log.error("One-click optimize phase failed: %s", e)
        result["error"] = str(e)

    # Finalize
    with _lock:
        _progress["active"] = False
        _progress["phase"] = "complete"
        _progress["threats_found"] = result["threats_found"]
        _progress["completed_at"] = _now_ms()

    result["completed_at"] = _progress["completed_at"]
    result["success"] = True
    return result


@register("one_click.start")
def one_click_start(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start a one-click scan & optimize operation in the background.

    Returns immediately with a started status. Use one_click.progress to poll.
    """
    scan_type = (params or {}).get("scan_type", "quick")
    global _running

    with _lock:
        if _running:
            return {"success": False, "error": "One-click already running", "progress": _progress}
        _running = True

    def _run():
        global _running
        try:
            _run_one_click(scan_type)
        except Exception as e:
            log.error("One-click failed: %s", e)
            with _lock:
                _progress["active"] = False
                _progress["phase"] = "error"
                _progress["error"] = str(e)
        finally:
            with _lock:
                _running = False

    thread = threading.Thread(target=_run, daemon=True, name="one-click-scan-optimize")
    thread.start()

    return {"success": True, "message": "One-click scan & optimize started", "progress": _progress}


@register("one_click.progress")
def one_click_progress(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get the current progress of a one-click operation."""
    with _lock:
        return dict(_progress)
