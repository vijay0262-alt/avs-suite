"""Advanced Security — Tier 3 advanced threat protection features.

Provides:
  1. Behavioral sandbox — observes executable behavior in a controlled manner
  2. ML-based anomaly classifier — statistical process behavior analysis
  3. Web shield / URL filtering — phishing and malicious URL detection
  4. Ransomware vaccine — canary files and active blocking
  5. Email attachment scanner — scans email attachments for malicious content
  6. Boot sector / MBR scanner — checks for boot-level malware

These are advanced security features that go beyond signature-based
detection. Each module is optional and degrades gracefully if its
dependencies are unavailable.

RPC methods:
    advanced_security.status           — get overall status of all advanced features
    advanced_security.sandbox.analyze  — analyze a file in the behavioral sandbox
    advanced_security.sandbox.status   — get sandbox status
    advanced_security.ml.start         — start ML anomaly monitoring
    advanced_security.ml.stop          — stop ML anomaly monitoring
    advanced_security.ml.status        — get ML classifier status
    advanced_security.ml.anomalies     — get detected anomalies
    advanced_security.ml.train         — train baseline data
    advanced_security.web.check        — check a URL
    advanced_security.web.status       — get web shield status
    advanced_security.web.updateFeeds  — update URL blocklist feeds
    advanced_security.web.blocked      — get recently blocked URLs
    advanced_security.web.addBlock     — add URL to blocklist
    advanced_security.web.removeBlock  — remove URL from blocklist
    advanced_security.ransomware.start    — start ransomware vaccine
    advanced_security.ransomware.stop     — stop ransomware vaccine
    advanced_security.ransomware.status   — get vaccine status
    advanced_security.ransomware.alerts   — get ransomware alerts
    advanced_security.ransomware.configure — configure vaccine settings
    advanced_security.ransomware.deploy   — deploy canary files
    advanced_security.ransomware.remove   — remove canary files
    advanced_security.email.scan        — scan an email attachment
    advanced_security.email.scanDir     — scan a directory of attachments
    advanced_security.email.status      — get email scanner status
    advanced_security.email.history     — get scan history
    advanced_security.boot.scan         — scan boot sector / MBR
    advanced_security.boot.scanDrive    — scan a specific drive
    advanced_security.boot.status       — get boot scanner status
    advanced_security.boot.backup       — backup MBR
    advanced_security.boot.verify       — verify MBR against backup
    advanced_security.boot.history      — get boot scan history
"""

from __future__ import annotations

import logging
import os
import platform
import threading
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.advanced_security")

IS_WINDOWS = platform.system() == "Windows"

# ─── Data paths ─────────────────────────────────────────────────────

_DATA_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
    "AVS Shield",
    "threat_engine",
)
os.makedirs(_DATA_DIR, exist_ok=True)

# ─── Module instances ───────────────────────────────────────────────

_sandbox: Any = None
_ml_classifier: Any = None
_web_shield: Any = None
_ransomware: Any = None
_email_scanner: Any = None
_boot_scanner: Any = None
_init_lock = threading.Lock()


def _init_modules() -> None:
    """Initialize all advanced security modules."""
    global _sandbox, _ml_classifier, _web_shield, _ransomware, _email_scanner, _boot_scanner

    with _init_lock:
        if _sandbox is None:
            try:
                from avs_backend.advanced_security.behavioral_sandbox import BehavioralSandbox
                _sandbox = BehavioralSandbox({"observation_time": 10})
                log.info("Behavioral sandbox initialized")
            except Exception as e:
                log.warning("Failed to init behavioral sandbox: %s", e)

        if _ml_classifier is None:
            try:
                from avs_backend.advanced_security.ml_anomaly import MLAnomalyClassifier
                _ml_classifier = MLAnomalyClassifier({})
                log.info("ML anomaly classifier initialized")
            except Exception as e:
                log.warning("Failed to init ML anomaly classifier: %s", e)

        if _web_shield is None:
            try:
                from avs_backend.advanced_security.web_shield import WebShield
                _web_shield = WebShield({})
                log.info("Web shield initialized")
            except Exception as e:
                log.warning("Failed to init web shield: %s", e)

        if _ransomware is None:
            try:
                from avs_backend.advanced_security.ransomware_vaccine import RansomwareVaccine
                _ransomware = RansomwareVaccine({})
                log.info("Ransomware vaccine initialized")
            except Exception as e:
                log.warning("Failed to init ransomware vaccine: %s", e)

        if _email_scanner is None:
            try:
                from avs_backend.advanced_security.email_scanner import EmailScanner
                _email_scanner = EmailScanner({})
                log.info("Email scanner initialized")
            except Exception as e:
                log.warning("Failed to init email scanner: %s", e)

        if _boot_scanner is None:
            try:
                from avs_backend.advanced_security.boot_sector import BootSectorScanner
                _boot_scanner = BootSectorScanner({})
                log.info("Boot sector scanner initialized")
            except Exception as e:
                log.warning("Failed to init boot sector scanner: %s", e)


