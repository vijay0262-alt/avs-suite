"""Real-Time Threat Protection — Tier 2 advanced monitoring.

Extends the basic real-time protection module with:
  1. ETW/WMI-based real-time file system monitoring
  2. USB device insertion detection and auto-scan
  3. Process execution monitoring via WMI (replaces psutil polling)
  4. Network C2 detection using threat intelligence feeds

These features provide proactive threat detection rather than just
on-demand scanning. When a suspicious event is detected, it is:
  - Logged to the event buffer
  - Cross-referenced with the threat engine
  - Optionally triggers an automatic scan

RPC methods:
    realtime_threat.status        — get overall monitoring status
    realtime_threat.start         — start all monitors
    realtime_threat.stop          — stop all monitors
    realtime_threat.events        — get recent monitoring events
    realtime_threat.alerts        — get recent alerts
    realtime_threat.configure     — configure monitoring settings
    realtime_threat.usbDevices    — list connected USB devices
    realtime_threat.usbScan       — manually scan a USB drive
    realtime_threat.networkScan   — scan current network connections
    realtime_threat.updateFeeds   — update threat intelligence feeds
    realtime_threat.feedStatus    — get threat feed status
"""

from __future__ import annotations

import logging
import os
import platform
import threading
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.realtime_threat")

IS_WINDOWS = platform.system() == "Windows"

# ─── Data paths ─────────────────────────────────────────────────────

_DATA_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~")),
    "AVS AI Shield",
    "threat_engine",
)
os.makedirs(_DATA_DIR, exist_ok=True)

# ─── Configuration ──────────────────────────────────────────────────

_DEFAULT_CONFIG = {
    "etw_file_monitor": True,
    "etw_process_monitor": True,
    "usb_auto_scan": True,
    "usb_scan_quick": True,
    "usb_exclude_drives": [],
    "network_c2_monitor": True,
    "network_poll_interval": 5,
    "auto_scan_on_alert": False,
}


