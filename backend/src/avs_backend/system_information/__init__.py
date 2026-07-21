"""System information and live-metric handlers.

Provides comprehensive system information including CPU, memory, disk, GPU, network, and OS details.
Optimized with static/dynamic data separation for performance.
"""

from __future__ import annotations

import logging
import os
import platform
import re
import threading
from pathlib import Path
from typing import Any
from functools import lru_cache

import psutil

from avs_backend.api.registry import register

logger = logging.getLogger(__name__)

IS_WINDOWS = platform.system() == "Windows"

# Cache for static hardware information (refreshed only on explicit request)
_static_info_cache: dict[str, Any] | None = None
_static_info_lock = threading.Lock()


def _get_static_info() -> dict[str, Any]:
    """Get static hardware information that doesn't change frequently."""
    global _static_info_cache
    
    if _static_info_cache is not None:
        return _static_info_cache
    
    with _static_info_lock:
        if _static_info_cache is not None:
            return _static_info_cache

        # CPU Information (static)
        cpu_info = {
            "name": platform.processor(),
            "architecture": platform.machine(),
            "cores": psutil.cpu_count(logical=False),
            "logicalCores": psutil.cpu_count(logical=True),
            "maxFrequency": psutil.cpu_freq().max if psutil.cpu_freq() else 0,
        }

        # OS Information (static)
        os_info = {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "hostname": platform.node(),
            "bootTime": psutil.boot_time(),
        }

        _static_info_cache = {
            "cpu": cpu_info,
            "os": os_info,
        }

        return _static_info_cache


def _get_dynamic_info() -> dict[str, Any]:
    """Get dynamic information that changes frequently."""
    # CPU Usage (dynamic)
    cpu_usage = psutil.cpu_percent(interval=0.05)
    cpu_freq = psutil.cpu_freq()
    
    # Memory Information (dynamic)
    mem = psutil.virtual_memory()
    memory_info = {
        "total": mem.total,
        "available": mem.available,
        "used": mem.used,
        "free": mem.free,
        "percent": mem.percent,
        "currentFrequency": cpu_freq.current if cpu_freq else 0,
    }
    
    # Disk Information (dynamic - can be cached per drive)
    disk_info = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disk_info.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
            })
        except OSError:
            continue
    
    # Network Information (dynamic)
    network_info = {
        "interfaces": list(psutil.net_if_addrs().keys()),
        "io": psutil.net_io_counters()._asdict() if psutil.net_io_counters() else {},
    }
    
    # Process Information (dynamic)
    process_info = {
        "total": len(psutil.pids()),
        "running": len([p for p in psutil.process_iter(['status']) if p.info['status'] == 'running']),
    }
    
    return {
        "cpuUsage": cpu_usage,
        "memory": memory_info,
        "disk": disk_info,
        "network": network_info,
        "processes": process_info,
    }


@register("system.ping")
def system_ping(_params: dict[str, Any] | None) -> dict[str, bool]:
    """Health probe. Returns immediately; used by the Electron main
    process during startup to confirm the child is alive."""
    return {"pong": True}


@register("system.logs")
def system_logs(params: dict[str, Any] | None) -> dict[str, Any]:
    """Return the most recent lines from the backend log file.

    Used by the developer diagnostics page. Reads ``AVS_LOG_DIR/main.log``
    (or ``logs/main.log``) and parses the configured structured format.
    """
    limit = int((params or {}).get("limit", 100) or 100)
    if limit <= 1 or limit > 1000:
        limit = 100

    log_path = Path(os.environ.get("AVS_LOG_DIR", "logs")) / "main.log"
    entries: list[dict[str, str]] = []
    if not log_path.exists():
        return {"logs": entries}

    try:
        with log_path.open("r", encoding="utf-8") as fh:
            lines = fh.readlines()
        for raw in lines[-limit:]:
            line = raw.rstrip("\n")
            match = re.match(r"^\[([^\]]+)\]\s+\[([A-Z]+)\]\s+(.*)$", line)
            if match:
                entries.append(
                    {
                        "timestamp": match.group(1),
                        "level": match.group(2).lower(),
                        "message": match.group(3),
                    }
                )
            else:
                entries.append({"timestamp": "", "level": "info", "message": line})
    except OSError as e:
        logger.warning("Could not read backend log file %s: %s", log_path, e)

    return {"logs": entries}


@register("system.info")
def system_info(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Static system identity."""
    return {
        "os": platform.system(),
        "osRelease": platform.release(),
        "osVersion": platform.version(),
        "arch": platform.machine(),
        "processor": platform.processor(),
        "python": platform.python_version(),
        "hostname": platform.node(),
    }


@register("system.healthScore")
def system_health_score(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Composite 0-100 health score based on CPU, memory, and disk usage."""
    cpu = psutil.cpu_percent(interval=0.05)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("C:\\" if os.name == "nt" else "/")

    cpu_score = max(0.0, 100.0 - cpu)
    mem_score = max(0.0, 100.0 - mem.percent)
    disk_score = max(0.0, 100.0 - disk.percent)

    # Weighted: CPU 35%, memory 35%, disk 30%
    score = cpu_score * 0.35 + mem_score * 0.35 + disk_score * 0.30
    return {"score": round(score, 1), "capturedAt": _now_iso()}


@register("system.comprehensive")
def system_comprehensive(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Comprehensive system information (optimized with caching)."""
    try:
        static_info = _get_static_info()
        dynamic_info = _get_dynamic_info()
        
        return {
            **static_info,
            **dynamic_info,
            "capturedAt": _now_iso(),
        }
    except Exception as e:
        logger.error(f"Failed to get comprehensive system info: {e}")
        raise


@register("system.static")
def system_static(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get only static hardware information (cached)."""
    try:
        return _get_static_info()
    except Exception as e:
        logger.error(f"Failed to get static system info: {e}")
        raise


@register("system.dynamic")
def system_dynamic(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get only dynamic information (real-time metrics)."""
    try:
        return _get_dynamic_info()
    except Exception as e:
        logger.error(f"Failed to get dynamic system info: {e}")
        raise


@register("system.refreshCache")
def system_refresh_cache(_params: dict[str, Any] | None) -> dict[str, bool]:
    """Refresh the static information cache."""
    global _static_info_cache
    with _static_info_lock:
        _static_info_cache = None
    _get_static_info()  # Force refresh
    return {"success": True}


@register("metrics.cpu")
def metrics_cpu(_params: dict[str, Any] | None) -> dict[str, float]:
    return {"usage": psutil.cpu_percent(interval=0.05)}


@register("metrics.memory")
def metrics_memory(_params: dict[str, Any] | None) -> dict[str, float]:
    vm = psutil.virtual_memory()
    return {"total": float(vm.total), "used": float(vm.used), "usage": float(vm.percent)}


@register("metrics.disk")
def metrics_disk(_params: dict[str, Any] | None) -> list[dict[str, float | str]]:
    result: list[dict[str, float | str]] = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except OSError:
            continue
        result.append(
            {
                "mount": part.mountpoint,
                "total": float(usage.total),
                "used": float(usage.used),
                "usage": float(usage.percent),
            }
        )
    return result


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()

