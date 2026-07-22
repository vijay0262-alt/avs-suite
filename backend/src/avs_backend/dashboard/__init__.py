"""System Health Dashboard — real-time metrics, health score, and optimization.

Provides comprehensive system monitoring and one-click optimization
with minimal CPU overhead (<1%).
"""

from __future__ import annotations

import ctypes
import functools
import logging
import os
import platform
import re
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
from datetime import datetime, timezone
from typing import Any, Callable

import psutil

from avs_backend.api.registry import register

log = logging.getLogger("avs.dashboard")

# Dashboard is Windows-specific
IS_WINDOWS = platform.system() == "Windows"

# Flag to spawn subprocesses without flashing a console window on Windows.
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0


def _ttl_cache(ttl_seconds: float) -> Callable[[Callable[[], Any]], Callable[[], Any]]:
    """Cache the result of a zero-argument function for ``ttl_seconds``.

    Security and hardware queries are expensive (they shell out to
    PowerShell) but change rarely, so we avoid running them on every
    metrics poll. Thread-safe via an internal lock.
    If another thread is already computing the value, callers will wait
    up to 5 seconds for the result, then fall back to the last cached
    value (or None if never cached).
    """

    def decorator(fn: Callable[[], Any]) -> Callable[[], Any]:
        state: dict[str, Any] = {"value": None, "ts": 0.0, "set": False}
        lock = threading.Lock()

        @functools.wraps(fn)
        def wrapper() -> Any:
            now = time.monotonic()
            if state["set"] and (now - state["ts"]) < ttl_seconds:
                return state["value"]
            acquired = lock.acquire(timeout=5.0)
            if not acquired:
                # Another thread is computing — return stale value if available
                if state["set"]:
                    return state["value"]
                return None
            try:
                # Double-check after acquiring lock to avoid duplicate work
                now = time.monotonic()
                if state["set"] and (now - state["ts"]) < ttl_seconds:
                    return state["value"]
                value = fn()
                state.update(value=value, ts=now, set=True)
                return value
            finally:
                lock.release()

        wrapper.cache_clear = lambda: state.update(value=None, ts=0.0, set=False)  # type: ignore[attr-defined]
        return wrapper

    return decorator


def _run_powershell(script: str, timeout: float = 4.0) -> str | None:
    """Run a PowerShell command; return trimmed stdout, or None on failure."""
    if not IS_WINDOWS:
        return None
    try:
        proc = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=_NO_WINDOW,
        )
        if proc.returncode != 0:
            return None
        return proc.stdout.strip()
    except Exception as e:  # noqa: BLE001 — best-effort probe
        log.debug("PowerShell query failed: %s", e)
        return None

# =====================================================================
# RPC Methods
# =====================================================================


@_ttl_cache(15.0)
def _collect_metrics() -> dict[str, Any]:
    """Run all metric collectors in parallel and cache the snapshot."""
    collectors = [
        ("cpu", _get_cpu_metrics),
        ("memory", _get_memory_metrics),
        ("storage", _get_storage_metrics),
        ("windows", _get_windows_info),
        ("security", _get_security_metrics),
        ("performance", _get_performance_metrics),
    ]
    results: dict[str, Any] = {}
    _DEFAULTS: dict[str, Any] = {
        "cpu": {"usage": 0, "frequency": 0, "logicalProcessors": 0, "physicalProcessors": 0, "processes": 0, "threads": 0, "temperature": None},
        "memory": {"total": 0, "used": 0, "available": 0, "usage": 0, "cached": 0, "swapTotal": 0, "swapUsed": 0, "swapUsage": 0},
        "storage": [],
        "windows": {},
        "security": {"defender": {}, "firewall": {}, "updates": {}, "realTimeProtection": False, "smartScreen": False},
        "performance": {"startupApps": 0, "backgroundProcesses": 0, "temporaryFilesSize": 0, "recycleBinSize": 0, "browserCacheSize": 0, "potentialRecoverable": 0, "memoryPressure": 0.0},
    }
    pool = ThreadPoolExecutor(max_workers=len(collectors))
    futures = {pool.submit(fn): name for name, fn in collectors}
    try:
        for fut in as_completed(futures, timeout=15.0):
            name = futures[fut]
            try:
                results[name] = fut.result()
            except Exception as e:
                log.warning("Collector %s failed: %s", name, e)
                results[name] = _DEFAULTS.get(name, {})
    except FuturesTimeoutError:
        log.warning("Some dashboard collectors timed out after 15s")
    # Fill in any missing results (timed out futures)
    for fut, name in futures.items():
        if name not in results:
            log.warning("Collector %s timed out", name)
            results[name] = _DEFAULTS.get(name, {})
            fut.cancel()
    # Don't wait for slow threads — release the pool immediately
    pool.shutdown(wait=False)
    results["capturedAt"] = _now_iso()
    return results


# =====================================================================
# Live metrics background refresh
# =====================================================================

_LIVE_REFRESH_INTERVAL = 1.0  # seconds
_live_metrics: dict[str, Any] = {}
_live_metrics_lock = threading.Lock()
_live_metrics_running = True
_prev_live_net_io = None


def _get_live_cpu_metrics() -> dict[str, Any]:
    """Get lightweight CPU metrics for the live feed."""
    usage = psutil.cpu_percent(interval=0.05)
    cores = psutil.cpu_count(logical=True) or 0
    physical = psutil.cpu_count(logical=False) or 0
    freq = psutil.cpu_freq()
    temperature: float | None = None
    try:
        if hasattr(psutil, 'sensors_temperatures'):
            temps = psutil.sensors_temperatures()
            if temps:
                for name, entries in temps.items():
                    if 'cpu' in name.lower() or 'core' in name.lower():
                        if entries:
                            temperature = entries[0].current
                            break
    except Exception:
        pass
    return {
        "usage": usage,
        "frequency": int(round((freq.current if freq else 0.0))),
        "logicalProcessors": cores,
        "physicalProcessors": physical,
        "processes": 0,
        "threads": 0,
        "temperature": temperature,
    }


def _get_live_memory_metrics() -> dict[str, Any]:
    """Get lightweight memory metrics for the live feed."""
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory() if hasattr(psutil, 'swap_memory') else None
    return {
        "total": mem.total,
        "used": mem.used,
        "available": mem.available,
        "usage": mem.percent,
        "cached": getattr(mem, 'cached', 0),
        "swapTotal": swap.total if swap else 0,
        "swapUsed": swap.used if swap else 0,
        "swapUsage": round(swap.percent, 1) if swap else 0.0,
    }


def _get_live_storage_metrics() -> list[dict[str, Any]]:
    """Get lightweight storage metrics for the live feed."""
    drives: list[dict[str, Any]] = []
    try:
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                drives.append({
                    "mount": part.mountpoint,
                    "name": _get_drive_name(part.mountpoint),
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "usage": round(usage.percent, 1),
                    "isSSD": _is_ssd(part.mountpoint),
                    "fileSystem": part.fstype,
                })
            except (OSError, PermissionError):
                continue
    except Exception as e:
        log.warning("Failed to get live storage metrics: %s", e)
    return drives


def _get_live_network_metrics() -> dict[str, Any]:
    """Get lightweight network metrics for the live feed."""
    global _prev_live_net_io
    counters = psutil.net_io_counters()
    if not counters:
        return {"uploadSpeed": 0.0, "downloadSpeed": 0.0, "totalBytesSent": 0, "totalBytesReceived": 0}

    upload = 0.0
    download = 0.0
    if _prev_live_net_io:
        upload = max(0.0, (counters.bytes_sent - _prev_live_net_io.bytes_sent) / _LIVE_REFRESH_INTERVAL)
        download = max(0.0, (counters.bytes_recv - _prev_live_net_io.bytes_recv) / _LIVE_REFRESH_INTERVAL)

    _prev_live_net_io = counters
    return {
        "uploadSpeed": upload,
        "downloadSpeed": download,
        "totalBytesSent": counters.bytes_sent,
        "totalBytesReceived": counters.bytes_recv,
    }


