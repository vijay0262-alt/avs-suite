"""Threat Engine — unified malware detection and protection system.

This is the core antivirus/anti-malware engine for AVS Shield. It
orchestrates multiple detection sources:

  1. Hash-based detection (local blocklist + VirusTotal cloud reputation)
  2. YARA rules scanning (custom + community rules)
  3. ClamAV signature scanning (if ClamAV daemon is available)
  4. AMSI script scanning (Windows AMSI for script-based malware)
  5. Heuristic analysis (file characteristics, behavior patterns)
  6. Windows Defender integration (leverages existing Defender detections)

Each detection source is implemented as a separate module and registered
with the orchestrator. The orchestrator runs scans in parallel and
aggregates results into a unified threat report.

RPC methods:
    threat.scan           — scan a file or directory for threats
    threat.scanStatus     — get status of an async scan
    threat.scanResult     — get results of a completed scan
    threat.scanCancel     — cancel a running scan
    threat.quickScan      — quick scan of critical system areas
    threat.fullScan       — full system scan of all drives
    threat.status         — get threat engine status and configuration
    threat.configure      — configure detection sources
    threat.quarantine     — quarantine a detected threat
    threat.restore        — restore a quarantined file
    threat.remove         — permanently remove a detected threat
    threat.listThreats    — list all detected threats from last scan
    threat.definitions    — get threat definition counts and update status
    threat.updateDefs     — update threat definitions (signatures, rules, hashes)
    threat.history        — get scan and detection history
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import subprocess
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, Future
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.threat_engine")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# ─── Scan state management ──────────────────────────────────────────

_scans: dict[str, dict[str, Any]] = {}
_scans_lock = threading.Lock()

# ─── Threat definition storage paths ────────────────────────────────

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)

_HASH_DB_PATH = _DATA_DIR / "hash_blocklist.json"
_YARA_RULES_DIR = _DATA_DIR / "yara_rules"
_YARA_RULES_DIR.mkdir(parents=True, exist_ok=True)
_CONFIG_PATH = _DATA_DIR / "config.json"
_HISTORY_PATH = _DATA_DIR / "history.json"

# ─── Default configuration ──────────────────────────────────────────

_DEFAULT_CONFIG = {
    "enabled_sources": {
        "hash_blocklist": True,
        "virustotal": True,  # Enabled — API key pre-configured
        "yara": True,
        "clamav": False,  # Off by default — requires ClamAV installed
        "amsi": True,
        "heuristic": True,
        "defender": True,
    },
    "virustotal_api_key": "REDACTED_VIRUSTOTAL_API_KEY",
    "scan_max_file_size_mb": 100,
    "scan_archives": True,
    "scan_email": False,
    "auto_quarantine": False,  # Don't auto-quarantine by default
    "exclude_paths": [
        "C:\\Windows\\WinSxS",
        "C:\\ProgramData\\Microsoft",
        "C:\\Program Files\\WindowsApps",
    ],
}


def _load_config() -> dict[str, Any]:
    """Load threat engine configuration from disk."""
    if _CONFIG_PATH.exists():
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            # Merge with defaults to handle new keys
            merged = _DEFAULT_CONFIG.copy()
            merged.update(cfg)
            if "enabled_sources" in cfg:
                merged["enabled_sources"] = {**_DEFAULT_CONFIG["enabled_sources"], **cfg["enabled_sources"]}
            return merged
        except Exception as e:
            log.warning("Failed to load threat engine config: %s", e)
    return _DEFAULT_CONFIG.copy()


def _save_config(cfg: dict[str, Any]) -> None:
    """Save threat engine configuration to disk."""
    try:
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        log.error("Failed to save threat engine config: %s", e)


_config = _load_config()


# ─── File hashing utilities ─────────────────────────────────────────

# File extensions to scan
_SCAN_EXTENSIONS = {
    ".exe", ".dll", ".sys", ".scr", ".ocx", ".com", ".pif", ".bat",
    ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".wsh", ".hta",
    ".msi", ".msp", ".mst", ".cpl", ".inf", ".lnk", ".jar", ".class",
    ".py", ".pyw", ".rb", ".pl", ".sh", ".apk", ".appx", ".msix",
    ".zip", ".rar", ".7z", ".cab", ".tar", ".gz", ".iso", ".img",
    ".doc", ".xls", ".ppt", ".docm", ".xlsm", ".pptm",
    ".pdf", ".html", ".htm", ".swf", ".flv",
}

# Extensions to always skip
_SKIP_EXTENSIONS = {".txt", ".log", ".csv", ".json", ".xml", ".css", ".md", ".rst"}


def _compute_sha256(file_path: str, max_size_mb: int = 100) -> str | None:
    """Compute SHA-256 hash of a file. Returns None on error or if too large."""
    try:
        size = os.path.getsize(file_path)
        if size > max_size_mb * 1024 * 1024:
            return None
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception as e:
        log.debug("Failed to hash %s: %s", file_path, e)
        return None


def _compute_md5(file_path: str, max_size_mb: int = 100) -> str | None:
    """Compute MD5 hash of a file (used for VirusTotal legacy lookups)."""
    try:
        size = os.path.getsize(file_path)
        if size > max_size_mb * 1024 * 1024:
            return None
        h = hashlib.md5()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception as e:
        log.debug("Failed to MD5 hash %s: %s", file_path, e)
        return None


def _should_scan(file_path: str, config: dict[str, Any]) -> bool:
    """Determine if a file should be scanned based on extension and exclusion rules."""
    ext = os.path.splitext(file_path)[1].lower()

    # Skip known-safe extensions
    if ext in _SKIP_EXTENSIONS:
        return False

    # Scan known-dangerous extensions
    if ext in _SCAN_EXTENSIONS:
        # Check exclusions
        for excl in config.get("exclude_paths", []):
            if file_path.lower().startswith(excl.lower()):
                return False
        return True

    # For files without extension or unknown extensions, scan if they're
    # in suspicious locations (Downloads, Temp, AppData)
    suspicious_dirs = ["Downloads", "Temp", "AppData", "Desktop"]
    for sd in suspicious_dirs:
        if sd.lower() in file_path.lower():
            return True

    return False


def _enumerate_scan_targets(path: str, config: dict[str, Any]) -> list[str]:
    """Enumerate files to scan in the given path."""
    targets = []
    max_size = config.get("scan_max_file_size_mb", 100) * 1024 * 1024

    try:
        if os.path.isfile(path):
            if _should_scan(path, config):
                targets.append(path)
        elif os.path.isdir(path):
            for root, dirs, files in os.walk(path):
                # Skip excluded paths
                root_lower = root.lower()
                if any(root_lower.startswith(excl.lower()) for excl in config.get("exclude_paths", [])):
                    dirs.clear()
                    continue

                for fname in files:
                    fpath = os.path.join(root, fname)
                    try:
                        if os.path.getsize(fpath) <= max_size and _should_scan(fpath, config):
                            targets.append(fpath)
                    except OSError:
                        continue
    except Exception as e:
        log.error("Error enumerating %s: %s", path, e)

    return targets


# ─── Quick scan targets (critical system areas) ─────────────────────

def _get_quick_scan_targets() -> list[str]:
    """Get paths for a quick scan — critical system areas where malware commonly resides."""
    targets = []
    if IS_WINDOWS:
        user_profile = os.environ.get("USERPROFILE", os.path.expanduser("~"))
        app_data = os.environ.get("APPDATA", "")
        local_app = os.environ.get("LOCALAPPDATA", "")
        temp_dir = os.environ.get("TEMP", "")

        critical_paths = [
            os.path.join(user_profile, "Downloads"),
            os.path.join(user_profile, "Desktop"),
            temp_dir,
            os.path.join(local_app, "Temp"),
            os.path.join(app_data, "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
            os.path.join(local_app, "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
            os.path.join(app_data),
            os.path.join(local_app),
            "C:\\ProgramData",
            os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Temp"),
        ]

        for p in critical_paths:
            if os.path.exists(p):
                targets.append(p)

    return targets


# ─── Scan execution ─────────────────────────────────────────────────

def _execute_scan(scan_id: str, targets: list[str], config: dict[str, Any]) -> None:
    """Execute a scan across all enabled detection sources."""
    scan = _scans[scan_id]
    detected_threats: list[dict[str, Any]] = []
    files_scanned = 0
    errors = []

    # Import detection sources lazily
    enabled = config.get("enabled_sources", {})

    # Initialize detection sources
    detectors = []

    if enabled.get("hash_blocklist", True):
        try:
            from avs_backend.threat_engine.hash_detector import HashDetector
            detectors.append(HashDetector(config))
        except Exception as e:
            log.warning("Hash detector init failed: %s", e)
            errors.append(f"Hash detector: {e}")

    if enabled.get("virustotal", False) and config.get("virustotal_api_key"):
        try:
            from avs_backend.threat_engine.virustotal import VirusTotalDetector
            detectors.append(VirusTotalDetector(config.get("virustotal_api_key", "")))
        except Exception as e:
            log.warning("VirusTotal init failed: %s", e)
            errors.append(f"VirusTotal: {e}")

    if enabled.get("yara", True):
        try:
            from avs_backend.threat_engine.yara_scanner import YaraScanner
            detectors.append(YaraScanner(config))
        except Exception as e:
            log.warning("YARA scanner init failed: %s", e)
            errors.append(f"YARA: {e}")

    if enabled.get("clamav", False):
        try:
            from avs_backend.threat_engine.clamav_scanner import ClamAvScanner
            detectors.append(ClamAvScanner(config))
        except Exception as e:
            log.warning("ClamAV init failed: %s", e)
            errors.append(f"ClamAV: {e}")

    if enabled.get("amsi", True) and IS_WINDOWS:
        try:
            from avs_backend.threat_engine.amsi_scanner import AmsiScanner
            detectors.append(AmsiScanner(config))
        except Exception as e:
            log.warning("AMSI init failed: %s", e)
            errors.append(f"AMSI: {e}")

    if enabled.get("heuristic", True):
        try:
            from avs_backend.threat_engine.heuristic import HeuristicDetector
            detectors.append(HeuristicDetector(config))
        except Exception as e:
            log.warning("Heuristic detector init failed: %s", e)
            errors.append(f"Heuristic: {e}")

    if enabled.get("defender", True) and IS_WINDOWS:
        try:
            from avs_backend.threat_engine.defender_scanner import DefenderScanner
            detectors.append(DefenderScanner(config))
        except Exception as e:
            log.warning("Defender scanner init failed: %s", e)
            errors.append(f"Defender: {e}")

    log.info("Threat scan %s: %d detectors initialized, %d files to scan", scan_id, len(detectors), len(targets))

    for file_path in targets:
        # Check for cancellation
        if scan.get("cancel", False):
            scan["status"] = "cancelled"
            scan["completed_at"] = datetime.now(timezone.utc).isoformat()
            return

        files_scanned += 1
        scan["files_scanned"] = files_scanned
        scan["progress"] = int((files_scanned / max(len(targets), 1)) * 100)

        # Run each detector on this file
        for detector in detectors:
            try:
                result = detector.scan_file(file_path)
                if result and result.get("detected"):
                    threat = {
                        "id": str(uuid.uuid4()),
                        "file_path": file_path,
                        "file_name": os.path.basename(file_path),
                        "file_size": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
                        "detection_source": detector.name,
                        "threat_name": result.get("threat_name", "Unknown"),
                        "threat_type": result.get("threat_type", "unknown"),
                        "severity": result.get("severity", "medium"),
                        "confidence": result.get("confidence", 0.5),
                        "details": result.get("details", {}),
                        "sha256": result.get("sha256"),
                        "md5": result.get("md5"),
                        "detected_at": datetime.now(timezone.utc).isoformat(),
                        "status": "detected",  # detected, quarantined, removed, ignored
                    }
                    detected_threats.append(threat)
                    scan["threats_found"] = len(detected_threats)

                    # Auto-quarantine if enabled
                    if config.get("auto_quarantine", False):
                        try:
                            from avs_backend.threat_engine.quarantine_manager import quarantine_file
                            qresult = quarantine_file(file_path, threat)
                            threat["status"] = "quarantined"
                            threat["quarantine_id"] = qresult.get("quarantine_id")
                        except Exception as qe:
                            log.error("Auto-quarantine failed for %s: %s", file_path, qe)

            except Exception as e:
                log.debug("Detector %s error on %s: %s", detector.name, file_path, e)

    # Update scan record
    scan["status"] = "complete"
    scan["completed_at"] = datetime.now(timezone.utc).isoformat()
    scan["threats"] = detected_threats
    scan["errors"] = errors
    scan["progress"] = 100

    # Save to history
    _save_scan_history(scan_id, scan)

    log.info("Threat scan %s complete: %d files scanned, %d threats found",
             scan_id, files_scanned, len(detected_threats))


def _save_scan_history(scan_id: str, scan: dict[str, Any]) -> None:
    """Save scan result to history file."""
    try:
        history = []
        if _HISTORY_PATH.exists():
            with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
                history = json.load(f)

        history_entry = {
            "scan_id": scan_id,
            "scan_type": scan.get("scan_type", "custom"),
            "started_at": scan.get("started_at"),
            "completed_at": scan.get("completed_at"),
            "files_scanned": scan.get("files_scanned", 0),
            "threats_found": scan.get("threats_found", 0),
            "threats": scan.get("threats", []),
        }
        history.append(history_entry)

        # Keep last 100 scans
        if len(history) > 100:
            history = history[-100:]

        with open(_HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        log.error("Failed to save scan history: %s", e)


# ─── RPC Handlers ───────────────────────────────────────────────────

@register("threat.scan")
def threat_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan a file or directory for threats.

    Params:
        path: File or directory path to scan
        scan_type: "quick", "full", or "custom" (default: "custom")
    """
    params = params or {}
    path = params.get("path", "")
    scan_type = params.get("scan_type", "custom")

    if not path and scan_type == "custom":
        return {"success": False, "error": "path is required for custom scan", "error_code": "INVALID_PARAMS"}

    scan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Determine targets
    if scan_type == "quick":
        target_paths = _get_quick_scan_targets()
        all_targets = []
        for tp in target_paths:
            all_targets.extend(_enumerate_scan_targets(tp, _config))
    elif scan_type == "full":
        # Scan all fixed drives
        all_targets = []
        if IS_WINDOWS:
            try:
                import string
                for letter in string.ascii_uppercase:
                    drive = f"{letter}:\\"
                    if os.path.exists(drive):
                        all_targets.extend(_enumerate_scan_targets(drive, _config))
            except Exception:
                pass
        else:
            all_targets = _enumerate_scan_targets(path or "/", _config)
    else:
        all_targets = _enumerate_scan_targets(path, _config)

    scan = {
        "scan_id": scan_id,
        "scan_type": scan_type,
        "status": "scanning",
        "started_at": now,
        "completed_at": None,
        "files_total": len(all_targets),
        "files_scanned": 0,
        "threats_found": 0,
        "threats": [],
        "progress": 0,
        "cancel": False,
        "errors": [],
    }

    with _scans_lock:
        _scans[scan_id] = scan

    # Run scan in background thread
    def _run():
        try:
            _execute_scan(scan_id, all_targets, _config)
        except Exception as e:
            log.error("Scan %s failed: %s", scan_id, e)
            with _scans_lock:
                if scan_id in _scans:
                    _scans[scan_id]["status"] = "error"
                    _scans[scan_id]["error"] = str(e)
                    _scans[scan_id]["completed_at"] = datetime.now(timezone.utc).isoformat()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return {"success": True, "scan_id": scan_id, "files_total": len(all_targets)}


