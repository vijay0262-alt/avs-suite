"""AI App Freeze/Sleep — freeze unused apps to free RAM, resumable.

Uses Windows NtSuspendProcess/NtResumeProcess via ntdll to suspend and
resume processes. Suspended processes consume no CPU and their working
sets can be trimmed by the OS, freeing RAM while keeping the app's state
intact for instant resume.

AI identifies candidate processes for freezing based on:
  - Low CPU usage (idle for extended period)
  - High memory usage (freeing RAM is beneficial)
  - Non-critical (not system processes, not AVS itself)
  - Not in the protected list

Data is stored in ~/.avs/app_freezer_state.json.

RPC methods:
    app_freezer.listCandidates   — list processes that can be frozen
    app_freezer.listFrozen       — list currently frozen processes
    app_freezer.freeze           — freeze a process by PID (Pro only)
    app_freezer.unfreeze         — unfreeze a process by PID (Pro only)
    app_freezer.freezeAll        — freeze all candidate processes (Pro only)
    app_freezer.unfreezeAll      — unfreeze all frozen processes (Pro only)
    app_freezer.status           — get freezer status and stats
    app_freezer.configure        — update freezer config (Pro only)
"""

from __future__ import annotations

import json
import logging
import os
import platform
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.app_freezer")

IS_WINDOWS = platform.system() == "Windows"

_STATE_PATH = os.path.join(os.path.expanduser("~"), ".avs", "app_freezer_state.json")

_DEFAULT_CONFIG = {
    "enabled": True,
    "autoFreeze": False,  # AI auto-freeze idle processes
    "idleThresholdSeconds": 300,  # Process must be idle for 5 min
    "minMemoryMB": 100,  # Only freeze processes using >100MB
    "maxFrozen": 10,  # Maximum number of frozen processes
    "protectedProcesses": [
        "explorer.exe", "dwm.exe", "csrss.exe", "winlogon.exe",
        "svchost.exe", "lsass.exe", "services.exe", "smss.exe",
        "wininit.exe", "spoolsv.exe", "fontdrvhost.exe",
        "avssuite.exe", "avs-backend.exe", "avs.exe",
        "system", "system idle process",
        "registry.exe", "sihost.exe", "taskhostw.exe",
        "ctfmon.exe", "textinputhost.exe",
    ],
}

# In-memory state
_frozen_pids: set[int] = set()
_frozen_info: dict[int, dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_STATE_PATH), exist_ok=True)