# ─── RPC: Overall status ────────────────────────────────────────────

@register("advanced_security.status")
def advanced_security_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get overall status of all advanced security features."""
    _init_modules()

    status = {
        "platform": platform.system(),
        "behavioral_sandbox": _sandbox.get_status() if _sandbox else None,
        "ml_anomaly": _ml_classifier.get_status() if _ml_classifier else None,
        "web_shield": _web_shield.get_status() if _web_shield else None,
        "ransomware_vaccine": _ransomware.get_status() if _ransomware else None,
        "email_scanner": _email_scanner.get_status() if _email_scanner else None,
        "boot_scanner": _boot_scanner.get_status() if _boot_scanner else None,
    }

    return {"success": True, "status": status}


# ─── RPC: Behavioral Sandbox ────────────────────────────────────────

@register("advanced_security.sandbox.analyze")
def sandbox_analyze(params: dict[str, Any] | None) -> dict[str, Any]:
    """Analyze a file in the behavioral sandbox."""
    params = params or {}
    file_path = params.get("file_path", "")
    if not file_path:
        return {"success": False, "error": "file_path is required", "error_code": "INVALID_PARAMS"}

    _init_modules()
    if not _sandbox:
        return {"success": False, "error": "Behavioral sandbox not available", "error_code": "NOT_AVAILABLE"}

    try:
        result = _sandbox.analyze(file_path)
        return {"success": True, "result": result}
    except Exception as e:
        log.error("Sandbox analysis failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "SANDBOX_FAILED"}


@register("advanced_security.sandbox.status")
def sandbox_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get behavioral sandbox status."""
    _init_modules()
    if not _sandbox:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _sandbox.get_status()}


# ─── RPC: ML Anomaly Classifier ─────────────────────────────────────

@register("advanced_security.ml.start")
def ml_start(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start ML anomaly monitoring."""
    _init_modules()
    if not _ml_classifier:
        return {"success": False, "error": "ML classifier not available", "error_code": "NOT_AVAILABLE"}
    try:
        _ml_classifier.start()
        return {"success": True, "message": "ML anomaly monitoring started"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.ml.stop")
def ml_stop(params: dict[str, Any] | None) -> dict[str, Any]:
    """Stop ML anomaly monitoring."""
    _init_modules()
    if not _ml_classifier:
        return {"success": False, "error": "ML classifier not available", "error_code": "NOT_AVAILABLE"}
    try:
        _ml_classifier.stop()
        return {"success": True, "message": "ML anomaly monitoring stopped"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.ml.status")
def ml_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get ML classifier status."""
    _init_modules()
    if not _ml_classifier:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _ml_classifier.get_status()}


