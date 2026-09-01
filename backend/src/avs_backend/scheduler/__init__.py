"""Scheduled Maintenance module — cron-like scheduling via Windows Task Scheduler.

Creates and manages scheduled maintenance tasks that run AVS Shield
optimization operations automatically:
  - Junk cleaning
  - Registry cleaning
  - Privacy cleaning
  - Health snapshot capture (for Predictive Health)

Uses schtasks.exe for Windows Task Scheduler integration. Each scheduled
task is stored as an AVS Shield task with a consistent naming convention.

RPC methods:
    scheduler.list      — list all scheduled AVS tasks
    scheduler.create    — create a new scheduled task
    scheduler.update    — update an existing scheduled task
    scheduler.delete    — delete a scheduled task
    scheduler.runNow    — run a scheduled task immediately
    scheduler.status    — get scheduler status
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.scheduler")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# Prefix for all AVS Shield scheduled tasks
_TASK_PREFIX = "AVSShield_"

# Available maintenance actions
_MAINTENANCE_ACTIONS = {
    "junk_clean": "Junk Cleaner — removes temp files, cache, recycle bin",
    "registry_clean": "Registry Cleaner — scans and fixes registry issues",
    "privacy_clean": "Privacy Cleaner — clears browser traces",
    "health_snapshot": "Health Snapshot — captures metrics for Predictive Health",
    "full_optimize": "Full Optimization — runs all cleaners + memory optimization",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_schtasks(args: list[str], timeout: float = 10.0) -> tuple[int, str, str]:
    """Run schtasks.exe and return (returncode, stdout, stderr)."""
    if not IS_WINDOWS:
        return (1, "", "Not supported on non-Windows platforms")
    try:
        proc = subprocess.run(
            ["schtasks"] + args,
            capture_output=True, text=True, timeout=timeout,
            creationflags=_NO_WINDOW,
        )
        return (proc.returncode, proc.stdout.strip(), proc.stderr.strip())
    except Exception as e:
        return (1, "", str(e))


def _task_name(action: str) -> str:
    """Get the full Windows Task Scheduler name for an AVS task."""
    return f"{_TASK_PREFIX}{action}"


def _resolve_backend_exe() -> str | None:
    """Resolve the path to the avs-backend executable.

    In packaged mode, the exe is alongside the currently running process.
    In dev mode, we use the Python interpreter with the rpc_server module.
    """
    # When running as PyInstaller bundle, sys.executable is avs-backend.exe
    exe = sys.executable
    if exe and os.path.isfile(exe):
        basename = os.path.basename(exe).lower()
        if basename in ("avs-backend.exe", "avs-backend"):
            return exe

    # Fallback: look in common locations relative to the current process
    candidates = [
        os.path.join(os.path.dirname(exe), "avs-backend.exe"),
        os.path.join(os.path.dirname(exe), "..", "backend", "avs-backend.exe"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c

    # Dev mode: use Python interpreter
    if exe and os.path.isfile(exe):
        return exe

    return None


def _build_maintenance_command(action: str) -> str:
    """Build the schtasks /TR command string for a maintenance action."""
    exe = _resolve_backend_exe()

    if exe is None:
        # Fallback: just log (shouldn't happen in production)
        return f'powershell -NoProfile -WindowStyle Hidden -Command "Write-Output \\"AVS Shield maintenance: {action} (no backend found)\\""'

    basename = os.path.basename(exe).lower()
    if basename in ("avs-backend.exe", "avs-backend"):
        # Packaged mode: call the exe directly with --maintenance flags
        return f'"{exe}" --maintenance --action {action}'

    # Dev mode: call Python with the rpc_server module
    return f'"{exe}" -u -m avs_backend.api.rpc_server --maintenance --action {action}'


# =====================================================================
# RPC Methods
# =====================================================================

@register("scheduler.list")
def list_scheduled_tasks(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """List all scheduled AVS Shield maintenance tasks."""
    if not IS_WINDOWS:
        return {"tasks": [], "supported": False, "capturedAt": _now_iso()}

    # Query all tasks and filter
    code, stdout, stderr = _run_schtasks([
        "/Query", "/FO", "CSV", "/NH",
    ], timeout=15.0)

    if code != 0:
        return {"tasks": [], "error": stderr or "Failed to query tasks", "capturedAt": _now_iso()}

    tasks: list[dict[str, Any]] = []
    try:
        lines = stdout.strip().split("\n")
        for line in lines:
            if not line.strip():
                continue
            # Parse CSV: "TaskName","Next Run Time","Status"
            parts = line.strip('"').split('","')
            if len(parts) < 3:
                continue
            task_name = parts[0]
            if not task_name.startswith(_TASK_PREFIX):
                continue

            action = task_name[len(_TASK_PREFIX):]
            tasks.append({
                "taskName": task_name,
                "action": action,
                "description": _MAINTENANCE_ACTIONS.get(action, "Unknown maintenance action"),
                "nextRun": parts[1] if parts[1] != "N/A" else None,
                "status": parts[2] if len(parts) > 2 else "Unknown",
            })
    except Exception as e:
        log.warning("Failed to parse schtasks output: %s", e)

    return {
        "tasks": tasks,
        "count": len(tasks),
        "availableActions": list(_MAINTENANCE_ACTIONS.keys()),
        "capturedAt": _now_iso(),
    }


@register("scheduler.create")
@require_feature("scheduled.optimization")
def create_scheduled_task(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Create a new scheduled maintenance task.

    Params:
        action: str — maintenance action (junk_clean, registry_clean, etc.)
        schedule: str — schedule type: 'daily', 'weekly', 'on_logon', 'on_idle'
        time: str — time in HH:MM format (for daily/weekly)
        day: str — day of week for weekly (MON, TUE, etc.)
    """
    if not IS_WINDOWS:
        return {"created": False, "supported": False}

    if not params or "action" not in params:
        return {"created": False, "error": "Missing action"}

    action = params["action"]
    if action not in _MAINTENANCE_ACTIONS:
        return {"created": False, "error": f"Unknown action: {action}"}

    schedule = params.get("schedule", "daily")
    task_time = params.get("time", "03:00")
    day = params.get("day", "SUN")

    task_name = _task_name(action)

    # Build the command to run the headless maintenance CLI
    command = _build_maintenance_command(action)

    # Build schtasks arguments
    schtask_type_map = {
        "daily": ["/SC", "DAILY", "/ST", task_time],
        "weekly": ["/SC", "WEEKLY", "/D", day, "/ST", task_time],
        "on_logon": ["/SC", "ONLOGON"],
        "on_idle": ["/SC", "ONIDLE", "/I", "30"],
    }

    schedule_args = schtask_type_map.get(schedule, schtask_type_map["daily"])

    args = ["/Create", "/TN", task_name, "/TR", command, "/F"] + schedule_args

    code, stdout, stderr = _run_schtasks(args, timeout=10.0)

    if code == 0:
        return {
            "created": True,
            "taskName": task_name,
            "action": action,
            "schedule": schedule,
            "time": task_time if schedule in ("daily", "weekly") else None,
            "timestamp": _now_iso(),
        }
    else:
        return {"created": False, "error": stderr or stdout or "Unknown error"}


