"""Predictive Health backend module — time-series storage and trend analysis.

Stores periodic health metric snapshots in SQLite and provides trend
analysis and forecasting. The frontend Predictive Health feature
consumes this data to detect degrading trends before they become
user-visible problems.

Data sources:
  - Dashboard health score (called on each snapshot)
  - CPU usage, memory usage, disk usage trends
  - Temperature readings (if available)
  - Startup impact trends

The module creates a SQLite database in AppData/Local/AVS Shield/
for persistent trend storage.

RPC methods:
    predictive.snapshot    — capture a health snapshot and store it
    predictive.trends      — get trend data for a metric over time
    predictive.forecast    — get forecast predictions for a metric
    predictive.history     — get historical snapshots
"""

from __future__ import annotations

import logging
import os
import platform
import sqlite3
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any

import psutil

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.predictive")

IS_WINDOWS = platform.system() == "Windows"

# Database path
if IS_WINDOWS:
    _DB_DIR = os.path.expandvars(r"%LOCALAPPDATA%\AVS Shield")
else:
    _DB_DIR = os.path.expanduser("~/.avs-shield")

os.makedirs(_DB_DIR, exist_ok=True)
_DB_PATH = os.path.join(_DB_DIR, "predictive_health.db")

_db_lock = threading.Lock()

# Snapshot interval for auto-capture (seconds)
_AUTO_SNAPSHOT_INTERVAL = 300  # 5 minutes
_auto_snapshot_running = False


