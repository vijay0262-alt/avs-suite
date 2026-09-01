"""AI Self-Learning Cleanup — learn user habits, customize cleanup over time.

Tracks user cleanup behavior patterns:
  - When the user typically runs cleanup (time of day, day of week)
  - Which cleaner categories the user selects/deselects
  - Which files/folders the user excludes from cleanup
  - How often the user runs cleanup
  - User's cleanup frequency preference

Uses this data to:
  - Predict optimal cleanup times
  - Auto-select/deselect cleaner categories based on past behavior
  - Suggest exclusions based on files the user frequently skips
  - Customize the cleanup experience over time

Data is stored in ~/.avs/self_learning_data.json.

RPC methods:
    self_learning.recordCleanup     — record a cleanup event (called after each cleanup)
    self_learning.recordSelection   — record category selection/deselection
    self_learning.recordExclusion   — record a file/folder exclusion
    self_learning.getHabits         — get learned habits and patterns
    self_learning.getRecommendations — get AI recommendations based on habits
    self_learning.status            — get learning status and stats
    self_learning.reset             — reset all learned data (Pro only)
    self_learning.configure         — update learning config (Pro only)
"""

from __future__ import annotations

import json
import logging
import os
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.self_learning")

_DATA_PATH = os.path.join(os.path.expanduser("~"), ".avs", "self_learning_data.json")

_DEFAULT_CONFIG = {
    "enabled": True,
    "autoApplyRecommendations": False,
    "learningRate": 0.1,  # Weight for new observations vs old
    "minObservations": 3,  # Min observations before making recommendations
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_DATA_PATH), exist_ok=True)


def _load_data() -> dict[str, Any]:
    if not os.path.isfile(_DATA_PATH):
        return {
            "cleanupEvents": [],
            "categorySelections": {},
            "exclusions": [],
            "config": _DEFAULT_CONFIG.copy(),
            "stats": {"totalCleanups": 0, "totalBytesCleaned": 0, "totalItemsCleaned": 0},
        }
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "cleanupEvents" not in data:
            data["cleanupEvents"] = []
        if "categorySelections" not in data:
            data["categorySelections"] = {}
        if "exclusions" not in data:
            data["exclusions"] = []
        if "config" not in data:
            data["config"] = _DEFAULT_CONFIG.copy()
        if "stats" not in data:
            data["stats"] = {"totalCleanups": 0, "totalBytesCleaned": 0, "totalItemsCleaned": 0}
        return data
    except (ValueError, OSError):
        return {
            "cleanupEvents": [],
            "categorySelections": {},
            "exclusions": [],
            "config": _DEFAULT_CONFIG.copy(),
            "stats": {"totalCleanups": 0, "totalBytesCleaned": 0, "totalItemsCleaned": 0},
        }


def _save_data(data: dict[str, Any]) -> bool:
    _ensure_dirs()
    try:
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save self-learning data: %s", e)
        return False


