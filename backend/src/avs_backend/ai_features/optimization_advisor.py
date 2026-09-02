"""AI Optimization Recommendations — rule-based optimization advisor.

Analyzes the current system state and generates personalized optimization
recommendations using a local rule-based engine (no external LLM API).

Checks performed:
  - Disk space usage on all mounted drives
  - Memory usage (virtual memory)
  - CPU usage trends (sampled over a short window)
  - Startup items count (Windows registry Run keys)
  - Running process count
  - Temporary file sizes in common temp directories

Each recommendation includes an identifier, category, priority, title,
description, expected impact, an action to perform, optional action
parameters, and an estimated time to apply.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
import time
from datetime import datetime, timezone
from typing import Any

import psutil

log = logging.getLogger("avs.ai_features.optimization_advisor")

IS_WINDOWS = platform.system() == "Windows"

# Suppress console window popups on Windows when spawning subprocesses.
_CREATE_NO_WINDOW = 0x08000000

# Thresholds
_DISK_CRITICAL_FREE_PERCENT = 10.0
_DISK_HIGH_FREE_PERCENT = 20.0
_MEMORY_HIGH_PERCENT = 80.0
_STARTUP_MEDIUM_COUNT = 15
_PROCESSES_MEDIUM_COUNT = 100
_TEMP_MEDIUM_BYTES = 1 * 1024 * 1024 * 1024  # 1 GB

# Windows registry Run key locations (HIVE\\subkey).
_RUN_KEYS = [
    r"HKLM\Software\Microsoft\Windows\CurrentVersion\Run",
    r"HKLM\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run",
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
]


class OptimizationAdvisor:
    """Rule-based optimization advisor that analyzes system state.

    Generates personalized optimization recommendations based on local
    system metrics. No external LLM API is used — all logic is rule-based.
    """

    name = "optimization_advisor"

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialize the advisor with the provided configuration.

        Args:
            config: Configuration dictionary. May contain tuning keys such
                as ``sample_interval`` (CPU sampling window in seconds) and
                ``enabled`` (whether the advisor is enabled).
        """
        self.config = config or {}
        self._enabled: bool = bool(self.config.get("enabled", True))
        self._sample_interval: float = float(self.config.get("sample_interval", 0.5))
        self._recommendations: list[dict[str, Any]] = []
        self._last_analysis: dict[str, Any] | None = None
        self._last_run: str | None = None
        log.debug("OptimizationAdvisor initialized (enabled=%s)", self._enabled)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(self) -> dict[str, Any]:
        """Collect system data and generate optimization recommendations.

        Returns:
            A dictionary with the following keys:
                - recommendations: list of recommendation dicts
                - system_score: int (0-100, higher is better)
                - potential_gain: str describing the potential improvement
                - summary: str human-readable summary
        """
        if not self._enabled:
            msg = "Optimization advisor is disabled"
            log.info(msg)
            return {
                "recommendations": [],
                "system_score": 100,
                "potential_gain": "none",
                "summary": msg,
            }

        recommendations: list[dict[str, Any]] = []
        metrics: dict[str, Any] = {}

        # --- Disk space -------------------------------------------------
        disk_info = self._collect_disk_info()
        metrics["disks"] = disk_info
        recommendations.extend(self._disk_recommendations(disk_info))

        # --- Memory -----------------------------------------------------
        mem_info = self._collect_memory_info()
        metrics["memory"] = mem_info
        recommendations.extend(self._memory_recommendations(mem_info))

        # --- CPU --------------------------------------------------------
        cpu_info = self._collect_cpu_info()
        metrics["cpu"] = cpu_info
        # CPU is informational; no hard rule triggers a recommendation yet.

        # --- Startup items ---------------------------------------------
        startup_count = self._collect_startup_count()
        metrics["startupItems"] = startup_count
        recommendations.extend(self._startup_recommendations(startup_count))

        # --- Running processes -----------------------------------------
        process_count = self._collect_process_count()
        metrics["processCount"] = process_count
        recommendations.extend(self._process_recommendations(process_count))

        # --- Temp files -------------------------------------------------
        temp_info = self._collect_temp_info()
        metrics["tempFiles"] = temp_info
        recommendations.extend(self._temp_recommendations(temp_info))

        # Deduplicate by id (keep first occurrence).
        seen: set[str] = set()
        unique: list[dict[str, Any]] = []
        for rec in recommendations:
            rid = rec.get("id", "")
            if rid in seen:
                continue
            seen.add(rid)
            unique.append(rec)
        recommendations = unique

        # Sort by priority: critical > high > medium > low
        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        recommendations.sort(key=lambda r: priority_order.get(r.get("priority", "low"), 99))

        system_score = self._compute_system_score(metrics, recommendations)
        potential_gain = self._compute_potential_gain(recommendations)
        summary = self._build_summary(metrics, recommendations, system_score)

        result = {
            "recommendations": recommendations,
            "system_score": system_score,
            "potential_gain": potential_gain,
            "summary": summary,
        }

        self._recommendations = recommendations
        self._last_analysis = result
        self._last_run = datetime.now(timezone.utc).isoformat()
        log.info(
            "Analysis complete: %d recommendations, score=%d, gain=%s",
            len(recommendations),
            system_score,
            potential_gain,
        )
        return result

    def get_recommendations(self) -> list[dict[str, Any]]:
        """Return cached recommendations from the last analysis.

        Returns:
            List of recommendation dicts. Empty if no analysis has run.
        """
        return list(self._recommendations)

    def get_status(self) -> dict[str, Any]:
        """Return the current advisor status.

        Returns:
            A dictionary describing enabled state, last run time, and
            cached recommendation count.
        """
        return {
            "name": self.name,
            "enabled": self._enabled,
            "lastRun": self._last_run,
            "recommendationCount": len(self._recommendations),
            "hasAnalysis": self._last_analysis is not None,
        }

    # ------------------------------------------------------------------
    # Data collection
    # ------------------------------------------------------------------

    def _collect_disk_info(self) -> list[dict[str, Any]]:
        """Collect disk usage info for all mounted partitions."""
        disks: list[dict[str, Any]] = []
        try:
            for part in psutil.disk_partitions(all=False):
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                except (PermissionError, OSError) as e:
                    log.debug("Cannot read disk %s: %s", part.mountpoint, e)
                    continue
                total = usage.total or 0
                free_percent = (usage.free / total * 100.0) if total else 100.0
                disks.append({
                    "device": part.device,
                    "mountpoint": part.mountpoint,
                    "fstype": part.fstype,
                    "total": total,
                    "used": usage.used,
                    "free": usage.free,
                    "freePercent": round(free_percent, 2),
                })
        except Exception as e:
            log.error("Failed to collect disk info: %s", e)
        return disks

    def _collect_memory_info(self) -> dict[str, Any]:
        """Collect virtual memory usage info."""
        try:
            mem = psutil.virtual_memory()
            return {
                "total": mem.total,
                "available": mem.available,
                "used": mem.used,
                "percent": mem.percent,
            }
        except Exception as e:
            log.error("Failed to collect memory info: %s", e)
            return {"total": 0, "available": 0, "used": 0, "percent": 0.0}

    def _collect_cpu_info(self) -> dict[str, Any]:
        """Collect CPU usage info, sampling over a short window."""
        try:
            # Prime the cpu_percent call and sample over the interval.
            psutil.cpu_percent(interval=None)
            time.sleep(self._sample_interval)
            cpu_percent = psutil.cpu_percent(interval=None)
            core_count = psutil.cpu_count(logical=True) or 0
            return {
                "percent": round(cpu_percent, 2),
                "coreCount": core_count,
                "loadAverage": list(os.getloadavg()) if hasattr(os, "getloadavg") else [],
            }
        except Exception as e:
            log.error("Failed to collect CPU info: %s", e)
            return {"percent": 0.0, "coreCount": 0, "loadAverage": []}

    def _collect_startup_count(self) -> int:
        """Count startup items by querying Windows registry Run keys."""
        if not IS_WINDOWS:
            return 0
        count = 0
        for key in _RUN_KEYS:
            try:
                result = subprocess.run(
                    ["reg", "query", key],
                    capture_output=True,
                    text=True,
                    timeout=10,
                    creationflags=_CREATE_NO_WINDOW,
                )
                if result.returncode != 0:
                    continue
                # Each value entry appears as a line with "REG_SZ"/"REG_EXPAND_SZ".
                for line in result.stdout.splitlines():
                    if "REG_" in line:
                        count += 1
            except Exception as e:
                log.debug("Failed to query startup key %s: %s", key, e)
        log.debug("Startup items count: %d", count)
        return count

    def _collect_process_count(self) -> int:
        """Count currently running processes."""
        try:
            return len(psutil.pids())
        except Exception as e:
            log.error("Failed to collect process count: %s", e)
            return 0

    def _collect_temp_info(self) -> dict[str, Any]:
        """Collect total size of temporary files in common temp directories."""
        temp_dirs: list[str] = []
        env_temp = os.environ.get("TEMP") or os.environ.get("TMP")
        if env_temp:
            temp_dirs.append(env_temp)
        if IS_WINDOWS:
            win_temp = os.environ.get("WINDIR", r"C:\Windows")
            temp_dirs.append(os.path.join(win_temp, "Temp"))
        else:
            temp_dirs.append("/tmp")

        total_size = 0
        file_count = 0
        for temp_dir in temp_dirs:
            if not temp_dir or not os.path.isdir(temp_dir):
                continue
            try:
                for root, _dirs, files in os.walk(temp_dir):
                    for fname in files:
                        fpath = os.path.join(root, fname)
                        try:
                            total_size += os.path.getsize(fpath)
                            file_count += 1
                        except (OSError, PermissionError):
                            continue
            except Exception as e:
                log.debug("Failed to walk temp dir %s: %s", temp_dir, e)
        return {
            "totalSize": total_size,
            "fileCount": file_count,
            "dirs": temp_dirs,
        }

    # ------------------------------------------------------------------
    # Recommendation rules
    # ------------------------------------------------------------------

    def _disk_recommendations(self, disks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Generate disk-space-related recommendations."""
        recs: list[dict[str, Any]] = []
        for disk in disks:
            free_percent = disk.get("freePercent", 100.0)
            mountpoint = disk.get("mountpoint", "")
            if free_percent < _DISK_CRITICAL_FREE_PERCENT:
                recs.append(self._make_recommendation(
                    id=f"disk_critical_{mountpoint}",
                    category="disk",
                    priority="critical",
                    title="Free up disk space",
                    description=(
                        f"Drive {mountpoint} has only {free_percent:.1f}% free space. "
                        "Low disk space can cause system instability and performance issues."
                    ),
                    expected_impact="high",
                    action="clean_disk",
                    action_params={"path": mountpoint},
                    estimated_time="10-30 min",
                ))
            elif free_percent < _DISK_HIGH_FREE_PERCENT:
                recs.append(self._make_recommendation(
                    id=f"disk_high_{mountpoint}",
                    category="disk",
                    priority="high",
                    title="Consider cleaning temporary files",
                    description=(
                        f"Drive {mountpoint} has {free_percent:.1f}% free space. "
                        "Cleaning temporary and cache files can reclaim space."
                    ),
                    expected_impact="medium",
                    action="clean_temp",
                    action_params={"path": mountpoint},
                    estimated_time="5-15 min",
                ))
        return recs

    def _memory_recommendations(self, mem: dict[str, Any]) -> list[dict[str, Any]]:
        """Generate memory-related recommendations."""
        recs: list[dict[str, Any]] = []
        percent = mem.get("percent", 0.0)
        if percent > _MEMORY_HIGH_PERCENT:
            recs.append(self._make_recommendation(
                id="memory_high",
                category="memory",
                priority="high",
                title="Close memory-intensive applications",
                description=(
                    f"Memory usage is at {percent:.1f}%. Closing unused or "
                    "memory-intensive applications can improve responsiveness."
                ),
                expected_impact="medium",
                action="optimize_memory",
                action_params={},
                estimated_time="1-5 min",
            ))
        return recs

    def _startup_recommendations(self, count: int) -> list[dict[str, Any]]:
        """Generate startup-items-related recommendations."""
        recs: list[dict[str, Any]] = []
        if count > _STARTUP_MEDIUM_COUNT:
            recs.append(self._make_recommendation(
                id="startup_medium",
                category="startup",
                priority="medium",
                title="Disable unnecessary startup programs",
                description=(
                    f"{count} startup items detected. Disabling unnecessary "
                    "startup programs can speed up boot time."
                ),
                expected_impact="medium",
                action="manage_startup",
                action_params={"count": count},
                estimated_time="5-10 min",
            ))
        return recs

    def _process_recommendations(self, count: int) -> list[dict[str, Any]]:
        """Generate running-process-related recommendations."""
        recs: list[dict[str, Any]] = []
        if count > _PROCESSES_MEDIUM_COUNT:
            recs.append(self._make_recommendation(
                id="processes_medium",
                category="processes",
                priority="medium",
                title="Reduce background processes",
                description=(
                    f"{count} processes are running. Reducing unnecessary "
                    "background processes can free up CPU and memory."
                ),
                expected_impact="low",
                action="reduce_processes",
                action_params={"count": count},
                estimated_time="2-10 min",
            ))
        return recs

    def _temp_recommendations(self, temp: dict[str, Any]) -> list[dict[str, Any]]:
        """Generate temporary-files-related recommendations."""
        recs: list[dict[str, Any]] = []
        total_size = temp.get("totalSize", 0)
        if total_size > _TEMP_MEDIUM_BYTES:
            size_gb = total_size / (1024 * 1024 * 1024)
            recs.append(self._make_recommendation(
                id="temp_medium",
                category="temp",
                priority="medium",
                title="Clean temporary files",
                description=(
                    f"Temporary files occupy {size_gb:.2f} GB. Cleaning them "
                    "can reclaim disk space and improve performance."
                ),
                expected_impact="medium",
                action="clean_temp",
                action_params={"dirs": temp.get("dirs", [])},
                estimated_time="5-15 min",
            ))
        return recs

    # ------------------------------------------------------------------
    # Scoring / summary helpers
    # ------------------------------------------------------------------

    def _compute_system_score(
        self, metrics: dict[str, Any], recommendations: list[dict[str, Any]]
    ) -> int:
        """Compute an overall system health score (0-100, higher is better)."""
        score = 100
        penalty = {"critical": 25, "high": 15, "medium": 8, "low": 3}
        for rec in recommendations:
            score -= penalty.get(rec.get("priority", "low"), 0)
        # Clamp to a sane range.
        return max(0, min(100, score))

    def _compute_potential_gain(self, recommendations: list[dict[str, Any]]) -> str:
        """Describe the potential improvement from applying recommendations."""
        if not recommendations:
            return "none"
        has_critical = any(r.get("priority") == "critical" for r in recommendations)
        has_high = any(r.get("priority") == "high" for r in recommendations)
        if has_critical:
            return "high"
        if has_high:
            return "medium"
        return "low"

    def _build_summary(
        self,
        metrics: dict[str, Any],
        recommendations: list[dict[str, Any]],
        score: int,
    ) -> str:
        """Build a human-readable summary of the analysis."""
        if not recommendations:
            return "System is in good shape — no optimization recommendations."
        crit = sum(1 for r in recommendations if r.get("priority") == "critical")
        high = sum(1 for r in recommendations if r.get("priority") == "high")
        med = sum(1 for r in recommendations if r.get("priority") == "medium")
        parts = [f"System score: {score}/100."]
        parts.append(f"{len(recommendations)} recommendation(s):")
        if crit:
            parts.append(f"{crit} critical")
        if high:
            parts.append(f"{high} high")
        if med:
            parts.append(f"{med} medium")
        return " ".join(parts)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _make_recommendation(
        *,
        id: str,
        category: str,
        priority: str,
        title: str,
        description: str,
        expected_impact: str,
        action: str,
        action_params: dict[str, Any],
        estimated_time: str,
    ) -> dict[str, Any]:
        """Build a recommendation dictionary with a consistent schema."""
        return {
            "id": id,
            "category": category,
            "priority": priority,
            "title": title,
            "description": description,
            "expected_impact": expected_impact,
            "action": action,
            "action_params": action_params,
            "estimated_time": estimated_time,
        }
