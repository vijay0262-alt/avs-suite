"""AI Process Prioritization — dynamic CPU priority based on active workload.

Adjusts process CPU priority and affinity based on the current workload:
  - Game Mode: boost game processes, lower background tasks
  - Work Mode: boost productivity apps, lower non-essential
  - Creative Mode: boost creative tools (video editing, 3D, design)
  - Battery Saver: lower all non-essential processes
  - Balanced: default Windows priorities

Uses Windows SetPriorityClass and SetProcessAffinityMask via ctypes.

Data is stored in ~/.avs/process_priority_data.json.

RPC methods:
    process_priority.getStatus      — get current mode and priority info
    process_priority.listProcesses  — list processes with their current priorities
    process_priority.setMode        — set optimization mode (Pro only)
    process_priority.applyMode      — apply priority adjustments for current mode (Pro only)
    process_priority.setPriority    — manually set priority for a process (Pro only)
    process_priority.setAffinity    — manually set CPU affinity for a process (Pro only)
    process_priority.resetAll       — reset all processes to default priority (Pro only)
    process_priority.configure      — update config (Pro only)
"""

from __future__ import annotations

import json
import logging
import os
import platform
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.process_priority")

IS_WINDOWS = platform.system() == "Windows"

_DATA_PATH = os.path.join(os.path.expanduser("~"), ".avs", "process_priority_data.json")

# Windows priority classes
PRIORITY_CLASSES = {
    "idle": 0x40,            # IDLE_PRIORITY_CLASS
    "below_normal": 0x4000,  # BELOW_NORMAL_PRIORITY_CLASS
    "normal": 0x20,          # NORMAL_PRIORITY_CLASS
    "above_normal": 0x8000,  # ABOVE_NORMAL_PRIORITY_CLASS
    "high": 0x80,            # HIGH_PRIORITY_CLASS
    "realtime": 0x100,       # REALTIME_PRIORITY_CLASS
}

PRIORITY_LABELS = {
    0x40: "Idle",
    0x4000: "Below Normal",
    0x20: "Normal",
    0x8000: "Above Normal",
    0x80: "High",
    0x100: "Realtime",
}

# Mode definitions: which process names get boosted, which get lowered
_MODE_PROFILES = {
    "balanced": {
        "label": "Balanced",
        "description": "Default Windows priorities — no changes",
        "boost": [],
        "lower": [],
        "boostPriority": "normal",
        "lowerPriority": "normal",
    },
    "game": {
        "label": "Game Mode",
        "description": "Boost games, lower background tasks",
        "boost": [
            "game", "steam", "epicgames", "origin", "gog", "battle.net", "ubisoft",
            "riotclient", "league", "valorant", "csgo", "dota", "pubg", "fortnite",
            "genshinimpact", "cyberpunk", "witcher", "skyrim", "minecraft", "wow",
            "overwatch", "apex", "warzone", "fifa", "nba2k", "callofduty",
        ],
        "lower": [
            "chrome", "firefox", "edge", "opera", "brave",
            "slack", "teams", "discord", "zoom", "outlook",
            "spotify", "onedrive", "dropbox", "backup",
        ],
        "boostPriority": "high",
        "lowerPriority": "below_normal",
    },
    "work": {
        "label": "Work Mode",
        "description": "Boost productivity apps, lower non-essential",
        "boost": [
            "winword", "excel", "powerpnt", "outlook", "teams", "slack",
            "notepad", "code", "devenv", "idea", "eclipse", "pycharm",
            "visualstudio", "vscode", "terminal", "cmd", "powershell",
            "chrome", "firefox", "edge",
        ],
        "lower": [
            "spotify", "game", "steam", "discord", "zoom",
            "onedrive", "dropbox", "backup",
        ],
        "boostPriority": "above_normal",
        "lowerPriority": "below_normal",
    },
    "creative": {
        "label": "Creative Mode",
        "description": "Boost creative tools — video, 3D, design",
        "boost": [
            "premiere", "afterfx", "photoshop", "illustrator", "indesign",
            "lightroom", "audition", "davinci", "resolve", "blender",
            "maya", "3dsmax", "cinema4d", "houdini", "zbrush",
            "figma", "sketch", "gimp", "inkscape", "krita",
            "obs64", "obs32",
        ],
        "lower": [
            "chrome", "firefox", "edge", "spotify", "discord",
            "onedrive", "dropbox", "backup", "steam", "game",
        ],
        "boostPriority": "high",
        "lowerPriority": "below_normal",
    },
    "battery": {
        "label": "Battery Saver",
        "description": "Lower all non-essential processes to save battery",
        "boost": [],
        "lower": [
            "chrome", "firefox", "edge", "opera", "brave",
            "spotify", "discord", "slack", "teams", "zoom",
            "steam", "game", "epicgames", "origin",
            "onedrive", "dropbox", "backup",
            "premiere", "afterfx", "blender", "obs64",
        ],
        "boostPriority": "normal",
        "lowerPriority": "idle",
    },
}

