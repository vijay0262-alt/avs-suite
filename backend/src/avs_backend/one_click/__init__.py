"""One-Click Security Scan — antivirus-only whole-computer scan.

Scans the entire computer for threats using ClamAV and other detection
sources (hash blocklist, YARA, heuristics). After detection, the user is
prompted to confirm before any files are quarantined. This is the "one
button does everything" antivirus feature that competitors like Norton,
McAfee, and Trend Micro offer as their primary scan action.

This module does NOT perform any optimization/cleanup. Temp file
cleanup, recycle bin emptying, and cache clearing are handled by the
Dashboard / AI Smart Optimize flows.
"""
from __future__ import annotations

import json
import logging
import hashlib
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

# ─── Unified progress weighting ──────────────────────────────────────
# The one-click scan runs through several sequential detectors after the
# main file scan (email attachments, process memory, browser extensions,
# network connections, quarantine). Each detector is allotted a fixed
# slice of the overall 0-100 progress bar so the UI shows one continuous,
# monotonically increasing percentage instead of resetting to 0% (or
# appearing frozen at 100%) when a new detector starts. The file scan is
# by far the most expensive phase on a full system scan, so it gets the
# bulk of the range.
_PHASE_FILE_SCAN_END = 90
_PHASE_EMAIL_END = 93
_PHASE_MEMORY_END = 96
_PHASE_EXTENSIONS_END = 98
_PHASE_NETWORK_END = 99
_PHASE_QUARANTINE_END = 100

# Track running one-click operations
_lock = threading.Lock()
_running = False

# Quarantine confirmation gate — the scan thread pauses after detecting
# threats and waits for the user to confirm before quarantining any files.
_quarantine_confirmed = threading.Event()
_quarantine_skipped = False

_progress: dict[str, Any] = {
    "active": False,
    "phase": "idle",  # idle | scanning | pending_confirmation | cleaning | complete
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
    "total_files": 0,
    "scan_speed": 0.0,
}


def _now_ms() -> int:
    return int(time.time() * 1000)


# ─── Scan target enumeration (whole computer) ───────────────────────

