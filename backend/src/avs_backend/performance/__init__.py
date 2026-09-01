"""Performance tuning and optimization modules."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature
from avs_backend.performance.memory_optimizer import (
    get_memory_info,
    optimize_memory,
    OptimizationResult,
    get_process_memory_info,
    check_optimization_permissions,
    ProcessMemoryInfo,
)
from avs_backend.performance.live_monitor import (
    get_system_metrics,
    metrics_to_dict,
    update_graph_history,
    get_graph_history,
    clear_graph_history,
    get_top_processes,
    generate_alerts,
    Alert,
    ProcessInfo,
)

logger = logging.getLogger(__name__)


@register("performance.memory.getInfo")
def performance_memory_get_info(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current memory usage statistics."""
    try:
        mem_info = get_memory_info()
        return {
            "totalRam": mem_info.total_ram,
            "usedRam": mem_info.used_ram,
            "freeRam": mem_info.free_ram,
            "cachedMemory": mem_info.cached_memory,
            "memoryPressure": mem_info.memory_pressure,
            "availableRam": mem_info.available_ram,
            "committedMemory": mem_info.committed_memory,
            "pageFileUsage": mem_info.page_file_usage,
            "memoryLoadPercent": mem_info.memory_load_percent,
        }
    except Exception as e:
        logger.error(f"Failed to get memory info: {e}")
        raise