_DEFAULT_CONFIG = {
    "enabled": True,
    "currentMode": "balanced",
    "autoDetect": True,  # Auto-detect workload and switch modes
    "applyAffinity": False,  # Also adjust CPU affinity (advanced)
    "protectedProcesses": [
        "explorer.exe", "dwm.exe", "csrss.exe", "winlogon.exe",
        "svchost.exe", "lsass.exe", "services.exe", "smss.exe",
        "wininit.exe", "spoolsv.exe", "system",
        "avssuite.exe", "avs-backend.exe", "avs.exe",
    ],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_DATA_PATH), exist_ok=True)


def _load_data() -> dict[str, Any]:
    if not os.path.isfile(_DATA_PATH):
        return {"config": _DEFAULT_CONFIG.copy(), "adjustedProcesses": [], "stats": {"totalAdjustments": 0, "totalBoosted": 0, "totalLowered": 0, "totalResets": 0}}
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "config" not in data:
            data["config"] = _DEFAULT_CONFIG.copy()
        if "adjustedProcesses" not in data:
            data["adjustedProcesses"] = []
        if "stats" not in data:
            data["stats"] = {"totalAdjustments": 0, "totalBoosted": 0, "totalLowered": 0, "totalResets": 0}
        return data
    except (ValueError, OSError):
        return {"config": _DEFAULT_CONFIG.copy(), "adjustedProcesses": [], "stats": {"totalAdjustments": 0, "totalBoosted": 0, "totalLowered": 0, "totalResets": 0}}


def _save_data(data: dict[str, Any]) -> bool:
    _ensure_dirs()
    try:
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save process priority data: %s", e)
        return False


def _set_process_priority(pid: int, priority_class: int) -> bool:
    """Set process priority using Windows SetPriorityClass."""
    if not IS_WINDOWS:
        return False

    try:
        import ctypes

        # PROCESS_SET_INFORMATION = 0x0200
        handle = ctypes.windll.kernel32.OpenProcess(0x0200, False, pid)
        if not handle:
            return False

        try:
            result = ctypes.windll.kernel32.SetPriorityClass(handle, priority_class)
            return bool(result)
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception as e:
        log.error("Failed to set priority for PID %d: %s", pid, e)
        return False


def _get_process_priority(pid: int) -> int | None:
    """Get process priority class."""
    if not IS_WINDOWS:
        return None

    try:
        import ctypes

        # PROCESS_QUERY_INFORMATION = 0x0400
        handle = ctypes.windll.kernel32.OpenProcess(0x0400, False, pid)
        if not handle:
            return None

        try:
            priority = ctypes.windll.kernel32.GetPriorityClass(handle)
            return priority if priority else None
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception:
        return None


def _set_process_affinity(pid: int, affinity_mask: int) -> bool:
    """Set process CPU affinity using SetProcessAffinityMask."""
    if not IS_WINDOWS:
        return False

    try:
        import ctypes

        # PROCESS_SET_INFORMATION = 0x0200
        handle = ctypes.windll.kernel32.OpenProcess(0x0200, False, pid)
        if not handle:
            return False

        try:
            result = ctypes.windll.kernel32.SetProcessAffinityMask(handle, affinity_mask)
            return bool(result)
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception as e:
        log.error("Failed to set affinity for PID %d: %s", pid, e)
        return False