@register("advanced_security.ml.anomalies")
def ml_anomalies(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get detected anomalies."""
    _init_modules()
    if not _ml_classifier:
        return {"success": True, "anomalies": []}
    return {"success": True, "anomalies": _ml_classifier.get_anomalies()}


@register("advanced_security.ml.train")
def ml_train(params: dict[str, Any] | None) -> dict[str, Any]:
    """Train baseline data."""
    params = params or {}
    duration = params.get("duration_seconds", 60)
    _init_modules()
    if not _ml_classifier:
        return {"success": False, "error": "ML classifier not available", "error_code": "NOT_AVAILABLE"}
    try:
        result = _ml_classifier.train_baseline(duration)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC: Web Shield ────────────────────────────────────────────────

@register("advanced_security.web.check")
def web_check(params: dict[str, Any] | None) -> dict[str, Any]:
    """Check a URL against blocklists."""
    params = params or {}
    url = params.get("url", "")
    if not url:
        return {"success": False, "error": "url is required", "error_code": "INVALID_PARAMS"}

    _init_modules()
    if not _web_shield:
        return {"success": False, "error": "Web shield not available", "error_code": "NOT_AVAILABLE"}

    try:
        result = _web_shield.check_url(url)
        return {"success": True, "result": result}
    except Exception as e:
        log.error("URL check failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "WEB_CHECK_FAILED"}


@register("advanced_security.web.status")
def web_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get web shield status."""
    _init_modules()
    if not _web_shield:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _web_shield.get_status()}