def _refresh_live_metrics() -> None:
    """Refresh the cached live metrics snapshot."""
    global _live_metrics
    try:
        snapshot = {
            "cpu": _get_live_cpu_metrics(),
            "memory": _get_live_memory_metrics(),
            "storage": _get_live_storage_metrics(),
            "network": _get_live_network_metrics(),
            "capturedAt": _now_iso(),
        }
        with _live_metrics_lock:
            _live_metrics = snapshot
    except Exception as e:
        log.debug("Live metrics refresh failed: %s", e)


def _live_metrics_loop() -> None:
    """Background daemon that keeps _live_metrics fresh."""
    while _live_metrics_running:
        start = time.monotonic()
        _refresh_live_metrics()
        elapsed = time.monotonic() - start
        time.sleep(max(0.0, _LIVE_REFRESH_INTERVAL - elapsed))


# Live metrics background loop started at end of module (after all helpers defined)


@register("dashboard.live")
def dashboard_live(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Return the latest cached live snapshot (<100ms)."""
    _ensure_live_metrics_thread()
    with _live_metrics_lock:
        snapshot = _live_metrics.copy()
    if snapshot:
        return snapshot
    # Return a minimal valid structure so the frontend doesn't crash
    # while the background loop warms up the first snapshot.
    return {
        "cpu": {"usage": 0, "frequency": 0, "logicalProcessors": 0, "physicalProcessors": 0, "processes": 0, "threads": 0, "temperature": None},
        "memory": {"total": 0, "used": 0, "available": 0, "usage": 0, "cached": 0, "swapTotal": 0, "swapUsed": 0, "swapUsage": 0},
        "storage": [],
        "network": {"uploadSpeed": 0.0, "downloadSpeed": 0.0, "totalBytesSent": 0, "totalBytesReceived": 0},
        "capturedAt": _now_iso(),
    }


@register("dashboard.metrics")
def dashboard_metrics(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Collect all real-time system metrics with minimal overhead."""
    if not IS_WINDOWS:
        try:
            return _get_stub_metrics()
        except NameError:
            pass
    else:
        try:
            return _collect_metrics()
        except NameError:
            pass
    # Fallback: return a minimal valid structure so the frontend doesn't
    # crash while the module is still importing in a background thread.
    return {
        "cpu": {"usage": 0, "frequency": 0, "logicalProcessors": 0, "physicalProcessors": 0, "processes": 0, "threads": 0, "temperature": None},
        "memory": {"total": 0, "used": 0, "available": 0, "usage": 0, "cached": 0, "swapTotal": 0, "swapUsed": 0, "swapUsage": 0},
        "storage": [],
        "windows": {},
        "security": {"defender": {}, "firewall": {}, "updates": {}, "realTimeProtection": False, "smartScreen": False},
        "performance": {"startupApps": 0, "backgroundProcesses": 0, "temporaryFilesSize": 0, "recycleBinSize": 0, "browserCacheSize": 0, "potentialRecoverable": 0, "memoryPressure": 0.0},
        "capturedAt": _now_iso(),
    }


@register("dashboard.refreshCache")
def dashboard_refresh_cache(_params: dict[str, Any] | None) -> dict[str, bool]:
    """Invalidate the cached metrics snapshot so the next ``dashboard.metrics``
    call performs a fresh collection instead of returning a stale value.

    This must be called by the frontend after any optimization/cleaning
    action (Junk Cleaner, Startup Manager, Privacy Cleaner, Registry
    Cleaner, One-Click Optimize) so the Dashboard reflects real, current
    system state rather than the pre-optimization snapshot.
    """
    try:
        _collect_metrics.cache_clear()  # type: ignore[attr-defined]
    except (NameError, AttributeError):
        pass
    try:
        _calculate_health_score.cache_clear()  # type: ignore[attr-defined]
    except (NameError, AttributeError):
        pass
    return {"refreshed": True}


_last_metrics_snapshot: dict[str, Any] | None = None
_metrics_lock = threading.Lock()


def _get_cached_metrics() -> dict[str, Any]:
    """Return the last-known metrics without forcing a fresh collection.
    
    If _collect_metrics is cached, returns the cached value.
    Otherwise returns the last snapshot or a minimal default.
    This ensures the health engine never triggers expensive scans.
    """
    global _last_metrics_snapshot
    try:
        cached = _collect_metrics()
        if cached:
            with _metrics_lock:
                _last_metrics_snapshot = cached
            return cached
    except (NameError, AttributeError):
        pass
    if _last_metrics_snapshot is not None:
        return _last_metrics_snapshot
    # Minimal default so health calculation doesn't crash
    return {
        "cpu": {"usage": 0, "frequency": 0, "logicalProcessors": 0, "physicalProcessors": 0, "processes": 0, "threads": 0, "temperature": None},
        "memory": {"total": 0, "used": 0, "available": 0, "usage": 0, "cached": 0, "swapTotal": 0, "swapUsed": 0, "swapUsage": 0},
        "storage": [],
        "windows": {},
        "security": {"defender": {}, "firewall": {}, "updates": {}, "realTimeProtection": False, "smartScreen": False},
        "performance": {"startupApps": 0, "backgroundProcesses": 0, "temporaryFilesSize": 0, "recycleBinSize": 0, "browserCacheSize": 0, "potentialRecoverable": 0, "memoryPressure": 0.0},
        "capturedAt": _now_iso(),
    }


@_ttl_cache(10.0)
def _calculate_health_score() -> dict[str, Any]:
    """Calculate health score from cached metrics. Never triggers scans."""
    metrics = _get_cached_metrics()
    
    cpu_score = _calculate_cpu_score(metrics["cpu"])
    memory_score = _calculate_memory_score(metrics["memory"])
    storage_score = _calculate_storage_score(metrics["storage"])
    security_score = _calculate_security_score(metrics["security"])
    performance_score = _calculate_performance_score(metrics["performance"])
    
    weights = {
        "cpu": 0.25,
        "memory": 0.25,
        "storage": 0.20,
        "security": 0.15,
        "performance": 0.15,
    }
    
    overall_score = (
        cpu_score * weights["cpu"] +
        memory_score * weights["memory"] +
        storage_score * weights["storage"] +
        security_score * weights["security"] +
        performance_score * weights["performance"]
    )
    
    overall_score = max(0, min(100, round(overall_score, 1)))
    
    return {
        "overallScore": overall_score,
        "categoryScores": {
            "cpu": round(cpu_score, 1),
            "memory": round(memory_score, 1),
            "storage": round(storage_score, 1),
            "security": round(security_score, 1),
            "performance": round(performance_score, 1),
        },
        "status": _get_health_status(overall_score),
        "suggestions": _generate_suggestions(metrics, {
            "cpu": cpu_score,
            "memory": memory_score,
            "storage": storage_score,
            "security": security_score,
            "performance": performance_score,
        }),
        "capturedAt": _now_iso(),
    }


@register("dashboard.health")
def dashboard_health(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Calculate comprehensive health score with category breakdown.
    
    Uses cached metrics only — never triggers fresh scans.
    """
    if not IS_WINDOWS:
        try:
            return _get_stub_health()
        except NameError:
            return {}
    try:
        return _calculate_health_score()
    except (NameError, KeyError, TypeError):
        return {}


@register("dashboard.optimize.preview")
def dashboard_optimize_preview(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Preview what One Click Optimize will clean."""
    if not IS_WINDOWS:
        return _get_stub_optimize_preview()
    temp_size = _get_temp_files_size() or 0
    recycle_bin_size = _get_recycle_bin_size() or 0
    browser_cache_size = _estimate_browser_cache_size() or 0
    thumbnail_cache_size = _get_thumbnail_cache_size() or 0
    prefetch_size = _get_prefetch_size() or 0
    update_cache_size = _get_windows_update_cache_size() or 0
    
    total_recoverable = temp_size + recycle_bin_size + browser_cache_size + thumbnail_cache_size + prefetch_size + update_cache_size
    
    actions = []
    if temp_size > 0:
        actions.append({
            "name": "Temporary Files",
            "size": temp_size,
            "description": "Windows and user temporary files"
        })
    if recycle_bin_size > 0:
        actions.append({
            "name": "Recycle Bin",
            "size": recycle_bin_size,
            "description": "Files in Recycle Bin"
        })
    if browser_cache_size > 0:
        actions.append({
            "name": "Browser Cache",
            "size": browser_cache_size,
            "description": "Browser temporary files and cache"
        })
    if thumbnail_cache_size > 0:
        actions.append({
            "name": "Thumbnail Cache",
            "size": thumbnail_cache_size,
            "description": "Windows thumbnail and icon cache"
        })
    if prefetch_size > 0:
        actions.append({
            "name": "Prefetch Files",
            "size": prefetch_size,
            "description": "Windows application prefetch files (auto-regenerated)"
        })
    if update_cache_size > 0:
        actions.append({
            "name": "Windows Update Cache",
            "size": update_cache_size,
            "description": "Downloaded Windows Update packages retained after install"
        })
    
    # Always include these non-size actions
    actions.extend([
        {"name": "Flush DNS", "size": 0, "description": "Clear DNS resolver cache"},
        {"name": "Refresh Explorer", "size": 0, "description": "Restart Windows Explorer"},
    ])
    
    return {
        "totalRecoverable": total_recoverable,
        "actions": actions,
        "estimatedTime": _estimate_optimization_time(total_recoverable),
    }


@register("dashboard.optimize.execute")
def dashboard_optimize_execute(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Execute One Click Optimize."""
    if not IS_WINDOWS:
        return _get_stub_optimize_execute()
    start_time = time.monotonic()
    
    results = {
        "temporaryFiles": {"cleaned": False, "size": 0, "error": None},
        "recycleBin": {"cleaned": False, "size": 0, "error": None},
        "browserCache": {"cleaned": False, "size": 0, "error": None},
        "thumbnailCache": {"cleaned": False, "size": 0, "error": None},
        "prefetchFiles": {"cleaned": False, "size": 0, "error": None},
        "windowsUpdateCache": {"cleaned": False, "size": 0, "error": None},
        "flushDNS": {"cleaned": False, "error": None},
        "refreshExplorer": {"cleaned": False, "error": None},
        "memoryTrim": {"cleaned": False, "error": None},
    }
    
    # Temporary files
    try:
        temp_size_before = _get_temp_files_size()
        _clean_temp_files()
        temp_size_after = _get_temp_files_size()
        actual_recovered = max(0, temp_size_before - temp_size_after)
        results["temporaryFiles"] = {"cleaned": True, "size": actual_recovered, "error": None}
    except Exception as e:
        results["temporaryFiles"]["error"] = str(e)
        log.warning("Failed to clean temp files: %s", e)
    
    # Recycle Bin
    try:
        recycle_size_before = _get_recycle_bin_size()
        if recycle_size_before > 0:
            from avs_backend.cleaner.recycle_bin import empty_recycle_bin
            empty_recycle_bin()
        recycle_size_after = _get_recycle_bin_size()
        actual_recycle_recovered = max(0, recycle_size_before - recycle_size_after)
        results["recycleBin"] = {"cleaned": True, "size": actual_recycle_recovered, "error": None}
    except Exception as e:
        results["recycleBin"]["error"] = str(e)
        log.warning("Failed to empty Recycle Bin: %s", e)
    
    # Browser cache
    try:
        browser_size_before = _estimate_browser_cache_size()
        _clean_browser_cache()
        browser_size_after = _estimate_browser_cache_size()
        actual_browser_recovered = max(0, browser_size_before - browser_size_after)
        results["browserCache"] = {"cleaned": True, "size": actual_browser_recovered, "error": None}
    except Exception as e:
        results["browserCache"]["error"] = str(e)
        log.warning("Failed to clean browser cache: %s", e)
    
    # Thumbnail cache
    try:
        thumb_size_before = _get_thumbnail_cache_size()
        _clean_thumbnail_cache()
        thumb_size_after = _get_thumbnail_cache_size()
        actual_thumb_recovered = max(0, thumb_size_before - thumb_size_after)
        results["thumbnailCache"] = {"cleaned": True, "size": actual_thumb_recovered, "error": None}
    except Exception as e:
        results["thumbnailCache"]["error"] = str(e)
        log.warning("Failed to clean thumbnail cache: %s", e)
    
    # Prefetch files
    try:
        prefetch_size_before = _get_prefetch_size()
        _clean_prefetch()
        prefetch_size_after = _get_prefetch_size()
        actual_prefetch_recovered = max(0, prefetch_size_before - prefetch_size_after)
        results["prefetchFiles"] = {"cleaned": True, "size": actual_prefetch_recovered, "error": None}
    except Exception as e:
        results["prefetchFiles"]["error"] = str(e)
        log.warning("Failed to clean prefetch files: %s", e)
    
    # Windows Update cache
    try:
        update_size_before = _get_windows_update_cache_size()
        _clean_windows_update_cache()
        update_size_after = _get_windows_update_cache_size()
        actual_update_recovered = max(0, update_size_before - update_size_after)
        results["windowsUpdateCache"] = {"cleaned": True, "size": actual_update_recovered, "error": None}
    except Exception as e:
        results["windowsUpdateCache"]["error"] = str(e)
        log.warning("Failed to clean Windows Update cache: %s", e)
    
    # Flush DNS
    try:
        _flush_dns()
        results["flushDNS"] = {"cleaned": True, "error": None}
    except Exception as e:
        results["flushDNS"]["error"] = str(e)
        log.warning("Failed to flush DNS: %s", e)
    
    # Refresh Explorer
    try:
        _refresh_explorer()
        results["refreshExplorer"] = {"cleaned": True, "error": None}
    except Exception as e:
        results["refreshExplorer"]["error"] = str(e)
        log.warning("Failed to refresh Explorer: %s", e)
    
    # Memory trim (optional, Windows only)
    if os.name == "nt":
        try:
            _trim_memory()
            results["memoryTrim"] = {"cleaned": True, "error": None}
        except Exception as e:
            results["memoryTrim"]["error"] = str(e)
            log.warning("Failed to trim memory: %s", e)
    
    total_recovered = sum(
        r.get("size", 0) for r in results.values()
        if isinstance(r, dict) and "size" in r
    )
    
    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    # These actions change temp files / recycle bin / browser cache — all
    # inputs to _collect_metrics(). Invalidate the cached snapshot so the
    # very next dashboard.metrics call reflects what we just did, instead
    # of returning the pre-optimization snapshot for up to 15 more seconds.
    _collect_metrics.cache_clear()  # type: ignore[attr-defined]

    return {
        "success": True,
        "totalRecovered": total_recovered,
        "results": results,
        "elapsedMs": elapsed_ms,
        "completedAt": _now_iso(),
    }


# =====================================================================
# Metric Collection Functions
# =====================================================================


def _get_cpu_metrics() -> dict[str, Any]:
    """Collect CPU metrics with minimal overhead."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.01)
        cpu_freq = psutil.cpu_freq()
        cpu_count = psutil.cpu_count(logical=True)
        cpu_count_phys = psutil.cpu_count(logical=False)
        
        # Process and thread counts
        proc_count = len(psutil.pids())
        
        return {
            "usage": round(cpu_percent, 1),
            "frequency": round(cpu_freq.current if cpu_freq else 0, 1),
            "logicalProcessors": cpu_count or 0,
            "physicalProcessors": cpu_count_phys or 0,
            "processes": proc_count,
            "threads": _get_thread_count(),
            "temperature": _get_cpu_temperature(),
        }
    except Exception as e:
        log.warning("Failed to get CPU metrics: %s", e)
        return {
            "usage": 0,
            "frequency": 0,
            "logicalProcessors": 0,
            "physicalProcessors": 0,
            "processes": 0,
            "threads": 0,
            "temperature": None,
        }


def _get_memory_metrics() -> dict[str, Any]:
    """Collect memory metrics."""
    try:
        vm = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        return {
            "total": vm.total,
            "used": vm.used,
            "available": vm.available,
            "usage": round(vm.percent, 1),
            "cached": getattr(vm, "cached", 0),
            "swapTotal": swap.total,
            "swapUsed": swap.used,
            "swapUsage": round(swap.percent, 1),
        }
    except Exception as e:
        log.warning("Failed to get memory metrics: %s", e)
        return {
            "total": 0,
            "used": 0,
            "available": 0,
            "usage": 0,
            "cached": 0,
            "swapTotal": 0,
            "swapUsed": 0,
            "swapUsage": 0,
        }


def _get_storage_metrics() -> list[dict[str, Any]]:
    """Collect storage metrics for all drives."""

    def _build_drive(part: Any) -> dict[str, Any] | None:
        try:
            usage = psutil.disk_usage(part.mountpoint)
            return {
                "mount": part.mountpoint,
                "name": _get_drive_name(part.mountpoint),
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "usage": round(usage.percent, 1),
                "isSSD": _is_ssd(part.mountpoint),
                "fileSystem": part.fstype,
            }
        except (OSError, PermissionError):
            return None

    drives: list[dict[str, Any]] = []
    try:
        partitions = psutil.disk_partitions(all=False)
        pool = ThreadPoolExecutor(max_workers=len(partitions) or 1)
        futures = [pool.submit(_build_drive, part) for part in partitions]
        for future in futures:
            try:
                drive = future.result(timeout=10.0)
                if drive:
                    drives.append(drive)
            except Exception as e:
                log.warning("Storage sub-collector failed: %s", e)
        pool.shutdown(wait=False)
    except Exception as e:
        log.warning("Failed to get storage metrics: %s", e)

    return drives


def _get_windows_info() -> dict[str, Any]:
    """Collect Windows system information."""
    try:
        if os.name != "nt":
            return {}
        
        import ctypes.wintypes
        
        # Windows version
        version = platform.version()
        build = platform.win32_ver()[1] if hasattr(platform, 'win32_ver') else ""
        
        # Uptime
        uptime = time.time() - psutil.boot_time()
        
        # Administrator status, power mode, battery, secure boot, TPM (parallel)
        pool = ThreadPoolExecutor(max_workers=5)
        windows_futures = {
            "is_admin": pool.submit(_is_admin),
            "power_mode": pool.submit(_get_power_mode),
            "battery": pool.submit(_get_battery_info),
            "secure_boot": pool.submit(_get_secure_boot_status),
            "tpm_status": pool.submit(_get_tpm_status),
        }
        windows_results = {}
        for name, fut in windows_futures.items():
            try:
                windows_results[name] = fut.result(timeout=10.0)
            except Exception as e:
                log.warning("Windows info sub-collector %s failed: %s", name, e)
                windows_results[name] = {}
        pool.shutdown(wait=False)

        return {
            "version": version,
            "build": build,
            "uptime": uptime,
            "isAdministrator": windows_results["is_admin"],
            "powerMode": windows_results["power_mode"],
            "battery": windows_results["battery"],
            "secureBoot": windows_results["secure_boot"],
            "tpmStatus": windows_results["tpm_status"],
        }
    except Exception as e:
        log.warning("Failed to get Windows info: %s", e)
        return {}


def _get_security_metrics() -> dict[str, Any]:
    """Collect security-related metrics."""
    try:
        if os.name != "nt":
            return {}
        
        # Run security probes in parallel (each may shell out to PowerShell)
        pool = ThreadPoolExecutor(max_workers=4)
        security_futures = {
            "defender": pool.submit(_get_defender_status),
            "firewall": pool.submit(_get_firewall_status),
            "updates": pool.submit(_get_windows_update_status),
            "smart_screen": pool.submit(_get_smartscreen_status),
        }
        security_results = {}
        for name, fut in security_futures.items():
            try:
                security_results[name] = fut.result(timeout=10.0)
            except Exception as e:
                log.warning("Security sub-collector %s failed: %s", name, e)
                security_results[name] = {}
        pool.shutdown(wait=False)

        return {
            "defender": security_results["defender"],
            "firewall": security_results["firewall"],
            "updates": security_results["updates"],
            "realTimeProtection": security_results["defender"].get("realTimeProtection", False),
            "smartScreen": security_results["smart_screen"],
        }
    except Exception as e:
        log.warning("Failed to get security metrics: %s", e)
        return {}


def _get_performance_metrics() -> dict[str, Any]:
    """Collect performance-related metrics."""
    try:
        # Run performance probes in parallel
        perf_tasks = [
            ("startup_apps", _get_startup_apps_count),
            ("background_procs", _get_background_processes_count),
            ("temp_size", _get_temp_files_size),
            ("recycle_size", _get_recycle_bin_size),
            ("browser_cache", _estimate_browser_cache_size),
            ("memory_pressure", _get_memory_pressure),
        ]
        pool = ThreadPoolExecutor(max_workers=len(perf_tasks))
        perf_futures = {
            name: pool.submit(fn) for name, fn in perf_tasks
        }
        perf_results = {}
        for name, fut in perf_futures.items():
            try:
                perf_results[name] = fut.result(timeout=10.0)
            except Exception as e:
                log.warning("Perf sub-collector %s failed: %s", name, e)
                perf_results[name] = 0
        pool.shutdown(wait=False)

        return {
            "startupApps": perf_results["startup_apps"] or 0,
            "backgroundProcesses": perf_results["background_procs"] or 0,
            "temporaryFilesSize": perf_results["temp_size"] or 0,
            "recycleBinSize": perf_results["recycle_size"] or 0,
            "browserCacheSize": perf_results["browser_cache"] or 0,
            "potentialRecoverable": (
                (perf_results["temp_size"] or 0)
                + (perf_results["recycle_size"] or 0)
                + (perf_results["browser_cache"] or 0)
            ),
            "memoryPressure": perf_results["memory_pressure"] or 0.0,
        }
    except Exception as e:
        log.warning("Failed to get performance metrics: %s", e)
        return {
            "startupApps": 0,
            "backgroundProcesses": 0,
            "temporaryFilesSize": 0,
            "recycleBinSize": 0,
            "browserCacheSize": 0,
            "potentialRecoverable": 0,
            "memoryPressure": 0.0,
        }


# =====================================================================
# Health Score Calculation
# =====================================================================


def _calculate_cpu_score(cpu_metrics: dict[str, Any]) -> float:
    """Calculate CPU health score (0-100)."""
    usage = cpu_metrics.get("usage", 0)
    
    # Lower CPU usage = higher score
    if usage < 20:
        return 100
    elif usage < 40:
        return 90
    elif usage < 60:
        return 70
    elif usage < 80:
        return 50
    else:
        return 30


def _calculate_memory_score(memory_metrics: dict[str, Any]) -> float:
    """Calculate memory health score (0-100)."""
    usage = memory_metrics.get("usage", 0)
    
    # Lower memory usage = higher score
    if usage < 50:
        return 100
    elif usage < 70:
        return 80
    elif usage < 85:
        return 60
    else:
        return 40


def _calculate_storage_score(storage_metrics: list[dict[str, Any]]) -> float:
    """Calculate storage health score (0-100)."""
    if not storage_metrics:
        return 100
    
    # Use the worst drive (highest usage)
    max_usage = max((d.get("usage", 0) for d in storage_metrics), default=0)
    
    # Lower disk usage = higher score
    if max_usage < 50:
        return 100
    elif max_usage < 70:
        return 80
    elif max_usage < 85:
        return 60
    elif max_usage < 95:
        return 40
    else:
        return 20


def _calculate_security_score(security_metrics: dict[str, Any]) -> float:
    """Calculate security health score (0-100)."""
    if not security_metrics:
        return 50
    
    score = 100
    
    defender = security_metrics.get("defender", {})
    firewall = security_metrics.get("firewall", {})
    third_party_av = defender.get("thirdPartyAV") or firewall.get("thirdPartyAV")
    
    if not third_party_av:
        if not defender.get("enabled", False):
            score -= 30
        if not defender.get("realTimeProtection", False):
            score -= 20
        if not firewall.get("enabled", False):
            score -= 20
    else:
        # Third-party AV is active — Defender/Firewall being off is expected
        # Only penalize for pending updates and smart screen
        pass
    
    updates = security_metrics.get("updates", {})
    if updates.get("pendingUpdates", 0) > 0:
        score -= 15
    
    return max(0, score)


def _calculate_performance_score(perf_metrics: dict[str, Any]) -> float:
    """Calculate performance health score (0-100)."""
    score = 100

    startup_apps = perf_metrics.get("startupApps", 0)
    if startup_apps > 15:
        score -= 25
    elif startup_apps > 10:
        score -= 15
    elif startup_apps > 5:
        score -= 5

    temp_size = perf_metrics.get("temporaryFilesSize", 0)
    if temp_size > 5 * 1024 * 1024 * 1024:  # > 5GB
        score -= 15
    elif temp_size > 1 * 1024 * 1024 * 1024:  # > 1GB
        score -= 5

    recycle_size = perf_metrics.get("recycleBinSize", 0)
    if recycle_size > 1 * 1024 * 1024 * 1024:  # > 1GB
        score -= 10

    memory_pressure = perf_metrics.get("memoryPressure", 0)
    if memory_pressure > 0.9:
        score -= 20
    elif memory_pressure > 0.8:
        score -= 10

    return max(0, score)


def _get_health_status(score: float) -> str:
    """Get health status label from score."""
    if score >= 90:
        return "excellent"
    elif score >= 75:
        return "good"
    elif score >= 60:
        return "fair"
    elif score >= 40:
        return "poor"
    else:
        return "critical"


def _generate_suggestions(metrics: dict[str, Any], scores: dict[str, float]) -> list[str]:
    """Generate actionable suggestions based on metrics and scores."""
    suggestions = []

    if scores["cpu"] < 70:
        suggestions.append("High CPU usage detected. Check for resource-intensive applications.")

    if scores["memory"] < 70:
        suggestions.append("High memory usage. Consider running Memory Optimizer to free up RAM.")

    if metrics["performance"].get("memoryPressure", 0) > 0.8:
        suggestions.append("High memory pressure detected. Memory optimization recommended.")

    if scores["storage"] < 70:
        suggestions.append("Low disk space. Run Junk Cleaner to free up space.")

    if scores["security"] < 80:
        suggestions.append("Security issues detected. Ensure Windows Defender and Firewall are enabled.")

    if scores["performance"] < 70:
        suggestions.append("Performance can be improved. Disable unnecessary startup apps and clean temporary files.")

    if metrics["performance"]["startupApps"] > 10:
        suggestions.append(f"{metrics['performance']['startupApps']} startup apps slowing boot. Use Startup Manager to disable unnecessary apps.")

    if metrics["performance"]["startupApps"] > 5:
        suggestions.append(f"{metrics['performance']['startupApps']} startup apps detected. Review in Startup Manager.")

    if metrics["performance"]["temporaryFilesSize"] > 500 * 1024 * 1024:
        suggestions.append("Large temporary files detected. Run One Click Optimize to clean them.")

    if metrics["performance"]["recycleBinSize"] > 100 * 1024 * 1024:
        suggestions.append("Recycle Bin contains large files. Empty it to free up space.")

    if metrics["performance"]["browserCacheSize"] > 500 * 1024 * 1024:
        suggestions.append("Large browser cache detected. Clean browser caches to free up space.")

    if not suggestions:
        suggestions.append("Your system is in good health. Keep up the good work!")

    return suggestions[:5]  # Limit to 5 suggestions


# =====================================================================
# Helper Functions
# =====================================================================


def _get_memory_pressure() -> float:
    """Get memory pressure from Memory Optimizer."""
    try:
        from avs_backend.performance.memory_optimizer import get_memory_info
        mem_info = get_memory_info()
        return mem_info.memory_pressure
    except Exception:
        # Fallback to psutil if Memory Optimizer fails
        try:
            vm = psutil.virtual_memory()
            return vm.percent / 100.0
        except Exception:
            return 0.0


# Startup-app scanning is slow (~4s). Warm the value in the background once the
# module is imported and serve the last-known value synchronously.
_startup_apps_value: int = 0
_startup_apps_ready: bool = False


def _refresh_startup_apps() -> None:
    global _startup_apps_value, _startup_apps_ready
    try:
        from avs_backend.startup.startup_manager import scan_startup_entries
        _startup_apps_value = len(scan_startup_entries())
    except Exception:
        pass
    _startup_apps_ready = True


threading.Thread(target=_refresh_startup_apps, daemon=True).start()


def _get_startup_apps_count() -> int:
    """Get count of startup applications."""
    if _startup_apps_ready:
        return _startup_apps_value
    return 0


def _get_background_processes_count() -> int:
    """Get count of background processes."""
    try:
        return len(psutil.pids())
    except Exception:
        return 0


def _scan_dir_fast(root: str, max_files: int = 2000) -> tuple[int, int]:
    """Recursively scan a directory tree using os.scandir.

    Returns (total_bytes, file_count).  Uses os.scandir instead of os.walk
    because DirEntry.stat() is cached by the OS and avoids a second stat
    syscall per file.  Stops after *max_files* files to bound runtime.
    """
    total = 0
    count = 0
    try:
        with os.scandir(root) as it:
            for entry in it:
                if count >= max_files:
                    break
                try:
                    if entry.is_dir(follow_symlinks=False):
                        sub_total, sub_count = _scan_dir_fast(entry.path, max_files - count)
                        total += sub_total
                        count += sub_count
                    elif entry.is_file(follow_symlinks=False):
                        total += entry.stat().st_size
                        count += 1
                except (OSError, PermissionError):
                    continue
    except (OSError, PermissionError):
        pass
    return total, count


@_ttl_cache(60.0)
def _get_temp_files_size() -> int:
    """Get total size of temporary files (user temp + Windows temp).

    Cached for 60 seconds — temp file size doesn't change rapidly.
    """
    total_size = 0
    temp_dirs = [
        os.environ.get("TEMP", ""),
        os.path.expandvars(r"%SystemRoot%\Temp"),
    ]
    for temp_dir in temp_dirs:
        if not temp_dir or not os.path.exists(temp_dir):
            continue
        size, _ = _scan_dir_fast(temp_dir, max_files=2000)
        total_size += size
    return total_size


@_ttl_cache(60.0)
def _get_recycle_bin_size() -> int:
    """Get total size of Recycle Bin. Cached for 60 seconds."""
    try:
        recycle_bin = os.path.join(os.environ.get("SystemDrive", "C:"), "$Recycle.Bin")
        if not os.path.exists(recycle_bin):
            return 0
        total, _ = _scan_dir_fast(recycle_bin, max_files=2000)
        return total
    except Exception:
        return 0


@_ttl_cache(60.0)
def _estimate_browser_cache_size() -> int:
    """Estimate browser cache size for all supported browsers.

    Cached for 60 seconds — browser cache doesn't change rapidly.
    """
    try:
        total_size = 0
        browser_cache_dirs = [
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data", "Default", "Cache"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data", "Default", "Code Cache"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data", "Default", "Cache"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data", "Default", "Code Cache"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "User Data", "Default", "Cache"),
            os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera Stable", "Cache"),
            os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera GX Stable", "Cache"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "User Data", "Default", "Cache"),
            os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles"),
        ]

        for cache_dir in browser_cache_dirs:
            if os.path.exists(cache_dir):
                size, _ = _scan_dir_fast(cache_dir, max_files=2000)
                total_size += size
        return total_size
    except Exception:
        return 0


def _now_iso() -> str:
    """Get current UTC time in ISO format."""
    return datetime.now(timezone.utc).isoformat()


_thread_count_value: int = 0
_thread_count_ready: bool = False


def _refresh_thread_count() -> None:
    global _thread_count_value, _thread_count_ready
    try:
        count = 0
        for p in psutil.process_iter(['threads']):
            try:
                threads = p.info.get('threads')
                if threads:
                    count += len(threads)
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                continue
        _thread_count_value = count
    except Exception:
        pass
    _thread_count_ready = True


threading.Thread(target=_refresh_thread_count, daemon=True).start()


def _periodic_refresh_thread_count() -> None:
    while True:
        time.sleep(30.0)
        _refresh_thread_count()


threading.Thread(target=_periodic_refresh_thread_count, daemon=True).start()


def _get_thread_count() -> int:
    """Get total thread count (served from background cache)."""
    return _thread_count_value if _thread_count_ready else 0


def _get_cpu_temperature() -> float | None:
    """Get CPU temperature if available."""
    try:
        # sensors_temperatures() is Linux-only; on Windows it raises NotImplementedError
        if IS_WINDOWS:
            return None
        temps = psutil.sensors_temperatures()
        if temps:
            for name, entries in temps.items():
                if entries:
                    return round(entries[0].current, 1)
    except Exception:
        pass
    return None


@_ttl_cache(3600.0)
def _all_disks_are_ssd() -> bool:
    """Return True when every physical disk reports MediaType == SSD.

    Cached for the process lifetime (hardware does not change at runtime).
    """
    total = _run_powershell("(Get-PhysicalDisk | Measure-Object).Count")
    ssd = _run_powershell(
        "(Get-PhysicalDisk | Where-Object { $_.MediaType -eq 'SSD' } | Measure-Object).Count"
    )
    try:
        total_count = int(total) if total else 0
        ssd_count = int(ssd) if ssd else 0
    except ValueError:
        return False
    return total_count > 0 and ssd_count == total_count


# The all-SSD probe shells out to PowerShell and can take several seconds.
# Warm it in a background thread once the module loads so the dashboard
# does not block on the first metrics request.
_all_disks_ssd_value: bool = False
_all_disks_ssd_ready: bool = False


def _refresh_all_disks_ssd() -> None:
    global _all_disks_ssd_value, _all_disks_ssd_ready
    try:
        _all_disks_ssd_value = _all_disks_are_ssd()
    except Exception:
        pass
    _all_disks_ssd_ready = True


threading.Thread(target=_refresh_all_disks_ssd, daemon=True).start()


def _is_ssd(mount: str) -> bool:
    """Check if a drive is backed by SSD storage (Windows only).

    Per-partition mapping is expensive, so we approximate: report SSD only
    when all physical disks are SSD to avoid false positives. The real value
    is populated asynchronously in the background.
    """
    if os.name != "nt":
        return False
    if _all_disks_ssd_ready:
        return _all_disks_ssd_value
    return False


def _get_drive_name(mount: str) -> str:
    """Get friendly drive name."""
    if os.name == "nt":
        # Windows: C:\ -> C:
        return mount[:2] if len(mount) >= 2 else mount
    return mount


def _is_admin() -> bool:
    """Check if running as administrator."""
    if os.name != "nt":
        return False
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


@_ttl_cache(30.0)
def _get_power_mode() -> str:
    """Get the active Windows power plan name."""
    if os.name != "nt":
        return "unknown"
    out = _run_powershell("powercfg /getactivescheme")
    if not out:
        return "unknown"
    low = out.lower()
    if "high performance" in low:
        return "high performance"
    if "power saver" in low:
        return "power saver"
    if "balanced" in low:
        return "balanced"
    match = re.search(r"\(([^)]+)\)", out)
    return match.group(1).lower() if match else "custom"


def _get_battery_info() -> dict[str, Any] | None:
    """Get battery information."""
    try:
        battery = psutil.sensors_battery()
        if battery:
            return {
                "percent": battery.percent,
                "powerPlugged": battery.power_plugged,
            }
    except Exception:
        pass
    return None


@_ttl_cache(3600.0)
def _get_secure_boot_status() -> bool:
    """Check Secure Boot status (Windows 8+). Cached for the process life."""
    if os.name != "nt":
        return False
    out = _run_powershell("try { Confirm-SecureBootUEFI } catch { 'False' }")
    return bool(out) and out.strip().lower() == "true"


@_ttl_cache(3600.0)
def _get_tpm_status() -> bool:
    """Check whether a TPM is present. Cached for the process life."""
    if os.name != "nt":
        return False
    out = _run_powershell("try { (Get-Tpm).TpmPresent } catch { 'False' }")
    return bool(out) and out.strip().lower() == "true"


@_ttl_cache(60.0)
def _get_third_party_antivirus() -> str | None:
    """Detect third-party antivirus software via Windows Security Center.

    Returns the product name if a third-party AV is active, or None if
    only Windows Defender is present.

    Uses Get-CimInstance to query the SecurityCenter2 namespace which
    lists registered security products. If a non-Microsoft product is
    found with active protection, we return its name.
    """
    if os.name != "nt":
        return None
    try:
        ps_script = (
            "$ErrorActionPreference = 'SilentlyContinue';"
            "$products = Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntivirusProduct;"
            "if ($products) {"
            "  foreach ($p in $products) {"
            "    if ($p.displayName -notmatch 'Windows Defender|Microsoft Defender') {"
            "      Write-Output $p.displayName;"
            "      break;"
            "    }"
            "  }"
            "}"
        )
        out = _run_powershell(ps_script, timeout=3.0)
        if out and out.strip():
            return out.strip()
        return None
    except Exception:
        return None


@_ttl_cache(60.0)
def _get_defender_status() -> dict[str, Any]:
    """Get Windows Defender status via Windows Registry.

    Uses winreg instead of PowerShell for <1ms response time.
    Falls back to PowerShell if registry keys are not found.
    """
    if os.name != "nt":
        return {}

    # Check if a third-party AV is active first
    third_party = _get_third_party_antivirus()
    if third_party:
        return {
            "enabled": True,
            "realTimeProtection": True,
            "thirdPartyAV": third_party,
        }

    # Try registry first — much faster than PowerShell
    try:
        import winreg
        # Defender AntiSpywareEnabled: 0=disabled, 1=enabled
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows Defender\Real-Time Protection",
        ) as key:
            rtp_value, _ = winreg.QueryValueEx(key, "DisableRealtimeMonitoring")
            rtp = rtp_value == 0  # 0 means real-time protection is ON

        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows Defender",
        ) as key:
            av_value, _ = winreg.QueryValueEx(key, "DisableAntiSpyware")
            enabled = av_value == 0  # 0 means Defender is enabled

        return {"enabled": enabled, "realTimeProtection": rtp, "thirdPartyAV": None}
    except (FileNotFoundError, OSError):
        pass

    # Fallback to PowerShell if registry keys are not found
    out = _run_powershell(
        "$s = Get-MpComputerStatus; "
        "Write-Output \"$($s.AntivirusEnabled),$($s.RealTimeProtectionEnabled)\"",
        timeout=1.5,
    )
    if not out:
        return {"enabled": False, "realTimeProtection": False, "thirdPartyAV": None}
    parts = out.split(",")
    enabled = parts[0].strip().lower() == "true"
    rtp = len(parts) > 1 and parts[1].strip().lower() == "true"
    return {"enabled": enabled, "realTimeProtection": rtp, "thirdPartyAV": None}


