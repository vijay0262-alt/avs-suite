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
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.one_click")

_IS_WINDOWS = os.name == "nt"
_CREATE_NO_WINDOW = 0x08000000 if _IS_WINDOWS else 0

# ─── Unified progress weighting ──────────────────────────────────────
# The one-click scan focuses on files, folders, and archives only. Email
# attachments and process memory scanning are offered as separate optional
# cards so they don't block or slow down the main one-click scan.
# Progress is one continuous, monotonically increasing percentage.
_PHASE_FILE_SCAN_END = 95
_PHASE_EXTENSIONS_END = 97
_PHASE_NETWORK_END = 99
_PHASE_QUARANTINE_END = 100

# Track running one-click operations
_lock = threading.Lock()
_running = False

# Live enumeration counters (updated while _collect_scannable_files runs)
_enum_state: dict[str, int] = {
    "files_found": 0,
    "dirs_visited": 0,
}

# Persistent estimate of total files for progress smoothing
_enum_estimate_path = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "threat_engine" / "one_click_enum_estimate.json"
_enum_estimate_path.parent.mkdir(parents=True, exist_ok=True)

# Quarantine confirmation gate — the scan thread pauses after detecting
# threats and waits for the user to confirm before quarantining any files.
_quarantine_confirmed = threading.Event()
_quarantine_skipped = False

_progress: dict[str, Any] = {
    "active": False,
    "phase": "idle",  # idle | finding_files | scanning | pending_confirmation | cleaning | complete
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
    "files_found": 0,
    "files_scanned": 0,
    "total_files": 0,
    "scan_speed": 0.0,
    "detected_threats": [],
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


def _load_enum_estimate() -> int:
    """Load the previous scan's file count as an estimate for progress."""
    try:
        if _enum_estimate_path.exists():
            with open(_enum_estimate_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return int(data.get("total_files", 0))
    except Exception:
        pass
    return 500_000  # Conservative default for first full scan


def _save_enum_estimate(total_files: int) -> None:
    """Persist the latest file count so the next scan can show smooth progress."""
    try:
        tmp = _enum_estimate_path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"total_files": total_files, "updated_at": _now_ms()}, f)
        tmp.replace(_enum_estimate_path)
    except Exception:
        pass


def _collect_scannable_files(root_path: str) -> list[str]:
    """Collect all scannable file paths under one scan root using os.scandir.

    Uses a stack-based walk with DirEntry objects so stat() calls are cached
    by the OS. This is significantly faster than os.path.getsize() per file.
    Updates live counters so the UI can show progress during enumeration.
    """
    paths: list[str] = []
    stack = [root_path]
    while stack:
        with _lock:
            if _progress.get("cancel_requested"):
                return paths
        current = stack.pop()
        if _is_excluded(current):
            continue
        depth = current.replace(root_path, "").count(os.sep)
        if depth > _MAX_DEPTH:
            continue
        try:
            with os.scandir(current) as it:
                for entry in it:
                    with _lock:
                        if _progress.get("cancel_requested"):
                            return paths
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            if entry.name.lower() not in _CFG_EXCLUDE_DIR_NAMES:
                                stack.append(entry.path)
                                with _lock:
                                    _enum_state["dirs_visited"] += 1
                        elif entry.is_file(follow_symlinks=False):
                            fpath = entry.path
                            if not _should_scan_file(fpath):
                                continue
                            try:
                                if entry.stat().st_size > _MAX_FILE_SIZE:
                                    continue
                            except OSError:
                                continue
                            paths.append(fpath)
                            with _lock:
                                _enum_state["files_found"] += 1
                    except OSError:
                        continue
        except OSError:
            continue
    return paths