def _load_state() -> dict[str, Any]:
    if not os.path.isfile(_STATE_PATH):
        return {"config": _DEFAULT_CONFIG.copy(), "frozen": [], "stats": {"totalFrozen": 0, "totalUnfrozen": 0, "totalBytesFreed": 0}}
    try:
        with open(_STATE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "config" not in data:
            data["config"] = _DEFAULT_CONFIG.copy()
        if "frozen" not in data:
            data["frozen"] = []
        if "stats" not in data:
            data["stats"] = {"totalFrozen": 0, "totalUnfrozen": 0, "totalBytesFreed": 0}
        return data
    except (ValueError, OSError):
        return {"config": _DEFAULT_CONFIG.copy(), "frozen": [], "stats": {"totalFrozen": 0, "totalUnfrozen": 0, "totalBytesFreed": 0}}


def _save_state(data: dict[str, Any]) -> bool:
    _ensure_dirs()
    try:
        with open(_STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save app freezer state: %s", e)
        return False


def _suspend_process(pid: int) -> bool:
    """Suspend a process using NtSuspendProcess via ntdll."""
    if not IS_WINDOWS:
        return False

    try:
        import ctypes

        ntdll = ctypes.windll.ntdll
        # Open process with PROCESS_SUSPEND_RESUME (0x0800)
        handle = ctypes.windll.kernel32.OpenProcess(0x0800, False, pid)
        if not handle:
            return False

        try:
            # NtSuspendProcess returns NTSTATUS (0 = success)
            status = ntdll.NtSuspendProcess(handle)
            return status == 0
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception as e:
        log.error("Failed to suspend process %d: %s", pid, e)
        return False


def _resume_process(pid: int) -> bool:
    """Resume a suspended process using NtResumeProcess via ntdll."""
    if not IS_WINDOWS:
        return False

    try:
        import ctypes

        ntdll = ctypes.windll.ntdll
        handle = ctypes.windll.kernel32.OpenProcess(0x0800, False, pid)
        if not handle:
            return False

        try:
            status = ntdll.NtResumeProcess(handle)
            return status == 0
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception as e:
        log.error("Failed to resume process %d: %s", pid, e)
        return False


def _is_protected(name: str, config: dict[str, Any]) -> bool:
    """Check if a process is in the protected list."""
    protected = config.get("protectedProcesses", [])
    name_lower = name.lower()
    for p in protected:
        if p.lower() in name_lower or name_lower in p.lower():
            return True
    return False


def _get_process_info(pid: int) -> dict[str, Any] | None:
    """Get info about a specific process."""
    try:
        import psutil
        p = psutil.Process(pid)
        with p.oneshot():
            name = p.name()
            mem = p.memory_info()
            cpu = p.cpu_percent(interval=0.1)
            try:
                exe = p.exe()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                exe = ""
            try:
                create_time = p.create_time()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                create_time = 0

            return {
                "pid": pid,
                "name": name,
                "exe": exe,
                "memoryMB": mem.rss / (1024 * 1024),
                "cpuPercent": cpu,
                "createTime": create_time,
            }
    except Exception:
        return None


def _get_all_processes() -> list[dict[str, Any]]:
    """Get all running processes with info."""
    try:
        import psutil
        procs: list[dict[str, Any]] = []
        for p in psutil.process_iter(["pid", "name", "memory_info", "cpu_percent", "exe", "create_time"]):
            try:
                info = p.info
                mi = info.get("memory_info")
                procs.append({
                    "pid": info.get("pid", 0),
                    "name": info.get("name", "") or "",
                    "exe": info.get("exe", "") or "",
                    "memoryMB": (mi.rss / (1024 * 1024)) if mi else 0,
                    "cpuPercent": info.get("cpu_percent", 0) or 0,
                    "createTime": info.get("create_time", 0) or 0,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return procs
    except Exception as e:
        log.error("Failed to get processes: %s", e)
        return []


def _get_candidates(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Get processes that are candidates for freezing."""
    all_procs = _get_all_processes()
    candidates: list[dict[str, Any]] = []

    min_mem = config.get("minMemoryMB", 100)
    idle_threshold = config.get("idleThresholdSeconds", 300)
    current_pid = os.getpid()

    for proc in all_procs:
        name = proc["name"]
        pid = proc["pid"]

        # Skip self
        if pid == current_pid:
            continue

        # Skip protected
        if _is_protected(name, config):
            continue

        # Skip already frozen
        if pid in _frozen_pids:
            continue

        # Must use enough memory to be worth freezing
        if proc["memoryMB"] < min_mem:
            continue

        # Must have low CPU (idle)
        if proc["cpuPercent"] > 1.0:
            continue

        # Check if process has been running long enough
        if proc["createTime"] > 0:
            uptime = time.time() - proc["createTime"]
            if uptime < idle_threshold:
                continue

        candidates.append(proc)

    # Sort by memory usage (highest first)
    candidates.sort(key=lambda x: x["memoryMB"], reverse=True)
    return candidates


# ─── RPC Methods ────────────────────────────────────────────────────

@register("app_freezer.listCandidates")
def app_freezer_list_candidates(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List processes that are candidates for freezing.

    Returns processes that:
      - Are not in the protected list
      - Use more than minMemoryMB of RAM
      - Have low CPU usage (idle)
      - Have been running for at least idleThresholdSeconds
    """
    if not IS_WINDOWS:
        return {"candidates": [], "count": 0, "supported": False}

    data = _load_state()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"candidates": [], "count": 0, "supported": True, "enabled": False}

    candidates = _get_candidates(config)
    max_frozen = config.get("maxFrozen", 10)
    current_frozen = len(_frozen_pids)
    remaining_slots = max(0, max_frozen - current_frozen)

    return {
        "candidates": candidates[:20],  # Return top 20
        "count": len(candidates),
        "currentFrozen": current_frozen,
        "remainingSlots": remaining_slots,
        "supported": True,
        "enabled": True,
    }


@register("app_freezer.listFrozen")
def app_freezer_list_frozen(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List currently frozen processes."""
    frozen_list: list[dict[str, Any]] = []

    for pid, info in _frozen_info.items():
        # Verify process is still alive
        proc_info = _get_process_info(pid)
        if proc_info is None:
            # Process died while frozen — clean up
            _frozen_pids.discard(pid)
            _frozen_info.pop(pid, None)
            continue
        frozen_list.append({
            **info,
            "currentMemoryMB": proc_info["memoryMB"],
        })

    return {
        "frozen": frozen_list,
        "count": len(frozen_list),
        "supported": True,
    }


@register("app_freezer.freeze")
@require_feature("app_freezer.freeze")
def app_freezer_freeze(params: dict[str, Any] | None) -> dict[str, Any]:
    """Freeze a process by PID. Pro only.

    Params:
        pid: int — process ID to freeze
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Not supported on this platform"}

    if not params or "pid" not in params:
        return {"success": False, "message": "pid parameter is required"}

    pid = int(params["pid"])
    data = _load_state()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "App freezer is disabled"}

    # Check max frozen limit
    max_frozen = config.get("maxFrozen", 10)
    if len(_frozen_pids) >= max_frozen:
        return {"success": False, "message": f"Maximum frozen limit ({max_frozen}) reached"}

    if pid in _frozen_pids:
        return {"success": False, "message": "Process is already frozen"}

    # Get process info before freezing
    proc_info = _get_process_info(pid)
    if proc_info is None:
        return {"success": False, "message": "Process not found"}

    # Check protected
    if _is_protected(proc_info["name"], config):
        return {"success": False, "message": f"Process '{proc_info['name']}' is protected and cannot be frozen"}

    # Suspend the process
    if not _suspend_process(pid):
        return {"success": False, "message": "Failed to suspend process (access denied or process not found)"}

    # Record state
    frozen_entry = {
        "pid": pid,
        "name": proc_info["name"],
        "exe": proc_info["exe"],
        "memoryMBAtFreeze": proc_info["memoryMB"],
        "frozenAt": _now_iso(),
    }
    _frozen_pids.add(pid)
    _frozen_info[pid] = frozen_entry

    # Update persistent state
    data["frozen"] = list(_frozen_info.values())
    data["stats"]["totalFrozen"] = data["stats"].get("totalFrozen", 0) + 1
    _save_state(data)

    return {
        "success": True,
        "message": f"Froze '{proc_info['name']}' (PID {pid})",
        "process": frozen_entry,
        "totalFrozen": len(_frozen_pids),
    }


@register("app_freezer.unfreeze")
@require_feature("app_freezer.unfreeze")
def app_freezer_unfreeze(params: dict[str, Any] | None) -> dict[str, Any]:
    """Unfreeze a process by PID. Pro only.

    Params:
        pid: int — process ID to unfreeze
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Not supported on this platform"}

    if not params or "pid" not in params:
        return {"success": False, "message": "pid parameter is required"}

    pid = int(params["pid"])

    if pid not in _frozen_pids:
        return {"success": False, "message": "Process is not frozen"}

    # Get info before unfreezing
    info = _frozen_info.get(pid, {})

    # Resume the process
    if not _resume_process(pid):
        # Process may have died
        _frozen_pids.discard(pid)
        _frozen_info.pop(pid, None)
        data = _load_state()
        data["frozen"] = list(_frozen_info.values())
        _save_state(data)
        return {"success": False, "message": "Failed to resume process (it may have terminated)"}

    # Get current memory after resume
    proc_info = _get_process_info(pid)
    current_mem = proc_info["memoryMB"] if proc_info else 0

    _frozen_pids.discard(pid)
    _frozen_info.pop(pid, None)

    # Update persistent state
    data = _load_state()
    data["frozen"] = list(_frozen_info.values())
    data["stats"]["totalUnfrozen"] = data["stats"].get("totalUnfrozen", 0) + 1
    _save_state(data)

    return {
        "success": True,
        "message": f"Unfroze '{info.get('name', 'unknown')}' (PID {pid})",
        "process": info,
        "currentMemoryMB": current_mem,
        "totalFrozen": len(_frozen_pids),
    }


@register("app_freezer.freezeAll")
@require_feature("app_freezer.freezeAll")
def app_freezer_freeze_all(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Freeze all candidate processes. Pro only.

    Freezes up to maxFrozen processes that meet the criteria.
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Not supported on this platform"}

    data = _load_state()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "App freezer is disabled"}

    candidates = _get_candidates(config)
    max_frozen = config.get("maxFrozen", 10)
    remaining_slots = max(0, max_frozen - len(_frozen_pids))
    to_freeze = candidates[:remaining_slots]

    frozen_count = 0
    failed_count = 0
    total_mem_frozen = 0.0

    for proc in to_freeze:
        pid = proc["pid"]
        if pid in _frozen_pids:
            continue

        if _suspend_process(pid):
            _frozen_pids.add(pid)
            _frozen_info[pid] = {
                "pid": pid,
                "name": proc["name"],
                "exe": proc["exe"],
                "memoryMBAtFreeze": proc["memoryMB"],
                "frozenAt": _now_iso(),
            }
            frozen_count += 1
            total_mem_frozen += proc["memoryMB"]
        else:
            failed_count += 1

    data["frozen"] = list(_frozen_info.values())
    data["stats"]["totalFrozen"] = data["stats"].get("totalFrozen", 0) + frozen_count
    data["stats"]["totalBytesFreed"] = data["stats"].get("totalBytesFreed", 0) + int(total_mem_frozen * 1024 * 1024)
    _save_state(data)

    return {
        "success": frozen_count > 0,
        "frozenCount": frozen_count,
        "failedCount": failed_count,
        "totalMemoryMB": round(total_mem_frozen, 1),
        "totalFrozen": len(_frozen_pids),
        "message": f"Froze {frozen_count} process(es), {failed_count} failed",
    }


@register("app_freezer.unfreezeAll")
@require_feature("app_freezer.unfreezeAll")
def app_freezer_unfreeze_all(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Unfreeze all frozen processes. Pro only."""
    if not IS_WINDOWS:
        return {"success": False, "message": "Not supported on this platform"}

    unfrozen_count = 0
    failed_count = 0

    pids_to_unfreeze = list(_frozen_pids)
    for pid in pids_to_unfreeze:
        if _resume_process(pid):
            _frozen_pids.discard(pid)
            _frozen_info.pop(pid, None)
            unfrozen_count += 1
        else:
            # Process may have died
            _frozen_pids.discard(pid)
            _frozen_info.pop(pid, None)
            failed_count += 1

    data = _load_state()
    data["frozen"] = list(_frozen_info.values())
    data["stats"]["totalUnfrozen"] = data["stats"].get("totalUnfrozen", 0) + unfrozen_count
    _save_state(data)

    return {
        "success": unfrozen_count > 0,
        "unfrozenCount": unfrozen_count,
        "failedCount": failed_count,
        "totalFrozen": len(_frozen_pids),
        "message": f"Unfroze {unfrozen_count} process(es), {failed_count} failed",
    }


@register("app_freezer.status")
def app_freezer_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get app freezer status and statistics."""
    data = _load_state()
    config = data.get("config", _DEFAULT_CONFIG.copy())
    stats = data.get("stats", {})

    # Clean up dead frozen processes
    dead_pids: list[int] = []
    for pid in list(_frozen_pids):
        proc_info = _get_process_info(pid)
        if proc_info is None:
            dead_pids.append(pid)
            _frozen_pids.discard(pid)
            _frozen_info.pop(pid, None)

    if dead_pids:
        data["frozen"] = list(_frozen_info.values())
        _save_state(data)

    # Calculate total memory of frozen processes
    total_frozen_mem = sum(info.get("memoryMBAtFreeze", 0) for info in _frozen_info.values())

    return {
        "enabled": config.get("enabled", True),
        "autoFreeze": config.get("autoFreeze", False),
        "frozenCount": len(_frozen_pids),
        "totalFrozenMemoryMB": round(total_frozen_mem, 1),
        "maxFrozen": config.get("maxFrozen", 10),
        "config": config,
        "stats": {
            "totalFrozen": stats.get("totalFrozen", 0),
            "totalUnfrozen": stats.get("totalUnfrozen", 0),
            "totalBytesFreed": stats.get("totalBytesFreed", 0),
        },
        "supported": IS_WINDOWS,
    }


@register("app_freezer.configure")
@require_feature("app_freezer.configure")
def app_freezer_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update app freezer configuration. Pro only.

    Params (all optional):
        enabled: bool
        autoFreeze: bool — AI auto-freeze idle processes
        idleThresholdSeconds: int
        minMemoryMB: int
        maxFrozen: int
        protectedProcesses: list[str] — add to protected list
    """
    data = _load_state()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "autoFreeze" in params:
            config["autoFreeze"] = bool(params["autoFreeze"])
        if "idleThresholdSeconds" in params:
            config["idleThresholdSeconds"] = max(30, int(params["idleThresholdSeconds"]))
        if "minMemoryMB" in params:
            config["minMemoryMB"] = max(10, int(params["minMemoryMB"]))
        if "maxFrozen" in params:
            config["maxFrozen"] = max(1, int(params["maxFrozen"]))
        if "protectedProcesses" in params and isinstance(params["protectedProcesses"], list):
            existing = config.get("protectedProcesses", [])
            for p in params["protectedProcesses"]:
                if p not in existing:
                    existing.append(p)
            config["protectedProcesses"] = existing

    data["config"] = config
    _save_state(data)

    return {
        "success": True,
        "config": config,
        "message": "App freezer configuration updated",
    }