@_ttl_cache(60.0)
def _get_firewall_status() -> dict[str, Any]:
    """Get Windows Firewall status via Windows Registry.

    Uses winreg instead of PowerShell for <1ms response time.
    Checks DomainProfile, StandardProfile, and PublicProfile EnableFirewall keys.
    """
    if os.name != "nt":
        return {}

    # Try registry first
    try:
        import winreg
        profiles = [
            r"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\DomainProfile",
            r"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\StandardProfile",
            r"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\PublicProfile",
        ]
        any_enabled = False
        for profile_path in profiles:
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, profile_path) as key:
                    value, _ = winreg.QueryValueEx(key, "EnableFirewall")
                    if value == 1:
                        any_enabled = True
                        break
            except (FileNotFoundError, OSError):
                continue

        if not any_enabled:
            # Check if 3rd-party AV is managing firewall
            third_party = _get_third_party_antivirus()
            if third_party:
                return {"enabled": True, "thirdPartyAV": third_party}
        return {"enabled": any_enabled}
    except (OSError, Exception):
        pass

    # Fallback to PowerShell
    out = _run_powershell(
        "(Get-NetFirewallProfile | Where-Object { $_.Enabled -eq 'True' } | "
        "Measure-Object).Count",
        timeout=1.5,
    )
    if out is None:
        third_party = _get_third_party_antivirus()
        if third_party:
            return {"enabled": True, "thirdPartyAV": third_party}
        return {"enabled": False}
    try:
        enabled = int(out) > 0
        if not enabled:
            third_party = _get_third_party_antivirus()
            if third_party:
                return {"enabled": True, "thirdPartyAV": third_party}
        return {"enabled": enabled}
    except ValueError:
        return {"enabled": False}


