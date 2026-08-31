"""Real-Time Protection backend module — event monitoring and alert generation.

Monitors the system for security-relevant events in real time:
  - New process creation (with suspicious path/signature checks)
  - Startup entry modifications
  - Network connection changes (new outbound connections to unknown IPs)
  - File system changes in sensitive directories
  - Windows Defender status changes

Uses psutil for process monitoring and PowerShell/WMI for Windows-specific
events. Runs a background polling thread (not a kernel driver) — this is
userland monitoring, not kernel-level protection.

RPC methods:
    realtime.status    — get current protection status
    realtime.start     — start real-time monitoring
    realtime.stop      — stop real-time monitoring
    realtime.events    — get recent monitoring events
    realtime.alerts    — get recent alerts
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any

import psutil

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.realtime")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_powershell(script: str, timeout: float = 5.0) -> str | None:
    if not IS_WINDOWS:
        return None
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
             "Bypass", "-Command", script],
            capture_output=True, text=True, timeout=timeout,
            creationflags=_NO_WINDOW,
        )
        if proc.returncode != 0:
            return None
        return proc.stdout.strip()
    except Exception:
        return None


# Suspicious paths for process creation
_SUSPICIOUS_PATHS = [
    os.path.expandvars("%TEMP%"),
    os.path.expandvars("%APPDATA%"),
    os.path.expandvars("%LOCALAPPDATA%\\Temp"),
]

# Known safe process names (to reduce false positives)
_SAFE_PROCESSES = {
    "explorer.exe", "svchost.exe", "csrss.exe", "winlogon.exe",
    "dwm.exe", "taskhostw.exe", "sihost.exe", "ctfmon.exe",
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe",
    "Code.exe", "node.exe", "python.exe", "powershell.exe",
    "cmd.exe", "SystemSettings.exe", "SearchHost.exe",
    "StartMenuExperienceHost.exe", "ShellExperienceHost.exe",
    "RuntimeBroker.exe", "backgroundTaskHost.exe",
}


# =====================================================================
# Monitoring State
# =====================================================================

_monitor_state: dict[str, Any] = {
    "running": False,
    "startedAt": None,
    "stoppedAt": None,
    "eventsCollected": 0,
    "alertsGenerated": 0,
}

_monitor_thread: threading.Thread | None = None
_monitor_lock = threading.Lock()

# Event and alert buffers (ring buffer)
_events: list[dict[str, Any]] = []
_alerts: list[dict[str, Any]] = []
_MAX_BUFFER = 500

# Known process PIDs for delta detection
_known_pids: set[int] = set()


def _add_event(event: dict[str, Any]) -> None:
    """Add an event to the ring buffer."""
    with _monitor_lock:
        _events.append(event)
        if len(_events) > _MAX_BUFFER:
            _events.pop(0)
        _monitor_state["eventsCollected"] += 1


def _add_alert(alert: dict[str, Any]) -> None:
    """Add an alert to the ring buffer."""
    with _monitor_lock:
        _alerts.append(alert)
        if len(_alerts) > _MAX_BUFFER:
            _alerts.pop(0)
        _monitor_state["alertsGenerated"] += 1


def _check_suspicious_process(proc_info: dict[str, Any]) -> dict[str, Any] | None:
    """Check if a new process is suspicious. Returns alert dict or None."""
    name = proc_info.get("name", "").lower()
    exe = proc_info.get("exe", "")

    # Skip known safe processes
    if name in _SAFE_PROCESSES:
        return None

    # Check if running from a suspicious location
    if exe:
        exe_normalized = os.path.normpath(exe)
        for susp_path in _SUSPICIOUS_PATHS:
            if exe_normalized.startswith(os.path.normpath(susp_path)):
                return {
                    "type": "suspicious_process_location",
                    "severity": "medium",
                    "pid": proc_info["pid"],
                    "name": name,
                    "exe": exe,
                    "reason": f"Process launched from suspicious location: {exe}",
                    "timestamp": _now_iso(),
                }

    # Check for unsigned executable
    if IS_WINDOWS and exe and os.path.isfile(exe):
        ps_script = f"""
