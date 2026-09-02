"""AI Features — Tier 4 AI-powered security and optimization features.

Provides:
  1. AI Threat Explanation — human-readable threat explanations
  2. AI Optimization Recommendations — personalized system optimization
  3. One-Click Security Audit — comprehensive security posture assessment
  4. Threat Timeline Visualization — chronological threat event timeline
  5. Community Threat Intelligence — anonymous threat intel sharing
  6. Privacy Score — privacy posture assessment
  7. Game/Movie Mode — silence non-critical activity during gaming/media

All AI features use local rule-based engines — no external LLM API calls.

RPC methods:
    ai_features.status                    — get overall status
    ai_features.threat.explain            — explain a single threat
    ai_features.threat.explainBatch       — explain multiple threats
    ai_features.optimization.analyze      — analyze system for recommendations
    ai_features.optimization.recommendations — get cached recommendations
    ai_features.optimization.status       — get advisor status
    ai_features.security.audit            — run one-click security audit
    ai_features.security.status           — get auditor status
    ai_features.security.history          — get audit history
    ai_features.timeline.record           — record a threat event
    ai_features.timeline.get              — get timeline events
    ai_features.timeline.summary          — get timeline summary
    ai_features.timeline.status           — get timeline status
    ai_features.timeline.clear            — clear timeline
    ai_features.timeline.export           — export timeline data
    ai_features.community.submit          — submit anonymized threat
    ai_features.community.submissions     — get recent submissions
    ai_features.community.status          — get community intel status
    ai_features.community.configure       — update configuration
    ai_features.community.preview         — preview submission data
    ai_features.community.sync            — sync with community server
    ai_features.community.stats           — get community statistics
    ai_features.privacy.calculate         — calculate privacy score
    ai_features.privacy.status            — get privacy scorer status
    ai_features.privacy.history           — get privacy score history
    ai_features.gameMode.activate         — activate Game/Movie Mode
    ai_features.gameMode.deactivate       — deactivate Game/Movie Mode
    ai_features.gameMode.toggle           — toggle Game/Movie Mode
    ai_features.gameMode.status           — get Game/Movie Mode status
    ai_features.gameMode.configure        — configure Game/Movie Mode
    ai_features.gameMode.sessions         — get session history
"""

from __future__ import annotations

import logging
import platform
import threading
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.ai_features")

IS_WINDOWS = platform.system() == "Windows"

# ─── Module instances ───────────────────────────────────────────────

_threat_explainer: Any = None
_optimization_advisor: Any = None
_security_auditor: Any = None
_threat_timeline: Any = None
_community_intel: Any = None
_privacy_scorer: Any = None
_game_mode: Any = None
_init_lock = threading.Lock()


def _init_modules() -> None:
    """Initialize all AI feature modules."""
    global _threat_explainer, _optimization_advisor, _security_auditor
    global _threat_timeline, _community_intel, _privacy_scorer, _game_mode

    with _init_lock:
        if _threat_explainer is None:
            try:
                from avs_backend.ai_features.threat_explainer import ThreatExplainer
                _threat_explainer = ThreatExplainer({})
                log.info("Threat explainer initialized")
            except Exception as e:
                log.warning("Failed to init threat explainer: %s", e)

        if _optimization_advisor is None:
            try:
                from avs_backend.ai_features.optimization_advisor import (
                    OptimizationAdvisor,
                )
                _optimization_advisor = OptimizationAdvisor({})
                log.info("Optimization advisor initialized")
            except Exception as e:
                log.warning("Failed to init optimization advisor: %s", e)

        if _security_auditor is None:
            try:
                from avs_backend.ai_features.security_audit import SecurityAuditor
                _security_auditor = SecurityAuditor({})
                log.info("Security auditor initialized")
            except Exception as e:
                log.warning("Failed to init security auditor: %s", e)

        if _threat_timeline is None:
            try:
                from avs_backend.ai_features.threat_timeline import ThreatTimeline
                _threat_timeline = ThreatTimeline({})
                log.info("Threat timeline initialized")
            except Exception as e:
                log.warning("Failed to init threat timeline: %s", e)

        if _community_intel is None:
            try:
                from avs_backend.ai_features.community_intel import CommunityIntel
                _community_intel = CommunityIntel({})
                log.info("Community intel initialized")
            except Exception as e:
                log.warning("Failed to init community intel: %s", e)

        if _privacy_scorer is None:
            try:
                from avs_backend.ai_features.privacy_score import PrivacyScorer
                _privacy_scorer = PrivacyScorer({})
                log.info("Privacy scorer initialized")
            except Exception as e:
                log.warning("Failed to init privacy scorer: %s", e)

        if _game_mode is None:
            try:
                from avs_backend.ai_features.game_movie_mode import GameMovieMode
                _game_mode = GameMovieMode({})
                log.info("Game/Movie mode initialized")
            except Exception as e:
                log.warning("Failed to init game/movie mode: %s", e)


# ─── RPC: Overall status ────────────────────────────────────────────