@_ttl_cache(300.0)
def _get_windows_update_status() -> dict[str, Any]:
    """Get the count of pending Windows updates and last install date.

    Uses PowerShell to query the Windows Update COM API. Cached for 5 minutes
    since the COM call can be slow.
    """
    if os.name != "nt":
        return {}
    try:
        # Use PowerShell to query pending updates via COM API
        ps_script = (
            "$ErrorActionPreference = 'SilentlyContinue';"
            "$session = New-Object -ComObject Microsoft.Update.Session;"
            "$searcher = $session.CreateUpdateSearcher();"
            "$result = $searcher.Search('IsInstalled=0 and Type=\\'Software\\'');"
            "Write-Output $result.Updates.Count;"
            "$history = $searcher.QueryHistory(0, 1);"
            "if ($history.Count -gt 0) { Write-Output $history.Item(0).Date }"
        )
        out = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True, text=True, timeout=8,
        )
        lines = [l.strip() for l in out.stdout.strip().split("\n") if l.strip()]
        pending = int(lines[0]) if lines and lines[0].isdigit() else 0
        last_date = lines[1] if len(lines) > 1 else None
        return {"pendingUpdates": pending, "lastUpdateDate": last_date}
    except Exception as e:
        log.warning("Failed to get Windows Update status: %s", e)
        return {"pendingUpdates": 0, "lastUpdateDate": None}


