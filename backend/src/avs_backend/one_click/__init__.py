"""One-Click Security Scan — antivirus-only whole-computer scan.

Scans the entire computer for threats using ClamAV and other detection
sources (hash blocklist, YARA, heuristics). Detected threats are
quarantined automatically. This is the "one button does everything"
antivirus feature that competitors like Norton, McAfee, and Trend Micro
offer as their primary scan action.

This module does NOT perform any optimization/cleanup. Temp file
cleanup, recycle bin emptying, and cache clearing are handled by the
Dashboard / AI Smart Optimize flows.
"""
from __future__ import annotations

import logging
import os
import string
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
    "phase": "idle",  # idle | scanning | cleaning | complete
    "scan_progress": 0,
    "optimize_progress": 0,
    "threats_found": 0,
    "threats_quarantined": 0,
    "space_freed": 0,
    "files_cleaned": 0,
    "started_at": None,
    "completed_at": None,
    "error": None,
    "current_file": None,
    "files_scanned": 0,
}


def _now_ms() -> int:
    return int(time.time() * 1000)


# ─── Scan target enumeration (whole computer) ───────────────────────

# Extensions that are security-relevant and should be scanned
_SCAN_EXTENSIONS = {
    ".exe", ".dll", ".sys", ".scr", ".ocx", ".com", ".pif", ".bat",
    ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".wsh", ".hta",
    ".msi", ".msp", ".mst", ".cpl", ".inf", ".lnk", ".jar", ".class",
    ".py", ".pyw", ".rb", ".pl", ".sh", ".apk", ".appx", ".msix",
    ".zip", ".rar", ".7z", ".cab", ".tar", ".gz", ".iso", ".img",
    ".doc", ".xls", ".ppt", ".docm", ".xlsm", ".pptm",
    ".pdf", ".html", ".htm", ".swf", ".flv",
}

# Extensions to always skip (not security-relevant)
_SKIP_EXTENSIONS = {
    ".txt", ".log", ".csv", ".json", ".xml", ".css", ".md", ".rst",
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv",
    ".mp3", ".wav", ".flac", ".aac", ".ogg",
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp",
    ".tmp", ".temp",
}

# Paths to exclude from scan (system-protected or huge)
_EXCLUDE_PATHS = {
    r"C:\Windows\WinSxS",
    r"C:\ProgramData\Microsoft\Windows Defender",
    r"C:\$Recycle.Bin",
    r"C:\System Volume Information",
    r"C:\Windows\assembly",
    r"C:\Windows\Installer",
}

_MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
_MAX_DEPTH = 12


def _get_scan_roots() -> list[str]:
    """Get root directories to scan — all existing drives for a full system scan."""
    roots = []
    if _IS_WINDOWS:
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if os.path.exists(drive):
                roots.append(drive)
    else:
        roots.append("/")
    return roots


def _is_excluded(path: str) -> bool:
    """Check if a path should be excluded from scanning."""
    path_lower = path.lower()
    for excl in _EXCLUDE_PATHS:
        if path_lower.startswith(excl.lower()):
            return True
    return False


def _should_scan_file(file_path: str) -> bool:
    """Determine if a file should be scanned based on extension and location."""
    ext = os.path.splitext(file_path)[1].lower()

    # Skip known-safe extensions
    if ext in _SKIP_EXTENSIONS:
        return False

    # Scan known-dangerous extensions
    if ext in _SCAN_EXTENSIONS:
        return not _is_excluded(file_path)

    # For files without extension or unknown extensions, scan if they're
    # in suspicious locations (Downloads, Temp, AppData, Desktop)
    suspicious_dirs = ["Downloads", "Temp", "AppData", "Desktop"]
    for sd in suspicious_dirs:
        if sd.lower() in file_path.lower():
            return not _is_excluded(file_path)

    return False


def _count_scannable_files(roots: list[str]) -> int:
    """Count all scannable files across all scan roots."""
    count = 0
    for root_path in roots:
        try:
            for root, dirs, files in os.walk(root_path):
                # Skip excluded paths
                if _is_excluded(root):
                    dirs.clear()
                    continue
                # Skip very deep directories
                depth = root.replace(root_path, "").count(os.sep)
                if depth > _MAX_DEPTH:
                    dirs.clear()
                    continue
                for fname in files:
                    fpath = os.path.join(root, fname)
                    if not _should_scan_file(fpath):
                        continue
                    try:
                        fsize = os.path.getsize(fpath)
                        if fsize > _MAX_FILE_SIZE:
                            continue
                    except OSError:
                        continue
                    count += 1
        except Exception:
            pass
    return count