@register("ai_features.status")
def ai_features_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get overall status of all AI features."""
    _init_modules()
    return {
        "success": True,
        "status": {
            "platform": platform.system(),
            "threat_explainer": (
                _threat_explainer.get_status() if _threat_explainer else None
            ),
            "optimization_advisor": (
                _optimization_advisor.get_status() if _optimization_advisor else None
            ),
            "security_auditor": (
                _security_auditor.get_status() if _security_auditor else None
            ),
            "threat_timeline": (
                _threat_timeline.get_status() if _threat_timeline else None
            ),
            "community_intel": (
                _community_intel.get_status() if _community_intel else None
            ),
            "privacy_scorer": (
                _privacy_scorer.get_status() if _privacy_scorer else None
            ),
            "game_mode": _game_mode.get_status() if _game_mode else None,
        },
    }


# ─── RPC: Threat Explanation ────────────────────────────────────────

@register("ai_features.threat.explain")
def threat_explain(params: dict[str, Any] | None) -> dict[str, Any]:
    """Explain a single threat."""
    params = params or {}
    threat = params.get("threat")
    if not threat:
        return {"success": False, "error": "threat is required"}
    _init_modules()
    if not _threat_explainer:
        return {"success": False, "error": "Threat explainer not available"}
    try:
        return {"success": True, "result": _threat_explainer.explain(threat)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.threat.explainBatch")
def threat_explain_batch(params: dict[str, Any] | None) -> dict[str, Any]:
    """Explain multiple threats."""
    params = params or {}
    threats = params.get("threats", [])
    if not threats:
        return {"success": False, "error": "threats is required"}
    _init_modules()
    if not _threat_explainer:
        return {"success": False, "error": "Threat explainer not available"}
    try:
        return {"success": True, "results": _threat_explainer.explain_batch(threats)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC: Optimization Advisor ──────────────────────────────────────

@register("ai_features.optimization.analyze")
def optimization_analyze(params: dict[str, Any] | None) -> dict[str, Any]:
    """Analyze system and generate optimization recommendations."""
    _init_modules()
    if not _optimization_advisor:
        return {"success": False, "error": "Optimization advisor not available"}
    try:
        return {"success": True, "result": _optimization_advisor.analyze()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.optimization.recommendations")
def optimization_recommendations(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get cached recommendations."""
    _init_modules()
    if not _optimization_advisor:
        return {"success": True, "recommendations": []}
    try:
        return {"success": True, "recommendations": _optimization_advisor.get_recommendations()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.optimization.status")
def optimization_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get optimization advisor status."""
    _init_modules()
    if not _optimization_advisor:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _optimization_advisor.get_status()}


# ─── RPC: Security Audit ────────────────────────────────────────────

@register("ai_features.security.audit")
def security_audit(params: dict[str, Any] | None) -> dict[str, Any]:
    """Run one-click security audit."""
    _init_modules()
    if not _security_auditor:
        return {"success": False, "error": "Security auditor not available"}
    try:
        return {"success": True, "result": _security_auditor.audit()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.security.status")
def security_audit_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get security auditor status."""
    _init_modules()
    if not _security_auditor:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _security_auditor.get_status()}


