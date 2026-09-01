"""AI Smart Notifications — contextual actionable alerts instead of generic ones.

Aggregates data from all AVS subsystems (junk monitor, predictive maintenance,
workload detection, auto-care, performance, security) and generates intelligent,
contextual notifications with actionable recommendations.

Unlike the basic notification system, smart notifications:
  - Correlate multiple data sources for context
  - Provide specific actionable recommendations
  - Prioritize based on urgency and impact
  - Avoid notification fatigue by deduplicating and rate-limiting
  - Learn from user dismissal patterns

Data is stored in ~/.avs/smart_notifications.json.

RPC methods:
    smart_notifications.generate    — generate smart notifications by analyzing all subsystems
    smart_notifications.list        — list smart notifications
    smart_notifications.dismiss     — dismiss a notification
    smart_notifications.action      — execute the recommended action for a notification
    smart_notifications.clearAll    — clear all notifications
    smart_notifications.stats       — get notification statistics
    smart_notifications.configure   — update smart notification config (Pro only)
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.smart_notifications")

_DATA_PATH = os.path.join(os.path.expanduser("~"), ".avs", "smart_notifications.json")

_DEFAULT_CONFIG = {
    "enabled": True,
    "maxNotifications": 50,
    "rateLimitMinutes": 30,  # Don't re-notify same category within 30 min
    "categories": {
        "performance": True,
        "security": True,
        "maintenance": True,
        "optimization": True,
        "predictive": True,
    },
}

# In-memory state
_state: dict[str, Any] = {
    "lastGenerationAt": None,
    "lastCategoryNotification": {},  # category -> timestamp
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_ts() -> float:
    return time.time()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_DATA_PATH), exist_ok=True)


def _load_data() -> dict[str, Any]:
    if not os.path.isfile(_DATA_PATH):
        return {"notifications": [], "config": _DEFAULT_CONFIG.copy(), "stats": {"totalGenerated": 0, "totalDismissed": 0, "totalActed": 0}}
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "notifications" not in data:
            data["notifications"] = []
        if "config" not in data:
            data["config"] = _DEFAULT_CONFIG.copy()
        if "stats" not in data:
            data["stats"] = {"totalGenerated": 0, "totalDismissed": 0, "totalActed": 0}
        return data
    except (ValueError, OSError):
        return {"notifications": [], "config": _DEFAULT_CONFIG.copy(), "stats": {"totalGenerated": 0, "totalDismissed": 0, "totalActed": 0}}


def _save_data(data: dict[str, Any]) -> bool:
    _ensure_dirs()
    try:
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save smart notifications: %s", e)
        return False


def _check_rate_limit(category: str, config: dict[str, Any]) -> bool:
    """Check if enough time has passed since last notification in this category."""
    last = _state["lastCategoryNotification"].get(category, 0)
    rate_limit = config.get("rateLimitMinutes", 30) * 60
    return (_now_ts() - last) >= rate_limit


def _update_rate_limit(category: str) -> None:
    _state["lastCategoryNotification"][category] = _now_ts()


def _create_notification(
    category: str,
    priority: str,
    title: str,
    message: str,
    action: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a smart notification object."""
    return {
        "id": f"smart_{int(_now_ts() * 1000)}_{category}",
        "category": category,
        "priority": priority,  # critical, high, normal, low
        "title": title,
        "message": message,
        "action": action,  # {label, rpcMethod, params}
        "context": context or {},
        "timestamp": _now_iso(),
        "dismissed": False,
        "acted": False,
    }


