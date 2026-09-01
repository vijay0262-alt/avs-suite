"""AI Predictive Maintenance — learn junk accumulation rate, predict when cleanup needed.

Tracks junk accumulation over time by sampling junk size at regular intervals.
Uses linear regression to predict when junk will reach a threshold and recommends
cleanup before it impacts system performance.

Data is stored in ~/.avs/predictive_data.json:
  - samples: list of {timestamp, junkBytes, tempBytes, totalBytes}
  - predictions: list of {timestamp, predictedDate, confidence, recommendedAction}
  - config: {enabled, thresholdGB, sampleIntervalMinutes, maxSamples}

RPC methods:
    predictive.sample       — take a junk accumulation sample (called periodically)
    predictive.status       — get current prediction status and recommendation
    predictive.history      — get historical samples and predictions
    predictive.configure    — update prediction config (Pro only)
    predictive.clearData    — clear all collected data (Pro only)
"""

from __future__ import annotations

import json
import logging
import os
import platform
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.predictive")

IS_WINDOWS = platform.system() == "Windows"

_DATA_PATH = os.path.join(os.path.expanduser("~"), ".avs", "predictive_data.json")

_DEFAULT_CONFIG = {
    "enabled": True,
    "thresholdGB": 5.0,  # Warn when junk predicted to reach 5 GB
    "sampleIntervalMinutes": 60,  # Sample every hour
    "maxSamples": 168,  # Keep 7 days of hourly samples
    "notificationThresholdHours": 24,  # Notify if cleanup needed within 24h
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_DATA_PATH), exist_ok=True)


def _load_data() -> dict[str, Any]:
    if not os.path.isfile(_DATA_PATH):
        return {"samples": [], "predictions": [], "config": _DEFAULT_CONFIG.copy()}
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "samples" not in data:
            data["samples"] = []
        if "predictions" not in data:
            data["predictions"] = []
        if "config" not in data:
            data["config"] = _DEFAULT_CONFIG.copy()
        return data
    except (ValueError, OSError):
        return {"samples": [], "predictions": [], "config": _DEFAULT_CONFIG.copy()}


def _save_data(data: dict[str, Any]) -> bool:
    _ensure_dirs()
    try:
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save predictive data: %s", e)
        return False


def _measure_junk() -> dict[str, int]:
    """Measure current junk size in bytes across temp locations."""
    junk_bytes = 0
    temp_bytes = 0
    cache_bytes = 0

    try:
        # User temp
        temp_dir = tempfile.gettempdir()
        if os.path.isdir(temp_dir):
            for dp, _, fs in os.walk(temp_dir):
                for f in fs:
                    try:
                        fp = os.path.join(dp, f)
                        temp_bytes += os.path.getsize(fp)
                    except OSError:
                        pass

        # Windows Temp
        if IS_WINDOWS:
            win_temp = os.path.expandvars(r"%WINDIR%\Temp")
            if os.path.isdir(win_temp):
                for dp, _, fs in os.walk(win_temp):
                    for f in fs:
                        try:
                            fp = os.path.join(dp, f)
                            temp_bytes += os.path.getsize(fp)
                        except OSError:
                            pass

            # Prefetch
            prefetch = os.path.expandvars(r"%WINDIR%\Prefetch")
            if os.path.isdir(prefetch):
                for entry in os.listdir(prefetch):
                    if entry.lower().endswith(".pf"):
                        try:
                            cache_bytes += os.path.getsize(os.path.join(prefetch, entry))
                        except OSError:
                            pass

        junk_bytes = temp_bytes + cache_bytes
    except Exception as e:
        log.error("Failed to measure junk: %s", e)

    return {
        "junkBytes": junk_bytes,
        "tempBytes": temp_bytes,
        "cacheBytes": cache_bytes,
        "totalBytes": junk_bytes,
    }


def _linear_regression(xs: list[float], ys: list[float]) -> tuple[float, float, float]:
    """Simple linear regression. Returns (slope, intercept, r_squared).

    slope: bytes per second
    intercept: initial bytes
    r_squared: goodness of fit (0-1)
    """
    n = len(xs)
    if n < 2:
        return 0.0, 0.0, 0.0

    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_x2 = sum(x * x for x in xs)

    denominator = n * sum_x2 - sum_x * sum_x
    if denominator == 0:
        return 0.0, sum_y / n, 0.0

    slope = (n * sum_xy - sum_x * sum_y) / denominator
    intercept = (sum_y - slope * sum_x) / n

    # Calculate r_squared
    mean_y = sum_y / n
    ss_total = sum((y - mean_y) ** 2 for y in ys)
    if ss_total == 0:
        return slope, intercept, 1.0 if slope == 0 else 0.0

    ss_residual = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    r_squared = 1.0 - (ss_residual / ss_total) if ss_total > 0 else 0.0

    return slope, intercept, max(0.0, min(1.0, r_squared))