@register("scheduler.update")
@require_feature("scheduled.optimization")
def update_scheduled_task(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Update an existing scheduled task.

    Params:
        action: str — maintenance action to update
        schedule: str — new schedule type
        time: str — new time
        day: str — new day for weekly
    """
    if not IS_WINDOWS:
        return {"updated": False, "supported": False}

    if not params or "action" not in params:
        return {"updated": False, "error": "Missing action"}

    action = params["action"]
    task_name = _task_name(action)

    # Delete and recreate (schtasks doesn't have a clean update)
    delete_result = delete_scheduled_task({"action": action})
    if not delete_result.get("deleted") and not delete_result.get("notFound"):
        return {"updated": False, "error": "Failed to delete old task"}

    return create_scheduled_task(params)


@register("scheduler.delete")
def delete_scheduled_task(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Delete a scheduled task.

    Params:
        action: str — maintenance action to delete
    """
    if not IS_WINDOWS:
        return {"deleted": False, "supported": False}

    if not params or "action" not in params:
        return {"deleted": False, "error": "Missing action"}

    action = params["action"]
    task_name = _task_name(action)

    code, stdout, stderr = _run_schtasks(["/Delete", "/TN", task_name, "/F"], timeout=10.0)

    if code == 0:
        return {"deleted": True, "taskName": task_name, "timestamp": _now_iso()}
    elif "cannot find" in stderr.lower() or "not found" in stderr.lower():
        return {"deleted": False, "notFound": True, "taskName": task_name}
    else:
        return {"deleted": False, "error": stderr or stdout}


@register("scheduler.runNow")
@require_feature("scheduled.optimization")
def run_scheduled_task_now(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run a scheduled task immediately.

    Params:
        action: str — maintenance action to run
    """
    if not IS_WINDOWS:
        return {"ran": False, "supported": False}

    if not params or "action" not in params:
        return {"ran": False, "error": "Missing action"}

    action = params["action"]
    task_name = _task_name(action)

    code, stdout, stderr = _run_schtasks(["/Run", "/TN", task_name], timeout=10.0)

    if code == 0:
        return {"ran": True, "taskName": task_name, "timestamp": _now_iso()}
    else:
        return {"ran": False, "error": stderr or stdout}


@register("scheduler.status")
def get_scheduler_status(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get scheduler status — whether Task Scheduler is available and running."""
    if not IS_WINDOWS:
        return {"available": False, "supported": False, "capturedAt": _now_iso()}

    # Check if Task Scheduler service is running
    try:
        import subprocess as sp
        result = sp.run(
            ["sc", "query", "Schedule"],
            capture_output=True, text=True, timeout=5,
            creationflags=_NO_WINDOW,
        )
        running = "RUNNING" in result.stdout
    except Exception:
        running = False

    return {
        "available": True,
        "serviceRunning": running,
        "supported": True,
        "availableActions": list(_MAINTENANCE_ACTIONS.keys()),
        "capturedAt": _now_iso(),
    }


@register("scheduler.configureFromSettings")
def configure_from_settings(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Read scheduled cleanup settings and create/update/delete tasks.

    Called when the user changes scheduled cleanup settings in the UI.
    - If enabled: creates/updates the scheduled task for each action
    - If disabled: deletes all AVS scheduled tasks
    """
    try:
        from avs_backend.settings.settings_manager import load_settings
        s = load_settings()
    except Exception as e:
        return {"configured": False, "error": f"Failed to load settings: {e}"}

    if not s.scheduled_cleanup_enabled:
        # Delete all existing scheduled tasks
        deleted = []
        for action in _MAINTENANCE_ACTIONS:
            result = delete_scheduled_task({"action": action})
            if result.get("deleted"):
                deleted.append(action)
        return {
            "configured": True,
            "enabled": False,
            "deleted": deleted,
        }

    # Create/update tasks for each configured action
    results = []
    for action in s.scheduled_cleanup_actions:
        if action not in _MAINTENANCE_ACTIONS:
            continue
        params = {
            "action": action,
            "schedule": s.scheduled_cleanup_frequency,
            "time": s.scheduled_cleanup_time,
            "day": s.scheduled_cleanup_day,
        }
        # Try update first (which deletes + creates)
        result = update_scheduled_task(params)
        if result.get("updated"):
            results.append({"action": action, "status": "updated"})
        else:
            # Fall back to create
            result = create_scheduled_task(params)
            if result.get("created"):
                results.append({"action": action, "status": "created"})
            else:
                results.append({"action": action, "status": "failed", "error": result.get("error")})

    return {
        "configured": True,
        "enabled": True,
        "frequency": s.scheduled_cleanup_frequency,
        "time": s.scheduled_cleanup_time,
        "day": s.scheduled_cleanup_day,
        "actions": s.scheduled_cleanup_actions,
        "results": results,
    }