def _get_db() -> sqlite3.Connection:
    """Get a SQLite connection with WAL mode."""
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def _init_db() -> None:
    """Initialize the database schema."""
    with _db_lock:
        conn = _get_db()
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS health_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    captured_at TEXT NOT NULL,
                    health_score REAL,
                    cpu_usage REAL,
                    memory_usage REAL,
                    disk_usage REAL,
                    temperature REAL,
                    startup_count INTEGER,
                    process_count INTEGER,
                    network_bytes_sent INTEGER,
                    network_bytes_recv INTEGER
                );

                CREATE TABLE IF NOT EXISTS metric_trends (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_name TEXT NOT NULL,
                    captured_at TEXT NOT NULL,
                    value REAL NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_snapshots_time ON health_snapshots(captured_at);
                CREATE INDEX IF NOT EXISTS idx_trends_name_time ON metric_trends(metric_name, captured_at);
            """)
            conn.commit()
        finally:
            conn.close()


# Initialize on import
_init_db()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# Snapshot Collection
# =====================================================================

@register("health.snapshot")
def capture_snapshot(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Capture a health snapshot and store it in the database.

    Collects: health score, CPU usage, memory usage, disk usage,
    temperature (if available), startup count, process count,
    network I/O counters.
    """
    try:
        # Collect metrics
        cpu_usage = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        mem_usage = mem.percent

        # Disk usage (average across all drives)
        disk_usages = []
        for part in psutil.disk_partitions(all=False):
            try:
                disk_usages.append(psutil.disk_usage(part.mountpoint).percent)
            except (OSError, PermissionError):
                continue
        disk_usage = sum(disk_usages) / len(disk_usages) if disk_usages else 0.0

        # Temperature (if available)
        temperature = None
        try:
            if hasattr(psutil, "sensors_temperatures"):
                temps = psutil.sensors_temperatures()
                if temps:
                    for name, entries in temps.items():
                        if "cpu" in name.lower() or "core" in name.lower():
                            if entries:
                                temperature = entries[0].current
                                break
        except Exception:
            pass

        # Process count
        process_count = len(psutil.pids())

        # Network I/O
        net = psutil.net_io_counters()
        net_sent = net.bytes_sent
        net_recv = net.bytes_recv

        # Startup count (from cache if available)
        startup_count = 0
        try:
            from avs_backend.dashboard import _get_startup_apps_count
            startup_count = _get_startup_apps_count()
        except Exception:
            pass

        # Health score (simple heuristic)
        health_score = (
            max(0, 100 - cpu_usage) * 0.3
            + max(0, 100 - mem_usage) * 0.3
            + max(0, 100 - disk_usage) * 0.2
            + (100 if temperature is None or temperature < 70 else max(0, 100 - (temperature - 70) * 5)) * 0.2
        )

        captured_at = _now_iso()

        # Store in database
        with _db_lock:
            conn = _get_db()
            try:
                conn.execute(
                    """INSERT INTO health_snapshots
                       (captured_at, health_score, cpu_usage, memory_usage, disk_usage,
                        temperature, startup_count, process_count, network_bytes_sent, network_bytes_recv)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (captured_at, health_score, cpu_usage, mem_usage, disk_usage,
                     temperature, startup_count, process_count, net_sent, net_recv),
                )

                # Also store individual metrics in trends table
                metrics = [
                    ("health_score", health_score),
                    ("cpu_usage", cpu_usage),
                    ("memory_usage", mem_usage),
                    ("disk_usage", disk_usage),
                    ("process_count", float(process_count)),
                ]
                if temperature is not None:
                    metrics.append(("temperature", temperature))

                for metric_name, value in metrics:
                    conn.execute(
                        "INSERT INTO metric_trends (metric_name, captured_at, value) VALUES (?, ?, ?)",
                        (metric_name, captured_at, value),
                    )

                conn.commit()
            finally:
                conn.close()

        return {
            "captured": True,
            "capturedAt": captured_at,
            "metrics": {
                "healthScore": round(health_score, 1),
                "cpuUsage": cpu_usage,
                "memoryUsage": mem_usage,
                "diskUsage": round(disk_usage, 1),
                "temperature": temperature,
                "startupCount": startup_count,
                "processCount": process_count,
                "networkBytesSent": net_sent,
                "networkBytesRecv": net_recv,
            },
        }
    except Exception as e:
        log.warning("Failed to capture snapshot: %s", e)
        return {"captured": False, "error": str(e)}


# =====================================================================
# Trend Retrieval
# =====================================================================

@register("health.trends")
@require_feature("health.timeline")
def get_trends(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get trend data for metrics over time.

    Params:
        metric: str — metric name (e.g. 'cpu_usage', 'memory_usage', 'health_score')
        hours: int — number of hours of history to return (default: 24)
    """
    metric = (params or {}).get("metric", "health_score")
    hours = (params or {}).get("hours", 24)

    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    try:
        with _db_lock:
            conn = _get_db()
            try:
                cursor = conn.execute(
                    """SELECT captured_at, value FROM metric_trends
                       WHERE metric_name = ? AND captured_at >= ?
                       ORDER BY captured_at ASC""",
                    (metric, since),
                )
                rows = cursor.fetchall()
            finally:
                conn.close()

        data_points = [
            {"timestamp": row[0], "value": row[1]}
            for row in rows
        ]

        # Calculate trend direction
        trend_direction = "stable"
        trend_slope = 0.0
        if len(data_points) >= 2:
            first_val = data_points[0]["value"]
            last_val = data_points[-1]["value"]
            trend_slope = (last_val - first_val) / max(len(data_points), 1)
            if trend_slope > 0.5:
                trend_direction = "increasing"
            elif trend_slope < -0.5:
                trend_direction = "decreasing"

        return {
            "metric": metric,
            "hours": hours,
            "dataPoints": data_points,
            "count": len(data_points),
            "trendDirection": trend_direction,
            "trendSlope": round(trend_slope, 4),
            "capturedAt": _now_iso(),
        }
    except Exception as e:
        log.warning("Failed to get trends: %s", e)
        return {"metric": metric, "dataPoints": [], "error": str(e)}


# =====================================================================
# Forecasting
# =====================================================================

@register("health.forecast")
@require_feature("health.timeline")
def get_forecast(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get forecast predictions for a metric.

    Uses simple linear regression on historical data to project
    future values. This is intentionally simple — not a complex
    ML model. The forecast includes a confidence band.

    Params:
        metric: str — metric name to forecast
        hoursAhead: int — hours to forecast ahead (default: 24)
        hoursHistory: int — hours of history to use (default: 168 / 7 days)
    """
    metric = (params or {}).get("metric", "health_score")
    hours_ahead = (params or {}).get("hoursAhead", 24)
    hours_history = (params or {}).get("hoursHistory", 168)

    # Get historical data
    trends = get_trends({"metric": metric, "hours": hours_history})
    data_points = trends.get("dataPoints", [])

    if len(data_points) < 3:
        return {
            "metric": metric,
            "forecast": [],
            "confidence": "low",
            "reason": "Insufficient historical data for forecasting",
            "capturedAt": _now_iso(),
        }

    # Simple linear regression: y = a + b*x
    n = len(data_points)
    x_values = list(range(n))
    y_values = [dp["value"] for dp in data_points]

    x_mean = sum(x_values) / n
    y_mean = sum(y_values) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, y_values))
    denominator = sum((x - x_mean) ** 2 for x in x_values)

    if denominator == 0:
        slope = 0.0
        intercept = y_mean
    else:
        slope = numerator / denominator
        intercept = y_mean - slope * x_mean

    # Calculate R² for confidence
    y_pred = [intercept + slope * x for x in x_values]
    ss_res = sum((y - yp) ** 2 for y, yp in zip(y_values, y_pred))
    ss_tot = sum((y - y_mean) ** 2 for y in y_values)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

    # Generate forecast points
    forecast_points: list[dict[str, Any]] = []
    last_timestamp = data_points[-1]["timestamp"]
    try:
        last_dt = datetime.fromisoformat(last_timestamp)
    except ValueError:
        last_dt = datetime.now(timezone.utc)

    # Estimate time interval between data points
    if n >= 2:
        try:
            first_dt = datetime.fromisoformat(data_points[0]["timestamp"])
            interval_seconds = (last_dt - first_dt).total_seconds() / max(n - 1, 1)
        except ValueError:
            interval_seconds = 300  # Default 5 min
    else:
        interval_seconds = 300

    steps_ahead = int((hours_ahead * 3600) / interval_seconds)
    steps_ahead = min(steps_ahead, 100)  # Cap at 100 points

    for i in range(1, steps_ahead + 1):
        x = n + i - 1
        predicted = intercept + slope * x
        # Add confidence band (wider for further predictions)
        band = (1 - r_squared) * abs(predicted) * 0.1 * (1 + i / steps_ahead)
        forecast_dt = last_dt + timedelta(seconds=interval_seconds * i)
        forecast_points.append({
            "timestamp": forecast_dt.isoformat(),
            "predicted": round(predicted, 2),
            "lowerBound": round(predicted - band, 2),
            "upperBound": round(predicted + band, 2),
        })

    # Determine confidence level
    if r_squared > 0.7:
        confidence = "high"
    elif r_squared > 0.4:
        confidence = "medium"
    else:
        confidence = "low"

    # Generate alert if forecast predicts a problem
    alerts: list[str] = []
    if forecast_points:
        final_value = forecast_points[-1]["predicted"]
        if metric == "health_score" and final_value < 60:
            alerts.append(f"Health score projected to decline to {final_value:.0f} within {hours_ahead}h")
        elif metric == "cpu_usage" and final_value > 80:
            alerts.append(f"CPU usage projected to reach {final_value:.0f}% within {hours_ahead}h")
        elif metric == "memory_usage" and final_value > 85:
            alerts.append(f"Memory usage projected to reach {final_value:.0f}% within {hours_ahead}h")
        elif metric == "disk_usage" and final_value > 90:
            alerts.append(f"Disk usage projected to reach {final_value:.0f}% within {hours_ahead}h")

    return {
        "metric": metric,
        "forecast": forecast_points,
        "confidence": confidence,
        "rSquared": round(r_squared, 4),
        "slope": round(slope, 4),
        "intercept": round(intercept, 4),
        "alerts": alerts,
        "hoursAhead": hours_ahead,
        "capturedAt": _now_iso(),
    }


# =====================================================================
# History Retrieval
# =====================================================================

@register("health.history")
@require_feature("health.timeline")
def get_history(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get historical health snapshots.

    Params:
        hours: int — number of hours of history (default: 168 / 7 days)
        limit: int — max number of snapshots (default: 500)
    """
    hours = (params or {}).get("hours", 168)
    limit = (params or {}).get("limit", 500)

    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    try:
        with _db_lock:
            conn = _get_db()
            try:
                cursor = conn.execute(
                    """SELECT captured_at, health_score, cpu_usage, memory_usage,
                              disk_usage, temperature, startup_count, process_count,
                              network_bytes_sent, network_bytes_recv
                       FROM health_snapshots
                       WHERE captured_at >= ?
                       ORDER BY captured_at DESC
                       LIMIT ?""",
                    (since, limit),
                )
                rows = cursor.fetchall()
            finally:
                conn.close()

        snapshots = [
            {
                "capturedAt": row[0],
                "healthScore": row[1],
                "cpuUsage": row[2],
                "memoryUsage": row[3],
                "diskUsage": row[4],
                "temperature": row[5],
                "startupCount": row[6],
                "processCount": row[7],
                "networkBytesSent": row[8],
                "networkBytesRecv": row[9],
            }
            for row in rows
        ]

        return {
            "snapshots": snapshots,
            "count": len(snapshots),
            "hours": hours,
            "capturedAt": _now_iso(),
        }
    except Exception as e:
        log.warning("Failed to get history: %s", e)
        return {"snapshots": [], "error": str(e)}