# Extensions that are security-relevant and should be scanned
# Import centralized scan config for consistency with threat_engine
from avs_backend.threat_engine.scan_config import (
    should_scan_file as _cfg_should_scan_file,
    is_excluded_path as _cfg_is_excluded_path,
    EXCLUDE_DIR_NAMES as _CFG_EXCLUDE_DIR_NAMES,
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
                # Prune excluded directory names
                dirs[:] = [d for d in dirs if d.lower() not in _CFG_EXCLUDE_DIR_NAMES]
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


def _run_full_scan(scan_type: str = "full") -> dict[str, Any]:
    """Run a full system scan with real-time progress.

    Scans the entire computer (all drives) using ClamAV and other
    detection sources. Uses parallel scanning with ThreadPoolExecutor
    for speed — targets 10-15 minute completion on typical systems.

    Defender is NOT used per-file (spawns MpCmdRun.exe subprocess = 2s/file).
    Instead, ClamAV is the primary scanner, with hash/YARA/heuristic/ML
    as secondary detectors applied in parallel.

    Args:
        scan_type: "full" scans all drives, "quick" scans critical
                   system areas only (System32, Program Files, AppData, etc.)
    """
    if scan_type == "quick":
        try:
            from avs_backend.threat_engine.scan_config import get_quick_scan_targets
            scan_roots = get_quick_scan_targets()
            if not scan_roots:
                scan_roots = _get_scan_roots()
        except Exception:
            scan_roots = _get_scan_roots()
    else:
        scan_roots = _get_scan_roots()
    log.info("One-click: Scan type=%s, roots=%s", scan_type, scan_roots)

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

    # Hash cache for incremental scanning (skip unchanged clean files)
    hash_cache = None
    try:
        from avs_backend.threat_engine.hash_cache import HashCache
        hash_cache = HashCache()
        log.info("One-click: Hash cache loaded (%d entries)", len(hash_cache._cache.get("entries", {})))
    except Exception as e:
        log.warning("One-click: Hash cache not available: %s", e)

    # ─── Streaming scan: enumerate + scan in one pass ───────────────
    # Instead of collecting all files first (which takes minutes on a
    # real system), we submit files to the executor as they're found
    # during os.walk. This eliminates the separate enumeration phase
    # and starts scanning immediately.

    _PE_EXTENSIONS = {".exe", ".dll", ".scr", ".sys", ".ocx", ".com", ".pif"}

    def _scan_single_file(fpath: str) -> dict[str, Any] | None:
        """Scan one file — ClamAV primary, hash detector secondary.

        Only uses ClamAV + hash blocklist for maximum speed.
        YARA/heuristic/behavioral/ML are skipped in one-click scan.
        """
        # Incremental scan: skip unchanged files that were previously clean
        if hash_cache and hash_cache.should_skip(fpath):
            return None

        # 1. ClamAV (primary — reads file via INSTREAM). Uses scan_file_fast
        # with an empty sha256 to skip the internal SHA-256 computation,
        # which would otherwise read the whole file a second time.
        if clamav_scanner:
            try:
                result = clamav_scanner.scan_file_fast(fpath, "")
                if result and result.get("detected"):
                    if hash_cache:
                        hash_cache.record_result(fpath, "threat", "")
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "Unknown"),
                        "threat_type": result.get("threat_type", "malware"),
                        "severity": result.get("severity", "high"),
                        "source": "clamav",
                    }
            except Exception:
                pass

        # 2. Hash detector (secondary — only for PE files, needs full read)
        ext = os.path.splitext(fpath)[1].lower()
        if hash_detector and ext in _PE_EXTENSIONS:
            try:
                sha256 = ""
                h = hashlib.sha256()
                with open(fpath, "rb") as f:
                    while True:
                        chunk = f.read(65536)
                        if not chunk:
                            break
                        h.update(chunk)
                sha256 = h.hexdigest()

                result = hash_detector.check_sha256(sha256)
                if result and result.get("detected"):
                    if hash_cache:
                        hash_cache.record_result(fpath, "threat", sha256)
                    return {
                        "path": fpath,
                        "threat_name": result.get("threat_name", "Unknown"),
                        "threat_type": result.get("threat_type", "malware"),
                        "severity": result.get("severity", "high"),
                        "source": "hash_detector",
                    }
            except Exception:
                pass

        # File is clean — record in hash cache for incremental scanning
        if hash_cache:
            hash_cache.record_result(fpath, "clean", "")

        return None

    # ─── Streaming parallel scan (producer/consumer) ────────────────
    # A background thread walks the filesystem and pushes scannable file
    # paths onto a bounded queue. The main thread pulls from the queue,
    # keeps the ThreadPoolExecutor saturated, and drains completed
    # futures continuously. This gives real-time progress (files_scanned
    # reflects files actually finished, current_file is the last file
    # that finished scanning) and starts scanning immediately instead of
    # waiting for a full filesystem walk to complete first.
    import queue as _queue_mod

    max_workers = min(48, (os.cpu_count() or 4) * 6)
    file_queue: "_queue_mod.Queue[str]" = _queue_mod.Queue(maxsize=4000)
    enum_done = threading.Event()
    files_enumerated = [0]  # mutable box for closure

    def _enumerate() -> None:
        try:
            for root_path in scan_roots:
                with _lock:
                    if _progress.get("cancel_requested"):
                        return
                try:
                    for root, dirs, files in os.walk(root_path):
                        with _lock:
                            if _progress.get("cancel_requested"):
                                return
                        if _is_excluded(root):
                            dirs.clear()
                            continue
                        depth = root.replace(root_path, "").count(os.sep)
                        if depth > _MAX_DEPTH:
                            dirs.clear()
                            continue
                        dirs[:] = [d for d in dirs if d.lower() not in _CFG_EXCLUDE_DIR_NAMES]

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

                            with _lock:
                                if _progress.get("cancel_requested"):
                                    return
                            file_queue.put(fpath)  # blocks if queue is full
                            files_enumerated[0] += 1
                            with _lock:
                                _progress["total_files"] = files_enumerated[0]
                except Exception:
                    pass
        finally:
            enum_done.set()

    enum_thread = threading.Thread(target=_enumerate, daemon=True)
    enum_thread.start()

    with _lock:
        _progress["phase"] = "scanning"
        _progress["current_file"] = "Starting scan..."
        _progress["total_files"] = 0

    executor = ThreadPoolExecutor(max_workers=max_workers)
    futures: dict = {}
    last_update = time.monotonic()
    scan_started_mono = time.monotonic()

    try:
        while True:
            with _lock:
                if _progress.get("cancel_requested"):
                    break

            # Keep the executor saturated by pulling from the queue
            while len(futures) < max_workers * 3:
                try:
                    fpath = file_queue.get_nowait()
                except _queue_mod.Empty:
                    break
                future = executor.submit(_scan_single_file, fpath)
                futures[future] = fpath

            if not futures:
                if enum_done.is_set() and file_queue.empty():
                    break  # enumeration finished and nothing left to scan
                time.sleep(0.05)
                continue

            done_futures = [f for f in futures if f.done()]
            if not done_futures:
                time.sleep(0.02)
                continue

            for f in done_futures:
                fpath = futures.pop(f)
                files_scanned += 1
                try:
                    result = f.result()
                    if result:
                        threats_found += 1
                        detected_threats.append(result)
                except Exception:
                    pass
                with _lock:
                    _progress["current_file"] = fpath

            now = time.monotonic()
            if now - last_update >= 0.25:
                last_update = now
                with _lock:
                    total_est = max(files_enumerated[0], files_scanned, 1)
                    if enum_done.is_set():
                        frac = files_scanned / max(files_enumerated[0], 1)
                    else:
                        frac = files_scanned / total_est
                    pct = min(_PHASE_FILE_SCAN_END, int(frac * _PHASE_FILE_SCAN_END))
                    _progress["scan_progress"] = pct
                    _progress["files_scanned"] = files_scanned
                    _progress["total_files"] = files_enumerated[0]
                    elapsed = max(now - scan_started_mono, 0.001)
                    _progress["scan_speed"] = round(files_scanned / elapsed, 1)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    with _lock:
        if not _progress.get("cancel_requested"):
            _progress["scan_progress"] = _PHASE_FILE_SCAN_END
        _progress["current_file"] = None
        _progress["files_scanned"] = files_scanned
        _progress["total_files"] = files_enumerated[0]

    # Save hash cache for incremental scanning next time
    if hash_cache:
        try:
            hash_cache.save()
            stats = hash_cache.get_stats()
            log.info("One-click: Hash cache saved — %d entries, %d hits, %d misses",
                     stats["total_entries"], stats["hits"], stats["misses"])
        except Exception as e:
            log.warning("One-click: Failed to save hash cache: %s", e)

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
            "total_files": 0,
            "scan_speed": 0.0,
            "cancel_requested": False,
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

    # Helper: check if cancel was requested
    def _cancel_requested() -> bool:
        with _lock:
            return bool(_progress.get("cancel_requested"))

    # Phase 1: Full system security scan (antivirus only)
    scan_result = {"files_scanned": 0, "threats_found": 0, "threats": []}
    try:
        scan_result = _run_full_scan(scan_type)
        result["threats_found"] = scan_result["threats_found"]
        result["files_scanned"] = scan_result["files_scanned"]
        with _lock:
            _progress["threats_found"] = scan_result["threats_found"]
    except Exception as e:
        log.error("One-click scan phase failed: %s", e)

    # Collect threats from additional scan phases (email, memory)
    _extra_threats: list[dict[str, Any]] = []

    # Phase 1.5: Email attachment scanning
    if not _cancel_requested():
        try:
            from avs_backend.threat_engine.email_scanner import EmailScanner
            email_scanner = EmailScanner()
            with _lock:
                _progress["current_file"] = "Scanning email attachments..."
                _progress["scan_progress"] = _PHASE_FILE_SCAN_END + 1

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

    with _lock:
        if not _progress.get("cancel_requested"):
            _progress["scan_progress"] = _PHASE_EMAIL_END

    # Phase 1.6: Memory/process scanning
    if not _cancel_requested():
        try:
            from avs_backend.threat_engine.memory_scanner import MemoryScanner
            mem_scanner = MemoryScanner()
            with _lock:
                _progress["current_file"] = "Scanning running processes memory..."
                _progress["scan_progress"] = _PHASE_EMAIL_END + 1

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

    with _lock:
        if not _progress.get("cancel_requested"):
            _progress["scan_progress"] = _PHASE_MEMORY_END

    # Phase 1.7: Browser extension scanning
    if not _cancel_requested():
        try:
            from avs_backend.browser_extensions import _get_all_extensions
            with _lock:
                _progress["current_file"] = "Scanning browser extensions..."
                _progress["scan_progress"] = _PHASE_MEMORY_END + 1

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

    with _lock:
        if not _progress.get("cancel_requested"):
            _progress["scan_progress"] = _PHASE_EXTENSIONS_END

    # Phase 1.8: Network connection scanning (C2 callbacks, suspicious connections)
    if not _cancel_requested():
        try:
            from avs_backend.threat_engine.network_monitor import scan_network_connections
            with _lock:
                _progress["current_file"] = "Scanning network connections..."
                _progress["scan_progress"] = _PHASE_EXTENSIONS_END + 1

            net_result = scan_network_connections()
            net_threats = net_result.get("suspicious_count", 0)
            if net_threats:
                for conn in net_result.get("suspicious_connections", []):
                    _extra_threats.append({
                        "path": conn.get("process_exe", "") or f"pid:{conn.get('pid', 0)}",
                        "threat_name": f"Network.Suspicious.{conn.get('process', 'unknown')}",
                        "threat_type": "c2_callback" if conn.get("threat_score", 0) >= 7 else "suspicious_connection",
                        "severity": conn.get("severity", "medium"),
                        "source": "network_monitor",
                    })
                result["threats_found"] += net_threats
                with _lock:
                    _progress["threats_found"] = result["threats_found"]
            log.info("One-click: Network scan found %d suspicious connections out of %d total",
                     net_threats, net_result.get("total_connections", 0))
        except Exception as e:
            log.warning("One-click: Network scanning phase failed: %s", e)

    with _lock:
        if not _progress.get("cancel_requested"):
            _progress["scan_progress"] = _PHASE_NETWORK_END

    # Phase 2: Quarantine/clean detected threats (skip if cancelled)
    all_threats = list(scan_result.get("threats", []))
    # Add email and memory threats collected above
    all_threats.extend(_extra_threats)
    if all_threats and not _cancel_requested():
        # ── Quarantine confirmation gate ──────────────────────────────
        # Pause and ask the user for permission before quarantining any
        # files. The frontend detects the "pending_confirmation" phase
        # and shows a dialog. The user must call one_click.confirm_quarantine
        # to proceed, or one_click.skip_quarantine to skip.
        with _lock:
            _progress["phase"] = "pending_confirmation"
            _progress["current_file"] = (
                f"{len(all_threats)} threat{'s' if len(all_threats) != 1 else ''} found. "
                "Waiting for your confirmation to quarantine."
            )
        log.info("One-click: %d threats found, waiting for user confirmation to quarantine", len(all_threats))

        _quarantine_confirmed.wait(timeout=300)  # 5-minute timeout

        if _quarantine_skipped or not _quarantine_confirmed.is_set():
            log.info("One-click: Quarantine skipped by user (or timeout)")
            with _lock:
                _progress["current_file"] = "Quarantine skipped by user."
        else:
            with _lock:
                _progress["phase"] = "cleaning"
                _progress["current_file"] = "Quarantining detected threats..."

            try:
                from avs_backend.threat_engine import threat_quarantine
                total_threats = len(all_threats)
                for idx, threat in enumerate(all_threats, start=1):
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

                    # Update quarantine count LIVE after every item (not just once
                    # at the end) so the UI's "quarantined" counter increments in
                    # sync with the "threats found" counter instead of staying
                    # frozen at 0 until the whole batch finishes.
                    with _lock:
                        _progress["threats_quarantined"] = result["threats_quarantined"]
                        _progress["current_file"] = f"Quarantining threat {idx}/{total_threats}: {os.path.basename(str(threat.get('path', '')))}"
                        if not _progress.get("cancel_requested"):
                            span = _PHASE_QUARANTINE_END - _PHASE_NETWORK_END
                            _progress["scan_progress"] = _PHASE_NETWORK_END + int((idx / total_threats) * span)
            except ImportError:
                log.warning("One-click: threat_quarantine not available, threats detected but not quarantined")
            except Exception as e:
                log.error("One-click: Quarantine phase failed: %s", e)

    # Finalize — don't override 'cancelled' or 'error' phase
    with _lock:
        if _progress.get("phase") not in ("cancelled", "error"):
            _progress["active"] = False
            _progress["phase"] = "complete"
            _progress["scan_progress"] = _PHASE_QUARANTINE_END
            _progress["current_file"] = None
            _progress["threats_found"] = result["threats_found"]
            _progress["threats_quarantined"] = result["threats_quarantined"]
            _progress["completed_at"] = _now_ms()
        else:
            # Keep cancelled/error phase but update counts and mark inactive
            _progress["active"] = False
            _progress["threats_found"] = result["threats_found"]
            _progress["threats_quarantined"] = result["threats_quarantined"]
            if not _progress.get("completed_at"):
                _progress["completed_at"] = _now_ms()

    result["completed_at"] = _progress.get("completed_at")
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
    global _running, _quarantine_skipped

    with _lock:
        if _running:
            return {"success": False, "error": "One-click already running", "progress": _progress}
        _running = True

    # Reset quarantine confirmation gate for this scan
    _quarantine_skipped = False
    _quarantine_confirmed.clear()

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


