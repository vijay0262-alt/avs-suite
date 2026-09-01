"""AI Auto-Care — idle maintenance daemon.

When the PC is idle, AI Auto-Care automatically:
  - Cleans junk files (temp, cache, logs)
  - Optimizes RAM (trims working sets)
  - Clears temporary folders

Idle detection uses GetLastInputInfo via ctypes on Windows.

Configuration is stored in ~/.avs/auto_care_config.json.
Activity log is stored in ~/.avs/auto_care_log.json (last 100 entries).

RPC methods:
    auto_care.status          — get current status and config
    auto_care.configure       — update auto-care configuration (Pro only)
    auto_care.getActivityLog  — get activity log entries
    auto_care.runNow          — trigger auto-care immediately (Pro only)
    auto_care.clearLog        — clear activity log (Pro only)
"""

from __future__ import annotations

import json
import logging
import os
import platform
import threading
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.auto_care")

IS_WINDOWS = platform.system() == "Windows"

# Storage paths
_CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".avs", "auto_care_config.json")
_LOG_PATH = os.path.join(os.path.expanduser("~"), ".avs", "auto_care_log.json")

# Default configuration
_DEFAULT_CONFIG = {
    "enabled": False,
    "idleThresholdSeconds": 300,  # 5 minutes
    "checkIntervalSeconds": 60,   # check every minute
    "tasks": {
        "junkClean": True,
        "memoryOptimize": True,
        "tempClean": True,
    },
    "minCpuUsage": 10,  # only run if CPU usage is below this
}

# In-memory state
_state: dict[str, Any] = {
    "running": False,
    "lastIdleTime": 0,
    "lastRunAt": None,
    "nextCheckAt": None,
}

# Background thread
_thread: threading.Thread | None = None
_thread_stop = threading.Event()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_CONFIG_PATH), exist_ok=True)


def _load_config() -> dict[str, Any]:
    """Load auto-care configuration."""
    if not os.path.isfile(_CONFIG_PATH):
        return _DEFAULT_CONFIG.copy()
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Merge with defaults
        config = _DEFAULT_CONFIG.copy()
        config.update(data)
        if "tasks" not in config:
            config["tasks"] = _DEFAULT_CONFIG["tasks"].copy()
        else:
            tasks = _DEFAULT_CONFIG["tasks"].copy()
            tasks.update(config["tasks"])
            config["tasks"] = tasks
        return config
    except (ValueError, OSError):
        return _DEFAULT_CONFIG.copy()


def _save_config(config: dict[str, Any]) -> bool:
    """Save auto-care configuration."""
    _ensure_dirs()
    try:
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save auto-care config: %s", e)
        return False