@register("threat.quickScan")
def threat_quick_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Quick scan of critical system areas."""
    return threat_scan({"scan_type": "quick"})


@register("threat.fullScan")
def threat_full_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Full system scan of all drives."""
    return threat_scan({"scan_type": "full"})


@register("threat.scanStatus")
def threat_scan_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get status of an async scan."""
    params = params or {}
    scan_id = params.get("scan_id", "")
    if not scan_id:
        return {"success": False, "error": "scan_id is required", "error_code": "INVALID_PARAMS"}

    with _scans_lock:
        scan = _scans.get(scan_id)
    if not scan:
        return {"success": False, "error": "scan not found", "error_code": "NOT_FOUND"}

    return {
        "success": True,
        "scan_id": scan_id,
        "status": scan["status"],
        "progress": scan.get("progress", 0),
        "files_scanned": scan.get("files_scanned", 0),
        "files_total": scan.get("files_total", 0),
        "threats_found": scan.get("threats_found", 0),
    }


@register("threat.scanResult")
def threat_scan_result(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get results of a completed scan."""
    params = params or {}
    scan_id = params.get("scan_id", "")
    if not scan_id:
        return {"success": False, "error": "scan_id is required", "error_code": "INVALID_PARAMS"}

    with _scans_lock:
        scan = _scans.get(scan_id)
    if not scan:
        return {"success": False, "error": "scan not found", "error_code": "NOT_FOUND"}

    return {
        "success": True,
        "scan_id": scan_id,
        "status": scan["status"],
        "scan_type": scan.get("scan_type", "custom"),
        "started_at": scan.get("started_at"),
        "completed_at": scan.get("completed_at"),
        "files_scanned": scan.get("files_scanned", 0),
        "files_total": scan.get("files_total", 0),
        "threats_found": scan.get("threats_found", 0),
        "threats": scan.get("threats", []),
        "errors": scan.get("errors", []),
    }