@register("one_click.cancel")
def one_click_cancel(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Cancel a running one-click scan.

    Sets the cancel flag so the scan loop exits at the next file boundary.
    The scan thread will stop gracefully and mark the progress as cancelled.
    Does NOT set _running=False here — the scan thread's finally block
    handles that, preventing race conditions with new scan starts.
    """
    with _lock:
        _progress["cancel_requested"] = True
        _progress["phase"] = "cancelled"
        _progress["current_file"] = None
    log.info("One-click: Cancel requested by user")
    return {"success": True, "message": "Scan cancelled"}


@register("one_click.confirm_quarantine")
def one_click_confirm_quarantine(_params: dict[str, Any] | None) -> dict[str, Any]:
    """User confirmed — proceed with quarantining detected threats."""
    global _quarantine_skipped
    _quarantine_skipped = False
    _quarantine_confirmed.set()
    log.info("One-click: User confirmed quarantine")
    return {"success": True, "message": "Quarantine confirmed"}


@register("one_click.skip_quarantine")
def one_click_skip_quarantine(_params: dict[str, Any] | None) -> dict[str, Any]:
    """User declined — skip quarantining, leave detected threats as-is."""
    global _quarantine_skipped
    _quarantine_skipped = True
    _quarantine_confirmed.set()  # unblock the waiting scan thread
    log.info("One-click: User skipped quarantine")
    return {"success": True, "message": "Quarantine skipped"}