def _load_log() -> list[dict[str, Any]]:
    """Load activity log."""
    if not os.path.isfile(_LOG_PATH):
        return []
    try:
        with open(_LOG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("entries", [])
    except (ValueError, OSError):
        return []


def _save_log(entries: list[dict[str, Any]]) -> bool:
    """Save activity log (keep last 100 entries)."""
    _ensure_dirs()
    try:
        with open(_LOG_PATH, "w", encoding="utf-8") as f:
            json.dump({"entries": entries[-100:]}, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save auto-care log: %s", e)
        return False


def _add_log_entry(entry: dict[str, Any]) -> None:
    """Add an entry to the activity log."""
    entries = _load_log()
    entries.append(entry)
    _save_log(entries)


def _get_idle_seconds() -> int:
    """Get system idle time in seconds using GetLastInputInfo."""
    if not IS_WINDOWS:
        return 0

    try:
        import ctypes

        # Define LASTINPUTINFO structure
        class LASTINPUTINFO(ctypes.Structure):
            _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

        lii = LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(LASTINPUTINFO)

        # GetLastInputInfo returns 1 on success
        if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
            # Get tick count (milliseconds since system start)
            current_tick = ctypes.windll.kernel32.GetTickCount()
            idle_ms = current_tick - lii.dwTime
            return idle_ms // 1000
    except Exception as e:
        log.error("Idle detection failed: %s", e)

    return 0


def _get_cpu_usage() -> float:
    """Get current CPU usage percentage."""
    try:
        import psutil
        return psutil.cpu_percent(interval=0.5)
    except Exception:
        return 0.0


def _run_junk_clean() -> dict[str, Any]:
    """Run junk cleanup (temp files, cache)."""
    result = {"task": "junkClean", "success": False, "details": "", "itemsCleaned": 0, "bytesFreed": 0}

    if not IS_WINDOWS:
        result["details"] = "Not available on non-Windows"
        return result

    try:
        import shutil
        import tempfile

        bytes_freed = 0
        items_cleaned = 0

        # Clean %TEMP%
        temp_dir = tempfile.gettempdir()
        if os.path.isdir(temp_dir):
            for entry in os.listdir(temp_dir):
                entry_path = os.path.join(temp_dir, entry)
                try:
                    if os.path.isfile(entry_path) or os.path.islink(entry_path):
                        size = os.path.getsize(entry_path)
                        os.remove(entry_path)
                        bytes_freed += size
                        items_cleaned += 1
                    elif os.path.isdir(entry_path):
                        size = sum(
                            os.path.getsize(os.path.join(dp, f))
                            for dp, _, fs in os.walk(entry_path) for f in fs
                        )
                        shutil.rmtree(entry_path, ignore_errors=True)
                        bytes_freed += size
                        items_cleaned += 1
                except OSError:
                    pass  # Skip locked/in-use files

        # Clean Windows Temp
        win_temp = os.path.expandvars(r"%WINDIR%\Temp")
        if os.path.isdir(win_temp):
            for entry in os.listdir(win_temp):
                entry_path = os.path.join(win_temp, entry)
                try:
                    if os.path.isfile(entry_path) or os.path.islink(entry_path):
                        size = os.path.getsize(entry_path)
                        os.remove(entry_path)
                        bytes_freed += size
                        items_cleaned += 1
                    elif os.path.isdir(entry_path):
                        size = sum(
                            os.path.getsize(os.path.join(dp, f))
                            for dp, _, fs in os.walk(entry_path) for f in fs
                        )
                        shutil.rmtree(entry_path, ignore_errors=True)
                        bytes_freed += size
                        items_cleaned += 1
                except OSError:
                    pass

        result["success"] = True
        result["itemsCleaned"] = items_cleaned
        result["bytesFreed"] = bytes_freed
        result["details"] = f"Cleaned {items_cleaned} items, freed {bytes_freed} bytes"
    except Exception as e:
        result["details"] = str(e)

    return result


def _run_memory_optimize() -> dict[str, Any]:
    """Run memory optimization (trim working sets)."""
    result = {"task": "memoryOptimize", "success": False, "details": "", "bytesFreed": 0}

    if not IS_WINDOWS:
        result["details"] = "Not available on non-Windows"
        return result

    try:
        import ctypes
        import psutil

        # Load psapi.dll for EmptyWorkingSet
        psapi = ctypes.windll.psapi
        kernel32 = ctypes.windll.kernel32

        bytes_freed = 0
        processes_trimmed = 0

        # Get top 30 processes by memory
        procs = []
        for p in psutil.process_iter(["pid", "memory_info"]):
            try:
                mi = p.info.get("memory_info")
                if mi and mi.rss > 10 * 1024 * 1024:  # Only processes using >10MB
                    procs.append((p, mi.rss))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        procs.sort(key=lambda x: x[1], reverse=True)
        top_procs = procs[:30]

        for p, _ in top_procs:
            try:
                handle = kernel32.OpenProcess(0x0400 | 0x0010, False, p.pid)  # QUERY_INFO | SET_INFO
                if handle:
                    if psapi.EmptyWorkingSet(handle):
                        processes_trimmed += 1
                    kernel32.CloseHandle(handle)
            except Exception:
                continue

        # Get memory after
        vm = psutil.virtual_memory()
        result["success"] = True
        result["bytesFreed"] = 0  # Accurate measurement requires before/after
        result["details"] = f"Trimmed working sets of {processes_trimmed} processes"
    except Exception as e:
        result["details"] = str(e)

    return result


def _run_temp_clean() -> dict[str, Any]:
    """Clean additional temporary folders (Prefetch, recent, etc.)."""
    result = {"task": "tempClean", "success": False, "details": "", "itemsCleaned": 0, "bytesFreed": 0}

    if not IS_WINDOWS:
        result["details"] = "Not available on non-Windows"
        return result

    try:
        bytes_freed = 0
        items_cleaned = 0

        # Clean Prefetch
        prefetch = os.path.expandvars(r"%WINDIR%\Prefetch")
        if os.path.isdir(prefetch):
            for entry in os.listdir(prefetch):
                if entry.lower().endswith(".pf"):
                    entry_path = os.path.join(prefetch, entry)
                    try:
                        size = os.path.getsize(entry_path)
                        os.remove(entry_path)
                        bytes_freed += size
                        items_cleaned += 1
                    except OSError:
                        pass

        # Clean recent files
        recent = os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Recent")
        if os.path.isdir(recent):
            for entry in os.listdir(recent):
                entry_path = os.path.join(recent, entry)
                try:
                    if os.path.isfile(entry_path):
                        size = os.path.getsize(entry_path)
                        os.remove(entry_path)
                        bytes_freed += size
                        items_cleaned += 1
                except OSError:
                    pass

        result["success"] = True
        result["itemsCleaned"] = items_cleaned
        result["bytesFreed"] = bytes_freed
        result["details"] = f"Cleaned {items_cleaned} items, freed {bytes_freed} bytes"
    except Exception as e:
        result["details"] = str(e)

    return result


def _run_auto_care(config: dict[str, Any]) -> dict[str, Any]:
    """Run all enabled auto-care tasks."""
    tasks_config = config.get("tasks", {})
    results: list[dict[str, Any]] = []

    if tasks_config.get("junkClean"):
        results.append(_run_junk_clean())

    if tasks_config.get("memoryOptimize"):
        results.append(_run_memory_optimize())

    if tasks_config.get("tempClean"):
        results.append(_run_temp_clean())

    total_bytes = sum(r.get("bytesFreed", 0) for r in results)
    total_items = sum(r.get("itemsCleaned", 0) for r in results)
    all_success = all(r.get("success", False) for r in results)

    log_entry = {
        "id": f"autocare_{int(time.time())}",
        "timestamp": _now_iso(),
        "trigger": "idle" if _state.get("running") else "manual",
        "tasks": results,
        "totalBytesFreed": total_bytes,
        "totalItemsCleaned": total_items,
        "success": all_success,
        "idleSeconds": _state.get("lastIdleTime", 0),
    }

    _add_log_entry(log_entry)
    _state["lastRunAt"] = _now_iso()

    return {
        "success": all_success,
        "tasks": results,
        "totalBytesFreed": total_bytes,
        "totalItemsCleaned": total_items,
        "logEntry": log_entry,
    }


def _daemon_loop(config: dict[str, Any]) -> None:
    """Background daemon loop that checks idle time and runs auto-care."""
    log.info("Auto-Care daemon started")

    while not _thread_stop.is_set():
        try:
            idle_seconds = _get_idle_seconds()
            _state["lastIdleTime"] = idle_seconds

            threshold = config.get("idleThresholdSeconds", 300)
            min_cpu = config.get("minCpuUsage", 10)

            if idle_seconds >= threshold:
                cpu = _get_cpu_usage()
                if cpu <= min_cpu:
                    log.info("Auto-Care triggered: idle=%ds, cpu=%.1f%%", idle_seconds, cpu)
                    _run_auto_care(config)
                    # Wait extra after running to avoid repeated triggers
                    _thread_stop.wait(config.get("checkIntervalSeconds", 60) * 5)
                else:
                    _state["nextCheckAt"] = _now_iso()
            else:
                _state["nextCheckAt"] = _now_iso()

        except Exception as e:
            log.error("Auto-Care daemon error: %s", e)

        # Wait for check interval or stop signal
        _thread_stop.wait(config.get("checkIntervalSeconds", 60))

    log.info("Auto-Care daemon stopped")


def _start_daemon(config: dict[str, Any]) -> None:
    """Start the auto-care background daemon."""
    global _thread

    if _thread and _thread.is_alive():
        return  # Already running

    _thread_stop.clear()
    _thread = threading.Thread(target=_daemon_loop, args=(config,), daemon=True, name="avs-auto-care")
    _thread.start()
    _state["running"] = True


def _stop_daemon() -> None:
    """Stop the auto-care background daemon."""
    global _thread

    _thread_stop.set()
    if _thread:
        _thread.join(timeout=5)
        _thread = None
    _state["running"] = False


# ─── RPC Methods ────────────────────────────────────────────────────

@register("auto_care.status")
def auto_care_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current auto-care status and configuration.

    Returns:
        config: current configuration
        running: whether the daemon is active
        currentIdleSeconds: current system idle time
        lastRunAt: timestamp of last auto-care run
        nextCheckAt: when daemon will next check
    """
    config = _load_config()
    idle_seconds = _get_idle_seconds()
    _state["lastIdleTime"] = idle_seconds

    return {
        "config": config,
        "running": _state["running"],
        "currentIdleSeconds": idle_seconds,
        "lastRunAt": _state["lastRunAt"],
        "nextCheckAt": _state["nextCheckAt"],
        "supported": IS_WINDOWS,
    }


@register("auto_care.configure")
@require_feature("auto_care.configure")
def auto_care_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update auto-care configuration. Pro only.

    Params (all optional):
        enabled: bool — enable/disable auto-care
        idleThresholdSeconds: int — idle time before auto-care triggers
        checkIntervalSeconds: int — how often to check idle state
        tasks: dict — which tasks to run {junkClean, memoryOptimize, tempClean}
        minCpuUsage: float — max CPU usage for auto-care to trigger
    """
    config = _load_config()

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "idleThresholdSeconds" in params:
            config["idleThresholdSeconds"] = max(60, int(params["idleThresholdSeconds"]))
        if "checkIntervalSeconds" in params:
            config["checkIntervalSeconds"] = max(10, int(params["checkIntervalSeconds"]))
        if "minCpuUsage" in params:
            config["minCpuUsage"] = max(0, float(params["minCpuUsage"]))
        if "tasks" in params and isinstance(params["tasks"], dict):
            tasks = config.get("tasks", {})
            tasks.update(params["tasks"])
            config["tasks"] = tasks

    _save_config(config)

    # Start or stop daemon based on enabled state
    if config["enabled"] and IS_WINDOWS:
        _start_daemon(config)
    else:
        _stop_daemon()

    return {
        "success": True,
        "config": config,
        "running": _state["running"],
        "message": "Auto-Care configuration updated",
    }


@register("auto_care.getActivityLog")
def auto_care_get_activity_log(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get auto-care activity log entries.

    Params (optional):
        limit: int — max entries to return (default 50)
    """
    limit = 50
    if params and "limit" in params:
        limit = min(100, max(1, int(params["limit"])))

    entries = _load_log()
    return {
        "entries": entries[-limit:],
        "count": len(entries),
        "supported": True,
    }


@register("auto_care.runNow")
@require_feature("auto_care.runNow")
def auto_care_run_now(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Trigger auto-care immediately. Pro only.

    Runs all enabled tasks regardless of idle state.
    """
    config = _load_config()
    result = _run_auto_care(config)
    return result


@register("auto_care.clearLog")
@require_feature("auto_care.clearLog")
def auto_care_clear_log(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear the auto-care activity log. Pro only."""
    _save_log([])
    return {
        "success": True,
        "message": "Activity log cleared",
    }
