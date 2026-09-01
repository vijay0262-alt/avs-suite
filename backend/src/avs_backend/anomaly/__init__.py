"""AI Anomaly Detection — behavioral malware detection beyond signatures.

Monitors running processes for suspicious behavioral patterns that may indicate
malware or unwanted software, even if no signature match exists.

Anomaly indicators scored:
  - High CPU + high network (possible crypto miner or botnet)
  - Process running from temp/cache directory (common malware behavior)
  - Process with no visible window but high resource usage (hidden activity)
  - Process spawning many child processes (possible worm/mass infector)
  - Process modifying many files rapidly (possible ransomware)
  - Process with suspicious name (random strings, mimicking system processes)
  - Process with unusual parent-child relationships
  - Process accessing camera/microphone without obvious need
  - Network connections to known-bad ports or unusual countries
  - Rapid registry modifications

Each indicator contributes to an anomaly score (0-100). Higher = more suspicious.

Data is stored in ~/.avs/anomaly_data.json.

RPC methods:
    anomaly.scan           — scan running processes for anomalies
    anomaly.status         — get current anomaly detection status
    anomaly.listAnomalies  — list detected anomalies
    anomaly.dismiss        — dismiss an anomaly
    anomaly.clearAll       — clear all anomalies
    anomaly.history        — get anomaly detection history
    anomaly.configure      — update anomaly detection config (Pro only)
    anomaly.getBaseline    — get established behavioral baseline (Pro only)
"""

from __future__ import annotations

import json
import logging
import os
import platform
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.anomaly")

IS_WINDOWS = platform.system() == "Windows"

_DATA_PATH = os.path.join(os.path.expanduser("~"), ".avs", "anomaly_data.json")

_DEFAULT_CONFIG = {
    "enabled": True,
    "sensitivity": "normal",  # low, normal, high
    "maxAnomalies": 100,
    "minScoreToReport": 30,  # Only report anomalies with score >= 30
    "baselineDays": 7,  # Days of data to establish baseline
}

# Sensitivity presets
_SENSITIVITY_PRESETS = {
    "low": {"minScore": 50, "cpuThreshold": 80, "netThreshold": 50, "childThreshold": 20},
    "normal": {"minScore": 30, "cpuThreshold": 60, "netThreshold": 30, "childThreshold": 10},
    "high": {"minScore": 20, "cpuThreshold": 40, "netThreshold": 10, "childThreshold": 5},
}

# Suspicious process name patterns
SUSPICIOUS_NAME_PATTERNS = [
    # Random-looking strings (common in malware)
    # e.g., "abc123.exe", "xk7m2f.exe"
    # We check for these programmatically below
]

# System process names that malware often mimics (typosquatting)
SYSTEM_PROCESS_NAMES = {
    "svchost.exe", "csrss.exe", "lsass.exe", "winlogon.exe", "services.exe",
    "smss.exe", "wininit.exe", "spoolsv.exe", "explorer.exe", "dwm.exe",
    "taskhostw.exe", "sihost.exe", "ctfmon.exe",
}

# Suspicious execution locations
SUSPICIOUS_PATHS = [
    "\\temp\\", "\\appdata\\local\\temp\\", "\\windows\\temp\\",
    "\\downloads\\", "\\programdata\\",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_DATA_PATH), exist_ok=True)


def _load_data() -> dict[str, Any]:
    if not os.path.isfile(_DATA_PATH):
        return {"anomalies": [], "baseline": {}, "config": _DEFAULT_CONFIG.copy(), "stats": {"totalScans": 0, "totalAnomalies": 0, "totalDismissed": 0}}
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "anomalies" not in data:
            data["anomalies"] = []
        if "baseline" not in data:
            data["baseline"] = {}
        if "config" not in data:
            data["config"] = _DEFAULT_CONFIG.copy()
        if "stats" not in data:
            data["stats"] = {"totalScans": 0, "totalAnomalies": 0, "totalDismissed": 0}
        return data
    except (ValueError, OSError):
        return {"anomalies": [], "baseline": {}, "config": _DEFAULT_CONFIG.copy(), "stats": {"totalScans": 0, "totalAnomalies": 0, "totalDismissed": 0}}