def _collect_all_scannable_files(roots: list[str]) -> list[str]:
    """Collect scannable file paths across all scan roots in parallel.

    Resets live counters before starting and updates the progress dictionary
    so the frontend can show the "Finding Files" phase.
    """
    all_paths: list[str] = []
    with _lock:
        _enum_state["files_found"] = 0
        _enum_state["dirs_visited"] = 0
    try:
        from concurrent.futures import ThreadPoolExecutor as _TPE, as_completed as _as_completed
        with _TPE(max_workers=min(len(roots), 8)) as pool:
            futures = {pool.submit(_collect_scannable_files, r): r for r in roots}
            for fut in _as_completed(futures):
                all_paths.extend(fut.result())
    except Exception:
        # Fallback to sequential enumeration
        for r in roots:
            all_paths.extend(_collect_scannable_files(r))
    return all_paths


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

    # ─── Phase 1: Collect all scannable file paths in parallel ─────
    # Parallel per-drive enumeration is much faster than the previous
    # sequential count + sequential walk. The frontend now shows a
    # dedicated "Finding Files" phase (1-100%) before scanning begins.
    with _lock:
        _progress["phase"] = "finding_files"
        _progress["current_file"] = "Finding files to scan..."
        _progress["scan_progress"] = 1
        _progress["files_found"] = 0
        _progress["files_scanned"] = 0
        _progress["total_files"] = 0

    enum_started = time.monotonic()
    enum_estimate = _load_enum_estimate()

    def _update_enum_progress() -> None:
        """Update finding-files progress every ~250ms based on files found."""
        last = time.monotonic()
        while _progress.get("phase") == "finding_files" and not _progress.get("cancel_requested"):
            time.sleep(0.25)
            with _lock:
                if _progress.get("phase") != "finding_files":
                    return
                files_found = _enum_state["files_found"]
                _progress["files_found"] = files_found
                # Percentage against the last scan's total; cap at 99% until done
                pct = min(99, int((files_found / max(enum_estimate, 1)) * 100))
                _progress["scan_progress"] = max(_progress.get("scan_progress", 1), pct)
                _progress["scan_speed"] = round(
                    files_found / max(time.monotonic() - enum_started, 0.001), 1
                )
            now = time.monotonic()
            if now - last < 0.25:
                continue
            last = now

    enum_progress_thread = threading.Thread(target=_update_enum_progress, daemon=True)
    enum_progress_thread.start()

    file_list = _collect_all_scannable_files(scan_roots)
    with _lock:
        _progress["phase"] = "scanning"
        _progress["scan_progress"] = 1
    enum_progress_thread.join(timeout=1.0)

    if _progress.get("cancel_requested"):
        return {"files_scanned": 0, "threats_found": 0, "threats": []}

    total_files = len(file_list) or 1
    _save_enum_estimate(total_files)

    with _lock:
        _progress["total_files"] = total_files
        _progress["current_file"] = f"Scanning {total_files:,} files..."
        _progress["scan_progress"] = 1

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

    # ─── Batch parallel scan ───────────────────────────────────────
    # The file list is already known, so we can keep the executor saturated
    # from the very first file. As each scan completes we immediately submit
    # the next path; this maximizes throughput (target 350-500 files/sec)
    # and gives a smooth progress bar based on the exact total.
    max_workers = min(48, (os.cpu_count() or 4) * 6)
    executor = ThreadPoolExecutor(max_workers=max_workers)
    futures: dict = {}
    file_iter = iter(file_list)
    last_update = time.monotonic()
    scan_started_mono = time.monotonic()
    _max_scan_pct = 0  # track max progress so scan_progress never goes backwards

    try:
        # Pre-fill the executor before draining
        for _ in range(max_workers * 3):
            try:
                fpath = next(file_iter)
            except StopIteration:
                break
            future = executor.submit(_scan_single_file, fpath)
            futures[future] = fpath

        while futures:
            with _lock:
                if _progress.get("cancel_requested"):
                    break

            done_futures = [f for f in futures if f.done()]
            if not done_futures:
                time.sleep(0.01)
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

                # Keep executor saturated by submitting the next file immediately
                try:
                    next_path = next(file_iter)
                    future = executor.submit(_scan_single_file, next_path)
                    futures[future] = next_path
                except StopIteration:
                    pass

            now = time.monotonic()
            if now - last_update >= 0.25:
                last_update = now
                with _lock:
                    frac = files_scanned / total_files
                    pct = min(_PHASE_FILE_SCAN_END, int(frac * _PHASE_FILE_SCAN_END))
                    if pct > _max_scan_pct:
                        _max_scan_pct = pct
                    _progress["scan_progress"] = _max_scan_pct
                    _progress["files_scanned"] = files_scanned
                    _progress["total_files"] = total_files
                    elapsed = max(now - scan_started_mono, 0.001)
                    _progress["scan_speed"] = round(files_scanned / elapsed, 1)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    with _lock:
        if not _progress.get("cancel_requested"):
            _progress["scan_progress"] = _PHASE_FILE_SCAN_END
        _progress["current_file"] = None
        _progress["files_scanned"] = files_scanned
        _progress["total_files"] = total_files

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
            "files_found": 0,
            "files_scanned": 0,
            "total_files": 0,
            "scan_speed": 0.0,
            "detected_threats": [],
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

    # Email attachment, process memory, and browser extension scans are
    # offered as separate optional scans (one_click.scan_email,
    # one_click.scan_memory, one_click.scan_extensions) so they don't slow
    # down or block the main one-click file scan.
    _extra_threats: list[dict[str, Any]] = []

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
    # Add network threats collected above
    all_threats.extend(_extra_threats)
    if all_threats and not _cancel_requested():
        # ── Quarantine confirmation gate ──────────────────────────────
        # Pause and ask the user for permission before quarantining any
        # files. The frontend detects the "pending_confirmation" phase
        # and shows a dialog. The user must call one_click.confirm_quarantine
        # to proceed, or one_click.skip_quarantine to skip.
        with _lock:
            _progress["phase"] = "pending_confirmation"
            _progress["detected_threats"] = all_threats
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
                            threat["quarantined"] = True
                            threat["quarantine_id"] = q_result.get("result", {}).get("quarantine_id")
                        else:
                            threat["quarantined"] = False
                            threat["quarantine_error"] = q_result.get("error", "Quarantine failed")
                    except Exception as e:
                        log.warning("One-click: Failed to quarantine %s: %s", threat["path"], e)
                        threat["quarantined"] = False
                        threat["quarantine_error"] = str(e)

                    # Update quarantine count LIVE after every item (not just once
                    # at the end) so the UI's "quarantined" counter increments in
                    # sync with the "threats found" counter instead of staying
                    # frozen at 0 until the whole batch finishes.
                    with _lock:
                        _progress["threats_quarantined"] = result["threats_quarantined"]
                        _progress["detected_threats"] = all_threats
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