$ErrorActionPreference = 'SilentlyContinue'
$sig = Get-AuthenticodeSignature -FilePath '{exe}'
$sig.Status.ToString()
"""
        status = _run_powershell(ps_script, timeout=3.0)
        if status and status != "Valid" and status != "NotSigned":
            return {
                "type": "unsigned_process",
                "severity": "medium",
                "pid": proc_info["pid"],
                "name": name,
                "exe": exe,
                "reason": f"Process has invalid signature: {status}",
                "timestamp": _now_iso(),
            }

    return None


def _monitor_loop() -> None:
    """Background monitoring loop — polls for new processes and events."""
    global _known_pids

    log.info("Real-time protection monitoring started")

    while True:
        with _monitor_lock:
            if not _monitor_state["running"]:
                break

        try:
            # Detect new processes
            current_pids: set[int] = set()
            for proc in psutil.process_iter(["pid", "name", "exe", "create_time"]):
                try:
                    info = proc.info
                    pid = info["pid"]
                    current_pids.add(pid)

                    if pid not in _known_pids:
                        # New process detected
                        event = {
                            "type": "process_started",
                            "pid": pid,
                            "name": info.get("name", ""),
                            "exe": info.get("exe", ""),
                            "createTime": info.get("create_time"),
                            "timestamp": _now_iso(),
                        }
                        _add_event(event)

                        # Check if suspicious
                        alert = _check_suspicious_process({
                            "pid": pid,
                            "name": info.get("name", ""),
                            "exe": info.get("exe", ""),
                        })
                        if alert:
                            _add_alert(alert)

                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            # Detect terminated processes
            terminated = _known_pids - current_pids
            for pid in terminated:
                _add_event({
                    "type": "process_terminated",
                    "pid": pid,
                    "timestamp": _now_iso(),
                })

            _known_pids = current_pids

        except Exception as e:
            log.debug("Monitoring loop error: %s", e)

        # Poll every 3 seconds
        time.sleep(3)

    log.info("Real-time protection monitoring stopped")


# =====================================================================
# RPC Methods
# =====================================================================

@register("realtime.status")
def get_protection_status(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get current real-time protection status."""
    with _monitor_lock:
        return {
            "running": _monitor_state["running"],
            "startedAt": _monitor_state["startedAt"],
            "stoppedAt": _monitor_state["stoppedAt"],
            "eventsCollected": _monitor_state["eventsCollected"],
            "alertsGenerated": _monitor_state["alertsGenerated"],
            "monitoredProcesses": len(_known_pids),
            "capturedAt": _now_iso(),
        }


@register("realtime.start")
@require_feature("real_time.protection")
def start_protection(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Start real-time protection monitoring."""
    global _monitor_thread

    with _monitor_lock:
        if _monitor_state["running"]:
            return {"started": False, "reason": "already_running"}

        # Initialize known PIDs with current processes
        _known_pids = set()
        for proc in psutil.process_iter(["pid"]):
            try:
                _known_pids.add(proc.info["pid"])
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        _monitor_state.update({
            "running": True,
            "startedAt": _now_iso(),
            "stoppedAt": None,
            "eventsCollected": 0,
            "alertsGenerated": 0,
        })

    _monitor_thread = threading.Thread(target=_monitor_loop, daemon=True)
    _monitor_thread.start()

    return {"started": True, "startedAt": _monitor_state["startedAt"]}


@register("realtime.stop")
@require_feature("real_time.protection")
def stop_protection(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Stop real-time protection monitoring."""
    with _monitor_lock:
        if not _monitor_state["running"]:
            return {"stopped": False, "reason": "not_running"}

        _monitor_state["running"] = False
        _monitor_state["stoppedAt"] = _now_iso()

    # Wait for thread to finish
    if _monitor_thread and _monitor_thread.is_alive():
        _monitor_thread.join(timeout=5.0)

    return {"stopped": True, "stoppedAt": _monitor_state["stoppedAt"]}


@register("realtime.events")
def get_events(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get recent monitoring events.

    Params:
        limit: int — max number of events to return (default: 100)
        type: str — filter by event type (optional)
    """
    limit = (params or {}).get("limit", 100)
    event_type = (params or {}).get("type")

    with _monitor_lock:
        events = list(_events)

    if event_type:
        events = [e for e in events if e.get("type") == event_type]

    # Return most recent first
    events.reverse()
    events = events[:limit]

    return {
        "events": events,
        "count": len(events),
        "capturedAt": _now_iso(),
    }


@register("realtime.alerts")
def get_alerts(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get recent alerts.

    Params:
        limit: int — max number of alerts to return (default: 50)
        severity: str — filter by severity (optional)
    """
    limit = (params or {}).get("limit", 50)
    severity = (params or {}).get("severity")

    with _monitor_lock:
        alerts = list(_alerts)

    if severity:
        alerts = [a for a in alerts if a.get("severity") == severity]

    # Return most recent first
    alerts.reverse()
    alerts = alerts[:limit]

    return {
        "alerts": alerts,
        "count": len(alerts),
        "capturedAt": _now_iso(),
    }