@register("ai_features.security.history")
def security_audit_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get audit history."""
    _init_modules()
    if not _security_auditor:
        return {"success": True, "history": []}
    try:
        return {"success": True, "history": _security_auditor.get_history()}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC: Threat Timeline ───────────────────────────────────────────

@register("ai_features.timeline.record")
def timeline_record(params: dict[str, Any] | None) -> dict[str, Any]:
    """Record a threat event in the timeline."""
    params = params or {}
    event = params.get("event")
    if not event:
        return {"success": False, "error": "event is required"}
    _init_modules()
    if not _threat_timeline:
        return {"success": False, "error": "Threat timeline not available"}
    try:
        return {"success": True, "result": _threat_timeline.record_event(event)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.timeline.get")
def timeline_get(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get timeline events."""
    params = params or {}
    start_time = params.get("start_time")
    end_time = params.get("end_time")
    limit = int(params.get("limit", 100))
    _init_modules()
    if not _threat_timeline:
        return {"success": True, "events": [], "total": 0, "summary": {}}
    try:
        return {"success": True, **_threat_timeline.get_timeline(start_time, end_time, limit)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.timeline.summary")
def timeline_summary(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get timeline summary statistics."""
    _init_modules()
    if not _threat_timeline:
        return {"success": True, "summary": {}}
    try:
        return {"success": True, "summary": _threat_timeline.get_summary()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.timeline.status")
def timeline_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get timeline status."""
    _init_modules()
    if not _threat_timeline:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _threat_timeline.get_status()}


@register("ai_features.timeline.clear")
def timeline_clear(params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all timeline data."""
    _init_modules()
    if not _threat_timeline:
        return {"success": False, "error": "Threat timeline not available"}
    try:
        return {"success": True, "result": _threat_timeline.clear_timeline()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.timeline.export")
def timeline_export(params: dict[str, Any] | None) -> dict[str, Any]:
    """Export timeline data."""
    params = params or {}
    fmt = params.get("format", "json")
    _init_modules()
    if not _threat_timeline:
        return {"success": False, "error": "Threat timeline not available"}
    try:
        return {"success": True, "result": _threat_timeline.export_timeline(fmt)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC: Community Intelligence ────────────────────────────────────

@register("ai_features.community.submit")
def community_submit(params: dict[str, Any] | None) -> dict[str, Any]:
    """Submit anonymized threat data to community."""
    params = params or {}
    threat = params.get("threat")
    if not threat:
        return {"success": False, "error": "threat is required"}
    _init_modules()
    if not _community_intel:
        return {"success": False, "error": "Community intel not available"}
    try:
        return {"success": True, "result": _community_intel.submit_threat(threat)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.community.submissions")
def community_submissions(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recent community submissions."""
    params = params or {}
    limit = int(params.get("limit", 50))
    _init_modules()
    if not _community_intel:
        return {"success": True, "submissions": []}
    try:
        return {"success": True, "submissions": _community_intel.get_submissions(limit)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.community.status")
def community_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get community intel status."""
    _init_modules()
    if not _community_intel:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _community_intel.get_status()}


@register("ai_features.community.configure")
def community_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update community intel configuration."""
    params = params or {}
    _init_modules()
    if not _community_intel:
        return {"success": False, "error": "Community intel not available"}
    try:
        return {"success": True, "result": _community_intel.configure(params)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.community.preview")
def community_preview(params: dict[str, Any] | None) -> dict[str, Any]:
    """Preview what data would be submitted."""
    params = params or {}
    threat = params.get("threat")
    if not threat:
        return {"success": False, "error": "threat is required"}
    _init_modules()
    if not _community_intel:
        return {"success": False, "error": "Community intel not available"}
    try:
        return {"success": True, "result": _community_intel.preview_submission(threat)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.community.sync")
def community_sync(params: dict[str, Any] | None) -> dict[str, Any]:
    """Sync local submissions with community server."""
    _init_modules()
    if not _community_intel:
        return {"success": False, "error": "Community intel not available"}
    try:
        return {"success": True, "result": _community_intel.sync()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.community.stats")
def community_stats(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get community-wide statistics."""
    _init_modules()
    if not _community_intel:
        return {"success": True, "stats": {}}
    try:
        return {"success": True, "stats": _community_intel.get_community_stats()}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC: Privacy Score ─────────────────────────────────────────────

@register("ai_features.privacy.calculate")
def privacy_calculate(params: dict[str, Any] | None) -> dict[str, Any]:
    """Calculate privacy score."""
    _init_modules()
    if not _privacy_scorer:
        return {"success": False, "error": "Privacy scorer not available"}
    try:
        return {"success": True, "result": _privacy_scorer.calculate()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.privacy.status")
def privacy_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get privacy scorer status."""
    _init_modules()
    if not _privacy_scorer:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _privacy_scorer.get_status()}


@register("ai_features.privacy.history")
def privacy_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get privacy score history."""
    _init_modules()
    if not _privacy_scorer:
        return {"success": True, "history": []}
    try:
        return {"success": True, "history": _privacy_scorer.get_history()}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC: Game/Movie Mode ───────────────────────────────────────────

@register("ai_features.gameMode.activate")
def game_mode_activate(params: dict[str, Any] | None) -> dict[str, Any]:
    """Activate Game/Movie Mode."""
    _init_modules()
    if not _game_mode:
        return {"success": False, "error": "Game/Movie mode not available"}
    try:
        return {"success": True, "result": _game_mode.activate()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.gameMode.deactivate")
def game_mode_deactivate(params: dict[str, Any] | None) -> dict[str, Any]:
    """Deactivate Game/Movie Mode."""
    _init_modules()
    if not _game_mode:
        return {"success": False, "error": "Game/Movie mode not available"}
    try:
        return {"success": True, "result": _game_mode.deactivate()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.gameMode.toggle")
def game_mode_toggle(params: dict[str, Any] | None) -> dict[str, Any]:
    """Toggle Game/Movie Mode."""
    _init_modules()
    if not _game_mode:
        return {"success": False, "error": "Game/Movie mode not available"}
    try:
        return {"success": True, "result": _game_mode.toggle()}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.gameMode.status")
def game_mode_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get Game/Movie Mode status."""
    _init_modules()
    if not _game_mode:
        return {"success": True, "status": {"available": False}}
    return {"success": True, "status": _game_mode.get_status()}


@register("ai_features.gameMode.configure")
def game_mode_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Configure Game/Movie Mode."""
    params = params or {}
    _init_modules()
    if not _game_mode:
        return {"success": False, "error": "Game/Movie mode not available"}
    try:
        return {"success": True, "result": _game_mode.configure(params)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("ai_features.gameMode.sessions")
def game_mode_sessions(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get Game/Movie Mode session history."""
    _init_modules()
    if not _game_mode:
        return {"success": True, "sessions": []}
    try:
        return {"success": True, "sessions": _game_mode.get_sessions()}
    except Exception as e:
        return {"success": False, "error": str(e)}


log.info("AI Features module loaded (platform: %s)", platform.system())