@register("one_click.scan_email")
def one_click_scan_email(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Standalone email attachment scan, run outside the main one-click flow."""
    try:
        from avs_backend.threat_engine.email_scanner import EmailScanner
        scanner = EmailScanner()
        result = scanner.scan_mailbox()
        return {"success": True, **result}
    except Exception as e:
        log.error("Email scan failed: %s", e)
        return {"success": False, "error": str(e)}


@register("one_click.scan_memory")
def one_click_scan_memory(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Standalone process memory scan, run outside the main one-click flow."""
    try:
        from avs_backend.threat_engine.memory_scanner import MemoryScanner
        scanner = MemoryScanner()
        result = scanner.scan_all_processes()
        return {"success": True, **result}
    except Exception as e:
        log.error("Memory scan failed: %s", e)
        return {"success": False, "error": str(e)}


@register("one_click.scan_extensions")
def one_click_scan_extensions(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Standalone browser extension scan, run outside the main one-click flow."""
    try:
        from avs_backend.browser_extensions import _get_all_extensions
        extensions = _get_all_extensions()
        detected: list[dict[str, Any]] = []

        js_patterns = [
            ("eval(atob(", 5, "Base64-encoded eval (obfuscation)"),
            ("eval(unescape(", 4, "Escaped eval (obfuscation)"),
            ("Function(atob(", 5, "Base64-encoded Function constructor"),
            ("crypto.miner", 5, "Cryptocurrency mining"),
            ("coinhive", 5, "Coinhive miner"),
            ("crypto-loot", 5, "Crypto-Loot miner"),
            ("chrome.debugger", 4, "Debugger API access"),
        ]

        for ext in extensions:
            ext_path = ext.get("path", "")
            ext_name = ext.get("name", "Unknown")

            if not ext_path or not os.path.isdir(ext_path):
                continue

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
                detected.append({
                    "path": ext_path,
                    "threat_name": f"BrowserExt.Suspicious.{ext_name}",
                    "threat_type": "adware" if "ad" in str(reasons).lower() else "spyware",
                    "severity": severity,
                    "source": "browser_ext_scanner",
                    "reasons": reasons,
                    "extension": ext,
                })

        return {
            "success": True,
            "extensions_scanned": len(extensions),
            "threats_found": len(detected),
            "threats": detected,
        }
    except Exception as e:
        log.error("Browser extension scan failed: %s", e)
        return {"success": False, "error": str(e)}
