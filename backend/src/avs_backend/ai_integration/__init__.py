"""AI Integration Hub — wires AI subsystems together for cohesive operation.

This module provides cross-module intelligence that connects:
  1. Self-Learning → Cleaner: auto-select/deselect cleaner categories based on habits
  2. Workload Detection → Process Priority: auto-switch priority mode based on workload
  3. Self-Learning → Auto-Care: adjust idle threshold based on cleanup frequency
  4. Anomaly → Smart Notifications: already wired in smart_notifications._analyze_anomaly

RPC methods:
    ai_integration.getRecommendedCleaners — get AI-recommended cleaner IDs to select
    ai_integration.applyWorkloadPriority — auto-switch priority mode based on current workload
    ai_integration.getAutoCareSuggestions — get AI suggestions for auto-care configuration
    ai_integration.getStatus — get integration status for all connected subsystems
"""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.ai_integration")


# Mapping from workload mode to process priority mode
_WORKLOAD_TO_PRIORITY = {
    "gaming": "game",
    "video_editing": "creative",
    "coding": "work",
    "office": "work",
    "browsing": "balanced",
    "media": "balanced",
    "idle": "battery",
    "mixed": "balanced",
}


@register("ai_integration.getRecommendedCleaners")
def ai_integration_get_recommended_cleaners(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get AI-recommended cleaner categories based on self-learning habits.

    Returns:
        recommendedSelect: list[str] — cleaner IDs to auto-select
        recommendedDeselect: list[str] — cleaner IDs to auto-deselect
        hasData: bool — whether enough learning data exists
        confidence: str — confidence level (low/medium/high)
    """
    try:
        from avs_backend.self_learning import self_learning_get_habits
        habits_result = self_learning_get_habits(None)
    except Exception as e:
        log.error("Failed to get self-learning habits: %s", e)
        return {"recommendedSelect": [], "recommendedDeselect": [], "hasData": False, "confidence": "low"}

    category_prefs = habits_result.get("categoryPreferences", {})
    patterns = habits_result.get("cleanupPatterns", {})
    total_events = patterns.get("totalEvents", 0) if isinstance(patterns, dict) else 0

    if total_events < 3:
        return {"recommendedSelect": [], "recommendedDeselect": [], "hasData": False, "confidence": "low"}

    recommended_select: list[str] = []
    recommended_deselect: list[str] = []

    for category, pref in category_prefs.items():
        if not isinstance(pref, dict):
            continue
        recommendation = pref.get("recommendation", "neutral")
        observations = pref.get("totalObservations", 0)

        if observations < 3:
            continue

        if recommendation == "select":
            recommended_select.append(category)
        elif recommendation == "deselect":
            recommended_deselect.append(category)

    # Determine confidence
    if total_events >= 10:
        confidence = "high"
    elif total_events >= 5:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "recommendedSelect": recommended_select,
        "recommendedDeselect": recommended_deselect,
        "hasData": True,
        "confidence": confidence,
        "totalEvents": total_events,
    }


@register("ai_integration.applyWorkloadPriority")
@require_feature("ai_integration.applyWorkloadPriority")
def ai_integration_apply_workload_priority(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Auto-switch process priority mode based on current workload detection. Pro only.

    Reads the current workload mode and applies the corresponding priority mode.
    """
    try:
        from avs_backend.workload import workload_status
        workload_result = workload_status(None)
    except Exception as e:
        log.error("Failed to get workload status: %s", e)
        return {"success": False, "message": "Failed to detect workload"}

    current_mode = workload_result.get("currentMode", "mixed")
    confidence = workload_result.get("currentConfidence", 0)

    # Only auto-switch if confidence is high enough
    if confidence < 0.5:
        return {
            "success": True,
            "message": f"Workload confidence too low ({confidence:.0%}) — keeping current priority mode",
            "workloadMode": current_mode,
            "confidence": confidence,
            "priorityMode": None,
            "applied": False,
        }

    priority_mode = _WORKLOAD_TO_PRIORITY.get(current_mode, "balanced")

    try:
        from avs_backend.process_priority import process_priority_set_mode, process_priority_apply_mode

        # Set the mode
        set_result = process_priority_set_mode({"mode": priority_mode})
        if not set_result.get("success", False):
            return {"success": False, "message": f"Failed to set priority mode: {set_result.get('message', '')}"}

        # Apply the mode
        apply_result = process_priority_apply_mode(None)

        return {
            "success": True,
            "message": f"Switched to {priority_mode} priority mode for {current_mode} workload",
            "workloadMode": current_mode,
            "confidence": confidence,
            "priorityMode": priority_mode,
            "applied": True,
            "boostedCount": apply_result.get("boostedCount", 0),
            "loweredCount": apply_result.get("loweredCount", 0),
        }
    except Exception as e:
        log.error("Failed to apply workload priority: %s", e)
        return {"success": False, "message": f"Failed to apply priority: {e}"}


@register("ai_integration.getAutoCareSuggestions")
def ai_integration_get_auto_care_suggestions(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get AI suggestions for auto-care configuration based on self-learning habits.

    Returns:
        suggestedIdleThreshold: int — recommended idle threshold in seconds
        suggestedTasks: dict — recommended tasks to enable
        preferredCleanupTime: str — preferred cleanup time if detectable
        hasData: bool — whether enough learning data exists
    """
    try:
        from avs_backend.self_learning import self_learning_get_habits
        habits_result = self_learning_get_habits(None)
    except Exception as e:
        log.error("Failed to get self-learning habits: %s", e)
        return {"hasData": False, "suggestedIdleThreshold": 300, "suggestedTasks": {}}

    patterns = habits_result.get("cleanupPatterns", {})
    if not isinstance(patterns, dict):
        return {"hasData": False, "suggestedIdleThreshold": 300, "suggestedTasks": {}}

    total_events = patterns.get("totalEvents", 0)
    if total_events < 3:
        return {"hasData": False, "suggestedIdleThreshold": 300, "suggestedTasks": {}}

    avg_frequency_hours = patterns.get("averageFrequencyHours")
    preferred_times = patterns.get("preferredTimes", [])

    # Suggest idle threshold based on cleanup frequency
    suggested_idle = 300  # Default 5 minutes
    if avg_frequency_hours:
        if avg_frequency_hours < 12:
            # Frequent cleaner — shorter idle threshold
            suggested_idle = 180  # 3 minutes
        elif avg_frequency_hours > 168:
            # Infrequent cleaner — longer idle threshold
            suggested_idle = 600  # 10 minutes

    # Suggest tasks based on what user typically cleans
    category_prefs = habits_result.get("categoryPreferences", {})
    suggested_tasks: dict[str, bool] = {
        "junkClean": True,  # Always recommend
        "memoryOptimize": True,  # Always recommend
        "tempClean": True,  # Always recommend
    }

    # If user frequently deselects a category, don't auto-clean it
    for cat, pref in category_prefs.items():
        if not isinstance(pref, dict):
            continue
        if pref.get("recommendation") == "deselect" and pref.get("totalObservations", 0) >= 3:
            # Map category to task
            if "temp" in cat.lower():
                suggested_tasks["tempClean"] = False
            elif "junk" in cat.lower() or "cache" in cat.lower():
                suggested_tasks["junkClean"] = False

    # Preferred cleanup time
    preferred_time = None
    if preferred_times and len(preferred_times) > 0:
        preferred_time = preferred_times[0].get("label", None) if isinstance(preferred_times[0], dict) else None

    return {
        "hasData": True,
        "suggestedIdleThreshold": suggested_idle,
        "suggestedTasks": suggested_tasks,
        "preferredCleanupTime": preferred_time,
        "averageFrequencyHours": avg_frequency_hours,
        "totalEvents": total_events,
    }


@register("ai_integration.getStatus")
def ai_integration_get_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get integration status for all connected subsystems."""
    status: dict[str, Any] = {
        "selfLearningConnected": False,
        "workloadConnected": False,
        "autoCareConnected": False,
        "anomalyConnected": False,
        "smartNotificationsConnected": False,
    }

    # Check self-learning
    try:
        from avs_backend.self_learning import self_learning_status
        sl_status = self_learning_status(None)
        status["selfLearningConnected"] = sl_status.get("enabled", False)
        status["selfLearningHasData"] = sl_status.get("hasEnoughData", False)
    except Exception:
        pass

    # Check workload
    try:
        from avs_backend.workload import workload_status
        wl_status = workload_status(None)
        status["workloadConnected"] = wl_status.get("config", {}).get("enabled", False)
        status["workloadMode"] = wl_status.get("currentMode", "unknown")
    except Exception:
        pass

    # Check auto-care
    try:
        from avs_backend.auto_care import auto_care_status
        ac_status = auto_care_status(None)
        status["autoCareConnected"] = ac_status.get("config", {}).get("enabled", False)
    except Exception:
        pass

    # Check anomaly
    try:
        from avs_backend.anomaly import anomaly_status
        an_status = anomaly_status(None)
        status["anomalyConnected"] = an_status.get("enabled", False)
        status["anomalyActiveCount"] = an_status.get("stats", {}).get("activeCount", 0)
    except Exception:
        pass

    # Check smart notifications
    try:
        from avs_backend.smart_notifications import smart_notifications_stats
        sn_stats = smart_notifications_stats(None)
        status["smartNotificationsConnected"] = sn_stats.get("enabled", True)
    except Exception:
        pass

    # Count active integrations
    active_count = sum(1 for k, v in status.items() if isinstance(v, bool) and v and k.endswith("Connected"))
    status["activeIntegrations"] = active_count
    status["totalIntegrations"] = 5

    return status