def _analyze_cleanup_patterns(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze cleanup events to find patterns."""
    if not events:
        return {
            "preferredTimes": [],
            "preferredDays": [],
            "averageFrequencyHours": None,
            "averageBytesCleaned": 0,
            "averageItemsCleaned": 0,
        }

    # Time of day analysis (hour buckets)
    hour_counts: Counter[int] = Counter()
    day_counts: Counter[str] = Counter()
    total_bytes = 0
    total_items = 0

    for event in events:
        try:
            dt = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))
            hour_counts[dt.hour] += 1
            day_counts[dt.strftime("%A")] += 1
            total_bytes += event.get("bytesCleaned", 0)
            total_items += event.get("itemsCleaned", 0)
        except (ValueError, KeyError):
            continue

    # Preferred times (top 3 hours)
    preferred_hours = hour_counts.most_common(3)
    preferred_times = [
        {"hour": h, "label": f"{h:02d}:00", "count": c}
        for h, c in preferred_hours
    ]

    # Preferred days
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    preferred_days = sorted(day_counts.items(), key=lambda x: x[1], reverse=True)
    preferred_days_list = [
        {"day": d, "count": c}
        for d, c in preferred_days
    ]

    # Average frequency
    avg_frequency = None
    if len(events) >= 2:
        timestamps = []
        for event in sorted(events, key=lambda e: e.get("timestamp", "")):
            try:
                dt = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))
                timestamps.append(dt)
            except (ValueError, KeyError):
                continue

        if len(timestamps) >= 2:
            intervals = []
            for i in range(1, len(timestamps)):
                interval = (timestamps[i] - timestamps[i - 1]).total_seconds() / 3600
                intervals.append(interval)
            if intervals:
                avg_frequency = sum(intervals) / len(intervals)

    return {
        "preferredTimes": preferred_times,
        "preferredDays": preferred_days_list,
        "averageFrequencyHours": round(avg_frequency, 1) if avg_frequency else None,
        "averageBytesCleaned": total_bytes // len(events) if events else 0,
        "averageItemsCleaned": total_items // len(events) if events else 0,
        "totalEvents": len(events),
    }


def _analyze_category_selections(selections: dict[str, Any]) -> dict[str, Any]:
    """Analyze category selection patterns."""
    result: dict[str, Any] = {}

    for category, data in selections.items():
        selected_count = data.get("selected", 0)
        deselected_count = data.get("deselected", 0)
        total = selected_count + deselected_count

        if total == 0:
            continue

        preference = selected_count / total  # 0.0 = always deselected, 1.0 = always selected
        result[category] = {
            "selectedCount": selected_count,
            "deselectedCount": deselected_count,
            "preferenceScore": round(preference, 2),
            "recommendation": "select" if preference >= 0.7 else "deselect" if preference <= 0.3 else "neutral",
            "totalObservations": total,
        }

    return result


def _analyze_exclusions(exclusions: list[dict[str, Any]]) -> dict[str, Any]:
    """Analyze exclusion patterns."""
    if not exclusions:
        return {"frequentExclusions": [], "totalExclusions": 0}

    # Count by path
    path_counts: Counter[str] = Counter()
    for exc in exclusions:
        path = exc.get("path", "")
        if path:
            path_counts[path] += 1

    frequent = [
        {"path": p, "count": c}
        for p, c in path_counts.most_common(10)
        if c >= 2  # Only show paths excluded multiple times
    ]

    return {
        "frequentExclusions": frequent,
        "totalExclusions": len(exclusions),
        "uniquePaths": len(path_counts),
    }


def _generate_recommendations(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate AI recommendations based on learned habits."""
    recommendations: list[dict[str, Any]] = []
    config = data.get("config", _DEFAULT_CONFIG.copy())
    min_obs = config.get("minObservations", 3)

    events = data.get("cleanupEvents", [])
    patterns = _analyze_cleanup_patterns(events)

    # Recommendation: optimal cleanup time
    if patterns["preferredTimes"] and patterns["totalEvents"] >= min_obs:
        top_time = patterns["preferredTimes"][0]
        recommendations.append({
            "id": "rec_cleanup_time",
            "type": "schedule",
            "priority": "normal",
            "title": "Optimal Cleanup Time Detected",
            "message": f"You typically run cleanup around {top_time['label']}. AI can schedule automatic cleanup at this time.",
            "action": {
                "label": "Schedule Cleanup",
                "rpcMethod": "scheduler.create",
                "params": {"action": "junk_clean", "schedule": "daily", "time": f"{top_time['hour']:02d}:00"},
            },
        })

    # Recommendation: category preferences
    selections = data.get("categorySelections", {})
    category_analysis = _analyze_category_selections(selections)

    for cat, info in category_analysis.items():
        if info["totalObservations"] >= min_obs:
            if info["recommendation"] == "deselect":
                recommendations.append({
                    "id": f"rec_cat_{cat}",
                    "type": "category",
                    "priority": "low",
                    "title": f"Skip {cat.title()} Category",
                    "message": f"You deselect '{cat}' in {info['deselectedCount']} out of {info['totalObservations']} cleanups. AI recommends deselecting it by default.",
                    "action": {
                        "label": "Auto-deselect",
                        "rpcMethod": "self_learning.configure",
                        "params": {"autoDeselectCategories": [cat]},
                    },
                })
            elif info["recommendation"] == "select":
                recommendations.append({
                    "id": f"rec_cat_{cat}",
                    "type": "category",
                    "priority": "low",
                    "title": f"Always Clean {cat.title()}",
                    "message": f"You select '{cat}' in {info['selectedCount']} out of {info['totalObservations']} cleanups. AI recommends selecting it by default.",
                    "action": {
                        "label": "Auto-select",
                        "rpcMethod": "self_learning.configure",
                        "params": {"autoSelectCategories": [cat]},
                    },
                })

    # Recommendation: exclusions
    exclusions = data.get("exclusions", [])
    exclusion_analysis = _analyze_exclusions(exclusions)

    for exc in exclusion_analysis["frequentExclusions"]:
        recommendations.append({
            "id": f"rec_exc_{hash(exc['path']) % 10000}",
            "type": "exclusion",
            "priority": "normal",
            "title": "Frequently Excluded Path",
            "message": f"You exclude '{exc['path']}' in {exc['count']} cleanups. AI recommends adding it to permanent exclusions.",
            "action": {
                "label": "Add to Exclusions",
                "rpcMethod": "settings.addExclusion",
                "params": {"path": exc["path"]},
            },
        })

    # Recommendation: cleanup frequency
    if patterns["averageFrequencyHours"] and patterns["totalEvents"] >= min_obs:
        freq_hours = patterns["averageFrequencyHours"]
        if freq_hours < 12:
            recommendations.append({
                "id": "rec_freq_high",
                "type": "frequency",
                "priority": "normal",
                "title": "Frequent Cleanup Detected",
                "message": f"You clean up every {freq_hours:.0f} hours on average. AI recommends enabling Auto-Care for hands-free maintenance.",
                "action": {
                    "label": "Enable Auto-Care",
                    "rpcMethod": "auto_care.configure",
                    "params": {"enabled": True},
                },
            })
        elif freq_hours > 168:  # More than a week
            recommendations.append({
                "id": "rec_freq_low",
                "type": "frequency",
                "priority": "low",
                "title": "Infrequent Cleanup Detected",
                "message": f"You clean up every {freq_hours:.0f} hours on average. Junk may accumulate significantly. AI recommends scheduling weekly cleanup.",
                "action": {
                    "label": "Schedule Weekly",
                    "rpcMethod": "scheduler.create",
                    "params": {"action": "junk_clean", "schedule": "weekly", "day": "SUN", "time": "02:00"},
                },
            })

    # Sort by priority
    priority_order = {"critical": 0, "high": 1, "normal": 2, "low": 3}
    recommendations.sort(key=lambda r: priority_order.get(r["priority"], 99))

    return recommendations


# ─── RPC Methods ────────────────────────────────────────────────────

@register("self_learning.recordCleanup")
def self_learning_record_cleanup(params: dict[str, Any] | None) -> dict[str, Any]:
    """Record a cleanup event for learning.

    Params:
        bytesCleaned: int — total bytes cleaned
        itemsCleaned: int — total items cleaned
        categories: list[str] — categories that were cleaned
        duration: float — cleanup duration in seconds (optional)
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "Self-learning is disabled"}

    if not params:
        return {"success": False, "message": "No cleanup data provided"}

    event = {
        "timestamp": _now_iso(),
        "bytesCleaned": int(params.get("bytesCleaned", 0)),
        "itemsCleaned": int(params.get("itemsCleaned", 0)),
        "categories": params.get("categories", []),
        "duration": float(params.get("duration", 0)),
    }

    data["cleanupEvents"].append(event)
    # Keep last 200 events
    data["cleanupEvents"] = data["cleanupEvents"][-200:]

    # Update stats
    data["stats"]["totalCleanups"] = data["stats"].get("totalCleanups", 0) + 1
    data["stats"]["totalBytesCleaned"] = data["stats"].get("totalBytesCleaned", 0) + event["bytesCleaned"]
    data["stats"]["totalItemsCleaned"] = data["stats"].get("totalItemsCleaned", 0) + event["itemsCleaned"]

    _save_data(data)

    return {
        "success": True,
        "message": "Cleanup event recorded",
        "totalEvents": len(data["cleanupEvents"]),
    }


@register("self_learning.recordSelection")
def self_learning_record_selection(params: dict[str, Any] | None) -> dict[str, Any]:
    """Record a category selection or deselection.

    Params:
        category: str — the cleaner category
        selected: bool — whether the category was selected (true) or deselected (false)
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "Self-learning is disabled"}

    if not params or "category" not in params:
        return {"success": False, "message": "category parameter is required"}

    category = params["category"]
    selected = bool(params.get("selected", True))

    selections = data.get("categorySelections", {})
    if category not in selections:
        selections[category] = {"selected": 0, "deselected": 0}

    if selected:
        selections[category]["selected"] += 1
    else:
        selections[category]["deselected"] += 1

    data["categorySelections"] = selections
    _save_data(data)

    return {
        "success": True,
        "message": f"Recorded {'selection' if selected else 'deselection'} of '{category}'",
        "category": category,
        "selectedCount": selections[category]["selected"],
        "deselectedCount": selections[category]["deselected"],
    }