@register("threat.scanCancel")
def threat_scan_cancel(params: dict[str, Any] | None) -> dict[str, Any]:
    """Cancel a running scan."""
    params = params or {}
    scan_id = params.get("scan_id", "")
    if not scan_id:
        return {"success": False, "error": "scan_id is required", "error_code": "INVALID_PARAMS"}

    with _scans_lock:
        scan = _scans.get(scan_id)
    if not scan:
        return {"success": False, "error": "scan not found", "error_code": "NOT_FOUND"}

    scan["cancel"] = True
    return {"success": True, "message": "Scan cancellation requested"}


@register("threat.status")
def threat_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get threat engine status and configuration."""
    cfg = _load_config()
    enabled = cfg.get("enabled_sources", {})

    # Count active scans
    active_scans = 0
    with _scans_lock:
        for s in _scans.values():
            if s["status"] == "scanning":
                active_scans += 1

    # Get definition counts
    def_counts = _get_definition_counts()

    return {
        "success": True,
        "status": "active" if active_scans > 0 else "idle",
        "active_scans": active_scans,
        "enabled_sources": enabled,
        "definitions": def_counts,
        "config": {
            "scan_max_file_size_mb": cfg.get("scan_max_file_size_mb", 100),
            "scan_archives": cfg.get("scan_archives", True),
            "auto_quarantine": cfg.get("auto_quarantine", False),
            "exclude_paths": cfg.get("exclude_paths", []),
            "virustotal_configured": bool(cfg.get("virustotal_api_key")),
        },
    }


@register("threat.configure")
def threat_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Configure threat engine detection sources and settings."""
    global _config
    params = params or {}

    cfg = _load_config()

    if "enabled_sources" in params:
        for key, val in params["enabled_sources"].items():
            if key in cfg["enabled_sources"]:
                cfg["enabled_sources"][key] = bool(val)

    if "virustotal_api_key" in params:
        cfg["virustotal_api_key"] = params["virustotal_api_key"]

    if "scan_max_file_size_mb" in params:
        cfg["scan_max_file_size_mb"] = int(params["scan_max_file_size_mb"])

    if "auto_quarantine" in params:
        cfg["auto_quarantine"] = bool(params["auto_quarantine"])

    if "exclude_paths" in params:
        cfg["exclude_paths"] = params["exclude_paths"]

    _save_config(cfg)
    _config = cfg

    return {"success": True, "config": cfg}