def _analyze_junk(data: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    """Analyze junk accumulation and generate notifications."""
    notifications: list[dict[str, Any]] = []
    if not config.get("categories", {}).get("maintenance", True):
        return notifications

    try:
        # Try to get junk monitor status
        from avs_backend.junk_monitor import junk_monitor_status
        junk_status = junk_monitor_status(None)
        junk_bytes = junk_status.get("currentJunkBytes", 0)
        threshold = junk_status.get("thresholdBytes", 2 * 1024 * 1024 * 1024)

        if junk_bytes >= threshold:
            if _check_rate_limit("junk_threshold", config):
                gb = junk_bytes / (1024 * 1024 * 1024)
                notifications.append(_create_notification(
                    "maintenance",
                    "high",
                    "Junk Files Need Cleanup",
                    f"You have {gb:.1f} GB of junk files accumulated. Cleaning now will free significant disk space.",
                    action={
                        "label": "Clean Now",
                        "rpcMethod": "cleaner.scan.start",
                        "params": {},
                    },
                    context={"junkBytes": junk_bytes, "thresholdBytes": threshold},
                ))
                _update_rate_limit("junk_threshold")
    except Exception:
        pass

    return notifications


def _analyze_predictive(data: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    """Analyze predictive maintenance data and generate notifications."""
    notifications: list[dict[str, Any]] = []
    if not config.get("categories", {}).get("predictive", True):
        return notifications

    try:
        from avs_backend.predictive import predictive_status
        pred_status = predictive_status(None)
        prediction = pred_status.get("prediction", {})
        days = prediction.get("daysUntilCleanup")

        if days is not None and days <= 1:
            if _check_rate_limit("predictive_urgent", config):
                notifications.append(_create_notification(
                    "predictive",
                    "critical" if days <= 0 else "high",
                    "Cleanup Needed Soon",
                    prediction.get("recommendedAction", "AI predicts cleanup is needed soon."),
                    action={
                        "label": "Clean Now",
                        "rpcMethod": "cleaner.scan.start",
                        "params": {},
                    },
                    context={
                        "daysUntilCleanup": days,
                        "currentJunkBytes": prediction.get("currentJunkBytes", 0),
                        "accumulationRate": prediction.get("accumulationRateBytesPerDay", 0),
                        "confidence": prediction.get("confidence", 0),
                    },
                ))
                _update_rate_limit("predictive_urgent")
        elif days is not None and days <= 3:
            if _check_rate_limit("predictive_warning", config):
                notifications.append(_create_notification(
                    "predictive",
                    "normal",
                    "Cleanup Recommended Soon",
                    prediction.get("recommendedAction", f"AI predicts cleanup needed in {days} days."),
                    action={
                        "label": "Schedule Cleanup",
                        "rpcMethod": "scheduler.create",
                        "params": {"action": "junk_clean", "schedule": "daily", "time": "02:00"},
                    },
                    context={"daysUntilCleanup": days, "confidence": prediction.get("confidence", 0)},
                ))
                _update_rate_limit("predictive_warning")
    except Exception:
        pass

    return notifications


def _analyze_workload(data: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    """Analyze workload detection and generate notifications."""
    notifications: list[dict[str, Any]] = []
    if not config.get("categories", {}).get("optimization", True):
        return notifications

    try:
        from avs_backend.workload import workload_status
        wl_status = workload_status(None)
        mode = wl_status.get("currentMode", "idle")
        config_wl = wl_status.get("config", {})
        auto_optimize = config_wl.get("autoOptimize", False)

        if mode == "gaming" and not auto_optimize:
            if _check_rate_limit("workload_gaming", config):
                notifications.append(_create_notification(
                    "optimization",
                    "normal",
                    "Game Mode Available",
                    "AI detected you're gaming. Enable Game Mode to suspend background scans and free RAM for better performance.",
                    action={
                        "label": "Enable Game Mode",
                        "rpcMethod": "workload.setMode",
                        "params": {"mode": "gaming"},
                    },
                    context={"detectedMode": mode, "confidence": wl_status.get("currentConfidence", 0)},
                ))
                _update_rate_limit("workload_gaming")
    except Exception:
        pass

    return notifications


def _analyze_performance(data: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    """Analyze performance metrics and generate notifications."""
    notifications: list[dict[str, Any]] = []
    if not config.get("categories", {}).get("performance", True):
        return notifications

    try:
        import psutil

        cpu = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()

        # High CPU notification
        if cpu > 85:
            if _check_rate_limit("perf_cpu", config):
                # Find top CPU process
                top_proc = None
                top_cpu = 0
                for p in psutil.process_iter(["name", "cpu_percent"]):
                    try:
                        p_cpu = p.info.get("cpu_percent", 0) or 0
                        if p_cpu > top_cpu:
                            top_cpu = p_cpu
                            top_proc = p.info.get("name", "unknown")
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

                notifications.append(_create_notification(
                    "performance",
                    "high",
                    "High CPU Usage Detected",
                    f"CPU usage is at {cpu:.0f}%. Top process: {top_proc} ({top_cpu:.1f}%). Consider closing unnecessary applications.",
                    action={
                        "label": "View Processes",
                        "rpcMethod": "performance.memory.getProcesses",
                        "params": {},
                    },
                    context={"cpuPercent": cpu, "topProcess": top_proc, "topCpuPercent": top_cpu},
                ))
                _update_rate_limit("perf_cpu")

        # High memory notification
        if mem.percent > 85:
            if _check_rate_limit("perf_mem", config):
                notifications.append(_create_notification(
                    "performance",
                    "high",
                    "High Memory Usage",
                    f"Memory usage is at {mem.percent:.0f}%. Optimizing RAM now can improve system responsiveness.",
                    action={
                        "label": "Optimize RAM",
                        "rpcMethod": "performance.memory.optimize",
                        "params": {},
                    },
                    context={"memoryPercent": mem.percent, "memoryAvailable": mem.available},
                ))
                _update_rate_limit("perf_mem")

        # Low disk space
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                if usage.percent > 90:
                    if _check_rate_limit(f"perf_disk_{part.mountpoint}", config):
                        notifications.append(_create_notification(
                            "performance",
                            "critical",
                            f"Low Disk Space: {part.mountpoint}",
                            f"Drive {part.mountpoint} is {usage.percent:.0f}% full. Only {usage.free / (1024**3):.1f} GB remaining. Cleaning junk files is recommended.",
                            action={
                                "label": "Clean Now",
                                "rpcMethod": "cleaner.scan.start",
                                "params": {},
                            },
                            context={"drive": part.mountpoint, "percent": usage.percent, "freeBytes": usage.free},
                        ))
                        _update_rate_limit(f"perf_disk_{part.mountpoint}")
            except (psutil.AccessDenied, PermissionError):
                continue
    except Exception:
        pass

    return notifications


def _analyze_auto_care(data: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    """Analyze auto-care status and generate notifications."""
    notifications: list[dict[str, Any]] = []
    if not config.get("categories", {}).get("maintenance", True):
        return notifications

    try:
        from avs_backend.auto_care import auto_care_status
        ac_status = auto_care_status(None)
        ac_config = ac_status.get("config", {})
        running = ac_status.get("running", False)

        if not ac_config.get("enabled", False) and not running:
            if _check_rate_limit("autocare_disabled", config):
                notifications.append(_create_notification(
                    "maintenance",
                    "low",
                    "Auto-Care is Disabled",
                    "Enable AI Auto-Care to automatically clean junk and optimize RAM when your PC is idle. Keep your system running smoothly without manual intervention.",
                    action={
                        "label": "Enable Auto-Care",
                        "rpcMethod": "auto_care.configure",
                        "params": {"enabled": True},
                    },
                    context={"enabled": False},
                ))
                _update_rate_limit("autocare_disabled")
    except Exception:
        pass

    return notifications


def _analyze_security(data: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    """Analyze security status and generate notifications."""
    notifications: list[dict[str, Any]] = []
    if not config.get("categories", {}).get("security", True):
        return notifications

    try:
        from avs_backend.realtime_protection import realtime_status
        rt_status = realtime_status(None)
        enabled = rt_status.get("enabled", False)

        if not enabled:
            if _check_rate_limit("security_disabled", config):
                notifications.append(_create_notification(
                    "security",
                    "high",
                    "Real-Time Protection is Off",
                    "Your system is not protected against threats in real-time. Enable real-time protection to scan files as they're accessed.",
                    action={
                        "label": "Enable Protection",
                        "rpcMethod": "realtime.enable",
                        "params": {},
                    },
                    context={"enabled": False},
                ))
                _update_rate_limit("security_disabled")
    except Exception:
        pass

    return notifications


def _analyze_anomaly(data: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    """Anomaly detection integration — generate notifications for critical/high anomalies."""
    notifications: list[dict[str, Any]] = []
    if not config.get("categories", {}).get("security", True):
        return notifications

    try:
        from avs_backend.anomaly import anomaly_list_anomalies
        result = anomaly_list_anomalies({"limit": 10, "minScore": 50})
        anomalies = result.get("anomalies", [])

        critical_anomalies = [a for a in anomalies if a.get("severity") == "critical"]
        high_anomalies = [a for a in anomalies if a.get("severity") == "high"]

        if critical_anomalies:
            if _check_rate_limit("anomaly_critical", config):
                names = ", ".join(a.get("name", "unknown") for a in critical_anomalies[:3])
                notifications.append(_create_notification(
                    "security",
                    "critical",
                    "Critical Behavioral Anomaly Detected",
                    f"{len(critical_anomalies)} critical anomaly detected: {names}. These processes show behavior patterns consistent with malware.",
                    action={
                        "label": "View Anomalies",
                        "rpcMethod": "anomaly.listAnomalies",
                        "params": {"minScore": 50},
                    },
                    context={"criticalCount": len(critical_anomalies), "names": names},
                ))
                _update_rate_limit("anomaly_critical")

        elif high_anomalies:
            if _check_rate_limit("anomaly_high", config):
                names = ", ".join(a.get("name", "unknown") for a in high_anomalies[:3])
                notifications.append(_create_notification(
                    "security",
                    "high",
                    "Suspicious Process Behavior Detected",
                    f"{len(high_anomalies)} suspicious process(es) detected: {names}. Review these anomalies to ensure system safety.",
                    action={
                        "label": "Review Anomalies",
                        "rpcMethod": "anomaly.listAnomalies",
                        "params": {"minScore": 50},
                    },
                    context={"highCount": len(high_anomalies), "names": names},
                ))
                _update_rate_limit("anomaly_high")
    except Exception:
        pass

    return notifications


def _deduplicate(notifications: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove duplicate notifications by category+title."""
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for n in notifications:
        key = f"{n['category']}_{n['title']}"
        if key not in seen:
            seen.add(key)
            result.append(n)
    return result


# ─── RPC Methods ────────────────────────────────────────────────────

@register("smart_notifications.generate")
def smart_notifications_generate(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Generate smart notifications by analyzing all subsystems.

    Aggregates data from junk monitor, predictive maintenance, workload detection,
    auto-care, performance metrics, and security status to produce contextual,
    actionable notifications.
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "Smart notifications are disabled", "generated": 0}

    all_notifications: list[dict[str, Any]] = []

    # Run all analyzers
    all_notifications.extend(_analyze_junk(data, config))
    all_notifications.extend(_analyze_predictive(data, config))
    all_notifications.extend(_analyze_workload(data, config))
    all_notifications.extend(_analyze_performance(data, config))
    all_notifications.extend(_analyze_auto_care(data, config))
    all_notifications.extend(_analyze_security(data, config))
    all_notifications.extend(_analyze_anomaly(data, config))

    # Deduplicate
    all_notifications = _deduplicate(all_notifications)

    # Sort by priority
    priority_order = {"critical": 0, "high": 1, "normal": 2, "low": 3}
    all_notifications.sort(key=lambda n: priority_order.get(n["priority"], 99))

    # Add to stored notifications
    existing = data.get("notifications", [])
    existing.extend(all_notifications)

    # Trim to max
    max_notif = config.get("maxNotifications", 50)
    existing = existing[-max_notif:]

    data["notifications"] = existing
    data["stats"]["totalGenerated"] = data["stats"].get("totalGenerated", 0) + len(all_notifications)
    _state["lastGenerationAt"] = _now_iso()

    _save_data(data)

    return {
        "success": True,
        "generated": len(all_notifications),
        "notifications": all_notifications,
        "totalActive": len([n for n in existing if not n.get("dismissed", False)]),
    }


@register("smart_notifications.list")
def smart_notifications_list(params: dict[str, Any] | None) -> dict[str, Any]:
    """List smart notifications.

    Params (optional):
        limit: int — max notifications to return (default 20)
        dismissed: bool — include dismissed notifications (default false)
        category: str — filter by category
    """
    data = _load_data()
    notifications = data.get("notifications", [])

    # Filter
    include_dismissed = params.get("dismissed", False) if params else False
    category_filter = params.get("category") if params else None

    filtered = []
    for n in notifications:
        if not include_dismissed and n.get("dismissed", False):
            continue
        if category_filter and n.get("category") != category_filter:
            continue
        filtered.append(n)

    limit = 20
    if params and "limit" in params:
        limit = min(100, max(1, int(params["limit"])))

    # Return most recent first
    filtered = list(reversed(filtered[-limit:]))

    return {
        "notifications": filtered,
        "count": len(filtered),
        "totalActive": len([n for n in notifications if not n.get("dismissed", False)]),
        "lastGenerationAt": _state["lastGenerationAt"],
    }


@register("smart_notifications.dismiss")
def smart_notifications_dismiss(params: dict[str, Any] | None) -> dict[str, Any]:
    """Dismiss a smart notification by ID.

    Params:
        id: str — notification ID to dismiss
    """
    if not params or "id" not in params:
        return {"success": False, "message": "id parameter is required"}

    notif_id = params["id"]
    data = _load_data()
    notifications = data.get("notifications", [])

    found = False
    for n in notifications:
        if n["id"] == notif_id:
            n["dismissed"] = True
            found = True
            break

    if not found:
        return {"success": False, "message": "Notification not found"}

    data["stats"]["totalDismissed"] = data["stats"].get("totalDismissed", 0) + 1
    _save_data(data)

    return {"success": True, "message": "Notification dismissed"}


@register("smart_notifications.action")
@require_feature("smart_notifications.action")
def smart_notifications_action(params: dict[str, Any] | None) -> dict[str, Any]:
    """Execute the recommended action for a notification. Pro only.

    Params:
        id: str — notification ID
    """
    if not params or "id" not in params:
        return {"success": False, "message": "id parameter is required"}

    notif_id = params["id"]
    data = _load_data()
    notifications = data.get("notifications", [])

    notif = None
    for n in notifications:
        if n["id"] == notif_id:
            notif = n
            break

    if not notif:
        return {"success": False, "message": "Notification not found"}

    action = notif.get("action")
    if not action:
        return {"success": False, "message": "No action available for this notification"}

    # Mark as acted
    notif["acted"] = True
    data["stats"]["totalActed"] = data["stats"].get("totalActed", 0) + 1
    _save_data(data)

    return {
        "success": True,
        "message": "Action triggered",
        "action": action,
        "rpcMethod": action.get("rpcMethod"),
        "params": action.get("params", {}),
    }


@register("smart_notifications.clearAll")
def smart_notifications_clear_all(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all smart notifications."""
    data = _load_data()
    data["notifications"] = []
    _save_data(data)

    return {"success": True, "message": "All notifications cleared"}


@register("smart_notifications.stats")
def smart_notifications_stats(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get smart notification statistics."""
    data = _load_data()
    notifications = data.get("notifications", [])
    stats = data.get("stats", {})

    # Count by category
    by_category: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    active = 0
    dismissed = 0
    acted = 0

    for n in notifications:
        cat = n.get("category", "unknown")
        by_category[cat] = by_category.get(cat, 0) + 1
        pri = n.get("priority", "normal")
        by_priority[pri] = by_priority.get(pri, 0) + 1
        if n.get("dismissed", False):
            dismissed += 1
        else:
            active += 1
        if n.get("acted", False):
            acted += 1

    return {
        "total": len(notifications),
        "active": active,
        "dismissed": dismissed,
        "acted": acted,
        "byCategory": by_category,
        "byPriority": by_priority,
        "totalGenerated": stats.get("totalGenerated", 0),
        "totalDismissed": stats.get("totalDismissed", 0),
        "totalActed": stats.get("totalActed", 0),
        "lastGenerationAt": _state["lastGenerationAt"],
    }


@register("smart_notifications.configure")
@require_feature("smart_notifications.configure")
def smart_notifications_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update smart notification configuration. Pro only.

    Params (all optional):
        enabled: bool
        maxNotifications: int
        rateLimitMinutes: int
        categories: dict — per-category enable/disable
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "maxNotifications" in params:
            config["maxNotifications"] = max(10, int(params["maxNotifications"]))
        if "rateLimitMinutes" in params:
            config["rateLimitMinutes"] = max(1, int(params["rateLimitMinutes"]))
        if "categories" in params and isinstance(params["categories"], dict):
            cats = config.get("categories", {})
            cats.update(params["categories"])
            config["categories"] = cats

    data["config"] = config
    _save_data(data)

    return {
        "success": True,
        "config": config,
        "message": "Smart notification configuration updated",
    }