@register("performance.memory.optimize")
@require_feature("performance.optimize")
def performance_memory_optimize(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Perform safe memory optimization."""
    from threading import Event

    cancel = Event()

    try:
        result = optimize_memory(cancel, None)
        return {
            "status": result.status.value,
            "memoryFreed": result.memory_freed,
            "optimizationTimeMs": result.optimization_time_ms,
            "processesOptimized": result.processes_optimized,
            "errors": result.errors,
            "healthImprovement": result.health_improvement,
            "beforeMemory": {
                "totalRam": result.before_memory.total_ram if result.before_memory else 0,
                "usedRam": result.before_memory.used_ram if result.before_memory else 0,
                "freeRam": result.before_memory.free_ram if result.before_memory else 0,
                "cachedMemory": result.before_memory.cached_memory if result.before_memory else 0,
                "memoryPressure": result.before_memory.memory_pressure if result.before_memory else 0,
                "committedMemory": result.before_memory.committed_memory if result.before_memory else 0,
                "pageFileUsage": result.before_memory.page_file_usage if result.before_memory else 0,
                "memoryLoadPercent": result.before_memory.memory_load_percent if result.before_memory else 0,
            } if result.before_memory else None,
            "afterMemory": {
                "totalRam": result.after_memory.total_ram if result.after_memory else 0,
                "usedRam": result.after_memory.used_ram if result.after_memory else 0,
                "freeRam": result.after_memory.free_ram if result.after_memory else 0,
                "cachedMemory": result.after_memory.cached_memory if result.after_memory else 0,
                "memoryPressure": result.after_memory.memory_pressure if result.after_memory else 0,
                "committedMemory": result.after_memory.committed_memory if result.after_memory else 0,
                "pageFileUsage": result.after_memory.page_file_usage if result.after_memory else 0,
                "memoryLoadPercent": result.after_memory.memory_load_percent if result.after_memory else 0,
            } if result.after_memory else None,
        }
    except Exception as e:
        logger.error(f"Memory optimization failed: {e}")
        raise


@register("performance.memory.getProcesses")
def performance_memory_get_processes(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get process memory information with sorting."""
    try:
        sort_by = params.get("sortBy", "memory") if params else "memory"
        limit = params.get("limit", 50) if params else 50
        
        processes = get_process_memory_info(sort_by=sort_by, limit=limit)
        return {
            "processes": [
                {
                    "pid": p.pid,
                    "name": p.name,
                    "memoryUsage": p.memory_usage,
                    "workingSet": p.working_set,
                    "privateBytes": p.private_bytes,
                    "status": p.status,
                    "cpuPercent": p.cpu_percent,
                }
                for p in processes
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get process memory info: {e}")
        raise


@register("performance.memory.checkPermissions")
def performance_memory_check_permissions(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Check if optimization is available due to permissions."""
    try:
        return check_optimization_permissions()
    except Exception as e:
        logger.error(f"Failed to check optimization permissions: {e}")
        raise


import threading
import time as _time

_metrics_lock = threading.Lock()
_last_metrics = None
_last_metrics_ts = 0.0
_METRICS_TTL = 2.0


@register("performance.monitor.getMetrics")
def performance_monitor_get_metrics(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get real-time system performance metrics."""
    try:
        metrics = get_system_metrics()
        # Update graph history with current metrics
        update_graph_history(metrics)
        # Cache for getAlerts to reuse
        global _last_metrics, _last_metrics_ts
        with _metrics_lock:
            _last_metrics = metrics
            _last_metrics_ts = _time.monotonic()
        return metrics_to_dict(metrics)
    except Exception as e:
        logger.error(f"Failed to get performance metrics: {e}")
        raise


@register("performance.monitor.getGraphHistory")
def performance_monitor_get_graph_history(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get graph history for live charts."""
    try:
        return get_graph_history()
    except Exception as e:
        logger.error(f"Failed to get graph history: {e}")
        raise


@register("performance.monitor.clearGraphHistory")
def performance_monitor_clear_graph_history(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear graph history."""
    try:
        clear_graph_history()
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to clear graph history: {e}")
        raise


@register("performance.monitor.getTopProcesses")
def performance_monitor_get_top_processes(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get top processes by CPU or memory usage."""
    try:
        sort_by = params.get("sortBy", "cpu") if params else "cpu"
        limit = params.get("limit", 10) if params else 10
        search = params.get("search", "") if params else ""
        
        processes = get_top_processes(sort_by=sort_by, limit=limit, search=search)
        return {
            "processes": [
                {
                    "pid": p.pid,
                    "name": p.name,
                    "cpuPercent": p.cpu_percent,
                    "memoryBytes": p.memory_bytes,
                    "status": p.status,
                }
                for p in processes
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get top processes: {e}")
        raise


@register("performance.monitor.getAlerts")
def performance_monitor_get_alerts(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current performance alerts."""
    try:
        # Reuse cached metrics if fresh enough (avoid redundant CPU sampling)
        metrics = None
        with _metrics_lock:
            if _last_metrics is not None and (_time.monotonic() - _last_metrics_ts) < _METRICS_TTL:
                metrics = _last_metrics
        if metrics is None:
            metrics = get_system_metrics()
        alerts = generate_alerts(metrics)
        return {
            "alerts": [
                {
                    "type": a.alert_type,
                    "severity": a.severity,
                    "message": a.message,
                    "value": a.value,
                    "threshold": a.threshold,
                }
                for a in alerts
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get alerts: {e}")
        raise


# ── Process Optimization: detect and kill high-resource processes ─────

_CRITICAL_PROCESSES = {
    "System", "System Idle Process", "Registry", "smss.exe", "csrss.exe",
    "wininit.exe", "services.exe", "lsass.exe", "svchost.exe", "winlogon.exe",
    "fontdrvhost.exe", "dwm.exe", "explorer.exe", "Taskmgr.exe",
    "AVS AI Shield.exe", "electron.exe", "node.exe",
    "powershell.exe", "python.exe", "pwsh.exe",
}

_CPU_THRESHOLD = 50.0
_MEM_THRESHOLD_PERCENT = 10.0
_DISK_THRESHOLD = 50.0


@register("performance.optimizeProcesses")
@require_feature("performance.optimizeProcesses")
def performance_optimize_processes(params: dict[str, Any] | None) -> dict[str, Any]:
    """Detect and optionally terminate processes consuming excessive resources.

    Params:
        kill: bool — if True, terminate detected processes (default: False)
        cpuThreshold: float — CPU % above which a process is flagged (default: 50)
        memThresholdPercent: float — memory % above which a process is flagged (default: 10)
        diskThreshold: float — disk I/O MB/s above which a process is flagged (default: 50)

    Returns list of detected processes and which were terminated.
    Critical system processes are never killed.
    """
    try:
        import psutil

        should_kill = params.get("kill", False) if params else False
        cpu_thresh = params.get("cpuThreshold", _CPU_THRESHOLD) if params else _CPU_THRESHOLD
        mem_thresh_pct = params.get("memThresholdPercent", _MEM_THRESHOLD_PERCENT) if params else _MEM_THRESHOLD_PERCENT
        disk_thresh = params.get("diskThreshold", _DISK_THRESHOLD) if params else _DISK_THRESHOLD

        total_mem = psutil.virtual_memory().total
        mem_thresh_bytes = total_mem * (mem_thresh_pct / 100.0)

        detected: list[dict[str, Any]] = []
        killed: list[dict[str, Any]] = []
        errors: list[str] = []

        # Get disk I/O counters per process if available
        disk_io_before: dict[int, tuple[float, float]] = {}
        try:
            for p in psutil.process_iter(["pid"]):
                try:
                    io = p.io_counters()
                    disk_io_before[p.pid] = (io.read_bytes, io.write_bytes)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception:
            pass

        import time as _t
        _t.sleep(0.5)

        for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "io_counters"]):
            try:
                info = proc.info
                name = info.get("name", "unknown")
                pid = info.get("pid", 0)
                cpu = info.get("cpu_percent", 0.0) or 0.0
                mem_info = info.get("memory_info")
                mem_bytes = mem_info.rss if mem_info else 0

                # Disk I/O rate
                disk_mbps = 0.0
                io = info.get("io_counters")
                if io and pid in disk_io_before:
                    prev_read, prev_write = disk_io_before[pid]
                    delta = (io.read_bytes - prev_read) + (io.write_bytes - prev_write)
                    disk_mbps = (delta / 0.5) / (1024 * 1024)  # MB/s

                is_high = cpu >= cpu_thresh or mem_bytes >= mem_thresh_bytes or disk_mbps >= disk_thresh
                if not is_high:
                    continue

                is_critical = name in _CRITICAL_PROCESSES
                entry = {
                    "pid": pid,
                    "name": name,
                    "cpuPercent": round(cpu, 1),
                    "memoryMB": round(mem_bytes / (1024 * 1024), 1),
                    "diskMBps": round(disk_mbps, 1),
                    "reason": (
                        "high CPU" if cpu >= cpu_thresh else
                        "high memory" if mem_bytes >= mem_thresh_bytes else
                        "high disk I/O"
                    ),
                    "critical": is_critical,
                }
                detected.append(entry)

                if should_kill and not is_critical:
                    try:
                        proc.terminate()
                        killed.append({"pid": pid, "name": name, "terminated": True})
                    except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
                        errors.append(f"Cannot terminate {name} (PID {pid}): {e}")
                        killed.append({"pid": pid, "name": name, "terminated": False})

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        return {
            "detected": detected,
            "killed": killed,
            "errors": errors,
            "totalDetected": len(detected),
            "totalKilled": len([k for k in killed if k.get("terminated")]),
            "thresholds": {
                "cpuPercent": cpu_thresh,
                "memoryPercent": mem_thresh_pct,
                "diskMBps": disk_thresh,
            },
        }
    except Exception as e:
        logger.error(f"Failed to optimize processes: {e}")
        raise