@_ttl_cache(3600.0)
def _get_last_update_date() -> str | None:
    """Get the install date of the most recent hotfix."""
    if os.name != "nt":
        return None
    out = _run_powershell(
        "$h = Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1; "
        "if ($h -and $h.InstalledOn) { $h.InstalledOn.ToString('o') }"
    )
    return out or None


@_ttl_cache(300.0)
def _get_smartscreen_status() -> bool:
    """Get Windows SmartScreen status from the registry via winreg."""
    if os.name != "nt":
        return False
    try:
        import winreg
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer",
        ) as key:
            value, _ = winreg.QueryValueEx(key, "SmartScreenEnabled")
            return str(value).lower() in ("requireadmin", "prompt", "warn", "on")
    except (FileNotFoundError, OSError):
        return False


def _get_thumbnail_cache_size() -> int:
    """Get Windows thumbnail and icon cache size."""
    try:
        thumb_dir = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Explorer")
        if os.path.exists(thumb_dir):
            total = 0
            for file in os.listdir(thumb_dir):
                lower = file.lower()
                if lower.startswith(("thumbcache_", "iconcache_")):
                    try:
                        total += os.path.getsize(os.path.join(thumb_dir, file))
                    except (OSError, PermissionError):
                        continue
            return total
    except Exception:
        pass
    return 0