@register("self_learning.recordExclusion")
def self_learning_record_exclusion(params: dict[str, Any] | None) -> dict[str, Any]:
    """Record a file/folder exclusion from cleanup.

    Params:
        path: str — the path that was excluded
        reason: str — why it was excluded (optional)
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "Self-learning is disabled"}

    if not params or "path" not in params:
        return {"success": False, "message": "path parameter is required"}

    exclusion = {
        "path": params["path"],
        "reason": params.get("reason", ""),
        "timestamp": _now_iso(),
    }

    data["exclusions"].append(exclusion)
    # Keep last 100 exclusions
    data["exclusions"] = data["exclusions"][-100:]

    _save_data(data)

    return {
        "success": True,
        "message": f"Exclusion recorded for '{params['path']}'",
        "totalExclusions": len(data["exclusions"]),
    }


@register("self_learning.getHabits")
def self_learning_get_habits(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get learned habits and patterns."""
    data = _load_data()

    events = data.get("cleanupEvents", [])
    patterns = _analyze_cleanup_patterns(events)

    selections = data.get("categorySelections", {})
    category_analysis = _analyze_category_selections(selections)

    exclusions = data.get("exclusions", [])
    exclusion_analysis = _analyze_exclusions(exclusions)

    return {
        "cleanupPatterns": patterns,
        "categoryPreferences": category_analysis,
        "exclusionPatterns": exclusion_analysis,
        "stats": data.get("stats", {}),
        "learningEnabled": data.get("config", {}).get("enabled", True),
    }