def _predict_cleanup_date(samples: list[dict[str, Any]], threshold_bytes: int) -> dict[str, Any]:
    """Predict when junk will reach the threshold.

    Returns:
        predictedDate: ISO date when threshold will be reached (or null)
        daysUntilCleanup: estimated days
        confidence: 0.0 to 1.0
        currentJunkBytes: latest junk size
        accumulationRateBytesPerDay: how fast junk is growing
        recommendedAction: what the user should do
    """
    if len(samples) < 2:
        latest = samples[-1] if samples else None
        current = latest["totalBytes"] if latest else 0
        return {
            "predictedDate": None,
            "daysUntilCleanup": None,
            "confidence": 0.0,
            "currentJunkBytes": current,
            "accumulationRateBytesPerDay": 0.0,
            "recommendedAction": "Collecting data — need more samples for prediction",
        }

    # Convert timestamps to seconds since first sample
    first_ts = datetime.fromisoformat(samples[0]["timestamp"].replace("Z", "+00:00"))
    xs: list[float] = []
    ys: list[float] = []

    for s in samples:
        try:
            ts = datetime.fromisoformat(s["timestamp"].replace("Z", "+00:00"))
            elapsed = (ts - first_ts).total_seconds()
            xs.append(elapsed)
            ys.append(float(s["totalBytes"]))
        except (ValueError, KeyError):
            continue

    if len(xs) < 2:
        return {
            "predictedDate": None,
            "daysUntilCleanup": None,
            "confidence": 0.0,
            "currentJunkBytes": ys[-1] if ys else 0,
            "accumulationRateBytesPerDay": 0.0,
            "recommendedAction": "Collecting data — need more samples for prediction",
        }

    slope, intercept, r_squared = _linear_regression(xs, ys)

    # slope is bytes per second
    rate_per_day = slope * 86400  # seconds per day
    current_bytes = ys[-1]

    if rate_per_day <= 0:
        # Junk is not growing or shrinking
        if current_bytes >= threshold_bytes:
            return {
                "predictedDate": _now_iso(),
                "daysUntilCleanup": 0,
                "confidence": r_squared,
                "currentJunkBytes": current_bytes,
                "accumulationRateBytesPerDay": rate_per_day,
                "recommendedAction": "Cleanup recommended now — junk threshold exceeded",
            }
        return {
            "predictedDate": None,
            "daysUntilCleanup": None,
            "confidence": r_squared,
            "currentJunkBytes": current_bytes,
            "accumulationRateBytesPerDay": rate_per_day,
            "recommendedAction": "No cleanup needed — junk is not accumulating",
        }

    # Predict when junk will reach threshold
    remaining_bytes = threshold_bytes - current_bytes
    if remaining_bytes <= 0:
        return {
            "predictedDate": _now_iso(),
            "daysUntilCleanup": 0,
            "confidence": r_squared,
            "currentJunkBytes": current_bytes,
            "accumulationRateBytesPerDay": rate_per_day,
            "recommendedAction": "Cleanup recommended now — junk threshold exceeded",
        }

    seconds_until = remaining_bytes / slope
    days_until = seconds_until / 86400

    predicted_dt = datetime.now(timezone.utc) + timedelta(seconds=seconds_until)

    # Determine recommended action
    if days_until <= 0:
        action = "Cleanup recommended now — junk threshold exceeded"
    elif days_until <= 1:
        action = "Cleanup recommended within 24 hours"
    elif days_until <= 3:
        action = f"Cleanup recommended within {int(days_until)} days"
    elif days_until <= 7:
        action = f"Cleanup suggested within {int(days_until)} days"
    else:
        action = f"No cleanup needed for ~{int(days_until)} days"

    return {
        "predictedDate": predicted_dt.isoformat(),
        "daysUntilCleanup": round(days_until, 1),
        "confidence": round(r_squared, 2),
        "currentJunkBytes": current_bytes,
        "accumulationRateBytesPerDay": round(rate_per_day),
        "recommendedAction": action,
    }


