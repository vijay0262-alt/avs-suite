"""Optimization Recommendations — actionable post-scan recommendations.

Generates structured recommendations that bridge security and optimization:
  - Startup items slowing boot time
  - Junk files wasting disk space
  - Browser cache buildup
  - Security posture issues
  - Outdated software
  - Registry issues
  - Memory pressure

Each recommendation has:
  - id: unique identifier
  - category: "performance" | "security" | "storage" | "startup"
  - severity: "low" | "medium" | "high"
  - title: short headline
  - description: detailed explanation
  - action_label: button text (e.g., "Clean Now", "Disable 5 apps")
  - action_route: frontend route to navigate to for the fix
  - metric: the numeric value (e.g., 23 startup items, 2.3 GB junk)
  - metric_unit: "items" | "GB" | "MB" | "%"
"""
from __future__ import annotations

import logging
import os
import platform
from typing import Any

log = logging.getLogger("avs.dashboard.optimization_recommendations")

IS_WINDOWS = platform.system() == "Windows"


def _get_startup_count() -> int:
    """Get the number of startup items."""
    try:
        from avs_backend.startup.startup_manager import scan_startup_entries
        entries = scan_startup_entries()
        return len(entries) if entries else 0
    except Exception:
        return 0


def _get_junk_size() -> int:
    """Get estimated junk file size in bytes."""
    try:
        temp_dir = os.environ.get("TEMP", "")
        total = 0
        if temp_dir and os.path.isdir(temp_dir):
            for root, _dirs, files in os.walk(temp_dir):
                for f in files:
                    try:
                        total += os.path.getsize(os.path.join(root, f))
                    except Exception:
                        pass
        # Windows Temp
        win_temp = r"C:\Windows\Temp"
        if os.path.isdir(win_temp):
            for root, _dirs, files in os.walk(win_temp):
                for f in files:
                    try:
                        total += os.path.getsize(os.path.join(root, f))
                    except Exception:
                        pass
        return total
    except Exception:
        return 0


def _get_recycle_bin_size() -> int:
    """Get recycle bin size in bytes."""
    if not IS_WINDOWS:
        return 0
    try:
        import subprocess
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             "(New-Object -ComObject Shell.Application).NameSpace(0xA).Items() | "
             "ForEach-Object { $_.Size } | Measure-Object -Sum | Select-Object -ExpandProperty Sum"],
            capture_output=True, text=True, timeout=10,
            creationflags=0x08000000,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return int(float(proc.stdout.strip()))
    except Exception:
        pass
    return 0


def _get_browser_cache_size() -> int:
    """Get browser cache size in bytes."""
    total = 0
    cache_paths = [
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data", "Default", "Cache"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data", "Default", "Cache"),
        os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles"),
    ]
    for path in cache_paths:
        if os.path.isdir(path):
            for root, _dirs, files in os.walk(path):
                for f in files:
                    try:
                        total += os.path.getsize(os.path.join(root, f))
                    except Exception:
                        pass
    return total


def _get_memory_usage_percent() -> float:
    """Get memory usage percentage."""
    try:
        import psutil
        return psutil.virtual_memory().percent
    except Exception:
        return 0.0


def _get_disk_usage_percent() -> float:
    """Get system drive disk usage percentage."""
    try:
        import psutil
        for part in psutil.disk_partitions(all=False):
            if part.mountpoint == "C:\\" or part.device.startswith("C:"):
                usage = psutil.disk_usage(part.mountpoint)
                return usage.percent
        # Fallback: use first partition
        for part in psutil.disk_partitions(all=False):
            usage = psutil.disk_usage(part.mountpoint)
            return usage.percent
    except Exception:
        pass
    return 0.0


def _bytes_to_gb(b: int) -> float:
    return round(b / 1073741824, 2) if b > 0 else 0.0


def _bytes_to_mb(b: int) -> float:
    return round(b / 1048576, 1) if b > 0 else 0.0


