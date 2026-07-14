"""System information and live-metric handlers.

Only ``system.ping``, ``system.info``, ``system.healthScore`` and the
three ``metrics.*`` methods have working implementations in this initial
scaffold. Everything else lives as documented stubs in the individual
feature modules.
"""

from __future__ import annotations

import platform
from typing import Any

import psutil

from avs_backend.api.registry import register


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