def _load_config() -> dict[str, Any]:
    """Load configuration from disk."""
    config_path = os.path.join(_DATA_DIR, "realtime_threat_config.json")
    if os.path.exists(config_path):
        try:
            import json
            with open(config_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
            merged = _DEFAULT_CONFIG.copy()
            merged.update(saved)
            return merged
        except Exception as e:
            log.warning("Failed to load realtime threat config: %s", e)
    return _DEFAULT_CONFIG.copy()


def _save_config(cfg: dict[str, Any]) -> None:
    """Save configuration to disk."""
    config_path = os.path.join(_DATA_DIR, "realtime_threat_config.json")
    try:
        import json
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        log.error("Failed to save realtime threat config: %s", e)


_config = _load_config()

# ─── Monitor instances ──────────────────────────────────────────────

_etw_monitor: Any = None
_usb_monitor: Any = None
_network_c2: Any = None
_monitors_lock = threading.Lock()


def _init_monitors() -> None:
    """Initialize all monitoring modules."""
    global _etw_monitor, _usb_monitor, _network_c2

    with _monitors_lock:
        if _etw_monitor is None and IS_WINDOWS:
            try:
                from avs_backend.realtime_threat.etw_monitor import EtwMonitor
                _etw_monitor = EtwMonitor(_config)
                log.info("ETW monitor initialized")
            except Exception as e:
                log.warning("Failed to init ETW monitor: %s", e)

        if _usb_monitor is None and IS_WINDOWS:
            try:
                from avs_backend.realtime_threat.usb_monitor import UsbMonitor
                _usb_monitor = UsbMonitor(_config)
                log.info("USB monitor initialized")
            except Exception as e:
                log.warning("Failed to init USB monitor: %s", e)

        if _network_c2 is None:
            try:
                from avs_backend.realtime_threat.network_c2 import NetworkC2Detector
                _network_c2 = NetworkC2Detector(_config)
                log.info("Network C2 detector initialized")
            except Exception as e:
                log.warning("Failed to init network C2 detector: %s", e)


# ─── RPC Handlers ───────────────────────────────────────────────────

@register("realtime_threat.status")
def realtime_threat_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get overall real-time threat monitoring status."""
    _init_monitors()

    status = {
        "platform": platform.system(),
        "etw_file_monitor": None,
        "etw_process_monitor": None,
        "usb_monitor": None,
        "network_c2": None,
        "config": _config,
    }

    if _etw_monitor:
        status["etw_file_monitor"] = _etw_monitor.get_status()
    if _usb_monitor:
        status["usb_monitor"] = _usb_monitor.get_status()
    if _network_c2:
        status["network_c2"] = _network_c2.get_status()

    return {"success": True, "status": status}


@register("realtime_threat.start")
def realtime_threat_start(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start all real-time threat monitors."""
    global _config
    _config = _load_config()
    _init_monitors()

    results = {}

    if _etw_monitor and (_config.get("etw_file_monitor", True) or _config.get("etw_process_monitor", True)):
        try:
            _etw_monitor.start()
            results["etw"] = "started"
        except Exception as e:
            results["etw"] = f"error: {e}"

    if _usb_monitor and _config.get("usb_auto_scan", True):
        try:
            _usb_monitor.start()
            results["usb"] = "started"
        except Exception as e:
            results["usb"] = f"error: {e}"

    if _network_c2 and _config.get("network_c2_monitor", True):
        try:
            _network_c2.start()
            results["network_c2"] = "started"
        except Exception as e:
            results["network_c2"] = f"error: {e}"

    return {"success": True, "results": results}


@register("realtime_threat.stop")
def realtime_threat_stop(params: dict[str, Any] | None) -> dict[str, Any]:
    """Stop all real-time threat monitors."""
    results = {}

    if _etw_monitor:
        try:
            _etw_monitor.stop()
            results["etw"] = "stopped"
        except Exception as e:
            results["etw"] = f"error: {e}"

    if _usb_monitor:
        try:
            _usb_monitor.stop()
            results["usb"] = "stopped"
        except Exception as e:
            results["usb"] = f"error: {e}"

    if _network_c2:
        try:
            _network_c2.stop()
            results["network_c2"] = "stopped"
        except Exception as e:
            results["network_c2"] = f"error: {e}"

    return {"success": True, "results": results}


@register("realtime_threat.events")
def realtime_threat_events(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recent monitoring events from all monitors."""
    params = params or {}
    limit = params.get("limit", 100)
    source = params.get("source")  # "etw", "usb", "network", or None for all

    events = []

    if _etw_monitor and (source is None or source == "etw"):
        events.extend(_etw_monitor.get_events())
    if _usb_monitor and (source is None or source == "usb"):
        events.extend(_usb_monitor.get_events())
    if _network_c2 and (source is None or source == "network"):
        events.extend(_network_c2.get_alerts())

    # Sort by timestamp (newest first) and limit
    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    events = events[:limit]

    return {"success": True, "events": events, "count": len(events)}


@register("realtime_threat.alerts")
def realtime_threat_alerts(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recent alerts from all monitors."""
    params = params or {}
    limit = params.get("limit", 50)

    alerts = []

    # ETW monitor alerts are events with severity
    if _etw_monitor:
        for event in _etw_monitor.get_events():
            if event.get("severity"):
                alerts.append(event)

    # Network C2 alerts
    if _network_c2:
        alerts.extend(_network_c2.get_alerts())

    # Sort by timestamp (newest first) and limit
    alerts.sort(key=lambda a: a.get("timestamp", ""), reverse=True)
    alerts = alerts[:limit]

    return {"success": True, "alerts": alerts, "count": len(alerts)}


@register("realtime_threat.configure")
def realtime_threat_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Configure real-time threat monitoring settings."""
    global _config
    params = params or {}

    cfg = _load_config()

    # Update config from params
    for key in ["etw_file_monitor", "etw_process_monitor", "usb_auto_scan",
                "usb_scan_quick", "network_c2_monitor", "auto_scan_on_alert"]:
        if key in params:
            cfg[key] = bool(params[key])

    if "usb_exclude_drives" in params:
        cfg["usb_exclude_drives"] = params["usb_exclude_drives"]

    if "network_poll_interval" in params:
        cfg["network_poll_interval"] = int(params["network_poll_interval"])

    _save_config(cfg)
    _config = cfg

    return {"success": True, "config": cfg}


@register("realtime_threat.usbDevices")
def realtime_threat_usb_devices(params: dict[str, Any] | None) -> dict[str, Any]:
    """List currently connected USB/removable devices."""
    _init_monitors()

    if not _usb_monitor:
        return {"success": True, "devices": [], "message": "USB monitor not available"}

    try:
        devices = _usb_monitor.get_devices()
        return {"success": True, "devices": devices}
    except Exception as e:
        return {"success": False, "error": str(e), "error_code": "USB_LIST_FAILED"}


@register("realtime_threat.usbScan")
def realtime_threat_usb_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Manually scan a USB drive for threats."""
    params = params or {}
    drive_letter = params.get("drive_letter", "")

    if not drive_letter:
        return {"success": False, "error": "drive_letter is required", "error_code": "INVALID_PARAMS"}

    _init_monitors()

    if not _usb_monitor:
        return {"success": False, "error": "USB monitor not available", "error_code": "NOT_AVAILABLE"}

    try:
        result = _usb_monitor.scan_usb_drive(drive_letter)
        return {"success": True, "result": result}
    except Exception as e:
        log.error("USB scan failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "USB_SCAN_FAILED"}


@register("realtime_threat.networkScan")
def realtime_threat_network_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan all current network connections for C2/threat indicators."""
    _init_monitors()

    if not _network_c2:
        return {"success": False, "error": "Network C2 detector not available", "error_code": "NOT_AVAILABLE"}

    try:
        alerts = _network_c2.scan_connections()
        return {"success": True, "alerts": alerts, "count": len(alerts)}
    except Exception as e:
        log.error("Network scan failed: %s", e)
        return {"success": False, "error": str(e), "error_code": "NETWORK_SCAN_FAILED"}


@register("realtime_threat.updateFeeds")
def realtime_threat_update_feeds(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update threat intelligence feeds."""
    params = params or {}
    force = params.get("force", False)

    _init_monitors()

    results = {}

    if _network_c2:
        try:
            results["network_c2"] = _network_c2.update_feeds(force=force)
        except Exception as e:
            results["network_c2"] = {"success": False, "error": str(e)}

    # Also update threat engine hash feeds
    try:
        from avs_backend.threat_engine.hash_detector import update_hash_feeds
        results["hash_blocklist"] = update_hash_feeds(force=force)
    except Exception as e:
        results["hash_blocklist"] = {"success": False, "error": str(e)}

    return {"success": True, "results": results}


@register("realtime_threat.feedStatus")
def realtime_threat_feed_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get threat intelligence feed status."""
    _init_monitors()

    feeds = {}

    if _network_c2:
        try:
            feeds["network_c2"] = _network_c2.get_status()
        except Exception as e:
            feeds["network_c2"] = {"error": str(e)}

    # Get hash blocklist status
    try:
        from avs_backend.threat_engine import _get_definition_counts
        def_counts = _get_definition_counts()
        feeds["hash_blocklist"] = {
            "count": def_counts.get("hash_blocklist", 0),
            "last_updated": def_counts.get("last_updated"),
        }
    except Exception as e:
        feeds["hash_blocklist"] = {"error": str(e)}

    return {"success": True, "feeds": feeds}


log.info("Real-time threat protection module loaded (platform: %s)", platform.system())
