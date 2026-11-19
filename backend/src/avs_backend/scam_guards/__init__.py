"""Scam Guards — remote-access watch, clipboard-swap watch, community
report upload, and Scam Wave Alerts.

RPC methods:
    scam_guards.start          — start the background monitor
    scam_guards.stop           — stop it
    scam_guards.status         — running state + alert count
    scam_guards.alerts         — recent guard alerts
    scam_guards.waves          — Scam Wave Alerts from the license server
    scam_guards.uploadReports  — push queued user reports to the server
"""

from __future__ import annotations

import logging
import time
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature
from avs_backend.scam_guards.family import configure as _family_configure
from avs_backend.scam_guards.family import get_config as _family_config
from avs_backend.scam_guards.family import send_alert as _family_send
from avs_backend.scam_guards.guards import ScamGuardMonitor
from avs_backend.scam_guards.reporter import fetch_waves, upload_reports

log = logging.getLogger("avs.scam_guards")

_monitor: ScamGuardMonitor | None = None


def _get_monitor() -> ScamGuardMonitor:
    global _monitor
    if _monitor is None:
        _monitor = ScamGuardMonitor(
            threat_context_fn=_last_blocked_ts,
            on_alert=_family_send,
        )
    return _monitor


def _last_blocked_ts() -> float:
    """Epoch of WebShield's most recent blocked URL (0 when none).

    Must use the SHARED WebShield instance from advanced_security —
    its _blocked_urls history is what RPC check_url calls populate.
    A private instance would always be empty."""
    try:
        from avs_backend import advanced_security
        advanced_security._init_modules()
        ws = advanced_security._web_shield
        if ws is None:
            return 0.0
        blocked = ws.get_blocked_urls()
        if not blocked:
            return 0.0
        ts = blocked[-1].get("blocked_at", "")
        from datetime import datetime
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def _error(msg: str, code: str) -> dict[str, Any]:
    return {"success": False, "error": msg, "error_code": code}


@register("scam_guards.start")
@require_feature("scam_guards.start")
def start(params: dict[str, Any] | None) -> dict[str, Any]:
    try:
        _get_monitor().start()
        return {"success": True, "result": _get_monitor().status()}
    except Exception as e:
        return _error(str(e), "START_FAILED")


@register("scam_guards.stop")
@require_feature("scam_guards.stop")
def stop(params: dict[str, Any] | None) -> dict[str, Any]:
    try:
        _get_monitor().stop()
        return {"success": True, "result": _get_monitor().status()}
    except Exception as e:
        return _error(str(e), "STOP_FAILED")


@register("scam_guards.status")
def status(params: dict[str, Any] | None) -> dict[str, Any]:
    return {"success": True, "result": _get_monitor().status()}


@register("scam_guards.alerts")
@require_feature("scam_guards.alerts")
def alerts(params: dict[str, Any] | None) -> dict[str, Any]:
    limit = (params or {}).get("limit", 50)
    return {"success": True, "result": _get_monitor().get_alerts(limit=limit)}


@register("scam_guards.waves")
@require_feature("scam_guards.waves")
def waves(params: dict[str, Any] | None) -> dict[str, Any]:
    try:
        return {"success": True, "result": fetch_waves(force=bool((params or {}).get("force")))}
    except Exception as e:
        return _error(str(e), "WAVES_FAILED")


@register("scam_guards.uploadReports")
@require_feature("scam_guards.uploadReports")
def upload(params: dict[str, Any] | None) -> dict[str, Any]:
    try:
        fp = (params or {}).get("device_fingerprint")
        return {"success": True, "result": upload_reports(fp)}
    except Exception as e:
        return _error(str(e), "UPLOAD_FAILED")


@register("scam_guards.familyConfig")
@require_feature("scam_guards.familyConfig")
def family_config(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get (no params) or set family alert configuration."""
    try:
        if params:
            return {"success": True, "result": _family_configure(**params)}
        return {"success": True, "result": _family_config()}
    except Exception as e:
        return _error(str(e), "CONFIG_FAILED")


@register("scam_guards.testFamilyAlert")
@require_feature("scam_guards.testFamilyAlert")
def test_family_alert(params: dict[str, Any] | None) -> dict[str, Any]:
    """Send a test alert through the configured family channels."""
    result = _family_send({
        "type": "test_alert", "severity": "critical",
        "message": "AVS AI Shield test alert — family notifications are working.",
    })
    return {"success": True, "result": result}
