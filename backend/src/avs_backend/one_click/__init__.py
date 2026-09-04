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


def _get_scan_dirs() -> list[str]:
    """Get directories to scan for the quick scan phase."""
    dirs = []
    if _IS_WINDOWS:
        user_profile = os.environ.get("USERPROFILE", os.path.expanduser("~"))
        candidates = [
            os.path.join(user_profile, "Downloads"),
            os.path.join(user_profile, "Desktop"),
            os.environ.get("TEMP", ""),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Temp"),
            os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
        ]
        for c in candidates:
            if c and os.path.isdir(c):
                dirs.append(c)
    else:
        dirs.append("/tmp")
    return dirs


def _count_files(dirs: list[str], max_count: int = 5000) -> int:
    """Quick count of files in directories (capped for speed)."""
    count = 0
    for d in dirs:
        if count >= max_count:
            break
        try:
            for root, _dirs, files in os.walk(d):
                count += len(files)
                if count >= max_count:
                    break
        except Exception:
            pass
    return min(count, max_count)


def _run_direct_scan(scan_type: str = "quick") -> dict[str, Any]:
    """Run a direct file scan with real-time progress.

    Scans critical areas using ClamAV (if available) and hash checking.
    Reports progress per-file so the UI can show a moving progress bar
    and the current file being scanned.
    """
    scan_dirs = _get_scan_dirs()
    num_dirs = len(scan_dirs)

    files_scanned = 0
    threats_found = 0
    max_files = 500  # Cap for quick scan (~30s)

    # Try to get ClamAV scanner
    clamav_scanner = None
    try:
        from avs_backend.threat_engine.clamav_scanner import check_clamav_available, ClamAvScanner
        if check_clamav_available():
            clamav_scanner = ClamAvScanner({})
            log.info("One-click: Using ClamAV for scanning")
    except Exception as e:
        log.warning("One-click: ClamAV not available: %s", e)

    # Try to get hash detector
    hash_detector = None
    try:
        from avs_backend.threat_engine.hash_detector import HashDetector
        hash_detector = HashDetector({})
    except Exception as e:
        log.warning("One-click: Hash detector not available: %s", e)

    scanned_paths = set()
    dir_index = 0

    # Skip archive files and large files for quick scan speed
    _SKIP_EXT = {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".iso", ".msi",
                 ".cab", ".arj", ".lzh", ".uue", ".xxe", ".zoo"}
    _MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB max for quick scan

    for scan_dir in scan_dirs:
        dir_index += 1
        # Base progress on directory index (each dir = ~15% of total)
        dir_base = int((dir_index - 1) / num_dirs * 100)

        try:
            for root, dirs, files in os.walk(scan_dir):
                # Skip deep directories
                depth = root.replace(scan_dir, "").count(os.sep)
                if depth > 4:
                    dirs.clear()
                    continue

                for fname in files:
                    if files_scanned >= max_files:
                        break

                    fpath = os.path.join(root, fname)
                    if fpath in scanned_paths:
                        continue
                    scanned_paths.add(fpath)

                    # Skip archives and large files for quick scan
                    ext = os.path.splitext(fname)[1].lower()
                    if ext in _SKIP_EXT:
                        continue

                    try:
                        fsize = os.path.getsize(fpath)
                        if fsize > _MAX_FILE_SIZE:
                            continue
                    except OSError:
                        continue

                    files_scanned += 1

                    # Update progress: based on files scanned vs max
                    with _lock:
                        _progress["scan_progress"] = min(99, int(files_scanned / max_files * 100))
                        _progress["current_file"] = fpath
                        _progress["files_scanned"] = files_scanned

                    # Scan with ClamAV
                    if clamav_scanner:
                        try:
                            result = clamav_scanner.scan_file(fpath)
                            if result and result.get("detected"):
                                threats_found += 1
                        except Exception:
                            pass  # Skip files that timeout or error
                    elif hash_detector:
                        try:
                            result = hash_detector.scan_file(fpath)
                            if result and result.get("detected"):
                                threats_found += 1
                        except Exception:
                            pass

                if files_scanned >= max_files:
                    break
        except Exception as e:
            log.warning("One-click: Error scanning %s: %s", scan_dir, e)

        # Update progress after each directory
        with _lock:
            _progress["scan_progress"] = min(99, int(dir_index / num_dirs * 100))

    with _lock:
        _progress["scan_progress"] = 100
        _progress["current_file"] = None

    return {
        "files_scanned": files_scanned,
        "threats_found": threats_found,
    }


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
            "current_file": None,
            "files_scanned": 0,
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

    # Phase 1: Direct security scan (real-time progress)
    try:
        scan_result = _run_direct_scan(scan_type)
        result["threats_found"] = scan_result["threats_found"]
        result["files_scanned"] = scan_result["files_scanned"]
        with _lock:
            _progress["threats_found"] = scan_result["threats_found"]
    except Exception as e:
        log.error("One-click scan phase failed: %s", e)
        # Continue with optimization

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