def _is_protected(name: str, config: dict[str, Any]) -> bool:
    """Check if a process is protected."""
    protected = config.get("protectedProcesses", [])
    name_lower = name.lower()
    for p in protected:
        if p.lower() in name_lower or name_lower in p.lower():
            return True
    return False


def _matches_profile(name: str, profile_list: list[str]) -> bool:
    """Check if a process name matches any entry in the profile list."""
    name_lower = name.lower()
    for entry in profile_list:
        if entry.lower() in name_lower:
            return True
    return False


def _get_all_processes() -> list[dict[str, Any]]:
    """Get all running processes with info."""
    try:
        import psutil
        procs: list[dict[str, Any]] = []
        for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]):
            try:
                info = p.info
                mi = info.get("memory_info")
                pid = info.get("pid", 0)
                priority = _get_process_priority(pid) if IS_WINDOWS else None
                procs.append({
                    "pid": pid,
                    "name": info.get("name", "") or "",
                    "cpuPercent": info.get("cpu_percent", 0) or 0,
                    "memoryMB": (mi.rss / (1024 * 1024)) if mi else 0,
                    "priority": priority,
                    "priorityLabel": PRIORITY_LABELS.get(priority, "Unknown") if priority else "Unknown",
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return procs
    except Exception as e:
        log.error("Failed to get processes: %s", e)
        return []


# ─── RPC Methods ────────────────────────────────────────────────────

@register("process_priority.getStatus")
def process_priority_get_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current priority management status."""
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())
    stats = data.get("stats", {})

    current_mode = config.get("currentMode", "balanced")
    mode_profile = _MODE_PROFILES.get(current_mode, _MODE_PROFILES["balanced"])

    return {
        "enabled": config.get("enabled", True),
        "currentMode": current_mode,
        "modeLabel": mode_profile.get("label", "Balanced"),
        "modeDescription": mode_profile.get("description", ""),
        "autoDetect": config.get("autoDetect", True),
        "applyAffinity": config.get("applyAffinity", False),
        "availableModes": [
            {"id": mid, "label": p["label"], "description": p["description"]}
            for mid, p in _MODE_PROFILES.items()
        ],
        "stats": {
            "totalAdjustments": stats.get("totalAdjustments", 0),
            "totalBoosted": stats.get("totalBoosted", 0),
            "totalLowered": stats.get("totalLowered", 0),
            "totalResets": stats.get("totalResets", 0),
        },
        "adjustedCount": len(data.get("adjustedProcesses", [])),
        "supported": IS_WINDOWS,
    }


@register("process_priority.listProcesses")
def process_priority_list_processes(params: dict[str, Any] | None) -> dict[str, Any]:
    """List processes with their current priorities.

    Params (optional):
        limit: int — max processes to return (default 50)
        sortBy: str — sort by 'cpu', 'memory', 'name' (default 'cpu')
    """
    if not IS_WINDOWS:
        return {"processes": [], "count": 0, "supported": False}

    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())
    current_mode = config.get("currentMode", "balanced")
    mode_profile = _MODE_PROFILES.get(current_mode, _MODE_PROFILES["balanced"])

    all_procs = _get_all_processes()
    current_pid = os.getpid()

    # Enrich with mode classification
    enriched: list[dict[str, Any]] = []
    for proc in all_procs:
        if proc["pid"] == current_pid:
            continue

        name = proc["name"]
        if _is_protected(name, config):
            proc["classification"] = "protected"
        elif _matches_profile(name, mode_profile.get("boost", [])):
            proc["classification"] = "boost"
        elif _matches_profile(name, mode_profile.get("lower", [])):
            proc["classification"] = "lower"
        else:
            proc["classification"] = "neutral"

        enriched.append(proc)

    # Sort
    sort_by = "cpu"
    if params and "sortBy" in params:
        sort_by = params["sortBy"]

    if sort_by == "memory":
        enriched.sort(key=lambda x: x["memoryMB"], reverse=True)
    elif sort_by == "name":
        enriched.sort(key=lambda x: x["name"].lower())
    else:  # cpu
        enriched.sort(key=lambda x: x["cpuPercent"], reverse=True)

    # Limit
    limit = 50
    if params and "limit" in params:
        limit = min(200, max(1, int(params["limit"])))

    return {
        "processes": enriched[:limit],
        "count": len(enriched[:limit]),
        "totalCount": len(enriched),
        "currentMode": current_mode,
        "supported": True,
    }


@register("process_priority.setMode")
@require_feature("process_priority.setMode")
def process_priority_set_mode(params: dict[str, Any] | None) -> dict[str, Any]:
    """Set optimization mode. Pro only.

    Params:
        mode: str — balanced, game, work, creative, battery
    """
    if not params or "mode" not in params:
        return {"success": False, "message": "mode parameter is required"}

    mode = params["mode"]
    if mode not in _MODE_PROFILES:
        return {"success": False, "message": f"Unknown mode: {mode}"}

    data = _load_data()
    data["config"]["currentMode"] = mode
    _save_data(data)

    profile = _MODE_PROFILES[mode]
    return {
        "success": True,
        "mode": mode,
        "label": profile["label"],
        "description": profile["description"],
        "message": f"Mode set to {profile['label']}",
    }


@register("process_priority.applyMode")
@require_feature("process_priority.applyMode")
def process_priority_apply_mode(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Apply priority adjustments for the current mode. Pro only.

    Adjusts CPU priority for processes matching the current mode profile.
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Not supported on this platform"}

    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "Process priority management is disabled"}

    current_mode = config.get("currentMode", "balanced")
    mode_profile = _MODE_PROFILES.get(current_mode, _MODE_PROFILES["balanced"])

    if current_mode == "balanced":
        return {"success": True, "boostedCount": 0, "loweredCount": 0, "message": "Balanced mode — no adjustments needed"}

    all_procs = _get_all_processes()
    current_pid = os.getpid()

    boosted_count = 0
    lowered_count = 0
    failed_count = 0
    adjusted: list[dict[str, Any]] = []

    boost_priority = PRIORITY_CLASSES.get(mode_profile.get("boostPriority", "normal"), 0x20)
    lower_priority = PRIORITY_CLASSES.get(mode_profile.get("lowerPriority", "normal"), 0x20)

    for proc in all_procs:
        pid = proc["pid"]
        if pid == current_pid:
            continue

        name = proc["name"]
        if _is_protected(name, config):
            continue

        if _matches_profile(name, mode_profile.get("boost", [])):
            if _set_process_priority(pid, boost_priority):
                boosted_count += 1
                adjusted.append({"pid": pid, "name": name, "action": "boosted", "priority": mode_profile["boostPriority"]})
            else:
                failed_count += 1

        elif _matches_profile(name, mode_profile.get("lower", [])):
            if _set_process_priority(pid, lower_priority):
                lowered_count += 1
                adjusted.append({"pid": pid, "name": name, "action": "lowered", "priority": mode_profile["lowerPriority"]})
            else:
                failed_count += 1

    # Save adjusted processes for reset
    data["adjustedProcesses"] = adjusted
    data["stats"]["totalAdjustments"] = data["stats"].get("totalAdjustments", 0) + boosted_count + lowered_count
    data["stats"]["totalBoosted"] = data["stats"].get("totalBoosted", 0) + boosted_count
    data["stats"]["totalLowered"] = data["stats"].get("totalLowered", 0) + lowered_count
    _save_data(data)

    return {
        "success": True,
        "boostedCount": boosted_count,
        "loweredCount": lowered_count,
        "failedCount": failed_count,
        "mode": current_mode,
        "message": f"Applied {mode_profile['label']}: {boosted_count} boosted, {lowered_count} lowered, {failed_count} failed",
    }


@register("process_priority.setPriority")
@require_feature("process_priority.setPriority")
def process_priority_set_priority(params: dict[str, Any] | None) -> dict[str, Any]:
    """Manually set priority for a process. Pro only.

    Params:
        pid: int — process ID
        priority: str — idle, below_normal, normal, above_normal, high, realtime
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Not supported on this platform"}

    if not params or "pid" not in params or "priority" not in params:
        return {"success": False, "message": "pid and priority parameters are required"}

    pid = int(params["pid"])
    priority_name = params["priority"]

    if priority_name not in PRIORITY_CLASSES:
        return {"success": False, "message": f"Unknown priority: {priority_name}"}

    # Don't allow realtime for safety
    if priority_name == "realtime":
        return {"success": False, "message": "Realtime priority is blocked for safety"}

    priority_class = PRIORITY_CLASSES[priority_name]

    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    # Get process name for protection check
    try:
        import psutil
        p = psutil.Process(pid)
        name = p.name()
        if _is_protected(name, config):
            return {"success": False, "message": f"Process '{name}' is protected"}
    except Exception:
        return {"success": False, "message": "Process not found"}

    if _set_process_priority(pid, priority_class):
        return {
            "success": True,
            "message": f"Set '{name}' (PID {pid}) to {PRIORITY_LABELS[priority_class]}",
            "pid": pid,
            "name": name,
            "priority": priority_name,
        }
    else:
        return {"success": False, "message": "Failed to set priority (access denied)"}


@register("process_priority.setAffinity")
@require_feature("process_priority.setAffinity")
def process_priority_set_affinity(params: dict[str, Any] | None) -> dict[str, Any]:
    """Manually set CPU affinity for a process. Pro only.

    Params:
        pid: int — process ID
        affinity: int — CPU affinity bitmask
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Not supported on this platform"}

    if not params or "pid" not in params or "affinity" not in params:
        return {"success": False, "message": "pid and affinity parameters are required"}

    pid = int(params["pid"])
    affinity = int(params["affinity"])

    if affinity <= 0:
        return {"success": False, "message": "Invalid affinity mask"}

    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    try:
        import psutil
        p = psutil.Process(pid)
        name = p.name()
        if _is_protected(name, config):
            return {"success": False, "message": f"Process '{name}' is protected"}
    except Exception:
        return {"success": False, "message": "Process not found"}

    if _set_process_affinity(pid, affinity):
        return {
            "success": True,
            "message": f"Set CPU affinity for '{name}' (PID {pid})",
            "pid": pid,
            "name": name,
            "affinity": affinity,
        }
    else:
        return {"success": False, "message": "Failed to set affinity (access denied)"}


@register("process_priority.resetAll")
@require_feature("process_priority.resetAll")
def process_priority_reset_all(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Reset all adjusted processes to normal priority. Pro only."""
    if not IS_WINDOWS:
        return {"success": False, "message": "Not supported on this platform"}

    data = _load_data()
    adjusted = data.get("adjustedProcesses", [])

    reset_count = 0
    failed_count = 0

    for proc in adjusted:
        pid = proc["pid"]
        if _set_process_priority(pid, PRIORITY_CLASSES["normal"]):
            reset_count += 1
        else:
            failed_count += 1

    data["adjustedProcesses"] = []
    data["stats"]["totalResets"] = data["stats"].get("totalResets", 0) + reset_count
    _save_data(data)

    return {
        "success": reset_count > 0,
        "resetCount": reset_count,
        "failedCount": failed_count,
        "message": f"Reset {reset_count} process(es) to normal, {failed_count} failed",
    }


@register("process_priority.configure")
@require_feature("process_priority.configure")
def process_priority_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update process priority configuration. Pro only.

    Params (all optional):
        enabled: bool
        autoDetect: bool
        applyAffinity: bool
        protectedProcesses: list[str]
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "autoDetect" in params:
            config["autoDetect"] = bool(params["autoDetect"])
        if "applyAffinity" in params:
            config["applyAffinity"] = bool(params["applyAffinity"])
        if "protectedProcesses" in params and isinstance(params["protectedProcesses"], list):
            existing = config.get("protectedProcesses", [])
            for p in params["protectedProcesses"]:
                if p not in existing:
                    existing.append(p)
            config["protectedProcesses"] = existing

    data["config"] = config
    _save_data(data)

    return {
        "success": True,
        "config": config,
        "message": "Process priority configuration updated",
    }
