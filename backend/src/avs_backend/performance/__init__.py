"""Performance tuning and optimization modules."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
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


@register("performance.monitor.getMetrics")
def performance_monitor_get_metrics(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get real-time system performance metrics."""
    try:
        metrics = get_system_metrics()
        return metrics_to_dict(metrics)
    except Exception as e:
        logger.error(f"Failed to get performance metrics: {e}")
        raise
