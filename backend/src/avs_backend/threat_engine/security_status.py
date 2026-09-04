"""Security Status — unified security status and scoring endpoints.

This module centralizes security-related endpoints that were previously
in the dashboard module. The dashboard should focus on optimization
metrics, while security status belongs in the threat engine domain.

The RPC names are kept the same for backward compatibility, but the
implementation is now in the security domain.

RPC methods:
    dashboard.securityScore  — comprehensive security score (0-100)
    system.avStatus          — unified antivirus status
    security.status          — combined security + AV status
"""
from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.security_status")


@register("security.status")
def security_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get combined security status including AV status and security score.

    This is the canonical security status endpoint. It aggregates:
    - AV engine status (AVS, Defender, third-party)
    - Security score (0-100)
    - Real-time protection status
    - Definition update status
    - Recent scan summary
    """
    result: dict[str, Any] = {
        "success": True,
        "av_status": {},
        "security_score": {},
        "real_time_protection": False,
        "definitions_up_to_date": False,
        "last_scan": None,
    }

    # Get AV status
    try:
        from avs_backend.dashboard import system_av_status
        result["av_status"] = system_av_status(None)
    except Exception as e:
        log.debug("Failed to get AV status: %s", e)

    # Get security score
    try:
        from avs_backend.dashboard.security_score import compute_security_score
        result["security_score"] = compute_security_score()
    except Exception as e:
        log.debug("Failed to get security score: %s", e)

    # Get real-time protection status
    try:
        from avs_backend.threat_engine.download_scanner import get_download_scanner_status
        ds_status = get_download_scanner_status()
        result["real_time_protection"] = ds_status.get("monitoring", False)
    except Exception:
        pass

    # Check if definitions are up to date
    try:
        from avs_backend.threat_engine.hash_detector import _load_hash_db
        db = _load_hash_db()
        updated_at = db.get("updated_at", "")
        if updated_at:
            from datetime import datetime, timezone
            updated_time = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - updated_time).total_seconds() / 3600
            result["definitions_up_to_date"] = age_hours < 24
    except Exception:
        pass

    # Get last scan result
    try:
        from avs_backend.threat_engine import _save_scan_history, _HISTORY_PATH
        import json
        if _HISTORY_PATH.exists():
            with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
                history = json.load(f)
            if history:
                result["last_scan"] = history[-1]
    except Exception:
        pass

    return result


@register("security.realTimeStatus")
def security_realtime_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get real-time protection status across all monitors.

    Aggregates status from:
    - Download scanner
    - Behavioral monitor
    - Network monitor
    - Memory scanner
    """
    result: dict[str, Any] = {
        "success": True,
        "monitors": {},
        "active_count": 0,
    }

    monitors = result["monitors"]
    active = 0

    # Download scanner
    try:
        from avs_backend.threat_engine.download_scanner import get_download_scanner_status
        ds = get_download_scanner_status()
        monitors["download_scanner"] = ds
        if ds.get("monitoring"):
            active += 1
    except Exception:
        monitors["download_scanner"] = {"available": False}

    # Network monitor
    try:
        from avs_backend.threat_engine.network_monitor import scan_network_connections
        monitors["network_monitor"] = {"available": True}
        active += 1
    except Exception:
        monitors["network_monitor"] = {"available": False}

    # Memory scanner
    try:
        from avs_backend.threat_engine.memory_scanner import get_memory_scanner_status
        ms = get_memory_scanner_status()
        monitors["memory_scanner"] = ms
        if ms.get("scanning"):
            active += 1
    except Exception:
        monitors["memory_scanner"] = {"available": False}

    # Email scanner
    try:
        from avs_backend.threat_engine.email_scanner import get_email_scanner_status
        es = get_email_scanner_status()
        monitors["email_scanner"] = es
    except Exception:
        monitors["email_scanner"] = {"available": False}

    result["active_count"] = active
    return result


@register("security.consolidatedScore")
def security_consolidated_score(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get a consolidated security score used by both Protection Center
    and AI Antivirus Security.

    This endpoint unifies the two previously separate scoring paths:
    - dashboard.securityScore (comprehensive, from security_score.py)
    - scan_core.security.score (Defender-based, from scan_core_rpc)

    Both Protection Center and Antivirus Security should use this
    endpoint to ensure consistent scoring across the product.

    Returns:
        - overall_score: 0-100 (consolidated)
        - dashboard_score: score from dashboard security_score.py
        - defender_score: score from scan_core Defender telemetry
        - status: "excellent" | "good" | "fair" | "poor" | "critical"
        - categories: breakdown by category
        - recommendations: what to fix
        - source: which scoring path was used
    """
    result: dict[str, Any] = {
        "success": True,
        "overall_score": 0,
        "dashboard_score": None,
        "defender_score": None,
        "status": "unknown",
        "categories": {},
        "recommendations": [],
        "source": "consolidated",
    }

    # Get dashboard comprehensive score
    dashboard_score = None
    try:
        from avs_backend.dashboard.security_score import compute_security_score
        dashboard_result = compute_security_score()
        dashboard_score = dashboard_result.get("overall_score", 0)
        result["dashboard_score"] = dashboard_score
        result["categories"] = dashboard_result.get("categories", {})
        result["recommendations"] = dashboard_result.get("recommendations", [])
    except Exception as e:
        log.debug("Failed to get dashboard score: %s", e)

    # Get Defender-based score
    defender_score = None
    try:
        from avs_backend.scan_core.security.defender_integration import get_defender_threat_info
        info = get_defender_threat_info()
        # Simple Defender-based score
        if info:
            d_score = 50  # Start at neutral
            if info.get("antivirus_enabled"):
                d_score += 20
            if info.get("real_time_protection"):
                d_score += 15
            if info.get("antivirus_signature_age_days", 999) < 7:
                d_score += 10
            if info.get("active_threats", 0) == 0:
                d_score += 5
            defender_score = min(d_score, 100)
            result["defender_score"] = defender_score
    except Exception as e:
        log.debug("Failed to get Defender score: %s", e)

    # Consolidate: use dashboard score as primary, Defender as secondary
    if dashboard_score is not None:
        result["overall_score"] = dashboard_score
        result["source"] = "dashboard"
    elif defender_score is not None:
        result["overall_score"] = defender_score
        result["source"] = "defender"
    else:
        result["overall_score"] = 50
        result["source"] = "fallback"

    # Determine status from score
    score = result["overall_score"]
    if score >= 85:
        result["status"] = "excellent"
    elif score >= 70:
        result["status"] = "good"
    elif score >= 50:
        result["status"] = "fair"
    elif score >= 30:
        result["status"] = "poor"
    else:
        result["status"] = "critical"

    return result
