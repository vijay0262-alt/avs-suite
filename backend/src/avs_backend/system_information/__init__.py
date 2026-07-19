"""System information and live-metric handlers.

Provides comprehensive system information including CPU, memory, disk, GPU, network, and OS details.
"""

from __future__ import annotations

import logging
import platform
from typing import Any

import psutil

from avs_backend.api.registry import register

logger = logging.getLogger(__name__)

IS_WINDOWS = platform.system() == "Windows"


@register("system.ping")
def system_ping(_params: dict[str, Any] | None) -> dict[str, bool]:
    """Health probe. Returns immediately; used by the Electron main
    process during startup to confirm the child is alive."""
    return {"pong": True}


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
    """Composite 0-100 health score.

    A production-grade weighting will be introduced with the metrics
    pipeline. For now we return a placeholder derived only from CPU
    load, so the dashboard renders a plausible number end-to-end.
    """
    cpu = psutil.cpu_percent(interval=0.05)
    score = max(0.0, 100.0 - cpu)
    return {"score": round(score, 1), "capturedAt": _now_iso()}


@register("system.comprehensive")
def system_comprehensive(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Comprehensive system information."""
    try:
        # CPU Information
        cpu_info = {
            "name": platform.processor(),
            "architecture": platform.machine(),
            "cores": psutil.cpu_count(logical=False),
            "logicalCores": psutil.cpu_count(logical=True),
            "maxFrequency": psutil.cpu_freq().max if psutil.cpu_freq() else 0,
            "currentFrequency": psutil.cpu_freq().current if psutil.cpu_freq() else 0,
        }

        # Memory Information
        mem = psutil.virtual_memory()
        memory_info = {
            "total": mem.total,
            "available": mem.available,
            "used": mem.used,
            "free": mem.free,
            "percent": mem.percent,
        }

        # Disk Information
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

        # Network Information
        network_info = {
            "interfaces": list(psutil.net_if_addrs().keys()),
            "io": psutil.net_io_counters()._asdict() if psutil.net_io_counters() else {},
        }

        # OS Information
        os_info = {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "hostname": platform.node(),
            "bootTime": psutil.boot_time(),
        }

        # Process Information
        process_info = {
            "total": len(psutil.pids()),
            "running": len([p for p in psutil.process_iter(['status']) if p.info['status'] == 'running']),
        }

        return {
            "cpu": cpu_info,
            "memory": memory_info,
            "disk": disk_info,
            "network": network_info,
            "os": os_info,
            "processes": process_info,
            "capturedAt": _now_iso(),
        }
    except Exception as e:
        logger.error(f"Failed to get comprehensive system info: {e}")
        raise


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