# ─── RPC Methods ────────────────────────────────────────────────────

@register("predictive.sample")
def predictive_sample(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Take a junk accumulation sample.

    Measures current junk size and stores it with a timestamp.
    Called periodically to build accumulation history.
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "Predictive maintenance is disabled"}

    # Measure junk
    measurements = _measure_junk()

    sample = {
        "timestamp": _now_iso(),
        "junkBytes": measurements["junkBytes"],
        "tempBytes": measurements["tempBytes"],
        "cacheBytes": measurements["cacheBytes"],
        "totalBytes": measurements["totalBytes"],
    }

    data["samples"].append(sample)

    # Trim to max samples
    max_samples = config.get("maxSamples", 168)
    data["samples"] = data["samples"][-max_samples:]

    # Generate prediction if we have enough samples
    threshold_bytes = int(config.get("thresholdGB", 5.0) * 1024 * 1024 * 1024)
    prediction = _predict_cleanup_date(data["samples"], threshold_bytes)

    # Store prediction
    pred_entry = {
        "timestamp": _now_iso(),
        "predictedDate": prediction["predictedDate"],
        "daysUntilCleanup": prediction["daysUntilCleanup"],
        "confidence": prediction["confidence"],
        "currentJunkBytes": prediction["currentJunkBytes"],
        "accumulationRateBytesPerDay": prediction["accumulationRateBytesPerDay"],
        "recommendedAction": prediction["recommendedAction"],
    }
    data["predictions"].append(pred_entry)
    data["predictions"] = data["predictions"][-50:]  # Keep last 50

    _save_data(data)

    return {
        "success": True,
        "sample": sample,
        "prediction": prediction,
        "sampleCount": len(data["samples"]),
    }


@register("predictive.status")
def predictive_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current prediction status and recommendation.

    Returns:
        prediction: current prediction with recommended action
        config: current configuration
        sampleCount: number of collected samples
        lastSampleAt: timestamp of last sample
        supported: whether feature is available
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())
    samples = data.get("samples", [])

    threshold_bytes = int(config.get("thresholdGB", 5.0) * 1024 * 1024 * 1024)
    prediction = _predict_cleanup_date(samples, threshold_bytes)

    last_sample = samples[-1] if samples else None

    return {
        "prediction": prediction,
        "config": config,
        "sampleCount": len(samples),
        "lastSampleAt": last_sample["timestamp"] if last_sample else None,
        "supported": True,
    }


@register("predictive.history")
def predictive_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get historical samples and predictions.

    Params (optional):
        limit: int — max samples to return (default 50)
    """
    limit = 50
    if params and "limit" in params:
        limit = min(200, max(1, int(params["limit"])))

    data = _load_data()
    samples = data.get("samples", [])[-limit:]
    predictions = data.get("predictions", [])[-limit:]

    return {
        "samples": samples,
        "predictions": predictions,
        "sampleCount": len(data.get("samples", [])),
        "predictionCount": len(predictions),
        "supported": True,
    }


@register("predictive.configure")
@require_feature("predictive.configure")
def predictive_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update prediction configuration. Pro only.

    Params (all optional):
        enabled: bool
        thresholdGB: float — junk threshold for cleanup recommendation
        sampleIntervalMinutes: int
        maxSamples: int
        notificationThresholdHours: int
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "thresholdGB" in params:
            config["thresholdGB"] = max(0.1, float(params["thresholdGB"]))
        if "sampleIntervalMinutes" in params:
            config["sampleIntervalMinutes"] = max(5, int(params["sampleIntervalMinutes"]))
        if "maxSamples" in params:
            config["maxSamples"] = max(10, int(params["maxSamples"]))
        if "notificationThresholdHours" in params:
            config["notificationThresholdHours"] = max(1, int(params["notificationThresholdHours"]))

    data["config"] = config
    _save_data(data)

    return {
        "success": True,
        "config": config,
        "message": "Predictive maintenance configuration updated",
    }


@register("predictive.clearData")
@require_feature("predictive.clearData")
def predictive_clear_data(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all collected prediction data. Pro only."""
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())
    data = {"samples": [], "predictions": [], "config": config}
    _save_data(data)

    return {
        "success": True,
        "message": "All prediction data cleared",
    }