def _estimate_optimization_time(size_bytes: int) -> int:
    """Estimate optimization time in seconds."""
    # Rough estimate: 1GB takes about 10 seconds
    size_gb = size_bytes / (1024 ** 3)
    return max(5, int(size_gb * 10))


# =====================================================================
# Optimization Functions
# =====================================================================


def _clean_temp_files() -> None:
    """Clean temporary files from both user temp and Windows temp."""
    import shutil

    temp_dirs = [
        tempfile.gettempdir(),
        os.path.expandvars(r"%SystemRoot%\Temp"),
    ]
    for temp_dir in temp_dirs:
        if not os.path.exists(temp_dir):
            continue
        for item in os.listdir(temp_dir):
            try:
                item_path = os.path.join(temp_dir, item)
                if os.path.isfile(item_path):
                    os.unlink(item_path)
                elif os.path.isdir(item_path):
                    shutil.rmtree(item_path)
            except (OSError, PermissionError):
                continue


def _clean_browser_cache() -> None:
    """Clean browser cache for all supported browsers."""
    import shutil

    cache_dirs = [
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache"),
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Code Cache"),
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache"),
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Code Cache"),
        os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Cache"),
        os.path.expandvars(r"%APPDATA%\Opera Software\Opera Stable\Cache"),
        os.path.expandvars(r"%APPDATA%\Opera Software\Opera GX Stable\Cache"),
        os.path.expandvars(r"%LOCALAPPDATA%\Vivaldi\User Data\Default\Cache"),
    ]
    # Add Firefox profile caches
    firefox_profiles = os.path.expandvars(r"%APPDATA%\Mozilla\Firefox\Profiles")
    if os.path.exists(firefox_profiles):
        try:
            for entry in os.scandir(firefox_profiles):
                if entry.is_dir(follow_symlinks=False):
                    cache2 = os.path.join(entry.path, "cache2")
                    if os.path.exists(cache2):
                        cache_dirs.append(cache2)
        except OSError:
            pass

    for cache_dir in cache_dirs:
        if os.path.exists(cache_dir):
            try:
                shutil.rmtree(cache_dir)
            except (OSError, PermissionError):
                continue