@register("advanced_security.web.updateFeeds")
def web_update_feeds(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update URL blocklist feeds."""
    params = params or {}
    force = params.get("force", False)
    _init_modules()
    if not _web_shield:
        return {"success": False, "error": "Web shield not available", "error_code": "NOT_AVAILABLE"}
    try:
        result = _web_shield.update_feeds(force=force)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.web.blocked")
def web_blocked(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recently blocked URLs."""
    _init_modules()
    if not _web_shield:
        return {"success": True, "blocked": []}
    return {"success": True, "blocked": _web_shield.get_blocked_urls()}


@register("advanced_security.web.addBlock")
def web_add_block(params: dict[str, Any] | None) -> dict[str, Any]:
    """Add a URL to the blocklist."""
    params = params or {}
    url = params.get("url", "")
    category = params.get("category", "manual")
    if not url:
        return {"success": False, "error": "url is required", "error_code": "INVALID_PARAMS"}
    _init_modules()
    if not _web_shield:
        return {"success": False, "error": "Web shield not available", "error_code": "NOT_AVAILABLE"}
    try:
        return {"success": True, "result": _web_shield.add_to_blocklist(url, category)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.web.removeBlock")
def web_remove_block(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove a URL from the blocklist."""
    params = params or {}
    url = params.get("url", "")
    if not url:
        return {"success": False, "error": "url is required", "error_code": "INVALID_PARAMS"}
    _init_modules()
    if not _web_shield:
        return {"success": False, "error": "Web shield not available", "error_code": "NOT_AVAILABLE"}
    try:
        return {"success": True, "result": _web_shield.remove_from_blocklist(url)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC: Ransomware Vaccine ────────────────────────────────────────

@register("advanced_security.ransomware.start")
def ransomware_start(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start ransomware vaccine (deploy canaries and monitor)."""
    _init_modules()
    if not _ransomware:
        return {"success": False, "error": "Ransomware vaccine not available", "error_code": "NOT_AVAILABLE"}
    try:
        _ransomware.start()
        return {"success": True, "message": "Ransomware vaccine started"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.ransomware.stop")
def ransomware_stop(params: dict[str, Any] | None) -> dict[str, Any]:
    """Stop ransomware vaccine."""
    _init_modules()
    if not _ransomware:
        return {"success": False, "error": "Ransomware vaccine not available", "error_code": "NOT_AVAILABLE"}
    try:
        _ransomware.stop()
        return {"success": True, "message": "Ransomware vaccine stopped"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.ransomware.status")
def ransomware_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get ransomware vaccine status."""
    _init_modules()
    if not _ransomware:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _ransomware.get_status()}


@register("advanced_security.ransomware.alerts")
def ransomware_alerts(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get ransomware alerts."""
    _init_modules()
    if not _ransomware:
        return {"success": True, "alerts": []}
    return {"success": True, "alerts": _ransomware.get_alerts()}


@register("advanced_security.ransomware.configure")
def ransomware_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Configure ransomware vaccine settings."""
    params = params or {}
    _init_modules()
    if not _ransomware:
        return {"success": False, "error": "Ransomware vaccine not available", "error_code": "NOT_AVAILABLE"}
    try:
        return {"success": True, "result": _ransomware.configure(params)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.ransomware.deploy")
def ransomware_deploy(params: dict[str, Any] | None) -> dict[str, Any]:
    """Deploy canary files."""
    _init_modules()
    if not _ransomware:
        return {"success": False, "error": "Ransomware vaccine not available", "error_code": "NOT_AVAILABLE"}
    try:
        return {"success": True, "result": _ransomware.deploy_canaries()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.ransomware.remove")
def ransomware_remove(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove canary files."""
    _init_modules()
    if not _ransomware:
        return {"success": False, "error": "Ransomware vaccine not available", "error_code": "NOT_AVAILABLE"}
    try:
        return {"success": True, "result": _ransomware.remove_canaries()}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC: Email Scanner ─────────────────────────────────────────────

@register("advanced_security.email.scan")
def email_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan an email attachment file."""
    params = params or {}
    file_path = params.get("file_path", "")
    if not file_path:
        return {"success": False, "error": "file_path is required", "error_code": "INVALID_PARAMS"}

    _init_modules()
    if not _email_scanner:
        return {"success": False, "error": "Email scanner not available", "error_code": "NOT_AVAILABLE"}

    try:
        result = _email_scanner.scan_file(file_path)
        return {"success": True, "result": result}
    except Exception as e:
        log.error("Email scan failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "EMAIL_SCAN_FAILED"}


@register("advanced_security.email.scanDir")
def email_scan_dir(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan a directory of email attachments."""
    params = params or {}
    dir_path = params.get("dir_path", "")
    if not dir_path:
        return {"success": False, "error": "dir_path is required", "error_code": "INVALID_PARAMS"}

    _init_modules()
    if not _email_scanner:
        return {"success": False, "error": "Email scanner not available", "error_code": "NOT_AVAILABLE"}

    try:
        result = _email_scanner.scan_directory(dir_path)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.email.status")
def email_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get email scanner status."""
    _init_modules()
    if not _email_scanner:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _email_scanner.get_status()}


@register("advanced_security.email.history")
def email_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get email scan history."""
    _init_modules()
    if not _email_scanner:
        return {"success": True, "history": []}
    return {"success": True, "history": _email_scanner.get_history()}


# ─── RPC: Boot Sector Scanner ───────────────────────────────────────

@register("advanced_security.boot.scan")
def boot_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan boot sector / MBR of the system drive."""
    _init_modules()
    if not _boot_scanner:
        return {"success": False, "error": "Boot scanner not available", "error_code": "NOT_AVAILABLE"}

    try:
        result = _boot_scanner.scan()
        return {"success": True, "result": result}
    except Exception as e:
        log.error("Boot scan failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "BOOT_SCAN_FAILED"}


@register("advanced_security.boot.scanDrive")
def boot_scan_drive(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan a specific physical drive."""
    params = params or {}
    drive_index = params.get("drive_index", 0)
    _init_modules()
    if not _boot_scanner:
        return {"success": False, "error": "Boot scanner not available", "error_code": "NOT_AVAILABLE"}

    try:
        result = _boot_scanner.scan_drive(drive_index)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.boot.status")
def boot_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get boot scanner status."""
    _init_modules()
    if not _boot_scanner:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _boot_scanner.get_status()}


@register("advanced_security.boot.backup")
def boot_backup(params: dict[str, Any] | None) -> dict[str, Any]:
    """Backup the MBR."""
    _init_modules()
    if not _boot_scanner:
        return {"success": False, "error": "Boot scanner not available", "error_code": "NOT_AVAILABLE"}
    try:
        result = _boot_scanner.backup_mbr()
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.boot.verify")
def boot_verify(params: dict[str, Any] | None) -> dict[str, Any]:
    """Verify MBR against a backup."""
    params = params or {}
    backup_path = params.get("backup_path", "")
    if not backup_path:
        return {"success": False, "error": "backup_path is required", "error_code": "INVALID_PARAMS"}
    _init_modules()
    if not _boot_scanner:
        return {"success": False, "error": "Boot scanner not available", "error_code": "NOT_AVAILABLE"}
    try:
        result = _boot_scanner.verify_mbr(backup_path)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("advanced_security.boot.history")
def boot_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get boot scan history."""
    _init_modules()
    if not _boot_scanner:
        return {"success": True, "history": []}
    return {"success": True, "history": _boot_scanner.get_history()}


log.info("Advanced Security module loaded (platform: %s)", platform.system())
