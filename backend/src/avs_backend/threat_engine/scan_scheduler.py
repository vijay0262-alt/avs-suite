"""Scan Scheduler — automatic scheduled antivirus scans.

Runs in the background using threading.Timer. Supports:
- Daily scans at a specific time (e.g., 02:00)
- Weekly scans on a specific day/time
- On-logon scans (runs shortly after backend starts)
- Configurable scan type (quick / full)

State is persisted to %LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\scan_schedule.json
so schedules survive restarts.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)

_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "threat_engine"

_SCHEDULE_PATH = _DATA_DIR / "scan_schedule.json"

_scheduler_timer: threading.Timer | None = None
_scheduler_running = False
_scheduler_lock = threading.Lock()
_last_run: str | None = None
_last_result: dict | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_schedule() -> dict:
    """Load saved scan schedule from disk."""
    if _SCHEDULE_PATH.exists():
        try:
            with open(_SCHEDULE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("Failed to load scan schedule: %s", e)
    return {"enabled": False, "frequency": "daily", "time": "02:00", "scan_type": "quick", "day_of_week": 0}


def _save_schedule(schedule: dict) -> None:
    """Save scan schedule to disk."""
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(_SCHEDULE_PATH, "w", encoding="utf-8") as f:
            json.dump(schedule, f, indent=2)
    except Exception as e:
        log.error("Failed to save scan schedule: %s", e)


def _run_scheduled_scan(scan_type: str) -> dict:
    """Run a scan and return the result."""
    try:
        from avs_backend.threat_engine import threat_scan
        result = threat_scan({"scan_type": scan_type})
        log.info("Scheduled %s scan started: %s", scan_type, result.get("scan_id"))
        return result
    except Exception as e:
        log.error("Scheduled scan failed: %s", e)
        return {"success": False, "error": str(e)}


def _scheduler_loop() -> None:
    """Main scheduler loop — checks if it's time to run, then sleeps until next check."""
    global _last_run, _last_result

    while True:
        try:
            schedule = _load_schedule()
            if not schedule.get("enabled"):
                break

            now = datetime.now()
            frequency = schedule.get("frequency", "daily")
            scheduled_time = schedule.get("time", "02:00")
            scan_type = schedule.get("scan_type", "quick")
            day_of_week = schedule.get("day_of_week", 0)

            # Parse target time
            try:
                hour, minute = map(int, scheduled_time.split(":"))
            except (ValueError, AttributeError):
                hour, minute = 2, 0

            # Check if we should run now
            should_run = False
            today_str = now.strftime("%Y-%m-%d")

            if frequency == "on_logon":
                # Run once on startup (handled separately)
                should_run = False
            elif frequency == "daily":
                # Run if current time is past scheduled time and we haven't run today
                if _last_run != today_str:
                    if now.hour > hour or (now.hour == hour and now.minute >= minute):
                        should_run = True
            elif frequency == "weekly":
                # Run if today is the target day and time has passed
                if _last_run != today_str:
                    if now.weekday() == day_of_week:
                        if now.hour > hour or (now.hour == hour and now.minute >= minute):
                            should_run = True

            if should_run:
                log.info("Running scheduled %s scan (%s)", scan_type, frequency)
                _last_result = _run_scheduled_scan(scan_type)
                _last_run = today_str

            # Sleep 60 seconds before checking again
            threading.Event().wait(60)

        except Exception as e:
            log.error("Scan scheduler loop error: %s", e)
            threading.Event().wait(60)


def start_scheduler() -> None:
    """Start the scan scheduler in a background daemon thread."""
    global _scheduler_running

    with _scheduler_lock:
        if _scheduler_running:
            return
        _scheduler_running = True

    schedule = _load_schedule()
    if not schedule.get("enabled"):
        log.debug("Scan scheduler not enabled, not starting")
        with _scheduler_lock:
            _scheduler_running = False
        return

    # Handle on-logon scan
    if schedule.get("frequency") == "on_logon" and schedule.get("enabled"):
        scan_type = schedule.get("scan_type", "quick")
        threading.Timer(30.0, _run_scheduled_scan, args=[scan_type]).start()
        log.info("On-logon %s scan scheduled in 30 seconds", scan_type)

    thread = threading.Thread(target=_scheduler_loop, daemon=True, name="scan-scheduler")
    thread.start()
    log.info("Scan scheduler started")


def stop_scheduler() -> None:
    """Stop the scan scheduler."""
    global _scheduler_running
    with _scheduler_lock:
        _scheduler_running = False


def get_schedule() -> dict:
    """Get the current scan schedule configuration."""
    sched = _load_schedule()
    return {
        "enabled": sched.get("enabled", False),
        "frequency": sched.get("frequency", "daily"),
        "time": sched.get("time", "02:00"),
        "scan_type": sched.get("scan_type", "quick"),
        "day_of_week": sched.get("day_of_week", 0),
        "last_run": _last_run,
        "last_result": _last_result,
        "scheduler_running": _scheduler_running,
    }


def set_schedule(params: dict) -> dict:
    """Set or update the scan schedule configuration.

    Params:
        enabled: bool
        frequency: "daily" | "weekly" | "on_logon"
        time: "HH:MM" (24-hour format, for daily/weekly)
        scan_type: "quick" | "full"
        day_of_week: 0-6 (0=Monday, for weekly)
    """
    schedule = _load_schedule()

    if "enabled" in params:
        schedule["enabled"] = bool(params["enabled"])
    if "frequency" in params:
        schedule["frequency"] = params["frequency"]
    if "time" in params:
        schedule["time"] = params["time"]
    if "scan_type" in params:
        schedule["scan_type"] = params["scan_type"]
    if "day_of_week" in params:
        schedule["day_of_week"] = int(params["day_of_week"])

    _save_schedule(schedule)

    # Restart scheduler if enabled
    stop_scheduler()
    if schedule.get("enabled"):
        start_scheduler()

    return {"success": True, "schedule": get_schedule()}


def run_scan_now(scan_type: str = "quick") -> dict:
    """Trigger an immediate scan (used by 'Scan Now' button in scheduler UI)."""
    return _run_scheduled_scan(scan_type)