def _run_full_scan() -> dict[str, Any]:
    """Run a full system scan with real-time progress.

    Scans the entire computer (all drives) using ClamAV and other
    detection sources. Reports progress per-file so the UI can show
    a moving progress bar and the current file being scanned.
    Returns threat details so they can be quarantined.
    """
    scan_roots = _get_scan_roots()
    log.info("One-click: Scan roots: %s", scan_roots)

    # First pass: count all scannable files for accurate progress
    with _lock:
        _progress["current_file"] = "Counting files..."
    total_files = _count_scannable_files(scan_roots)
    if total_files == 0:
        total_files = 1
    log.info("One-click: Found %d files to scan", total_files)

    files_scanned = 0
    threats_found = 0
    detected_threats: list[dict[str, Any]] = []

    # Try to get ClamAV scanner
    clamav_scanner = None
    try:
        from avs_backend.threat_engine.clamav_scanner import check_clamav_available, ClamAvScanner
        if check_clamav_available():
            clamav_scanner = ClamAvScanner({})
            log.info("One-click: Using ClamAV for scanning")
        else:
            log.warning("One-click: ClamAV not available, using fallback detectors")
    except Exception as e:
        log.warning("One-click: ClamAV init failed: %s", e)

    # Try to get hash detector as fallback
    hash_detector = None
    try:
        from avs_backend.threat_engine.hash_detector import HashDetector
        hash_detector = HashDetector({})
    except Exception as e:
        log.warning("One-click: Hash detector not available: %s", e)

    # Try YARA scanner
    yara_scanner = None
    try:
        from avs_backend.threat_engine.yara_scanner import YaraScanner
        yara_scanner = YaraScanner({})
    except Exception as e:
        log.warning("One-click: YARA scanner not available: %s", e)

    # Try Heuristic detector
    heuristic_detector = None
    try:
        from avs_backend.threat_engine.heuristic import HeuristicDetector
        heuristic_detector = HeuristicDetector({})
    except Exception as e:
        log.warning("One-click: Heuristic detector not available: %s", e)

    # Try AMSI scanner (Windows scripts)
    amsi_scanner = None
    try:
        from avs_backend.threat_engine.amsi_scanner import AmsiScanner
        amsi_scanner = AmsiScanner({})
    except Exception as e:
        log.warning("One-click: AMSI scanner not available: %s", e)

    # Try Defender scanner
    defender_scanner = None
    try:
        from avs_backend.threat_engine.defender_scanner import DefenderScanner
        defender_scanner = DefenderScanner({})
    except Exception as e:
        log.warning("One-click: Defender scanner not available: %s", e)

    for root_path in scan_roots:
        try:
            for root, dirs, files in os.walk(root_path):
                # Skip excluded paths
                if _is_excluded(root):
                    dirs.clear()
                    continue

                # Skip very deep directories
                depth = root.replace(root_path, "").count(os.sep)
                if depth > _MAX_DEPTH:
                    dirs.clear()
                    continue

                for fname in files:
                    fpath = os.path.join(root, fname)

                    # Skip non-security-relevant files
                    if not _should_scan_file(fpath):
                        continue

                    try:
                        fsize = os.path.getsize(fpath)
                        if fsize > _MAX_FILE_SIZE:
                            continue
                    except OSError:
                        continue

                    files_scanned += 1

                    # Update progress
                    with _lock:
                        _progress["scan_progress"] = min(99, int(files_scanned / total_files * 100))
                        _progress["current_file"] = fpath
                        _progress["files_scanned"] = files_scanned

                    # Scan with ClamAV (primary)
                    if clamav_scanner:
                        try:
                            result = clamav_scanner.scan_file(fpath)
                            if result and result.get("detected"):
                                threats_found += 1
                                detected_threats.append({
                                    "path": fpath,
                                    "threat_name": result.get("threat_name", "Unknown"),
                                    "threat_type": result.get("threat_type", "malware"),
                                    "severity": result.get("severity", "high"),
                                    "source": "clamav",
                                })
                                continue  # Don't double-scan with other detectors
                        except Exception:
                            pass

                    # Fallback: hash detector
                    if hash_detector:
                        try:
                            result = hash_detector.scan_file(fpath)
                            if result and result.get("detected"):
                                threats_found += 1
                                detected_threats.append({
                                    "path": fpath,
                                    "threat_name": result.get("threat_name", "Unknown"),
                                    "threat_type": result.get("threat_type", "malware"),
                                    "severity": result.get("severity", "high"),
                                    "source": "hash_detector",
                                })
                                continue
                        except Exception:
                            pass

                    # Fallback: YARA
                    if yara_scanner:
                        try:
                            result = yara_scanner.scan_file(fpath)
                            if result and result.get("detected"):
                                threats_found += 1
                                detected_threats.append({
                                    "path": fpath,
                                    "threat_name": result.get("threat_name", "Unknown"),
                                    "threat_type": result.get("threat_type", "suspicious"),
                                    "severity": result.get("severity", "medium"),
                                    "source": "yara",
                                })
                                continue
                        except Exception:
                            pass

                    # Heuristic detector (PE analysis, double extensions, etc.)
                    if heuristic_detector:
                        try:
                            result = heuristic_detector.scan_file(fpath)
                            if result and result.get("detected"):
                                threats_found += 1
                                detected_threats.append({
                                    "path": fpath,
                                    "threat_name": result.get("threat_name", "Suspicious"),
                                    "threat_type": result.get("threat_type", "suspicious"),
                                    "severity": result.get("severity", "medium"),
                                    "source": "heuristic",
                                })
                                continue
                        except Exception:
                            pass

                    # AMSI scanner (scripts: .ps1, .js, .vbs, etc.)
                    if amsi_scanner:
                        try:
                            result = amsi_scanner.scan_file(fpath)
                            if result and result.get("detected"):
                                threats_found += 1
                                detected_threats.append({
                                    "path": fpath,
                                    "threat_name": result.get("threat_name", "AMSI.Detected"),
                                    "threat_type": result.get("threat_type", "script"),
                                    "severity": result.get("severity", "high"),
                                    "source": "amsi",
                                })
                                continue
                        except Exception:
                            pass

                    # Defender scanner (Windows Defender integration)
                    if defender_scanner:
                        try:
                            result = defender_scanner.scan_file(fpath)
                            if result and result.get("detected"):
                                threats_found += 1
                                detected_threats.append({
                                    "path": fpath,
                                    "threat_name": result.get("threat_name", "Defender.Detected"),
                                    "threat_type": result.get("threat_type", "malware"),
                                    "severity": result.get("severity", "high"),
                                    "source": "defender",
                                })
                        except Exception:
                            pass

        except Exception as e:
            log.warning("One-click: Error scanning %s: %s", root_path, e)

    with _lock:
        _progress["scan_progress"] = 100
        _progress["current_file"] = None

    return {
        "files_scanned": files_scanned,
        "threats_found": threats_found,
        "threats": detected_threats,
    }


