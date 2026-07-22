"""Performance profiling script for AVS PC Optimizer backend.

Measures import time, RPC handler execution time, and identifies bottlenecks.
Run: python profile_backend.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import importlib
import threading
from concurrent.futures import ThreadPoolExecutor

# Ensure src is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

RESULTS: list[dict] = []


def measure(label: str, fn, iterations=1):
    """Measure execution time of fn, return result and timings."""
    times = []
    result = None
    for i in range(iterations):
        start = time.monotonic()
        try:
            result = fn()
        except Exception as e:
            result = f"ERROR: {e}"
        elapsed = time.monotonic() - start
        times.append(elapsed)
    
    avg = sum(times) / len(times)
    mx = max(times)
    mn = min(times)
    
    entry = {
        "label": label,
        "avg_ms": round(avg * 1000, 2),
        "min_ms": round(mn * 1000, 2),
        "max_ms": round(mx * 1000, 2),
        "iterations": iterations,
        "result_type": type(result).__name__ if result else "None",
    }
    if isinstance(result, str) and result.startswith("ERROR"):
        entry["error"] = result
    else:
        # Brief result summary
        try:
            summary = str(result)[:200]
            entry["result_summary"] = summary
        except Exception:
            pass
    
    RESULTS.append(entry)
    print(f"  {label}: avg={entry['avg_ms']:.1f}ms min={entry['min_ms']:.1f}ms max={entry['max_ms']:.1f}ms")
    return result


def profile_imports():
    """Profile import time for each feature module."""
    print("\n=== PHASE 1: Module Import Times ===")
    
    modules = [
        "avs_backend.api.registry",
        "avs_backend.common.errors",
        "avs_backend.common.logging_setup",
        "avs_backend.dashboard",
        "avs_backend.cleaner",
        "avs_backend.privacy",
        "avs_backend.startup",
        "avs_backend.performance",
        "avs_backend.disk_analyzer",
        "avs_backend.duplicate_finder",
        "avs_backend.registry_cleaner",
        "avs_backend.system_information",
        "avs_backend.software_updater",
        "avs_backend.uninstaller",
        "avs_backend.history",
        "avs_backend.notifications",
        "avs_backend.reporting",
        "avs_backend.settings",
        "avs_backend.undo",
    ]
    
    total_start = time.monotonic()
    for mod in modules:
        measure(f"import {mod}", lambda m=mod: importlib.import_module(m))
    total = time.monotonic() - total_start
    print(f"\n  TOTAL import time: {total:.2f}s")


def profile_dashboard():
    """Profile dashboard metric collectors."""
    print("\n=== PHASE 2: Dashboard Metric Collectors ===")
    
    try:
        from avs_backend.dashboard import (
            _get_cpu_metrics,
            _get_memory_metrics,
            _get_storage_metrics,
            _get_windows_info,
            _get_security_metrics,
            _get_performance_metrics,
            _collect_metrics,
            dashboard_metrics,
            dashboard_live,
            dashboard_health,
        )
    except ImportError as e:
        print(f"  SKIP: Cannot import dashboard: {e}")
        return
    
    # Individual collectors
    measure("dashboard._get_cpu_metrics", _get_cpu_metrics, 3)
    measure("dashboard._get_memory_metrics", _get_memory_metrics, 3)
    measure("dashboard._get_storage_metrics", _get_storage_metrics, 3)
    measure("dashboard._get_windows_info", _get_windows_info, 3)
    measure("dashboard._get_security_metrics", _get_security_metrics, 3)
    measure("dashboard._get_performance_metrics", _get_performance_metrics, 3)
    
    # Composite
    measure("dashboard._collect_metrics (cached)", _collect_metrics, 3)
    measure("dashboard._collect_metrics.cache_clear + recollect", lambda: (_collect_metrics.cache_clear(), _collect_metrics()), 1)
    
    # RPC handlers
    measure("dashboard.metrics RPC", lambda: dashboard_metrics(None), 3)
    measure("dashboard.live RPC", lambda: dashboard_live(None), 3)
    measure("dashboard.health RPC", lambda: dashboard_health(None), 1)


def profile_system_info():
    """Profile system_information module."""
    print("\n=== PHASE 3: System Information ===")
    
    try:
        from avs_backend.system_information import (
            _get_static_info,
            _get_dynamic_info,
            system_info,
            system_comprehensive,
            system_static,
            system_dynamic,
            system_health_score,
        )
    except ImportError as e:
        print(f"  SKIP: Cannot import system_information: {e}")
        return
    
    measure("sysinfo._get_static_info (first call)", _get_static_info, 1)
    measure("sysinfo._get_static_info (cached)", _get_static_info, 3)
    measure("sysinfo._get_dynamic_info", _get_dynamic_info, 3)
    measure("sysinfo.system.info RPC", lambda: system_info(None), 3)
    measure("sysinfo.system.static RPC", lambda: system_static(None), 3)
    measure("sysinfo.system.dynamic RPC", lambda: system_dynamic(None), 3)
    measure("sysinfo.system.comprehensive RPC", lambda: system_comprehensive(None), 3)
    measure("sysinfo.system.healthScore RPC", lambda: system_health_score(None), 3)


def profile_startup():
    """Profile startup module."""
    print("\n=== PHASE 4: Startup Manager ===")
    
    try:
        from avs_backend.startup import startup_list, startup_refresh_cache
    except ImportError as e:
        print(f"  SKIP: Cannot import startup: {e}")
        return
    
    measure("startup.list RPC (first call)", lambda: startup_list(None), 1)
    measure("startup.list RPC (cached)", lambda: startup_list(None), 3)


def profile_privacy():
    """Profile privacy module."""
    print("\n=== PHASE 5: Privacy Cleaner ===")
    
    try:
        from avs_backend.privacy import privacy_scan, privacy_detect_browsers
    except ImportError as e:
        print(f"  SKIP: Cannot import privacy: {e}")
        return
    
    measure("privacy.detectBrowsers RPC", lambda: privacy_detect_browsers(None), 1)
    measure("privacy.scan RPC", lambda: privacy_scan(None), 1)


def profile_performance():
    """Profile performance module."""
    print("\n=== PHASE 6: Performance Monitor ===")
    
    try:
        from avs_backend.performance import (
            get_performance_metrics,
            get_graph_history,
            get_top_processes,
        )
    except ImportError as e:
        print(f"  SKIP: Cannot import performance: {e}")
        return
    
    measure("performance.getMetrics RPC", lambda: get_performance_metrics(None), 3)
    measure("performance.getGraphHistory RPC", lambda: get_graph_history(None), 1)
    measure("performance.getTopProcesses RPC", lambda: get_top_processes({"sortBy": "cpu", "limit": 10}), 1)


def profile_disk_analyzer():
    """Profile disk analyzer module."""
    print("\n=== PHASE 7: Disk Analyzer ===")
    
    try:
        from avs_backend.disk_analyzer import disk_analyzer_scan
    except ImportError as e:
        print(f"  SKIP: Cannot import disk_analyzer: {e}")
        return
    
    # Just measure scan start, not full scan
    measure("disk_analyzer.scan.start RPC", lambda: disk_analyzer_scan({"path": "C:\\", "maxDepth": 1}), 1)


def profile_registry():
    """Profile registry cleaner module."""
    print("\n=== PHASE 8: Registry Cleaner ===")
    
    try:
        from avs_backend.registry_cleaner import registry_scan
    except ImportError as e:
        print(f"  SKIP: Cannot import registry_cleaner: {e}")
        return
    
    measure("registry.scan RPC", lambda: registry_scan(None), 1)


def profile_powershell():
    """Profile individual PowerShell calls."""
    print("\n=== PHASE 9: PowerShell Call Latency ===")
    
    try:
        from avs_backend.dashboard import _run_powershell
    except ImportError:
        print("  SKIP: Cannot import _run_powershell")
        return
    
    measure("powershell: echo hello", lambda: _run_powershell("Write-Output 'hello'"), 3)
    measure("powershell: Get-PhysicalDisk count", lambda: _run_powershell("(Get-PhysicalDisk | Measure-Object).Count"), 1)
    measure("powershell: powercfg /getactivescheme", lambda: _run_powershell("powercfg /getactivescheme"), 1)
    measure("powershell: Get-MpComputerStatus", lambda: _run_powershell("$s = Get-MpComputerStatus; Write-Output $s.AntivirusEnabled", 1.5), 1)
    measure("powershell: Get-NetFirewallProfile", lambda: _run_powershell("(Get-NetFirewallProfile | Where-Object { $_.Enabled -eq 'True' } | Measure-Object).Count", 1.5), 1)


def profile_filesystem():
    """Profile filesystem operations."""
    print("\n=== PHASE 10: Filesystem Scan Speed ===")
    
    try:
        from avs_backend.dashboard import _get_temp_files_size, _get_recycle_bin_size, _estimate_browser_cache_size
    except ImportError:
        print("  SKIP: Cannot import filesystem functions")
        return
    
    measure("dashboard._get_temp_files_size", _get_temp_files_size, 1)
    measure("dashboard._get_recycle_bin_size", _get_recycle_bin_size, 1)
    measure("dashboard._estimate_browser_cache_size", _estimate_browser_cache_size, 1)


def profile_thread_contention():
    """Profile thread pool behavior."""
    print("\n=== PHASE 11: Thread Pool & Concurrency ===")
    
    # Measure dispatch pool size
    from concurrent.futures import ThreadPoolExecutor
    
    def quick_task():
        return sum(range(1000))
    
    def slow_task():
        time.sleep(0.5)
        return True
    
    # 8 quick tasks in parallel
    measure("8 quick tasks in pool(8)", lambda: ThreadPoolExecutor(max_workers=8).map(quick_task, range(8)) and list(ThreadPoolExecutor(max_workers=8).map(quick_task, range(8))), 1)
    
    # 4 slow tasks in parallel (should take ~0.5s, not ~2s)
    def run_4_slow():
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(slow_task, range(4)))
    measure("4 slow(0.5s) tasks in pool(4)", run_4_slow, 1)


def main():
    print("=" * 70)
    print("AVS PC Optimizer — Backend Performance Profile")
    print("=" * 70)
    print(f"Python: {sys.version}")
    print(f"Platform: {sys.platform}")
    print(f"PID: {os.getpid()}")
    
    # Set environment to skip elevation
    os.environ["AVS_NO_ELEVATE"] = "1"
    
    profile_imports()
    profile_dashboard()
    profile_system_info()
    profile_startup()
    profile_privacy()
    profile_performance()
    profile_powershell()
    profile_filesystem()
    profile_thread_contention()
    
    # Write results
    output_path = os.path.join(os.path.dirname(__file__), "PERFORMANCE_PROFILE.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(RESULTS, f, indent=2)
    
    print(f"\n{'=' * 70}")
    print(f"Profile complete. {len(RESULTS)} measurements written to {output_path}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