def _clean_thumbnail_cache() -> None:
    """Clean Windows thumbnail and icon cache."""
    thumb_dir = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Explorer")
    if os.path.exists(thumb_dir):
        for file in os.listdir(thumb_dir):
            lower = file.lower()
            if lower.startswith(("thumbcache_", "iconcache_")):
                try:
                    os.unlink(os.path.join(thumb_dir, file))
                except (OSError, PermissionError):
                    continue


def _flush_dns() -> None:
    """Flush DNS resolver cache."""
    if os.name == "nt":
        subprocess.run(["ipconfig", "/flushdns"], capture_output=True)


def _refresh_explorer() -> None:
    """Restart Windows Explorer."""
    if os.name == "nt":
        try:
            subprocess.run(["taskkill", "/f", "/im", "explorer.exe"], capture_output=True)
            time.sleep(1)
            subprocess.run(["start", "explorer.exe"], shell=True)
        except Exception as e:
            log.error("Failed to restart Explorer: %s", e)
            # Attempt to restart explorer as a fallback
            try:
                subprocess.Popen(["explorer.exe"], creationflags=_NO_WINDOW)
            except Exception as e2:
                log.error("Fallback explorer restart also failed: %s", e2)
                raise RuntimeError(f"Explorer was killed but could not be restarted: {e2}") from e


