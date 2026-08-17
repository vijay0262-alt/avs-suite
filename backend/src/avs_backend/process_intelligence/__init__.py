"""Process Intelligence backend module — read-only process enumeration.

Provides:
  - process_intelligence.scan — enumerate running processes with sensor data

This module is READ-ONLY. It does not:
  - terminate processes
  - modify process priorities
  - start/stop services
  - execute subprocesses
  - modify the registry
  - call scan_core, SafetyGate, RemediationCoordinator, or any executor

The RPC returns ProcessEntry[] data for the frontend AI Process Intelligence
engine. The frontend performs all analysis, classification, insight generation,
and recommendation creation.

Privacy: The response does NOT expose:
  - command-line arguments (may contain secrets)
  - full filesystem paths for non-system processes
  - registry keys
  - browser profile paths
  - environment variables
  - network connection details
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.process_intelligence")

# Maximum number of processes to return in a single scan.
_MAX_PROCESSES = 500

# Known process names for classification.
_BROWSER_NAMES = {
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe",
    "opera.exe", "vivaldi.exe", "iexplore.exe",
}
_DEV_NAMES = {
    "code.exe", "code - insiders.exe", "devenv.exe", "idea64.exe",
    "pycharm64.exe", "node.exe", "ruby.exe", "python.exe",
    "golang.exe", "java.exe", "eclipse.exe", "sublime_text.exe",
}
_SECURITY_NAMES = {
    "msmpeng.exe", "securityhealthservice.exe", "avp.exe", "ekrn.exe",
    "avgsvc.exe", "mbam.exe", "nortonsecurity.exe", "avastsvc.exe",
}
_SYSTEM_NAMES = {
    "system", "idle", "registry", "smss.exe", "csrss.exe",
    "wininit.exe", "services.exe", "lsass.exe", "svchost.exe",
    "fontdrvhost.exe", "dwm.exe", "winlogon.exe",
}
_UPDATER_KEYWORDS = {"update", "updater", "updateagent"}


def _classify_process(name: str, exe_path: str) -> str:
    """Classify a process into a category using heuristics."""
    lower_name = name.lower()

    if lower_name in _SYSTEM_NAMES:
        return "system"
    if lower_name in _BROWSER_NAMES:
        return "browser"
    if lower_name in _DEV_NAMES:
        return "development"
    if lower_name in _SECURITY_NAMES:
        return "security"
    if any(kw in lower_name for kw in _UPDATER_KEYWORDS):
        return "updater"
    if lower_name.endswith(".sys"):
        return "driver"

    # Check if it's a Windows/Microsoft process
    if exe_path:
        normalized = exe_path.replace("\\", "/").lower()
        if "/windows/" in normalized:
            return "windows"
        if "/program files/" in normalized or "/program files (x86)/" in normalized:
            return "user_application"
        if "/users/" in normalized or "/home/" in normalized:
            return "user_application"
        if "/appdata/" in normalized:
            return "background"

    return "unknown"


def _safety_level(category: str, signature_status: str) -> str:
    """Determine the safety level of a process."""
    if category == "system":
        return "critical_system"
    if category in ("windows", "microsoft") and signature_status == "valid":
        return "safe"
    if signature_status == "invalid":
        return "avoid"
    if signature_status in ("unsigned", "unknown", "expired"):
        return "review_recommended"
    return "safe"


def _sanitize_exe_path(exe_path: str, category: str) -> str:
    """Sanitize executable path — only expose Windows system paths."""
    if not exe_path:
        return ""
    if category in ("system", "windows"):
        return exe_path
    # Do not expose user application paths
    return ""


def _make_display_name(name: str, description: str | None) -> str:
    """Create a human-readable display name."""
    if description and description.strip():
        return description.strip()
    # Strip .exe extension
    base = name
    if base.lower().endswith(".exe"):
        base = base[:-4]
    # Replace dots and hyphens with spaces, title-case
    return base.replace(".", " ").replace("-", " ").strip().title()


def _map_priority(nice_value: int) -> str:
    """Map psutil nice/priority value to ProcessPriority enum."""
    if nice_value <= -15:
        return "realtime"
    if nice_value <= -5:
        return "high"
    if nice_value < 0:
        return "above_normal"
    if nice_value == 0:
        return "normal"
    if nice_value <= 5:
        return "below_normal"
    return "idle"


def _safe_get(proc: Any, attr: str, default: Any = None) -> Any:
    """Safely get an attribute from a psutil process."""
    try:
        return getattr(proc, attr)()
    except Exception:
        return default


@register("process_intelligence.scan")
def scan_processes(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Enumerate running processes and return ProcessEntry[] data.

    This is a read-only operation. No processes are terminated, modified,
    or started. The response is sanitized to protect privacy.
    """
    try:
        import psutil
    except ImportError:
        return {"ok": False, "error": "psutil not available"}

    start_time = time.time()
    entries: list[dict[str, Any]] = []

    try:
        # Establish CPU baseline for all processes (non-blocking)
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                proc.cpu_percent(interval=None)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception:
                continue

        # Single short sleep for CPU measurement
        time.sleep(0.1)

        for proc in psutil.process_iter(["pid", "name", "status"]):
            if len(entries) >= _MAX_PROCESSES:
                break

            try:
                pid = proc.info["pid"]
                name = proc.info["name"] or "unknown"

                # Get parent info
                parent_pid = 0
                parent_name = ""
                try:
                    parent = proc.parent()
                    if parent:
                        parent_pid = parent.pid
                        parent_name = parent.name() or ""
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

                # Get executable path (for classification only)
                exe_path = ""
                try:
                    exe_path = proc.exe() or ""
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass

                # Classify process
                category = _classify_process(name, exe_path)

                # Sanitize exe path — don't expose user paths
                sanitized_path = _sanitize_exe_path(exe_path, category)

                # Get memory info
                mem_info = _safe_get(proc, "memory_info")
                memory_bytes = mem_info.rss if mem_info and hasattr(mem_info, "rss") else 0
                private_bytes = mem_info.private if mem_info and hasattr(mem_info, "private") else 0
                virtual_bytes = mem_info.vms if mem_info and hasattr(mem_info, "vms") else 0

                memory_mb = memory_bytes / 1048576.0
                private_mb = private_bytes / 1048576.0
                virtual_mb = virtual_bytes / 1048576.0

                # Get CPU usage
                cpu_percent = 0.0
                try:
                    cpu_percent = proc.cpu_percent(interval=None)
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass

                # Get thread/handle counts
                thread_count = _safe_get(proc, "num_threads", 0) or 0
                handle_count = 0
                try:
                    handle_count = proc.num_handles() or 0
                except (AttributeError, psutil.AccessDenied):
                    pass

                # Get launch time
                launch_time = 0
                try:
                    launch_time = int(proc.create_time() * 1000)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

                # Get user account
                user_account = ""
                try:
                    user_account = proc.username() or ""
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

                # Get priority
                nice_value = 0
                try:
                    nice_value = proc.nice() or 0
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
                priority = _map_priority(nice_value)

                # Get disk I/O (cumulative bytes — rate is not per-snapshot)
                disk_read_bytes = 0
                disk_write_bytes = 0
                try:
                    io_counters = proc.io_counters()
                    if io_counters:
                        disk_read_bytes = io_counters.read_bytes or 0
                        disk_write_bytes = io_counters.write_bytes or 0
                except (AttributeError, psutil.AccessDenied, psutil.NoSuchProcess):
                    pass

                # Convert to MB/s (rough estimate based on process uptime)
                disk_read_mbps = disk_read_bytes / 1048576.0
                disk_write_mbps = disk_write_bytes / 1048576.0

                # Power draw estimate (rough heuristic from CPU usage)
                power_draw_w = cpu_percent * 0.3

                # Signature status (best-effort, default unknown)
                signature_status = "unknown"
                signature_issuer = ""

                # Check if process is a service
                is_service = category == "system"
                service_name = name.replace(".exe", "") if is_service else ""

                # Display name
                display_name = _make_display_name(name, None)

                # Publisher (best-effort)
                publisher = ""
                if category in ("system", "windows"):
                    publisher = "Microsoft Corporation"

                # Safety level
                safety = _safety_level(category, signature_status)

                # Integrity level (best-effort)
                integrity = "system" if category == "system" else "high"

                entry = {
                    "info": {
                        "pid": pid,
                        "name": name,
                        "displayName": display_name,
                        "parentPid": parent_pid,
                        "parentName": parent_name,
                        "publisher": publisher,
                        "description": display_name,
                        "executablePath": sanitized_path,
                        "signatureStatus": signature_status,
                        "signatureIssuer": signature_issuer,
                        "launchTime": launch_time,
                        "priority": priority,
                        "integrityLevel": integrity,
                        "threadCount": thread_count,
                        "handleCount": handle_count,
                        "windowTitle": "",
                        "userAccount": user_account,
                        "isService": is_service,
                        "serviceName": service_name,
                        "isStartupEntry": False,
                        "startupEntryName": "",
                        "category": category,
                        "safetyLevel": safety,
                    },
                    "sensors": {
                        "cpuUsagePercent": round(cpu_percent, 2),
                        "perCoreUsage": [],
                        "memoryMB": round(memory_mb, 2),
                        "privateMemoryMB": round(private_mb, 2),
                        "workingSetMB": round(memory_mb, 2),
                        "virtualMemoryMB": round(virtual_mb, 2),
                        "diskReadMBps": round(disk_read_mbps, 4),
                        "diskWriteMBps": round(disk_write_mbps, 4),
                        "gpuUsagePercent": 0,
                        "vramMB": 0,
                        "networkDownloadMbps": 0,
                        "networkUploadMbps": 0,
                        "powerDrawEstimateW": round(power_draw_w, 2),
                    },
                }
                entries.append(entry)

            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception as e:
                log.debug("Error processing entry: %s", e)
                continue

    except Exception as e:
        log.error("Process enumeration failed: %s", e)
        return {"ok": False, "error": f"Process enumeration failed: {e}"}

    scan_duration_ms = int((time.time() - start_time) * 1000)

    return {
        "ok": True,
        "entries": entries,
        "count": len(entries),
        "scanDurationMs": scan_duration_ms,
    }