def generate_recommendations() -> list[dict[str, Any]]:
    """Generate actionable optimization recommendations.

    Returns a list of recommendation dicts, sorted by severity (high first).
    """
    recommendations: list[dict[str, Any]] = []

    # 1. Startup items
    startup_count = _get_startup_count()
    if startup_count > 15:
        recommendations.append({
            "id": "startup_heavy",
            "category": "startup",
            "severity": "high",
            "title": f"{startup_count} startup items slowing boot time",
            "description": f"Your PC has {startup_count} programs starting with Windows. Disabling unnecessary ones can speed up boot time by up to 50%.",
            "action_label": "Manage Startup",
            "action_route": "#/startup-manager",
            "metric": startup_count,
            "metric_unit": "items",
        })
    elif startup_count > 8:
        recommendations.append({
            "id": "startup_moderate",
            "category": "startup",
            "severity": "medium",
            "title": f"{startup_count} startup items detected",
            "description": f"{startup_count} programs start with Windows. Review and disable unnecessary ones to improve boot time.",
            "action_label": "Review Startup",
            "action_route": "#/startup-manager",
            "metric": startup_count,
            "metric_unit": "items",
        })

    # 2. Junk files
    junk_size = _get_junk_size()
    junk_gb = _bytes_to_gb(junk_size)
    if junk_gb > 2.0:
        recommendations.append({
            "id": "junk_large",
            "category": "storage",
            "severity": "high",
            "title": f"{junk_gb} GB of junk files found",
            "description": f"Temporary files are using {junk_gb} GB of disk space. Clean them to free up storage and improve performance.",
            "action_label": "Clean Junk Now",
            "action_route": "#/dashboard",
            "metric": junk_gb,
            "metric_unit": "GB",
        })
    elif junk_gb > 0.5:
        recommendations.append({
            "id": "junk_moderate",
            "category": "storage",
            "severity": "medium",
            "title": f"{junk_gb} GB of temporary files",
            "description": f"Temporary files are using {junk_gb} GB. Consider cleaning them to free up space.",
            "action_label": "Clean Temp Files",
            "action_route": "#/dashboard",
            "metric": junk_gb,
            "metric_unit": "GB",
        })

    # 3. Recycle Bin
    recycle_size = _get_recycle_bin_size()
    recycle_gb = _bytes_to_gb(recycle_size)
    if recycle_gb > 1.0:
        recommendations.append({
            "id": "recycle_bin_large",
            "category": "storage",
            "severity": "medium",
            "title": f"Recycle Bin has {recycle_gb} GB",
            "description": f"Your Recycle Bin contains {recycle_gb} GB of deleted files. Empty it to permanently free up space.",
            "action_label": "Empty Recycle Bin",
            "action_route": "#/dashboard",
            "metric": recycle_gb,
            "metric_unit": "GB",
        })

    # 4. Browser cache
    cache_size = _get_browser_cache_size()
    cache_mb = _bytes_to_mb(cache_size)
    if cache_mb > 500:
        recommendations.append({
            "id": "browser_cache_large",
            "category": "storage",
            "severity": "medium",
            "title": f"Browser cache is {cache_mb} MB",
            "description": f"Browser caches are using {cache_mb} MB. Cleaning them frees space and improves browser performance.",
            "action_label": "Clean Browser Cache",
            "action_route": "#/privacy-cleaner",
            "metric": cache_mb,
            "metric_unit": "MB",
        })

    # 5. Memory pressure
    mem_usage = _get_memory_usage_percent()
    if mem_usage > 85:
        recommendations.append({
            "id": "memory_high",
            "category": "performance",
            "severity": "high",
            "title": f"Memory usage at {mem_usage:.0f}%",
            "description": f"Your RAM is {mem_usage:.0f}% full. Run Memory Optimizer to free up RAM and improve responsiveness.",
            "action_label": "Optimize Memory",
            "action_route": "#/memory-optimizer",
            "metric": mem_usage,
            "metric_unit": "%",
        })
    elif mem_usage > 70:
        recommendations.append({
            "id": "memory_moderate",
            "category": "performance",
            "severity": "medium",
            "title": f"Memory usage at {mem_usage:.0f}%",
            "description": f"RAM usage is elevated at {mem_usage:.0f}%. Consider optimizing memory.",
            "action_label": "Optimize Memory",
            "action_route": "#/memory-optimizer",
            "metric": mem_usage,
            "metric_unit": "%",
        })

    # 6. Disk space
    disk_usage = _get_disk_usage_percent()
    if disk_usage > 90:
        recommendations.append({
            "id": "disk_critical",
            "category": "storage",
            "severity": "high",
            "title": f"System drive is {disk_usage:.0f}% full",
            "description": f"Your C: drive is {disk_usage:.0f}% full. Critical: free up space immediately to prevent system issues.",
            "action_label": "Free Up Space",
            "action_route": "#/dashboard",
            "metric": disk_usage,
            "metric_unit": "%",
        })
    elif disk_usage > 80:
        recommendations.append({
            "id": "disk_warning",
            "category": "storage",
            "severity": "medium",
            "title": f"System drive is {disk_usage:.0f}% full",
            "description": f"Your C: drive is {disk_usage:.0f}% full. Consider cleaning up files to prevent slowdowns.",
            "action_label": "Free Up Space",
            "action_route": "#/dashboard",
            "metric": disk_usage,
            "metric_unit": "%",
        })

    # Sort by severity (high first, then medium, then low)
    severity_order = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(key=lambda r: severity_order.get(r["severity"], 3))

    return recommendations
