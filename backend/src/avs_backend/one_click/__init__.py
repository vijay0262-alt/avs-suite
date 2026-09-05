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

import json
import logging
import os
import string
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
# Import centralized scan config for consistency with threat_engine
from avs_backend.threat_engine.scan_config import (
    should_scan_file as _cfg_should_scan_file,
    is_excluded_path as _cfg_is_excluded_path,
    MAX_FILE_SIZE as _CFG_MAX_FILE_SIZE,
    MAX_DEPTH as _CFG_MAX_DEPTH,
)

_MAX_FILE_SIZE = _CFG_MAX_FILE_SIZE
_MAX_DEPTH = _CFG_MAX_DEPTH


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
    """Check if a path should be excluded from scanning.

    Delegates to the centralized scan_config.is_excluded_path to ensure
    consistency with the threat engine.
    """
    return _cfg_is_excluded_path(path)


def _should_scan_file(file_path: str) -> bool:
    """Determine if a file should be scanned based on extension and location.

    Uses the centralized scan_config.should_scan_file for the core check,
    then adds extra coverage for suspicious directories (Downloads, Temp,
    AppData, Desktop) that the centralized version doesn't include.
    """
    # First, use the centralized check
    if _cfg_should_scan_file(file_path):
        return True

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
    detection sources. Uses parallel scanning with ThreadPoolExecutor
    for speed — targets 10-15 minute completion on typical systems.

    Defender is NOT used per-file (spawns MpCmdRun.exe subprocess = 2s/file).
    Instead, ClamAV is the primary scanner, with hash/YARA/heuristic/ML
    as secondary detectors applied in parallel.
    """
    scan_roots = _get_scan_roots()
    log.info("One-click: Scan roots: %s", scan_roots)

    total_files = 50000  # rough estimate, refined as we scan
    with _lock:
        _progress["current_file"] = f"Scanning {scan_roots[0] if scan_roots else 'C:\\'}..."

    files_scanned = 0
    threats_found = 0
    detected_threats: list[dict[str, Any]] = []

    # ─── Initialize detectors ──────────────────────────────────────

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

    hash_detector = None
    try:
        from avs_backend.threat_engine.hash_detector import HashDetector
        hash_detector = HashDetector({})
    except Exception as e:
        log.warning("One-click: Hash detector not available: %s", e)

    yara_scanner = None
    try:
        from avs_backend.threat_engine.yara_scanner import YaraScanner
        yara_scanner = YaraScanner({})
    except Exception as e:
        log.warning("One-click: YARA scanner not available: %s", e)

    heuristic_detector = None
    try:
        from avs_backend.threat_engine.heuristic import HeuristicDetector
        heuristic_detector = HeuristicDetector({})
    except Exception as e:
        log.warning("One-click: Heuristic detector not available: %s", e)

    amsi_scanner = None
    try:
        from avs_backend.threat_engine.amsi_scanner import AmsiScanner
        amsi_scanner = AmsiScanner({})
    except Exception as e:
        log.warning("One-click: AMSI scanner not available: %s", e)

    # Defender scanner removed from per-file loop — MpCmdRun.exe spawns
    # a subprocess per file taking 1-3 seconds each, making scans take
    # 14+ hours. Defender is still available via the threat engine RPC
    # for on-demand single-file scans.

    behavioral_detector = None
    try:
        from avs_backend.threat_engine.behavioral import BehavioralDetector
        behavioral_detector = BehavioralDetector({})
    except Exception as e:
        log.warning("One-click: Behavioral detector not available: %s", e)

    ml_detector = None
    try:
        from avs_backend.threat_engine.ml_detector import MlDetector
        ml_detector = MlDetector({})
    except Exception as e:
        log.warning("One-click: ML detector not available: %s", e)

    # ─── Collect all files to scan first ───────────────────────────
    all_files: list[str] = []
    for root_path in scan_roots:
        try:
            for root, dirs, files in os.walk(root_path):
                if _is_excluded(root):
                    dirs.clear()
                    continue
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
                    all_files.append(fpath)
        except Exception:
            pass

    total_files = max(len(all_files), 1)
    log.info("One-click: %d files to scan", total_files)

    # ─── PE extensions for ML/heuristic routing ────────────────────
    _PE_EXTENSIONS = {".exe", ".dll", ".scr", ".sys", ".ocx", ".com", ".pif"}
    _SCRIPT_EXTENSIONS = {".ps1", ".js", ".jse", ".vbs", ".wsf", ".wsh", ".hta", ".bat", ".cmd"}

    # ─── Scan a single file with smart detector routing ────────────
    def _scan_single_file(fpath: str) -> dict[str, Any] | None:
        """Scan one file with appropriate detectors based on file type."""
        ext = os.path.splitext(fpath)[1].lower()
        is_pe = ext in _PE_EXTENSIONS
        is_script = ext in _SCRIPT_EXTENSIONS

        # 1. ClamAV (primary — fast, in-process via clamd socket)
        if clamav_scanner:
            try:
                result = clamav_scanner.scan_file(fpath)
                if result and result.get("detected"):
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "Unknown"),
                        "threat_type": result.get("threat_type", "malware"),
                        "severity": result.get("severity", "high"),
                        "source": "clamav",
                    }
            except Exception:
                pass

        # 2. Hash detector (fast — SHA256 lookup in local blocklist)
        if hash_detector:
            try:
                result = hash_detector.scan_file(fpath)
                if result and result.get("detected"):
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "Unknown"),
                        "threat_type": result.get("threat_type", "malware"),
                        "severity": result.get("severity", "high"),
                        "source": "hash_detector",
                    }
            except Exception:
                pass

        # 3. YARA (medium — rule matching)
        if yara_scanner:
            try:
                result = yara_scanner.scan_file(fpath)
                if result and result.get("detected"):
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "Unknown"),
                        "threat_type": result.get("threat_type", "suspicious"),
                        "severity": result.get("severity", "medium"),
                        "source": "yara",
                    }
            except Exception:
                pass

        # 4. Heuristic — only for PE files (medium speed)
        if is_pe and heuristic_detector:
            try:
                result = heuristic_detector.scan_file(fpath)
                if result and result.get("detected"):
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "Suspicious"),
                        "threat_type": result.get("threat_type", "suspicious"),
                        "severity": result.get("severity", "medium"),
                        "source": "heuristic",
                    }
            except Exception:
                pass

        # 5. AMSI — only for script files
        if is_script and amsi_scanner:
            try:
                result = amsi_scanner.scan_file(fpath)
                if result and result.get("detected"):
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "AMSI.Detected"),
                        "threat_type": result.get("threat_type", "script"),
                        "severity": result.get("severity", "high"),
                        "source": "amsi",
                    }
            except Exception:
                pass

        # 6. Behavioral — only for PE files
        if is_pe and behavioral_detector:
            try:
                result = behavioral_detector.scan_file(fpath)
                if result and result.get("detected"):
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "Behavioral.Detected"),
                        "threat_type": result.get("threat_type", "suspicious"),
                        "severity": result.get("severity", "medium"),
                        "source": "behavioral",
                    }
            except Exception:
                pass

        # 7. ML detector — only for PE files
        if is_pe and ml_detector:
            try:
                result = ml_detector.scan_file(fpath)
                if result and result.get("detected"):
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "ML.Detected"),
                        "threat_type": result.get("threat_type", "suspicious"),
                        "severity": result.get("severity", "medium"),
                        "source": "ml_detector",
                    }
            except Exception:
                pass

        return None

    # ─── Parallel scanning with ThreadPoolExecutor ─────────────────
    max_workers = min(8, os.cpu_count() or 4)
    progress_update_interval = 10  # Update progress every 10 files

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for fpath in all_files:
            future = executor.submit(_scan_single_file, fpath)
            futures[future] = fpath

        for future in as_completed(futures):
            fpath = futures[future]
            files_scanned += 1

            # Batch progress updates (reduce lock contention)
            if files_scanned % progress_update_interval == 0 or files_scanned == total_files:
                with _lock:
                    pct = min(99, int(files_scanned / total_files * 100))
                    _progress["scan_progress"] = pct
                    _progress["current_file"] = fpath
                    _progress["files_scanned"] = files_scanned

            try:
                result = future.result()
                if result:
                    threats_found += 1
                    detected_threats.append(result)
            except Exception:
                pass

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
            "scan_progress": 1,
            "optimize_progress": 0,
            "threats_found": 0,
            "threats_quarantined": 0,
            "space_freed": 0,
            "files_cleaned": 0,
            "started_at": _now_ms(),
            "completed_at": None,
            "error": None,
            "current_file": "Initializing scan...",
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

    # Collect threats from additional scan phases (email, memory)
    _extra_threats: list[dict[str, Any]] = []

    # Phase 1.5: Email attachment scanning
    try:
        from avs_backend.threat_engine.email_scanner import EmailScanner
        email_scanner = EmailScanner()
        with _lock:
            _progress["current_file"] = "Scanning email attachments..."

        # Scan common email file locations
        email_dirs = []
        if _IS_WINDOWS:
            local_app_data = os.environ.get("LOCALAPPDATA", "")
            app_data = os.environ.get("APPDATA", "")
            user_profile = os.environ.get("USERPROFILE", "")
            email_dirs = [
                os.path.join(user_profile, "Documents"),
                os.path.join(local_app_data, "Microsoft", "Outlook"),
                os.path.join(app_data, "Thunderbird", "Profiles"),
                os.path.join(local_app_data, "Microsoft", "Windows", "Mail"),
            ]

        email_threats = 0
        for email_dir in email_dirs:
            if not os.path.isdir(email_dir):
                continue
            for root, _dirs, files in os.walk(email_dir):
                for fname in files:
                    ext = os.path.splitext(fname)[1].lower()
                    if ext in (".eml", ".msg"):
                        fpath = os.path.join(root, fname)
                        try:
                            email_result = email_scanner.scan_email_file(fpath)
                            if email_result.get("threats"):
                                for threat in email_result["threats"]:
                                    _extra_threats.append({
                                        "path": threat.get("file_path", fpath),
                                        "threat_name": threat.get("threat_name", "Email.Malware"),
                                        "threat_type": threat.get("threat_type", "malware"),
                                        "severity": threat.get("severity", "high"),
                                        "source": "email_scanner",
                                    })
                                    email_threats += 1
                        except Exception:
                            pass

        if email_threats:
            result["threats_found"] += email_threats
            with _lock:
                _progress["threats_found"] = result["threats_found"]
        log.info("One-click: Email scan found %d threats", email_threats)
    except Exception as e:
        log.warning("One-click: Email scanning phase failed: %s", e)

    # Phase 1.6: Memory/process scanning
    try:
        from avs_backend.threat_engine.memory_scanner import MemoryScanner
        mem_scanner = MemoryScanner()
        with _lock:
            _progress["current_file"] = "Scanning running processes memory..."

        mem_result = mem_scanner.scan_all_processes()
        mem_threats = mem_result.get("threats_found", 0)
        if mem_threats:
            for threat in mem_result.get("threats", []):
                _extra_threats.append({
                    "path": threat.get("process", "unknown"),
                    "threat_name": threat.get("threat_name", "Memory.Injection"),
                    "threat_type": threat.get("threat_type", "malware"),
                    "severity": threat.get("severity", "high"),
                    "source": "memory_scanner",
                })
            result["threats_found"] += mem_threats
            with _lock:
                _progress["threats_found"] = result["threats_found"]
        log.info("One-click: Memory scan found %d threats in %d processes",
                 mem_threats, mem_result.get("processes_scanned", 0))
    except Exception as e:
        log.warning("One-click: Memory scanning phase failed: %s", e)

    # Phase 1.7: Browser extension scanning
    try:
        from avs_backend.browser_extensions import _get_all_extensions
        with _lock:
            _progress["current_file"] = "Scanning browser extensions..."

        extensions = _get_all_extensions()
        ext_threats = 0
        for ext in extensions:
            ext_path = ext.get("path", "")
            ext_id = ext.get("extensionId", "")
            browser = ext.get("browser", "")
            ext_name = ext.get("name", "Unknown")

            if not ext_path or not os.path.isdir(ext_path):
                continue

            # Scan extension JS files and manifest for malicious patterns
            threat_score = 0
            reasons: list[str] = []

            # Check manifest for suspicious permissions
            manifest_path = os.path.join(ext_path, "manifest.json")
            if os.path.isfile(manifest_path):
                try:
                    with open(manifest_path, "r", encoding="utf-8", errors="ignore") as f:
                        manifest = json.load(f)
                    perms = manifest.get("permissions", [])
                    host_perms = manifest.get("host_permissions", [])
                    all_perms = perms + host_perms

                    has_all_urls = "<all_urls>" in all_perms or "*://*/*" in all_perms
                    has_tabs = "tabs" in all_perms
                    has_cookies = "cookies" in all_perms
                    has_web_request = "webRequest" in all_perms
                    has_native_messaging = "nativeMessaging" in all_perms

                    if has_all_urls and has_web_request:
                        threat_score += 4
                        reasons.append("Can intercept all web requests")
                    if has_all_urls and has_tabs:
                        threat_score += 3
                        reasons.append("Can read all web pages and tab content")
                    if has_cookies and has_all_urls:
                        threat_score += 3
                        reasons.append("Can read cookies from all sites")
                    if has_native_messaging:
                        threat_score += 3
                        reasons.append("Can communicate with native applications")
                except Exception:
                    pass

            # Scan JavaScript files for suspicious patterns
            js_patterns = [
                ("eval(atob(", 5, "Base64-encoded eval (obfuscation)"),
                ("eval(unescape(", 4, "Escaped eval (obfuscation)"),
                ("Function(atob(", 5, "Base64-encoded Function constructor"),
                ("crypto.miner", 5, "Cryptocurrency mining"),
                ("coinhive", 5, "Coinhive miner"),
                ("crypto-loot", 5, "Crypto-Loot miner"),
                ("chrome.debugger", 4, "Debugger API access"),
            ]

            for root, _dirs, files in os.walk(ext_path):
                for fname in files:
                    if not fname.endswith((".js", ".html")):
                        continue
                    fpath = os.path.join(root, fname)
                    try:
                        if os.path.getsize(fpath) > 500 * 1024:
                            continue
                        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                        for pattern, score, reason in js_patterns:
                            if pattern in content:
                                threat_score += score
                                reasons.append(f"{reason} in {fname}")
                                break
                    except Exception:
                        pass

            if threat_score >= 5:
                severity = "critical" if threat_score >= 10 else "high" if threat_score >= 7 else "medium"
                _extra_threats.append({
                    "path": ext_path,
                    "threat_name": f"BrowserExt.Suspicious.{ext_name}",
                    "threat_type": "adware" if "ad" in str(reasons).lower() else "spyware",
                    "severity": severity,
                    "source": "browser_ext_scanner",
                })
                ext_threats += 1

        if ext_threats:
            result["threats_found"] += ext_threats
            with _lock:
                _progress["threats_found"] = result["threats_found"]
        log.info("One-click: Browser extension scan found %d threats in %d extensions", ext_threats, len(extensions))
    except Exception as e:
        log.warning("One-click: Browser extension scanning phase failed: %s", e)

    # Phase 2: Quarantine/clean detected threats
    all_threats = list(scan_result.get("threats", []))
    # Add email and memory threats collected above
    all_threats.extend(_extra_threats)
    if all_threats:
        with _lock:
            _progress["phase"] = "cleaning"

        try:
            from avs_backend.threat_engine import threat_quarantine
            for threat in all_threats:
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