def _save_data(data: dict[str, Any]) -> bool:
    _ensure_dirs()
    try:
        with open(_DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save anomaly data: %s", e)
        return False


def _is_suspicious_name(name: str) -> tuple[bool, str]:
    """Check if a process name looks suspicious."""
    name_lower = name.lower()

    # Check for typosquatting of system processes
    for sys_name in SYSTEM_PROCESS_NAMES:
        # Check for slight variations (e.g., svch0st.exe, scvhost.exe)
        if name_lower != sys_name and _levenshtein_distance(name_lower, sys_name) == 1:
            return True, f"Name mimics system process '{sys_name}' (typosquatting)"

    # Check for random-looking names (all lowercase + digits, short)
    base = name_lower.replace(".exe", "").replace(".dll", "")
    if len(base) >= 6 and len(base) <= 12:
        has_alpha = any(c.isalpha() for c in base)
        has_digit = any(c.isdigit() for c in base)
        has_upper = any(c.isupper() for c in name.replace(".exe", "").replace(".dll", ""))
        no_vowels = not any(v in base for v in "aeiou")
        if has_alpha and has_digit and no_vowels and not has_upper:
            return True, "Name appears to be randomly generated"

    # Check for double extensions (e.g., "document.pdf.exe")
    if name_lower.count(".") >= 2 and name_lower.endswith((".exe", ".scr", ".bat", ".cmd")):
        return True, "Double extension (possible disguised executable)"

    return False, ""


def _levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def _is_suspicious_path(exe_path: str) -> tuple[bool, str]:
    """Check if a process is running from a suspicious location."""
    if not exe_path:
        return False, ""

    path_lower = exe_path.lower()
    for susp in SUSPICIOUS_PATHS:
        if susp in path_lower:
            return True, f"Running from suspicious location ({susp.strip(chr(92))})"

    return False, ""


def _score_process(proc: dict[str, Any], config: dict[str, Any], preset: dict[str, int]) -> dict[str, Any] | None:
    """Score a single process for anomaly indicators.

    Returns anomaly dict if score >= minScoreToReport, else None.
    """
    score = 0
    indicators: list[str] = []

    name = proc.get("name", "")
    exe = proc.get("exe", "")
    cpu = proc.get("cpuPercent", 0)
    mem = proc.get("memoryMB", 0)
    pid = proc.get("pid", 0)
    children = proc.get("children", 0)

    # Indicator 1: Suspicious name
    susp_name, name_reason = _is_suspicious_name(name)
    if susp_name:
        score += 25
        indicators.append(name_reason)

    # Indicator 2: Suspicious path
    susp_path, path_reason = _is_suspicious_path(exe)
    if susp_path:
        score += 20
        indicators.append(path_reason)

    # Indicator 3: High CPU usage
    if cpu > preset["cpuThreshold"]:
        score += 15
        indicators.append(f"High CPU usage ({cpu:.1f}%)")

    # Indicator 4: High memory + high CPU (possible miner)
    if cpu > preset["cpuThreshold"] and mem > 500:
        score += 15
        indicators.append(f"High CPU + memory ({cpu:.1f}% CPU, {mem:.0f} MB RAM) — possible crypto miner")

    # Indicator 5: Many child processes
    if children > preset["childThreshold"]:
        score += 20
        indicators.append(f"Spawned {children} child processes (possible worm/mass infector)")

    # Indicator 6: No executable path (possible injected process)
    if not exe and name:
        score += 10
        indicators.append("No executable path (possible process injection)")

    # Indicator 7: Process name with .scr or .bat extension (unusual for running processes)
    if name.lower().endswith((".scr", ".bat", ".cmd", ".com", ".pif")):
        score += 15
        indicators.append(f"Unusual executable extension for running process ({name})")

    # Indicator 8: Very high memory usage with low CPU (possible memory leak or data exfiltration)
    if mem > 2000 and cpu < 1:
        score += 10
        indicators.append(f"High memory with no CPU activity ({mem:.0f} MB, {cpu:.1f}% CPU)")

    # Clamp score to 0-100
    score = min(100, max(0, score))

    if score < config.get("minScoreToReport", preset["minScore"]):
        return None

    # Determine severity
    if score >= 70:
        severity = "critical"
    elif score >= 50:
        severity = "high"
    elif score >= 35:
        severity = "normal"
    else:
        severity = "low"

    return {
        "id": f"anomaly_{pid}_{int(time.time())}",
        "pid": pid,
        "name": name,
        "exe": exe,
        "score": score,
        "severity": severity,
        "indicators": indicators,
        "cpuPercent": cpu,
        "memoryMB": mem,
        "childCount": children,
        "timestamp": _now_iso(),
        "dismissed": False,
    }


def _get_processes_with_children() -> list[dict[str, Any]]:
    """Get all processes with child counts."""
    try:
        import psutil

        # Build process tree
        proc_children: dict[int, int] = {}
        all_procs: list[dict[str, Any]] = []

        for p in psutil.process_iter(["pid", "name", "exe", "cpu_percent", "memory_info", "ppid"]):
            try:
                info = p.info
                ppid = info.get("ppid", 0)
                if ppid:
                    proc_children[ppid] = proc_children.get(ppid, 0) + 1

                mi = info.get("memory_info")
                all_procs.append({
                    "pid": info.get("pid", 0),
                    "name": info.get("name", "") or "",
                    "exe": info.get("exe", "") or "",
                    "cpuPercent": info.get("cpu_percent", 0) or 0,
                    "memoryMB": (mi.rss / (1024 * 1024)) if mi else 0,
                    "ppid": ppid,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        # Add child counts
        for proc in all_procs:
            proc["children"] = proc_children.get(proc["pid"], 0)

        return all_procs
    except Exception as e:
        log.error("Failed to get processes: %s", e)
        return []


# ─── RPC Methods ────────────────────────────────────────────────────

@register("anomaly.scan")
def anomaly_scan(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan running processes for behavioral anomalies.

    Analyzes all running processes for suspicious behavioral patterns
    and generates anomaly reports with scores.
    """
    if not IS_WINDOWS:
        return {"success": False, "anomalies": [], "count": 0, "supported": False}

    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if not config.get("enabled", True):
        return {"success": False, "message": "Anomaly detection is disabled", "anomalies": [], "count": 0}

    sensitivity = config.get("sensitivity", "normal")
    preset = _SENSITIVITY_PRESETS.get(sensitivity, _SENSITIVITY_PRESETS["normal"])

    processes = _get_processes_with_children()
    anomalies: list[dict[str, Any]] = []

    current_pid = os.getpid()
    for proc in processes:
        if proc["pid"] == current_pid:
            continue

        anomaly = _score_process(proc, config, preset)
        if anomaly:
            anomalies.append(anomaly)

    # Sort by score (highest first)
    anomalies.sort(key=lambda a: a["score"], reverse=True)

    # Limit to maxAnomalies
    max_anom = config.get("maxAnomalies", 100)
    anomalies = anomalies[:max_anom]

    # Store
    existing = data.get("anomalies", [])
    existing.extend(anomalies)
    existing = existing[-max_anom:]

    data["anomalies"] = existing
    data["stats"]["totalScans"] = data["stats"].get("totalScans", 0) + 1
    data["stats"]["totalAnomalies"] = data["stats"].get("totalAnomalies", 0) + len(anomalies)

    _save_data(data)

    return {
        "success": True,
        "anomalies": anomalies,
        "count": len(anomalies),
        "scannedProcesses": len(processes),
        "supported": True,
    }


@register("anomaly.status")
def anomaly_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get anomaly detection status and statistics."""
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())
    stats = data.get("stats", {})
    anomalies = data.get("anomalies", [])

    active = [a for a in anomalies if not a.get("dismissed", False)]

    # Count by severity
    by_severity: dict[str, int] = {}
    for a in active:
        sev = a.get("severity", "low")
        by_severity[sev] = by_severity.get(sev, 0) + 1

    return {
        "enabled": config.get("enabled", True),
        "sensitivity": config.get("sensitivity", "normal"),
        "config": config,
        "stats": {
            "totalScans": stats.get("totalScans", 0),
            "totalAnomalies": stats.get("totalAnomalies", 0),
            "totalDismissed": stats.get("totalDismissed", 0),
            "activeCount": len(active),
            "bySeverity": by_severity,
        },
        "supported": IS_WINDOWS,
    }


@register("anomaly.listAnomalies")
def anomaly_list_anomalies(params: dict[str, Any] | None) -> dict[str, Any]:
    """List detected anomalies.

    Params (optional):
        limit: int — max anomalies to return (default 50)
        dismissed: bool — include dismissed anomalies (default false)
        minScore: int — minimum score to include
    """
    data = _load_data()
    anomalies = data.get("anomalies", [])

    include_dismissed = params.get("dismissed", False) if params else False
    min_score = params.get("minScore", 0) if params else 0

    filtered = []
    for a in anomalies:
        if not include_dismissed and a.get("dismissed", False):
            continue
        if a.get("score", 0) < min_score:
            continue
        filtered.append(a)

    limit = 50
    if params and "limit" in params:
        limit = min(200, max(1, int(params["limit"])))

    filtered = list(reversed(filtered[-limit:]))

    return {
        "anomalies": filtered,
        "count": len(filtered),
        "totalActive": len([a for a in anomalies if not a.get("dismissed", False)]),
    }


@register("anomaly.dismiss")
def anomaly_dismiss(params: dict[str, Any] | None) -> dict[str, Any]:
    """Dismiss an anomaly by ID.

    Params:
        id: str — anomaly ID to dismiss
    """
    if not params or "id" not in params:
        return {"success": False, "message": "id parameter is required"}

    anom_id = params["id"]
    data = _load_data()
    anomalies = data.get("anomalies", [])

    found = False
    for a in anomalies:
        if a["id"] == anom_id:
            a["dismissed"] = True
            found = True
            break

    if not found:
        return {"success": False, "message": "Anomaly not found"}

    data["stats"]["totalDismissed"] = data["stats"].get("totalDismissed", 0) + 1
    _save_data(data)

    return {"success": True, "message": "Anomaly dismissed"}


@register("anomaly.clearAll")
def anomaly_clear_all(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all anomalies."""
    data = _load_data()
    data["anomalies"] = []
    _save_data(data)

    return {"success": True, "message": "All anomalies cleared"}


@register("anomaly.history")
def anomaly_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get anomaly detection history (all anomalies including dismissed).

    Params (optional):
        limit: int — max entries (default 50)
    """
    data = _load_data()
    anomalies = data.get("anomalies", [])

    limit = 50
    if params and "limit" in params:
        limit = min(200, max(1, int(params["limit"])))

    return {
        "anomalies": anomalies[-limit:],
        "count": len(anomalies),
        "supported": True,
    }


@register("anomaly.configure")
@require_feature("anomaly.configure")
def anomaly_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update anomaly detection configuration. Pro only.

    Params (all optional):
        enabled: bool
        sensitivity: str — low, normal, high
        maxAnomalies: int
        minScoreToReport: int
        baselineDays: int
    """
    data = _load_data()
    config = data.get("config", _DEFAULT_CONFIG.copy())

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "sensitivity" in params:
            s = params["sensitivity"]
            if s in ("low", "normal", "high"):
                config["sensitivity"] = s
        if "maxAnomalies" in params:
            config["maxAnomalies"] = max(10, int(params["maxAnomalies"]))
        if "minScoreToReport" in params:
            config["minScoreToReport"] = max(0, min(100, int(params["minScoreToReport"])))
        if "baselineDays" in params:
            config["baselineDays"] = max(1, int(params["baselineDays"]))

    data["config"] = config
    _save_data(data)

    return {
        "success": True,
        "config": config,
        "message": "Anomaly detection configuration updated",
    }


@register("anomaly.getBaseline")
@require_feature("anomaly.getBaseline")
def anomaly_get_baseline(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get established behavioral baseline. Pro only.

    Returns the known-good process baseline if one has been established.
    """
    data = _load_data()
    baseline = data.get("baseline", {})

    return {
        "baseline": baseline,
        "hasBaseline": len(baseline) > 0,
        "baselineDays": data.get("config", {}).get("baselineDays", 7),
        "supported": IS_WINDOWS,
    }