@register("threat.definitions")
def threat_definitions(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get threat definition counts and update status."""
    return {"success": True, "definitions": _get_definition_counts()}


@register("threat.updateDefs")
def threat_update_defs(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update threat definitions from online feeds."""
    params = params or {}
    force = params.get("force", False)
    results = {}

    # Update hash blocklist
    try:
        from avs_backend.threat_engine.hash_detector import update_hash_feeds
        results["hash_blocklist"] = update_hash_feeds(force=force)
    except Exception as e:
        results["hash_blocklist"] = {"success": False, "error": str(e)}

    # Update YARA rules
    try:
        from avs_backend.threat_engine.yara_scanner import update_yara_rules
        results["yara"] = update_yara_rules(force=force)
    except Exception as e:
        results["yara"] = {"success": False, "error": str(e)}

    # Update ClamAV signatures (if ClamAV is installed)
    try:
        from avs_backend.threat_engine.clamav_scanner import (
            detect_clamav_installation,
            ensure_clamav_db,
        )
        install_info = detect_clamav_installation()
        if install_info.get("installed"):
            fc_path = install_info.get("freshclam_path")
            results["clamav"] = ensure_clamav_db(freshclam_path=fc_path)
        else:
            results["clamav"] = {
                "success": False,
                "message": "ClamAV is not installed. "
                           "Download from https://www.clamav.net/downloads",
                "output": "",
                "updated_at": None,
                "db_exists": False,
            }
    except Exception as e:
        results["clamav"] = {"success": False, "error": str(e)}

    return {"success": True, "results": results}


@register("threat.clamavStatus")
def threat_clamav_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get ClamAV installation and daemon status."""
    try:
        from avs_backend.threat_engine.clamav_scanner import detect_clamav_installation
        info = detect_clamav_installation()
        return {"success": True, "status": info}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavUpdate")
def threat_clamav_update(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update ClamAV signature database via freshclam."""
    try:
        from avs_backend.threat_engine.clamav_scanner import (
            detect_clamav_installation,
            ensure_clamav_db,
        )
        install_info = detect_clamav_installation()
        if not install_info.get("installed"):
            return {
                "success": False,
                "error": "ClamAV is not installed. "
                         "Download from https://www.clamav.net/downloads",
                "install_info": install_info,
            }
        fc_path = install_info.get("freshclam_path")
        result = ensure_clamav_db(freshclam_path=fc_path)
        return {"success": result.get("success", False), "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavDetect")
def threat_clamav_detect(params: dict[str, Any] | None) -> dict[str, Any]:
    """Detect ClamAV installation on this system."""
    try:
        from avs_backend.threat_engine.clamav_scanner import detect_clamav_installation
        info = detect_clamav_installation()
        return {"success": True, "detection": info}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavSetup")
def threat_clamav_setup(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start ClamAV portable download and setup (async, runs in background)."""
    try:
        from avs_backend.threat_engine.clamav_setup import start_setup
        return start_setup()
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavSetupStatus")
def threat_clamav_setup_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get ClamAV setup progress/status."""
    try:
        from avs_backend.threat_engine.clamav_setup import get_setup_status
        return {"success": True, "status": get_setup_status()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavStart")
def threat_clamav_start(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start the ClamAV daemon (clamd) as a background process."""
    try:
        from avs_backend.threat_engine.clamav_setup import start_clamd
        return start_clamd()
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavUninstall")
def threat_clamav_uninstall(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove the ClamAV portable installation."""
    try:
        from avs_backend.threat_engine.clamav_setup import uninstall
        return uninstall()
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavAutoUpdateStart")
def threat_clamav_auto_update_start(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start the ClamAV auto-update scheduler (runs freshclam daily)."""
    try:
        from avs_backend.threat_engine.clamav_setup import start_auto_update
        return start_auto_update()
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavAutoUpdateStop")
def threat_clamav_auto_update_stop(params: dict[str, Any] | None) -> dict[str, Any]:
    """Stop the ClamAV auto-update scheduler."""
    try:
        from avs_backend.threat_engine.clamav_setup import stop_auto_update
        return stop_auto_update()
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.clamavAutoUpdateStatus")
def threat_clamav_auto_update_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get ClamAV auto-update scheduler status."""
    try:
        from avs_backend.threat_engine.clamav_setup import get_auto_update_status
        return {"success": True, "status": get_auto_update_status()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("threat.listThreats")
def threat_list_threats(params: dict[str, Any] | None) -> dict[str, Any]:
    """List all detected threats from last scan or history."""
    params = params or {}
    scan_id = params.get("scan_id")

    if scan_id:
        with _scans_lock:
            scan = _scans.get(scan_id)
        if not scan:
            return {"success": False, "error": "scan not found", "error_code": "NOT_FOUND"}
        return {"success": True, "threats": scan.get("threats", [])}

    # Return from history
    try:
        if _HISTORY_PATH.exists():
            with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
                history = json.load(f)
            all_threats = []
            for entry in history[-10:]:  # Last 10 scans
                all_threats.extend(entry.get("threats", []))
            return {"success": True, "threats": all_threats}
    except Exception as e:
        log.error("Failed to load threat history: %s", e)

    return {"success": True, "threats": []}


@register("threat.quarantine")
def threat_quarantine(params: dict[str, Any] | None) -> dict[str, Any]:
    """Quarantine a detected threat."""
    params = params or {}
    file_path = params.get("file_path", "")
    threat_info = params.get("threat_info", {})

    if not file_path:
        return {"success": False, "error": "file_path is required", "error_code": "INVALID_PARAMS"}

    try:
        from avs_backend.threat_engine.quarantine_manager import quarantine_file
        result = quarantine_file(file_path, threat_info)
        return {"success": True, "result": result}
    except Exception as e:
        log.error("Quarantine failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "QUARANTINE_FAILED"}


@register("threat.restore")
def threat_restore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Restore a quarantined file."""
    params = params or {}
    quarantine_id = params.get("quarantine_id", "")
    if not quarantine_id:
        return {"success": False, "error": "quarantine_id is required", "error_code": "INVALID_PARAMS"}

    try:
        from avs_backend.threat_engine.quarantine_manager import restore_file
        result = restore_file(quarantine_id)
        return {"success": True, "result": result}
    except Exception as e:
        log.error("Restore failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "RESTORE_FAILED"}


@register("threat.remove")
def threat_remove(params: dict[str, Any] | None) -> dict[str, Any]:
    """Permanently remove a detected threat."""
    params = params or {}
    file_path = params.get("file_path", "")
    if not file_path:
        return {"success": False, "error": "file_path is required", "error_code": "INVALID_PARAMS"}

    try:
        # Securely delete the file
        if os.path.exists(file_path):
            # Overwrite with zeros before deletion
            size = os.path.getsize(file_path)
            with open(file_path, "wb") as f:
                f.write(b"\x00" * min(size, 1024 * 1024))  # Overwrite up to 1MB
            os.remove(file_path)
            return {"success": True, "message": "Threat removed", "file_path": file_path}
        else:
            return {"success": False, "error": "File not found", "error_code": "NOT_FOUND"}
    except Exception as e:
        log.error("Remove failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "REMOVE_FAILED"}


@register("threat.history")
def threat_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get scan and detection history."""
    try:
        if _HISTORY_PATH.exists():
            with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
                history = json.load(f)
            return {"success": True, "history": history[-50:]}  # Last 50 scans
    except Exception as e:
        log.error("Failed to load history: %s", e)
    return {"success": True, "history": []}


# ─── Helper functions ───────────────────────────────────────────────

def _get_definition_counts() -> dict[str, Any]:
    """Get counts of threat definitions from each source."""
    counts = {
        "hash_blocklist": 0,
        "yara_rules": 0,
        "clamav_signatures": 0,
        "clamav_available": False,
        "clamav_version": None,
        "last_updated": None,
    }

    # Hash blocklist count
    try:
        if _HASH_DB_PATH.exists():
            with open(_HASH_DB_PATH, "r", encoding="utf-8") as f:
                db = json.load(f)
            counts["hash_blocklist"] = len(db.get("hashes", []))
            counts["last_updated"] = db.get("updated_at")
    except Exception:
        pass

    # YARA rules count
    try:
        yara_files = list(_YARA_RULES_DIR.glob("*.yar")) + list(_YARA_RULES_DIR.glob("*.yara"))
        counts["yara_rules"] = len(yara_files)
    except Exception:
        pass

    # ClamAV signature count — query clamd if available
    try:
        from avs_backend.threat_engine.clamav_scanner import (
            check_clamav_available,
            get_clamav_version,
            get_clamav_signature_count,
        )
        if check_clamav_available():
            counts["clamav_available"] = True
            counts["clamav_version"] = get_clamav_version()
            counts["clamav_signatures"] = get_clamav_signature_count()
    except Exception:
        pass

    return counts


log.info("Threat Engine module loaded — %d detection sources configured",
         sum(1 for v in _config.get("enabled_sources", {}).values() if v))