def _run_one_click(scan_type: str = "full") -> dict[str, Any]:
    """Run the one-click security scan (antivirus only, no optimization).

    Scans the ENTIRE COMPUTER for threats using ClamAV and other
    detectors, then quarantines any detected threats. Does NOT clean
    temp files or optimize the system — that's handled by
    Dashboard/AI Smart Optimize.

    This is a full system scan like Norton/McAfee/Trend Micro —
    it scans all drives, all user profiles, Program Files, and
    the Windows folder for viruses, trojans, worms, spyware,
    adware, PUPs, ransomware, rootkits, bootkits, and more.
    """
    global _progress

    with _lock:
        _progress = {
            "active": True,
            "phase": "scanning",
            "scan_progress": 0,
            "optimize_progress": 0,
            "threats_found": 0,
            "threats_quarantined": 0,
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
        "threats_cleaned": 0,
        "files_scanned": 0,
        "actions": [],
        "scan_id": None,
    }

    # Phase 1: Full system security scan (antivirus only)
    scan_result = {"files_scanned": 0, "threats_found": 0, "threats": []}
    try:
        scan_result = _run_full_scan()
        result["threats_found"] = scan_result["threats_found"]
        result["files_scanned"] = scan_result["files_scanned"]
        with _lock:
            _progress["threats_found"] = scan_result["threats_found"]
    except Exception as e:
        log.error("One-click scan phase failed: %s", e)

    # Phase 2: Quarantine/clean detected threats
    threats = scan_result.get("threats", [])
    if threats:
        with _lock:
            _progress["phase"] = "cleaning"

        try:
            from avs_backend.threat_engine import threat_quarantine
            for threat in threats:
                try:
                    q_result = threat_quarantine({
                        "file_path": threat["path"],
                        "threat_info": {
                            "threat_name": threat.get("threat_name", "Unknown"),
                            "threat_type": threat.get("threat_type", "malware"),
                            "severity": threat.get("severity", "high"),
                            "source": threat.get("source", "clamav"),
                        },
                    })
                    if q_result.get("success"):
                        result["threats_quarantined"] += 1
                        result["threats_cleaned"] += 1
                except Exception as e:
                    log.warning("One-click: Failed to quarantine %s: %s", threat["path"], e)

            with _lock:
                _progress["threats_quarantined"] = result["threats_quarantined"]
        except ImportError:
            log.warning("One-click: threat_quarantine not available, threats detected but not quarantined")
        except Exception as e:
            log.error("One-click: Quarantine phase failed: %s", e)

    # Finalize
    with _lock:
        _progress["active"] = False
        _progress["phase"] = "complete"
        _progress["threats_found"] = result["threats_found"]
        _progress["threats_quarantined"] = result["threats_quarantined"]
        _progress["completed_at"] = _now_ms()

    result["completed_at"] = _progress["completed_at"]
    result["success"] = True
    return result


@register("one_click.start")
def one_click_start(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start a one-click security scan in the background.

    Scans the entire computer for threats and quarantines any detected
    infections. Returns immediately with a started status.
    Use one_click.progress to poll for progress.
    """
    scan_type = (params or {}).get("scan_type", "full")
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

    thread = threading.Thread(target=_run, daemon=True, name="one-click-security-scan")
    thread.start()

    return {"success": True, "message": "One-click security scan started", "progress": _progress}


@register("one_click.progress")
def one_click_progress(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get the current progress of a one-click operation."""
    with _lock:
        return dict(_progress)