def _get_prefetch_size() -> int:
    """Get total size of Prefetch folder."""
    try:
        prefetch_dir = os.path.expandvars(r"%SystemRoot%\Prefetch")
        if not os.path.exists(prefetch_dir):
            return 0
        total_size = 0
        for root, _, files in os.walk(prefetch_dir):
            for file in files:
                try:
                    total_size += os.path.getsize(os.path.join(root, file))
                except (OSError, PermissionError):
                    continue
        return total_size
    except Exception:
        return 0


def _clean_prefetch() -> None:
    """Clean Windows Prefetch files."""
    prefetch_dir = os.path.expandvars(r"%SystemRoot%\Prefetch")
    if not os.path.exists(prefetch_dir):
        return
    for file in os.listdir(prefetch_dir):
        if file.lower().endswith(".pf"):
            try:
                os.unlink(os.path.join(prefetch_dir, file))
            except (OSError, PermissionError):
                continue


def _get_windows_update_cache_size() -> int:
    """Get total size of Windows Update download cache."""
    try:
        update_dir = os.path.expandvars(r"%SystemRoot%\SoftwareDistribution\Download")
        if not os.path.exists(update_dir):
            return 0
        total_size = 0
        for root, _, files in os.walk(update_dir):
            for file in files:
                try:
                    total_size += os.path.getsize(os.path.join(root, file))
                except (OSError, PermissionError):
                    continue
        return total_size
    except Exception:
        return 0


def _clean_windows_update_cache() -> None:
    """Clean Windows Update download cache."""
    import shutil

    update_dir = os.path.expandvars(r"%SystemRoot%\SoftwareDistribution\Download")
    if not os.path.exists(update_dir):
        return
    for item in os.listdir(update_dir):
        try:
            item_path = os.path.join(update_dir, item)
            if os.path.isfile(item_path):
                os.unlink(item_path)
            elif os.path.isdir(item_path):
                shutil.rmtree(item_path)
        except (OSError, PermissionError):
            continue


def _trim_memory() -> None:
    """Trim working sets of inactive processes (Windows only)."""
    if os.name == "nt":
        try:
            from avs_backend.performance.memory_optimizer import optimize_memory
            from threading import Event

            cancel = Event()
            result = optimize_memory(cancel, None)
            if result.status.value == "completed":
                log.info("Memory trim freed %.1f MB", result.memory_freed / 1024 / 1024)
            else:
                log.warning("Memory trim did not complete: %s", result.status.value)
        except Exception as e:
            log.warning("Memory trim failed: %s", e)


# =====================================================================
# Stub Functions for Non-Windows Platforms
# =====================================================================


def _get_stub_metrics() -> dict[str, Any]:
    """Return stub metrics for non-Windows platforms."""
    return {
        "cpu": {"usage": 0, "frequency": 0, "temperature": None, "logicalProcessors": 0, "currentProcesses": 0, "currentThreads": 0},
        "memory": {"total": 0, "used": 0, "available": 0, "pressure": 0, "cached": 0, "commitUsage": 0},
        "storage": [],
        "windows": {"version": "Unknown", "build": "Unknown", "uptime": 0, "secureBoot": False, "tpm": False, "admin": False, "powerMode": "Unknown", "batteryHealth": None},
        "security": {"defender": False, "firewall": False, "updates": False, "realtimeProtection": False, "smartScreen": False},
        "performance": {"startupTime": 0, "startupApps": 0, "backgroundProcesses": 0, "temporaryFilesSize": 0, "recycleBinSize": 0, "browserCacheSize": 0, "potentialRecoverableSpace": 0},
        "capturedAt": _now_iso(),
    }


def _get_stub_health() -> dict[str, Any]:
    """Return stub health for non-Windows platforms."""
    return {
        "overallScore": 0,
        "categoryScores": {"cpu": 0, "memory": 0, "storage": 0, "security": 0, "performance": 0},
        "status": "critical",
        "suggestions": ["Dashboard is Windows-specific"],
        "capturedAt": _now_iso(),
    }


def _get_stub_optimize_preview() -> dict[str, Any]:
    """Return stub optimize preview for non-Windows platforms."""
    return {
        "totalRecoverable": 0,
        "actions": [],
        "estimatedTime": 0,
    }


def _get_stub_optimize_execute() -> dict[str, Any]:
    """Return stub optimize execute for non-Windows platforms."""
    return {
        "temporaryFiles": {"cleaned": False, "size": 0, "error": "Not supported on this platform"},
        "recycleBin": {"cleaned": False, "size": 0, "error": "Not supported on this platform"},
        "browserCache": {"cleaned": False, "size": 0, "error": "Not supported on this platform"},
        "thumbnailCache": {"cleaned": False, "size": 0, "error": "Not supported on this platform"},
        "flushDNS": {"cleaned": False, "error": "Not supported on this platform"},
        "refreshExplorer": {"cleaned": False, "error": "Not supported on this platform"},
        "memoryTrim": {"cleaned": False, "error": "Not supported on this platform"},
        "totalRecovered": 0,
        "timeTaken": 0,
        "success": False,
        "error": "Not supported on this platform",
    }


__all__ = [
    "dashboard_metrics",
    "dashboard_health",
    "dashboard_optimize_preview",
    "dashboard_optimize_execute",
]

# Start the live metrics background loop lazily to avoid import lock deadlock.
# The thread is started on first call to dashboard_live instead of at import time.
_live_metrics_thread: threading.Thread | None = None
_live_metrics_thread_lock = threading.Lock()


def _ensure_live_metrics_thread() -> None:
    """Start the live metrics background thread if not already running."""
    global _live_metrics_thread
    if _live_metrics_thread is None or not _live_metrics_thread.is_alive():
        with _live_metrics_thread_lock:
            if _live_metrics_thread is None or not _live_metrics_thread.is_alive():
                _live_metrics_thread = threading.Thread(
                    target=_live_metrics_loop, daemon=True, name="dashboard-live-metrics"
                )
                _live_metrics_thread.start()
