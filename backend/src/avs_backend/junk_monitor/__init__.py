"""Junk Monitor — real-time junk accumulation tracker.

Periodically scans the junk cleaner categories to estimate how much
junk has accumulated since the last cleanup. When the accumulated
junk exceeds the user-configured threshold, a notification is created
so the user knows it's time to clean.

RPC methods:
    junk_monitor.status   — get current junk estimate and threshold
    junk_monitor.scanNow  — trigger an immediate junk estimate scan
    junk_monitor.history  — get historical junk accumulation data
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import UTC, datetime
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.junk_monitor")

# ─── State ────────────────────────────────────────────────────────
_last_scan: dict[str, Any] = {
    "total_bytes": 0,
    "total_files": 0,
    "categories": [],
    "scanned_at": None,
    "threshold_bytes": 0,
    "threshold_exceeded": False,
}
_history: list[dict[str, Any]] = []
_history_max = 288  # Keep ~24h of 5-minute snapshots
_lock = threading.Lock()
_monitor_thread: threading.Thread | None = None
_monitor_stop = threading.Event()
_monitor_interval = 300  # 5 minutes between background scans


def _format_bytes(b: int) -> str:
    if b >= 1024 ** 3:
        return f"{b / (1024 ** 3):.2f} GB"
    if b >= 1024 ** 2:
        return f"{b / (1024 ** 2):.2f} MB"
    if b >= 1024:
        return f"{b / 1024:.2f} KB"
    return f"{b} B"


def _estimate_junk() -> dict[str, Any]:
    """Quick scan of junk categories to estimate accumulated junk.

    Uses the same all_cleaners() system as Junk Cleaner and Dashboard
    scans, but only counts files — does NOT delete anything.
    """
    from avs_backend.cleaner.cleaners import all_cleaners
    from threading import Event

    cancel = Event()
    cleaners = all_cleaners()
    # Skip browser-history (opt-in for privacy)
    cleaners = [c for c in cleaners if c.id != "browser-history"]

    categories: list[dict[str, Any]] = []
    total_bytes = 0
    total_files = 0

    for cleaner in cleaners:
        try:
            result = cleaner.scan(cancel, lambda pct: None, on_file=None)
            total_files += result.total_files
            total_bytes += result.total_bytes
            categories.append({
                "id": cleaner.id,
                "name": cleaner.name,
                "files": result.total_files,
                "bytes": result.total_bytes,
                "mb": round(result.total_bytes / (1024 * 1024), 2),
            })
        except Exception as e:
            log.warning("Junk monitor: failed to scan %s: %s", cleaner.id, e)
            categories.append({
                "id": cleaner.id,
                "name": cleaner.name,
                "files": 0,
                "bytes": 0,
                "mb": 0.0,
                "error": str(e),
            })

    return {
        "total_bytes": total_bytes,
        "total_files": total_files,
        "total_mb": round(total_bytes / (1024 * 1024), 2),
        "total_gb": round(total_bytes / (1024 ** 3), 2),
        "categories": categories,
        "scanned_at": datetime.now(UTC).isoformat(),
    }


def _check_threshold(scan_result: dict[str, Any], threshold_bytes: int) -> bool:
    """Check if junk exceeds threshold and create notification if so."""
    if threshold_bytes <= 0:
        return False
    exceeded = scan_result["total_bytes"] >= threshold_bytes
    if exceeded:
        try:
            from avs_backend.notifications.notification_manager import (
                create_notification,
                NotificationType,
                NotificationPriority,
            )
            gb = scan_result["total_bytes"] / (1024 ** 3)
            create_notification(
                NotificationType.OPTIMIZATION_COMPLETE,
                title="Junk Accumulation Alert",
                message=(
                    f"{_format_bytes(scan_result['total_bytes'])} of junk files "
                    f"detected. Run AI Smart Optimize to clean your PC."
                ),
                priority=NotificationPriority.NORMAL,
                module="junk_monitor",
                action="scan",
                action_data={"junk_gb": round(gb, 2)},
            )
        except Exception as e:
            log.warning("Junk monitor: failed to create notification: %s", e)
    return exceeded


def _monitor_loop() -> None:
    """Background thread that periodically estimates junk."""
    log.info("Junk monitor background thread started")
    while not _monitor_stop.is_set():
        try:
            # Load threshold from settings
            threshold_gb = 2.0
            try:
                from avs_backend.settings.settings_manager import load_settings
                s = load_settings()
                if not s.junk_monitor_enabled:
                    _monitor_stop.wait(_monitor_interval)
                    continue
                threshold_gb = s.junk_monitor_threshold_gb
            except Exception:
                pass

            threshold_bytes = int(threshold_gb * 1024 ** 3)

            result = _estimate_junk()
            result["threshold_bytes"] = threshold_bytes
            result["threshold_exceeded"] = result["total_bytes"] >= threshold_bytes

            with _lock:
                _last_scan.update(result)

            _check_threshold(result, threshold_bytes)

        except Exception as e:
            log.warning("Junk monitor scan failed: %s", e)

        _monitor_stop.wait(_monitor_interval)

    log.info("Junk monitor background thread stopped")


def start_monitor() -> None:
    """Start the background junk monitor thread."""
    global _monitor_thread
    if _monitor_thread and _monitor_thread.is_alive():
        return
    _monitor_stop.clear()
    _monitor_thread = threading.Thread(target=_monitor_loop, daemon=True, name="junk-monitor")
    _monitor_thread.start()


def stop_monitor() -> None:
    """Stop the background junk monitor thread."""
    _monitor_stop.set()
    if _monitor_thread:
        _monitor_thread.join(timeout=5)


# ─── RPC Methods ──────────────────────────────────────────────────

@register("junk_monitor.status")
def junk_monitor_status(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get current junk accumulation status."""
    with _lock:
        return dict(_last_scan)


@register("junk_monitor.scanNow")
def junk_monitor_scan_now(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Trigger an immediate junk estimate scan."""
    threshold_gb = 2.0
    try:
        from avs_backend.settings.settings_manager import load_settings
        s = load_settings()
        threshold_gb = s.junk_monitor_threshold_gb
    except Exception:
        pass
    threshold_bytes = int(threshold_gb * 1024 ** 3)

    result = _estimate_junk()
    result["threshold_bytes"] = threshold_bytes
    result["threshold_exceeded"] = result["total_bytes"] >= threshold_bytes

    with _lock:
        _last_scan.update(result)
        # Record a compact snapshot for history
        _history.append({
            "scanned_at": result.get("scanned_at"),
            "total_bytes": result.get("total_bytes", 0),
            "total_files": result.get("total_files", 0),
            "total_mb": result.get("total_mb", 0),
            "total_gb": result.get("total_gb", 0),
        })
        # Trim to max size
        if len(_history) > _history_max:
            del _history[: len(_history) - _history_max]

    _check_threshold(result, threshold_bytes)

    return result


@register("junk_monitor.history")
def junk_monitor_history(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get historical junk accumulation data.

    Returns a list of compact snapshots recorded after each scan,
    plus the current scan state.
    """
    with _lock:
        return {
            "current": dict(_last_scan),
            "history": list(_history),
            "count": len(_history),
        }


# Start the background monitor when this module is imported
start_monitor()