@register("self_learning.getRecommendations")
def self_learning_get_recommendations(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get AI recommendations based on learned habits."""
    data = _load_data()
    recommendations = _generate_recommendations(data)

    return {
        "recommendations": recommendations,
        "count": len(recommendations),
        "autoApply": data.get("config", {}).get("autoApplyRecommendations", False),
    }


@register("self_learning.status")
def self_learning_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get learning status and statistics."""
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())
    stats = data.get("stats", {})

    events = data.get("cleanupEvents", [])
    selections = data.get("categorySelections", {})
    exclusions = data.get("exclusions", [])

    return {
        "enabled": config.get("enabled", True),
        "autoApplyRecommendations": config.get("autoApplyRecommendations", False),
        "config": config,
        "stats": {
            "totalCleanups": stats.get("totalCleanups", 0),
            "totalBytesCleaned": stats.get("totalBytesCleaned", 0),
            "totalItemsCleaned": stats.get("totalItemsCleaned", 0),
            "totalEvents": len(events),
            "totalCategoriesTracked": len(selections),
            "totalExclusions": len(exclusions),
        },
        "hasEnoughData": len(events) >= config.get("minObservations", 3),
        "supported": True,
    }


@register("self_learning.reset")
@require_feature("self_learning.reset")
def self_learning_reset(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Reset all learned data. Pro only."""
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    data = {
        "cleanupEvents": [],
        "categorySelections": {},
        "exclusions": [],
        "config": config,
        "stats": {"totalCleanups": 0, "totalBytesCleaned": 0, "totalItemsCleaned": 0},
    }
    _save_data(data)

    return {
        "success": True,
        "message": "All learned data has been reset",
    }


@register("self_learning.configure")
@require_feature("self_learning.configure")
def self_learning_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update learning configuration. Pro only.

    Params (all optional):
        enabled: bool
        autoApplyRecommendations: bool
        learningRate: float
        minObservations: int
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "autoApplyRecommendations" in params:
            config["autoApplyRecommendations"] = bool(params["autoApplyRecommendations"])
        if "learningRate" in params:
            config["learningRate"] = max(0.01, min(1.0, float(params["learningRate"])))
        if "minObservations" in params:
            config["minObservations"] = max(1, int(params["minObservations"]))

    data["config"] = config
    _save_data(data)

    return {
        "success": True,
        "config": config,
        "message": "Self-learning configuration updated",
    }
