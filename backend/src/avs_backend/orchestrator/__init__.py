"""OptimizationOrchestrator — unified backend optimization pipeline.

Single entry point for all optimization workflows:
  Dashboard → orchestrator.start → scan → optimize → verify → score → history
  AI Smart Optimize → orchestrator.start → same pipeline
  Protection Center → orchestrator.start → same pipeline

The orchestrator runs REAL backend modules (junk cleaner, privacy cleaner,
registry cleaner, startup manager, performance optimizer, disk analyzer,
security check, system info). No simulated progress.

RPC methods:
  orchestrator.start      → begin a new session, returns sessionId
  orchestrator.scan       → run all module scans, return results
  orchestrator.optimize   → run all module optimizations, return results
  orchestrator.status     → poll session status / progress / activity / counters
  orchestrator.result     → get final session result (scores, history, summary)
  orchestrator.cancel     → cancel a running session
  orchestrator.full       → synchronous full pipeline (scan + optimize)
  orchestrator.fullAsync  → async full pipeline in background thread
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.orchestrator.health_model import (
    calculate_health_model,
    calculate_after_health_model,
    get_profile_modules,
    get_optimize_modules,
    SCAN_PROFILES,
)

log = logging.getLogger("avs.orchestrator")

# ── Session state ───────────────────────────────────────────────────

_sessions: dict[str, dict[str, Any]] = {}
_sessions_lock = threading.Lock()

# Maximum activity log entries kept in session state
_MAX_ACTIVITIES = 50

# ── Instrumentation ─────────────────────────────────────────────────

_instrumentation: dict[str, dict[str, Any]] = {}
_instrumentation_lock = threading.Lock()


def _init_instrument(session_id: str) -> None:
    with _instrumentation_lock:
        _instrumentation[session_id] = {
            "modules": {},  # module_id -> instrument data
            "sessionStart": time.monotonic(),
            "maxUpdateGapMs": 0,
            "lastUpdateTs": time.monotonic(),
        }


def _record_module_instrument(session_id: str, module_id: str, phase: str,
                               duration_ms: int, files_scanned: int = 0,
                               files_cleaned: int = 0) -> None:
    with _instrumentation_lock:
        inst = _instrumentation.get(session_id)
        if not inst:
            return
        mod_data = inst["modules"].setdefault(module_id, {})
        mod_data[f"{phase}_ms"] = duration_ms
        if files_scanned:
            mod_data["filesScanned"] = mod_data.get("filesScanned", 0) + files_scanned
        if files_cleaned:
            mod_data["filesCleaned"] = mod_data.get("filesCleaned", 0) + files_cleaned
        if phase == "scan" and duration_ms > 0:
            mod_data["scanThroughput"] = round(files_scanned / (duration_ms / 1000), 1) if files_scanned else 0


def _tick_update(session_id: str) -> None:
    """Record a UI update tick and track max gap between updates."""
    with _instrumentation_lock:
        inst = _instrumentation.get(session_id)
        if not inst:
            return
        now = time.monotonic()
        gap_ms = int((now - inst["lastUpdateTs"]) * 1000)
        if gap_ms > inst["maxUpdateGapMs"]:
            inst["maxUpdateGapMs"] = gap_ms
        inst["lastUpdateTs"] = now


def _get_instrumentation(session_id: str) -> dict[str, Any] | None:
    with _instrumentation_lock:
        return _instrumentation.get(session_id)


def _clear_instrumentation(session_id: str) -> None:
    with _instrumentation_lock:
        _instrumentation.pop(session_id, None)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_session() -> dict[str, Any]:
    return {
        "sessionId": str(uuid.uuid4()),
        "phase": "idle",        # idle → scanning → optimizing → verifying → complete
        "progress": 0,          # 0-100
        "currentModule": None,
        "modules": {},          # moduleId → module result dict
        "scanResults": {},      # moduleId → scan result from backend
        "optimizeResults": {},  # moduleId → optimize result from backend
        "overallScoreBefore": 0,
        "overallScoreAfter": 0,
        "issuesBefore": 0,
        "issuesAfter": 0,
        "recoverableSpace": 0,
        "spaceRecovered": 0,
        "startedAt": _now_iso(),
        "completedAt": None,
        "error": None,
        "cancelled": False,
        "history": None,        # history entry dict once complete
        "profile": "dashboard",  # scan profile: dashboard | optimize | protection
        "healthModel": None,     # unified health model (before)
        "healthModelAfter": None, # unified health model (after)
        # Real-time streaming data
        "activityLog": [],      # list of {ts, module, action, detail, operation?, path?}
        "counters": {           # live counters updated during scan/optimize
            "itemsScanned": 0,
            "itemsAnalyzed": 0,
            "itemsOptimized": 0,
            "itemsSkipped": 0,
            "storageRecovered": 0,
            "elapsedMs": 0,
            "itemsCleaned": 0,
            "registryFixed": 0,
            "threatsChecked": 0,
        },
        "moduleStatuses": {},   # moduleId → {status, progress, itemsScanned, issuesFound}
        "currentOperation": None,   # e.g. 'Scanning', 'Cleaning', 'Optimizing'
        "currentPath": None,        # real file/folder path when available
        "itemsProcessed": 0,        # total items processed so far
        "itemsRemaining": 0,        # estimated items remaining
        "bytesRecovered": 0,        # total bytes recovered so far
        "instrumentation": None,   # per-module timing/throughput data
    }


def _get_session(session_id: str) -> dict[str, Any] | None:
    with _sessions_lock:
        return _sessions.get(session_id)


def _update_session(session_id: str, patch: dict[str, Any]) -> None:
    with _sessions_lock:
        s = _sessions.get(session_id)
        if s:
            s.update(patch)
    _tick_update(session_id)


def _add_activity(session_id: str, module: str, action: str, detail: str,
                    operation: str | None = None, path: str | None = None) -> None:
    """Append an activity entry to the session log (thread-safe, capped).

    Each entry includes:
      ts        — ISO timestamp
      module    — which module (junk, privacy, registry, ...)
      action    — scanning, scanned, optimizing, optimized, verifying, error, skipped
      detail    — human-readable description
      operation — machine-readable operation label (e.g. 'Scanning', 'Cleaning')
      path      — real file/folder path when available
    """
    entry = {
        "ts": _now_iso(),
        "module": module,
        "action": action,
        "detail": detail,
    }
    if operation:
        entry["operation"] = operation
    if path:
        entry["path"] = path
    with _sessions_lock:
        s = _sessions.get(session_id)
        if s:
            s["activityLog"].append(entry)
            # Trim to last N entries
            if len(s["activityLog"]) > _MAX_ACTIVITIES:
                s["activityLog"] = s["activityLog"][-_MAX_ACTIVITIES:]


def _update_counters(session_id: str, counters: dict[str, int]) -> None:
    """Merge counter updates into the session (thread-safe).

    Most counters are cumulative (added to previous value).
    bytesRecovered and elapsedMs are set directly (not cumulative).
    """
    with _sessions_lock:
        s = _sessions.get(session_id)
        if s:
            for k, v in counters.items():
                if k in ("elapsedMs", "bytesRecovered"):
                    s["counters"][k] = v
                else:
                    s["counters"][k] = s["counters"].get(k, 0) + v


def _set_module_status(session_id: str, module_id: str, status: str,
                        progress: int = 0, items_scanned: int = 0,
                        issues_found: int = 0) -> None:
    """Update per-module status in the session (thread-safe)."""
    with _sessions_lock:
        s = _sessions.get(session_id)
        if s:
            s["moduleStatuses"][module_id] = {
                "status": status,
                "progress": progress,
                "itemsScanned": items_scanned,
                "issuesFound": issues_found,
            }


def _update_elapsed(session_id: str, start_time: float) -> None:
    """Update the elapsed time counter."""
    elapsed = int((time.monotonic() - start_time) * 1000)
    with _sessions_lock:
        s = _sessions.get(session_id)
        if s:
            s["counters"]["elapsedMs"] = elapsed


# ── Module definitions ──────────────────────────────────────────────

# Each module: id, name, canAutoFix, scanFn, optimizeFn
# scanFn/optimizeFn are callables that take () and return a dict.

MODULE_ORDER = [
    "junk",
    "privacy",
    "registry",
    "startup",
    "performance",
    "disk",
    "security",
    "system",
]


def _module_name(mid: str) -> str:
    names = {
        "junk": "Junk Cleaner",
        "privacy": "Privacy Cleaner",
        "registry": "Registry Cleaner",
        "startup": "Startup Manager",
        "performance": "Performance",
        "disk": "Disk Analyzer",
        "security": "Security Check",
        "system": "System Information",
    }
    return names.get(mid, mid)


def _can_auto_fix(mid: str) -> bool:
    return mid in ("junk", "privacy", "registry", "startup", "performance")


# ── Real scan implementations ───────────────────────────────────────

def _scan_junk(session_id: str | None = None) -> dict[str, Any]:
    """Run junk cleaner scan via the cleaner module."""
    _scan_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "junk", "scanning", "Scanning temporary files...", operation="Scanning")
    from avs_backend.cleaner import _ensure_singletons, _scan_manager, _cleaners
    _ensure_singletons()
    cleaners = _cleaners or []
    if _scan_manager is None:
        return {"issues": 0, "size": 0, "error": "Scan manager not ready"}
    cleaner_ids = [c.id for c in cleaners]
    if session_id:
        _add_activity(session_id, "junk", "scanning", f"Starting scan with {len(cleaner_ids)} cleaners", operation="Scanning")
    task_id = _scan_manager.start(only=cleaner_ids)
    # Wait for scan to complete (poll at 300ms for responsive UI), emitting real paths and progress
    for _ in range(200):  # max 60 seconds at 300ms
        snap = _scan_manager.snapshot(task_id)
        if snap is None:
            break
        if snap.status.value in ("completed", "done", "cancelled", "error"):
            break
        if session_id:
            if snap.total_files > 0:
                _add_activity(session_id, "junk", "scanning", f"Found {snap.total_files} files ({snap.total_bytes} bytes)", operation="Scanning",
                              path=snap.current_path)
            else:
                _add_activity(session_id, "junk", "scanning", f"Scanning... {snap.current_cleaner or ''}", operation="Scanning",
                              path=snap.current_path)
            _update_session(session_id, {"currentPath": snap.current_path})
        time.sleep(0.3)
    snap = _scan_manager.snapshot(task_id)
    if snap is None:
        return {"issues": 0, "size": 0, "error": "Scan snapshot unavailable"}
    total_files = snap.total_files
    total_bytes = snap.total_bytes
    if session_id:
        _add_activity(session_id, "junk", "scanned", f"Junk scan complete: {total_files} files, {total_bytes} bytes", operation="Scanned")
        _update_counters(session_id, {"itemsScanned": total_files})
        _update_session(session_id, {"itemsProcessed": total_files, "itemsRemaining": 0})
        _record_module_instrument(session_id, "junk", "scan", int((time.monotonic() - _scan_start) * 1000), files_scanned=total_files)
    return {
        "issues": total_files,
        "size": total_bytes,
        "cleaners": cleaner_ids,
    }


def _scan_privacy(session_id: str | None = None) -> dict[str, Any]:
    """Run privacy cleaner scan."""
    _scan_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "privacy", "scanning", "Scanning browser traces and privacy data...", operation="Scanning")
    from avs_backend.privacy.privacy_cleaner import scan_privacy_items
    from threading import Event

    # Build a progress callback that emits activities to the session
    _last_privacy_pct = [0]
    def _on_privacy_progress(pct: int) -> None:
        if not session_id:
            return
        # Emit activity every 10% change to avoid flooding
        if pct - _last_privacy_pct[0] >= 10:
            _last_privacy_pct[0] = pct
            _add_activity(session_id, "privacy", "scanning", f"Privacy scan {pct}% complete", operation="Scanning")
            _update_session(session_id, {"progress": pct})

    result = scan_privacy_items(Event(), _on_privacy_progress, None)
    if session_id:
        # Emit real file paths for the first few items found
        for item in result.items[:5]:
            _add_activity(session_id, "privacy", "scanning", f"Found: {item.description}", operation="Scanning", path=item.path)
        _add_activity(session_id, "privacy", "scanned", f"Privacy scan complete: {len(result.items)} items found", operation="Scanned")
        _update_counters(session_id, {"itemsScanned": len(result.items)})
        _record_module_instrument(session_id, "privacy", "scan", int((time.monotonic() - _scan_start) * 1000), files_scanned=len(result.items))
    return {
        "issues": len(result.items),
        "size": result.total_size,
        "items": [
            {
                "category": item.category.value,
                "path": item.path,
                "size": item.size,
                "description": item.description,
                "safeToDelete": item.safe_to_delete,
                "riskLevel": item.risk_level.value,
                "canRestore": item.can_restore,
            }
            for item in result.items
        ],
        "categoriesFound": [c.value for c in result.categories_found],
    }


def _scan_registry(session_id: str | None = None) -> dict[str, Any]:
    """Run registry cleaner scan."""
    _scan_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "registry", "scanning", "Scanning registry keys and broken entries...", operation="Scanning")
    from avs_backend.registry_cleaner.registry_scanner import scan_registry, _SCANNERS
    # Scan categories individually to emit progress per category
    all_categories = list(_SCANNERS.keys())
    all_issues = []
    for cat_idx, cat in enumerate(all_categories):
        try:
            cat_result = scan_registry([cat])
            all_issues.extend(cat_result.issues)
            if session_id:
                pct = int((cat_idx + 1) / len(all_categories) * 100)
                _add_activity(session_id, "registry", "scanning", f"Scanned {cat}: {len(cat_result.issues)} issues ({pct}%)", operation="Scanning")
                _update_session(session_id, {"progress": pct})
        except Exception as e:
            log.warning("Registry scan for %s failed: %s", cat, e)
    # Build a result-like object with a real per-category breakdown
    class _RegistryResult:
        def __init__(self, issues):
            self.issues = issues
        def breakdown(self):
            out: dict[str, int] = {}
            for issue in self.issues:
                cat = getattr(issue, "category", "unknown")
                out[cat] = out.get(cat, 0) + 1
            return out
    result = _RegistryResult(all_issues)
    if session_id:
        # Emit real registry key paths for the first few issues found
        for issue in result.issues[:5]:
            _add_activity(session_id, "registry", "scanning", f"Found: {issue.to_dict().get('description', 'registry issue')}", operation="Scanning", path=issue.to_dict().get('key', None))
        _add_activity(session_id, "registry", "scanned", f"Registry scan complete: {len(result.issues)} issues found", operation="Scanned")
        _update_counters(session_id, {"itemsScanned": len(result.issues)})
        _record_module_instrument(session_id, "registry", "scan", int((time.monotonic() - _scan_start) * 1000), files_scanned=len(result.issues))
    return {
        "issues": len(result.issues),
        "size": 0,
        "items": [issue.to_dict() for issue in result.issues],
        "categoryBreakdown": result.breakdown(),
    }


def _scan_startup(session_id: str | None = None) -> dict[str, Any]:
    """Run startup manager scan."""
    _scan_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "startup", "scanning", "Scanning startup applications and services...", operation="Scanning")
    from avs_backend.startup.startup_manager import scan_startup_entries
    entries = scan_startup_entries()
    # Filter out critical system entries — they can't be disabled and
    # shouldn't count as issues since they can't be fixed.
    from avs_backend.startup.startup_manager import _is_critical_system_entry
    high_impact = [e for e in entries if e.impact.value == "high" and e.enabled and not _is_critical_system_entry(e)]
    skipped_critical = [e for e in entries if e.impact.value == "high" and e.enabled and _is_critical_system_entry(e)]
    if session_id and skipped_critical:
        _add_activity(session_id, "startup", "scanning", f"Skipped {len(skipped_critical)} critical system entries", operation="Scanning")
    if session_id:
        # Emit real startup entry locations for high-impact items
        for e in high_impact[:5]:
            _add_activity(session_id, "startup", "scanning", f"High-impact: {e.name} ({e.publisher})", operation="Scanning", path=e.location)
        _add_activity(session_id, "startup", "scanned", f"Startup scan complete: {len(entries)} entries, {len(high_impact)} high-impact", operation="Scanned")
        _update_counters(session_id, {"itemsScanned": len(entries)})
        _record_module_instrument(session_id, "startup", "scan", int((time.monotonic() - _scan_start) * 1000), files_scanned=len(entries))
    return {
        "issues": len(high_impact),
        "size": 0,
        "entries": [
            {
                "name": e.name,
                "publisher": e.publisher,
                "status": e.status.value,
                "impact": e.impact.value,
                "source": e.source.value,
                "location": e.location,
                "command": e.command,
                "enabled": e.enabled,
            }
            for e in entries if not _is_critical_system_entry(e)
        ],
    }


def _scan_performance(session_id: str | None = None) -> dict[str, Any]:
    """Run performance monitor scan."""
    _scan_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "performance", "scanning", "Analyzing CPU, memory, and performance metrics...", operation="Scanning")
    from avs_backend.performance.live_monitor import get_system_metrics, generate_alerts, metrics_to_dict
    metrics = get_system_metrics()
    alerts = generate_alerts(metrics)
    metrics_dict = metrics_to_dict(metrics)
    mem_info = None
    try:
        from avs_backend.performance.memory_optimizer import get_memory_info
        mem_info = get_memory_info()
    except Exception:
        pass
    ram_recovery = 0
    if mem_info:
        ram_recovery = max(0, mem_info.used_ram - mem_info.total_ram * 0.5)
    if session_id:
        _add_activity(session_id, "performance", "scanned", f"Performance scan complete: {len(alerts)} alerts, {int(ram_recovery)} bytes recoverable", operation="Scanned")
        _update_counters(session_id, {"itemsScanned": len(alerts)})
        _record_module_instrument(session_id, "performance", "scan", int((time.monotonic() - _scan_start) * 1000), files_scanned=len(alerts))
    return {
        "issues": len(alerts),
        "size": int(ram_recovery),
        "metrics": metrics_dict,
        "alerts": [{"type": a.alert_type, "message": a.message} for a in alerts] if alerts else [],
        "memoryInfo": {
            "total": mem_info.total_ram if mem_info else 0,
            "used": mem_info.used_ram if mem_info else 0,
            "usage": mem_info.memory_load_percent if mem_info else 0,
        } if mem_info else None,
    }


def _scan_disk(session_id: str | None = None) -> dict[str, Any]:
    """Run disk analyzer scan using psutil directly."""
    _scan_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "disk", "scanning", "Analyzing disk space usage...", operation="Scanning")
    import psutil
    drives = []
    try:
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                drives.append({
                    "device": part.device,
                    "mountpoint": part.mountpoint,
                    "fstype": part.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent,
                })
                if session_id:
                    _add_activity(session_id, "disk", "scanning", f"{part.device}: {usage.percent}% used", operation="Scanning", path=part.mountpoint)
            except OSError:
                continue
    except Exception as e:
        log.warning("Disk scan failed: %s", e)
    full = [d for d in drives if d.get("percent", 0) > 80]
    if session_id:
        _add_activity(session_id, "disk", "scanned", f"Disk scan complete: {len(drives)} drives, {len(full)} nearly full", operation="Scanned")
        _update_counters(session_id, {"itemsScanned": len(drives)})
        _record_module_instrument(session_id, "disk", "scan", int((time.monotonic() - _scan_start) * 1000), files_scanned=len(drives))
    return {
        "issues": len(full),
        "size": sum(d.get("used", 0) for d in drives),
        "drives": drives,
    }


def _scan_security(session_id: str | None = None) -> dict[str, Any]:
    """Run security check via dashboard metrics."""
    _scan_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "security", "scanning", "Checking security features and Windows updates...", operation="Scanning")
    from avs_backend.dashboard import _collect_metrics
    metrics = _collect_metrics()
    sec = metrics.get("security", {}) if isinstance(metrics, dict) else {}
    pending = sec.get("updates", {}).get("pendingUpdates", 0)
    defender = 0 if sec.get("defender", {}).get("enabled") else 1
    firewall = 0 if sec.get("firewall", {}).get("enabled") else 1
    if session_id:
        # Emit real security check details
        _add_activity(session_id, "security", "scanning", f"Windows Defender: {'Enabled' if not defender else 'Disabled'}", operation="Scanning")
        _add_activity(session_id, "security", "scanning", f"Firewall: {'Enabled' if not firewall else 'Disabled'}", operation="Scanning")
        _add_activity(session_id, "security", "scanning", f"Pending Windows Updates: {pending}", operation="Scanning")
        _add_activity(session_id, "security", "scanned", f"Security check complete: {pending + defender + firewall} issues", operation="Scanned")
        _update_counters(session_id, {"itemsScanned": 1, "threatsChecked": 1})
        _record_module_instrument(session_id, "security", "scan", int((time.monotonic() - _scan_start) * 1000))
    return {
        "issues": pending + defender + firewall,
        "size": 0,
        "details": sec,
    }


def _scan_system(session_id: str | None = None) -> dict[str, Any]:
    """Run system info scan using psutil directly."""
    _scan_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "system", "scanning", "Gathering system information...", operation="Scanning")
    import psutil
    import platform as _platform
    boot_time = psutil.boot_time()
    import time as _time
    uptime_days = (_time.time() - boot_time) / 86400
    info = {
        "os": {
            "system": _platform.system(),
            "release": _platform.release(),
            "version": _platform.version(),
            "hostname": _platform.node(),
            "bootTime": boot_time,
        },
        "cpu": {
            "name": _platform.processor(),
            "cores": psutil.cpu_count(logical=False),
            "logicalCores": psutil.cpu_count(logical=True),
        },
    }
    if session_id:
        _add_activity(session_id, "system", "scanned", f"System info: {_platform.system()} {_platform.release()}, uptime {uptime_days:.1f} days", operation="Scanned")
        _update_counters(session_id, {"itemsScanned": 1})
        _record_module_instrument(session_id, "system", "scan", int((time.monotonic() - _scan_start) * 1000))
    return {
        "issues": 1 if uptime_days > 30 else 0,
        "size": 0,
        "info": info,
        "uptimeDays": uptime_days,
    }


SCAN_FNS = {
    "junk": _scan_junk,
    "privacy": _scan_privacy,
    "registry": _scan_registry,
    "startup": _scan_startup,
    "performance": _scan_performance,
    "disk": _scan_disk,
    "security": _scan_security,
    "system": _scan_system,
}


# ── Real optimize implementations ───────────────────────────────────

def _optimize_junk(scan_result: dict[str, Any], session_id: str | None = None) -> dict[str, Any]:
    """Execute junk cleaning."""
    _opt_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "junk", "optimizing", "Cleaning temporary files and browser caches...", operation="Cleaning")
    from avs_backend.dashboard import dashboard_optimize_execute
    result = dashboard_optimize_execute(None)
    recovered = result.get("totalRecovered", 0)
    total_files_found = result.get("totalFilesFound", 0)
    total_files_removed = result.get("totalFilesRemoved", 0)
    total_files_skipped = result.get("totalFilesSkipped", 0)
    results_detail = result.get("results", {})
    items_removed = sum(
        1 for r in results_detail.values()
        if isinstance(r, dict) and r.get("cleaned") and not r.get("error")
    )
    errors = [
        r.get("error") for r in results_detail.values()
        if isinstance(r, dict) and r.get("error")
    ]
    if session_id:
        # Emit per-category cleanup events
        for cat_name, cat_result in results_detail.items():
            if isinstance(cat_result, dict) and cat_result.get("cleaned"):
                _add_activity(session_id, "junk", "optimizing", f"Cleaned {cat_name}: {cat_result.get('filesRemoved', 0)} files", operation="Cleaning")
        _add_activity(session_id, "junk", "optimized", f"Junk cleaning complete: {total_files_removed} files removed, {items_removed} categories cleaned, {recovered} bytes recovered", operation="Cleaned")
        _update_counters(session_id, {"itemsOptimized": items_removed, "storageRecovered": recovered, "itemsCleaned": items_removed})
        _record_module_instrument(session_id, "junk", "optimize", int((time.monotonic() - _opt_start) * 1000), files_cleaned=total_files_removed)
    return {
        "success": result.get("success", False),
        "bytesRecovered": recovered,
        "itemsRemoved": total_files_removed,
        "filesFound": total_files_found,
        "filesSkipped": total_files_skipped,
        "categoriesCleaned": items_removed,
        "errors": errors,
        "details": result,
    }


def _optimize_privacy(scan_result: dict[str, Any], session_id: str | None = None) -> dict[str, Any]:
    """Execute privacy cleaning."""
    _opt_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "privacy", "optimizing", "Cleaning privacy traces...", operation="Cleaning")
    from avs_backend.privacy.privacy_cleaner import PrivacyItem, PrivacyCategory, RiskLevel, clean_privacy_items
    from threading import Event
    items_data = scan_result.get("items", [])
    if not items_data:
        if session_id:
            _add_activity(session_id, "privacy", "optimized", "No privacy items to clean", operation="Cleaned")
        return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "errors": []}
    items = [
        PrivacyItem(
            category=PrivacyCategory(item["category"]),
            path=item["path"],
            size=item["size"],
            description=item["description"],
            safe_to_delete=item.get("safeToDelete", True),
            risk_level=RiskLevel(item.get("riskLevel", "low")),
            can_restore=item.get("canRestore", False),
        )
        for item in items_data
    ]
    # Build a progress callback for privacy cleaning
    _last_clean_pct = [0]
    def _on_privacy_clean_progress(pct: int) -> None:
        if not session_id:
            return
        if pct - _last_clean_pct[0] >= 10:
            _last_clean_pct[0] = pct
            _add_activity(session_id, "privacy", "optimizing", f"Privacy cleaning {pct}% complete", operation="Cleaning")
            _update_session(session_id, {"progress": pct})

    result = clean_privacy_items(items, Event(), _on_privacy_clean_progress)
    errors = result.errors or []
    if session_id:
        _add_activity(session_id, "privacy", "optimized", f"Privacy cleaning complete: {result.items_cleaned or 0} items cleaned", operation="Cleaned")
        _update_counters(session_id, {"itemsOptimized": result.items_cleaned or 0, "itemsCleaned": result.items_cleaned or 0})
        _record_module_instrument(session_id, "privacy", "optimize", int((time.monotonic() - _opt_start) * 1000), files_cleaned=result.items_cleaned or 0)
    return {
        "success": len(errors) == 0,
        "bytesRecovered": result.space_freed or 0,
        "itemsRemoved": result.items_cleaned or 0,
        "errors": errors,
    }


def _optimize_registry(scan_result: dict[str, Any], session_id: str | None = None) -> dict[str, Any]:
    """Execute registry cleaning."""
    _opt_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "registry", "optimizing", "Repairing registry entries...", operation="Optimizing")
    from avs_backend.registry_cleaner.registry_scanner import RegistryIssue, fix_issues
    issues_data = scan_result.get("items", [])
    if not issues_data:
        if session_id:
            _add_activity(session_id, "registry", "optimized", "No registry issues to fix", operation="Optimized")
        return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "errors": []}
    issues = [RegistryIssue.from_dict(d) for d in issues_data]
    result = fix_issues(issues)
    errors = result.get("errors", []) or []
    fixed = result.get("fixed", 0)
    if session_id:
        _add_activity(session_id, "registry", "optimized", f"Registry repair complete: {fixed} issues fixed", operation="Optimized")
        _update_counters(session_id, {"itemsOptimized": fixed, "registryFixed": fixed})
        _record_module_instrument(session_id, "registry", "optimize", int((time.monotonic() - _opt_start) * 1000), files_cleaned=fixed)
    return {
        "success": len(errors) == 0,
        "bytesRecovered": 0,
        "itemsRemoved": fixed,
        "errors": errors,
    }


def _optimize_startup(scan_result: dict[str, Any], session_id: str | None = None) -> dict[str, Any]:
    """Execute startup optimization — disable high-impact enabled entries."""
    _opt_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "startup", "optimizing", "Disabling high-impact startup entries...", operation="Optimizing")
    from avs_backend.startup.startup_manager import disable_startup_entry, StartupEntry, StartupStatus, StartupImpact, StartupSource, _is_critical_system_entry
    entries_data = scan_result.get("entries", [])
    to_disable = [e for e in entries_data if e.get("enabled") and e.get("impact") == "high"]
    # Skip critical system entries — they can't be disabled
    to_disable = [e for e in to_disable if not _is_critical_system_entry(
        StartupEntry(
            name=e.get("name", ""),
            publisher=e.get("publisher", ""),
            status=StartupStatus(e.get("status", "enabled")),
            impact=StartupImpact(e.get("impact", "medium")),
            source=StartupSource(e.get("source", "registry_run")),
            location=e.get("location", ""),
            command=e.get("command", ""),
            enabled=True,
        )
    )]
    if not to_disable:
        if session_id:
            _add_activity(session_id, "startup", "optimized", "No safe-to-disable startup entries found", operation="Optimized")
        return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "entriesDisabled": 0, "errors": []}
    disabled = 0
    errors: list[str] = []
    for entry_data in to_disable:
        try:
            if session_id:
                _add_activity(session_id, "startup", "optimizing", f"Disabling: {entry_data['name']}", operation="Optimizing")
            entry = StartupEntry(
                name=entry_data["name"],
                publisher=entry_data.get("publisher", ""),
                status=StartupStatus(entry_data.get("status", "enabled")),
                impact=StartupImpact(entry_data.get("impact", "medium")),
                source=StartupSource(entry_data.get("source", "registry_run")),
                location=entry_data.get("location", ""),
                command=entry_data.get("command", ""),
                enabled=True,
            )
            result = disable_startup_entry(entry)
            if result.get("success"):
                disabled += 1
            else:
                errors.append(result.get("reason", f"Failed to disable {entry_data['name']}"))
        except Exception as e:
            errors.append(f"{entry_data.get('name', 'unknown')}: {e}")
    if session_id:
        _add_activity(session_id, "startup", "optimized", f"Startup optimization complete: {disabled} entries disabled", operation="Optimized")
        _update_counters(session_id, {"itemsOptimized": disabled})
        _record_module_instrument(session_id, "startup", "optimize", int((time.monotonic() - _opt_start) * 1000), files_cleaned=disabled)
    return {
        "success": len(errors) == 0,
        "bytesRecovered": 0,
        "itemsRemoved": 0,
        "entriesDisabled": disabled,
        "errors": errors[:10],
    }


def _optimize_performance(scan_result: dict[str, Any], session_id: str | None = None) -> dict[str, Any]:
    """Execute memory optimization."""
    _opt_start = time.monotonic()
    if session_id:
        _add_activity(session_id, "performance", "optimizing", "Optimizing memory and processes...", operation="Optimizing")
    from avs_backend.performance.memory_optimizer import optimize_memory
    from threading import Event
    # Build a progress callback for memory optimization
    _last_mem_pct = [0]
    def _on_mem_progress(pct: int) -> None:
        if not session_id:
            return
        if pct - _last_mem_pct[0] >= 10:
            _last_mem_pct[0] = pct
            _add_activity(session_id, "performance", "optimizing", f"Memory optimization {pct}% complete", operation="Optimizing")
            _update_session(session_id, {"progress": pct})
    result = optimize_memory(Event(), _on_mem_progress)
    errors = result.errors or []
    success = result.status.value in ("completed", "success") or (len(errors) == 0 and (result.memory_freed > 0 or result.processes_optimized > 0))
    if session_id:
        _add_activity(session_id, "performance", "optimized", f"Memory optimization complete: {result.memory_freed or 0} bytes freed", operation="Optimized")
        _update_counters(session_id, {"itemsOptimized": result.processes_optimized or 0, "storageRecovered": result.memory_freed or 0})
        _record_module_instrument(session_id, "performance", "optimize", int((time.monotonic() - _opt_start) * 1000))
    return {
        "success": success,
        "bytesRecovered": result.memory_freed or 0,
        "itemsRemoved": 0,
        "issuesFixed": result.processes_optimized or 0,
        "errors": errors,
    }


def _optimize_disk(scan_result: dict[str, Any], session_id: str | None = None) -> dict[str, Any]:
    """Disk analyzer is informational — no auto-fix."""
    if session_id:
        _add_activity(session_id, "disk", "skipped", "Disk analyzer is informational — no auto-fix", operation="Skipped")
        _update_counters(session_id, {"itemsSkipped": 1})
    return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "errors": [], "reason": "No auto-fix — use Disk Analyzer page to review"}


def _optimize_security(scan_result: dict[str, Any], session_id: str | None = None) -> dict[str, Any]:
    """Security check requires manual action."""
    if session_id:
        _add_activity(session_id, "security", "skipped", "Security requires manual action via Windows Security", operation="Skipped")
        _update_counters(session_id, {"itemsSkipped": 1})
    return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "errors": [], "reason": "Requires manual action via Windows Security"}


def _optimize_system(scan_result: dict[str, Any], session_id: str | None = None) -> dict[str, Any]:
    """System info is informational."""
    if session_id:
        _add_activity(session_id, "system", "skipped", "System info is informational — restart if uptime is high", operation="Skipped")
        _update_counters(session_id, {"itemsSkipped": 1})
    return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "errors": [], "reason": "No changes — restart if uptime is high"}


OPTIMIZE_FNS = {
    "junk": _optimize_junk,
    "privacy": _optimize_privacy,
    "registry": _optimize_registry,
    "startup": _optimize_startup,
    "performance": _optimize_performance,
    "disk": _optimize_disk,
    "security": _optimize_security,
    "system": _optimize_system,
}


# ── Score calculation ───────────────────────────────────────────────

def _calculate_module_score(mid: str, scan_result: dict[str, Any]) -> int:
    """Calculate a 0-100 health score for a module from its scan result."""
    issues = scan_result.get("issues", 0)
    size = scan_result.get("size", 0)
    if mid == "junk":
        return max(0, 100 - min(issues / 100, 100))
    elif mid == "privacy":
        return max(0, 100 - issues * 2)
    elif mid == "registry":
        return max(0, 100 - issues)
    elif mid == "startup":
        return max(0, 100 - issues * 5)
    elif mid == "performance":
        return max(0, 100 - issues * 10 - 20)
    elif mid == "disk":
        drives = scan_result.get("drives", [])
        if not drives:
            return 100
        full = [d for d in drives if d.get("percent", 0) > 80]
        avg_usage = sum(d.get("percent", 0) for d in drives) / len(drives)
        return max(0, 100 - len(full) * 25 - avg_usage / 2)
    elif mid == "security":
        return max(0, 100 - issues * 20)
    elif mid == "system":
        return 80 if issues > 0 else 95
    return 100


def _calculate_after_score(mid: str, before_score: int, scan_result: dict[str, Any], optimize_result: dict[str, Any]) -> int:
    """Calculate post-optimization score.

    Score only increases when items were actually fixed (removed, disabled, or repaired).
    Bytes recovered alone without item counts is not enough — the verification
    re-scan will confirm whether actual changes occurred.
    """
    items_fixed = (
        optimize_result.get("itemsRemoved", 0)
        + optimize_result.get("entriesDisabled", 0)
        + optimize_result.get("issuesFixed", 0)
    )
    before_issues = scan_result.get("issues", 0)

    if items_fixed > 0 and before_issues > 0:
        if items_fixed >= before_issues:
            return 100
        ratio = items_fixed / before_issues
        boost = max(1, int(ratio * (100 - before_score)))
        return min(100, before_score + boost)

    if items_fixed > 0 and before_issues == 0:
        return min(100, before_score + 5)

    # Nothing was fixed — score must not increase
    return before_score


# ── RPC: orchestrator.start ─────────────────────────────────────────

@register("orchestrator.start")
def orchestrator_start(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Start a new optimization session. Returns sessionId."""
    session = _new_session()
    with _sessions_lock:
        _sessions[session["sessionId"]] = session
    log.info("Orchestrator session started: %s", session["sessionId"])
    return {"sessionId": session["sessionId"], "startedAt": session["startedAt"]}


# ── RPC: orchestrator.scan ──────────────────────────────────────────

@register("orchestrator.scan")
def orchestrator_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Run module scans sequentially. Returns full scan results.

    Accepts optional 'profile' param: 'dashboard' | 'optimize' | 'protection'
    to control which modules are scanned.
    """
    session_id = params.get("sessionId") if params else None
    profile = params.get("profile", "dashboard") if params else "dashboard"
    if not session_id:
        session = _new_session()
        session_id = session["sessionId"]
        with _sessions_lock:
            _sessions[session_id] = session

    session = _get_session(session_id)
    if not session:
        return {"error": "Session not found", "sessionId": session_id}

    if session.get("cancelled"):
        return {"error": "Session cancelled", "sessionId": session_id}

    # Determine which modules to scan based on profile
    scan_modules = get_profile_modules(profile)
    _update_session(session_id, {"phase": "scanning", "progress": 0, "currentOperation": "Preparing", "profile": profile})
    _add_activity(session_id, "orchestrator", "preparing", f"Initializing optimization engine (profile: {profile})...", operation="Preparing")
    _init_instrument(session_id)

    modules_result = {}
    total_issues = 0
    total_recoverable = 0
    scores = []

    # Scan ALL modules in the profile — non-fixable modules (disk, security,
    # system) are informational but still need to be scanned so the UI can
    # display real data. They just won't be optimized.
    for i, mid in enumerate(scan_modules):
        session = _get_session(session_id)
        if session and session.get("cancelled"):
            break

        progress = int((i / len(scan_modules)) * 100) if scan_modules else 100
        mod_name = _module_name(mid)
        _update_session(session_id, {
            "currentModule": mid,
            "currentOperation": "Scanning",
            "currentPath": None,
            "progress": progress,
        })
        _set_module_status(session_id, mid, "scanning", progress)
        _add_activity(session_id, mid, "scanning", f"Scanning {mod_name}...", operation="Scanning")

        # Start heartbeat thread to emit progress every 400ms during long scans
        _heartbeat_stop = threading.Event()
        def _heartbeat(_sid=session_id, _mid=mid, _stop=_heartbeat_stop):
            while not _stop.wait(0.4):
                _tick_update(_sid)
                _update_session(_sid, {"currentModule": _mid, "currentOperation": "Scanning"})
        hb_thread = threading.Thread(target=_heartbeat, daemon=True, name=f"hb-{session_id}-{mid}")
        hb_thread.start()

        try:
            scan_fn = SCAN_FNS.get(mid)
            if scan_fn is None:
                modules_result[mid] = {
                    "moduleId": mid,
                    "moduleName": _module_name(mid),
                    "status": "skipped",
                    "issues": 0,
                    "size": 0,
                    "score": 100,
                    "canAutoFix": _can_auto_fix(mid),
                    "error": "No scan function",
                }
                _set_module_status(session_id, mid, "skipped", progress)
                continue

            result = scan_fn(session_id)
            score = _calculate_module_score(mid, result)
            issues = result.get("issues", 0)
            size = result.get("size", 0)
            total_issues += issues
            total_recoverable += size
            scores.append(score)

            modules_result[mid] = {
                "moduleId": mid,
                "moduleName": _module_name(mid),
                "status": "complete",
                "issues": issues,
                "size": size,
                "score": score,
                "canAutoFix": _can_auto_fix(mid),
                "scanResult": result,
            }
            _set_module_status(session_id, mid, "complete", int(((i + 1) / len(scan_modules)) * 100) if scan_modules else 100, issues, issues)
        except Exception as e:
            log.error("Scan failed for module %s: %s", mid, e)
            modules_result[mid] = {
                "moduleId": mid,
                "moduleName": _module_name(mid),
                "status": "error",
                "issues": 0,
                "size": 0,
                "score": 100,
                "canAutoFix": _can_auto_fix(mid),
                "error": str(e),
            }
            _set_module_status(session_id, mid, "error", progress)
            _add_activity(session_id, mid, "error", f"Scan failed: {e}")
            scores.append(100)  # Don't penalize for scan failure
        finally:
            _heartbeat_stop.set()
            hb_thread.join(timeout=1.0)

    overall = int(sum(scores) / len(scores)) if scores else 0

    # Calculate unified health model from per-module scores
    module_scores = {mid: m.get("score", 100) for mid, m in modules_result.items()}
    module_issues_map = {mid: m.get("issues", 0) for mid, m in modules_result.items()}
    health_model = calculate_health_model(module_scores, module_issues_map)

    _update_session(session_id, {
        "phase": "scanned",
        "progress": 100,
        "modules": modules_result,
        "scanResults": {mid: m.get("scanResult", {}) for mid, m in modules_result.items()},
        "issuesBefore": total_issues,
        "recoverableSpace": total_recoverable,
        "overallScoreBefore": overall,
        "healthModel": health_model,
        "currentModule": None,
        "currentOperation": None,
        "currentPath": None,
        "itemsProcessed": total_issues,
        "itemsRemaining": total_issues,
    })

    return {
        "sessionId": session_id,
        "modules": modules_result,
        "overallScore": overall,
        "totalIssues": total_issues,
        "recoverableSpace": total_recoverable,
        "healthModel": health_model,
        "profile": profile,
    }


# ── RPC: orchestrator.optimize ──────────────────────────────────────

@register("orchestrator.optimize")
def orchestrator_optimize(params: dict[str, Any] | None) -> dict[str, Any]:
    """Run module optimizations sequentially. Returns full results.

    Uses the scan profile stored in the session to determine which
    modules to optimize.
    """
    session_id = params.get("sessionId") if params else None
    if not session_id:
        return {"error": "sessionId required"}

    session = _get_session(session_id)
    if not session:
        return {"error": "Session not found", "sessionId": session_id}

    if session.get("cancelled"):
        return {"error": "Session cancelled", "sessionId": session_id}

    modules = session.get("modules", {})
    scan_results = session.get("scanResults", {})
    profile = session.get("profile", "dashboard")
    # Get modules to optimize based on profile
    profile_optimize_modules = get_optimize_modules(profile)
    _update_session(session_id, {"phase": "optimizing", "progress": 0, "currentOperation": "Analyzing"})
    _add_activity(session_id, "orchestrator", "analyzing", "Analyzing scan results and preparing optimizations...", operation="Analyzing")

    optimize_results = {}
    total_recovered = 0
    total_items_fixed = 0
    total_entries_disabled = 0
    total_issues_fixed = 0
    all_errors: list[str] = []

    fixable = [mid for mid in profile_optimize_modules
               if mid in modules and modules[mid].get("canAutoFix")
               and modules[mid].get("status") == "complete"
               and (modules[mid].get("issues", 0) > 0 or modules[mid].get("size", 0) > 0)]

    # Non-fixable modules are not shown — don't mark them as skipped

    for i, mid in enumerate(fixable):
        session = _get_session(session_id)
        if session and session.get("cancelled"):
            break

        progress = int((i / max(1, len(fixable))) * 100)
        mod_name = _module_name(mid)
        _update_session(session_id, {
            "currentModule": mid,
            "currentOperation": "Optimizing",
            "currentPath": None,
            "progress": progress,
            "itemsProcessed": total_items_fixed + total_entries_disabled + total_issues_fixed,
            "itemsRemaining": len(fixable) - i,
        })
        _set_module_status(session_id, mid, "optimizing", progress)
        _add_activity(session_id, mid, "optimizing", f"Optimizing {mod_name}...", operation="Optimizing")

        # Start heartbeat thread for optimize phase
        _opt_hb_stop = threading.Event()
        def _opt_hb(_sid=session_id, _mid=mid, _stop=_opt_hb_stop):
            while not _stop.wait(0.4):
                _tick_update(_sid)
                _update_session(_sid, {"currentModule": _mid, "currentOperation": "Optimizing"})
        opt_hb_thread = threading.Thread(target=_opt_hb, daemon=True, name=f"opt-hb-{session_id}-{mid}")
        opt_hb_thread.start()

        try:
            opt_fn = OPTIMIZE_FNS.get(mid)
            if opt_fn is None:
                continue
            scan_result = scan_results.get(mid, {})
            result = opt_fn(scan_result, session_id)
            optimize_results[mid] = result
            total_recovered += result.get("bytesRecovered", 0)
            total_items_fixed += result.get("itemsRemoved", 0)
            total_entries_disabled += result.get("entriesDisabled", 0)
            total_issues_fixed += result.get("issuesFixed", 0)
            if result.get("errors"):
                all_errors.extend(result["errors"][:5])
                _set_module_status(session_id, mid, "error", int(((i + 1) / max(1, len(fixable))) * 100))
            else:
                _set_module_status(session_id, mid, "complete", int(((i + 1) / max(1, len(fixable))) * 100))
        except Exception as e:
            log.error("Optimize failed for module %s: %s", mid, e)
            optimize_results[mid] = {
                "success": False,
                "bytesRecovered": 0,
                "itemsRemoved": 0,
                "errors": [str(e)],
            }
            all_errors.append(str(e))
            _set_module_status(session_id, mid, "error", progress)
            _add_activity(session_id, mid, "error", f"Optimize failed: {e}")
        finally:
            _opt_hb_stop.set()
            opt_hb_thread.join(timeout=1.0)

    # Calculate after-scores
    # Verification phase: re-scan modules that were optimized to confirm
    # actual changes occurred on the filesystem/registry/startup.
    _verify_start = time.monotonic()
    _add_activity(session_id, "orchestrator", "verifying", "Re-scanning to verify actual changes...", operation="Verifying")
    verification_results: dict[str, Any] = {}
    for v_idx, mid in enumerate(fixable):
        scan_fn = SCAN_FNS.get(mid)
        if scan_fn is None:
            continue
        # Start heartbeat thread for verification
        _vrf_hb_stop = threading.Event()
        def _vrf_hb(_sid=session_id, _mid=mid, _stop=_vrf_hb_stop):
            while not _stop.wait(0.4):
                _tick_update(_sid)
                _update_session(_sid, {"currentModule": _mid, "currentOperation": "Verifying"})
        vrf_hb_thread = threading.Thread(target=_vrf_hb, daemon=True, name=f"vrf-hb-{session_id}-{mid}")
        vrf_hb_thread.start()
        try:
            _add_activity(session_id, mid, "verifying", f"Verifying {mid} ({v_idx + 1}/{len(fixable)})...", operation="Verifying")
            _update_session(session_id, {
                "currentModule": mid,
                "currentOperation": "Verifying",
                "progress": int((v_idx / max(1, len(fixable))) * 100),
            })
            _verify_mod_start = time.monotonic()
            verify_result = scan_fn(None)
            verification_results[mid] = verify_result
            _record_module_instrument(session_id, mid, "verify", int((time.monotonic() - _verify_mod_start) * 1000))
            _add_activity(session_id, mid, "verified", f"Verified {mid}: {verify_result.get('issues', 0)} remaining issues", operation="Verified")
        except Exception as e:
            log.warning("Verification re-scan failed for %s: %s", mid, e)
        finally:
            _vrf_hb_stop.set()
            vrf_hb_thread.join(timeout=1.0)
    _record_module_instrument(session_id, "orchestrator", "verify_total", int((time.monotonic() - _verify_start) * 1000))

    after_scores = []
    after_issues = 0
    # Only calculate after-scores for fixable modules that were scanned
    fixable_modules = [mid for mid in MODULE_ORDER if _can_auto_fix(mid) and mid in get_profile_modules(profile)]
    for mid in fixable_modules:
        mod = modules.get(mid, {})
        before_score = mod.get("score", 100)
        before_issues = mod.get("issues", 0)
        opt_result = optimize_results.get(mid)
        scan_result = scan_results.get(mid, {})
        verify_result = verification_results.get(mid)

        if opt_result:
            after_score = _calculate_after_score(mid, before_score, scan_result, opt_result)
            items_fixed = (
                opt_result.get("itemsRemoved", 0)
                + opt_result.get("entriesDisabled", 0)
                + opt_result.get("issuesFixed", 0)
            )
            remaining = max(0, before_issues - items_fixed)
            after_issues += remaining

            # Use verification scan to confirm actual changes
            if verify_result:
                verified_issues = verify_result.get("issues", 0)
                # If verification shows fewer issues than before, the optimization worked
                if verified_issues < before_issues:
                    # Recalculate score based on verified state
                    verified_score = _calculate_module_score(mid, verify_result)
                    after_score = max(after_score, verified_score)
                    remaining = verified_issues
                    after_issues = after_issues - (before_issues - items_fixed) + verified_issues
                    mod["verifiedIssues"] = verified_issues
                elif verified_issues == 0 and items_fixed > 0:
                    after_score = 100
                    remaining = 0
                    after_issues = after_issues - remaining
                    mod["verifiedIssues"] = 0
                else:
                    mod["verifiedIssues"] = verified_issues
        else:
            after_score = before_score
            after_issues += before_issues

        after_scores.append(after_score)
        mod["scoreAfter"] = after_score
        mod["issuesAfter"] = max(0, before_issues - (
            (opt_result.get("itemsRemoved", 0) + opt_result.get("entriesDisabled", 0) + opt_result.get("issuesFixed", 0))
            if opt_result else 0
        ))

    overall_after = int(sum(after_scores) / len(after_scores)) if after_scores else 0
    overall_before = session.get("overallScoreBefore", 0)

    # Calculate unified health model (after) from per-module after-scores
    # Only include fixable modules — non-fixable modules don't count toward health
    after_module_scores = {}
    after_module_issues = {}
    for mid in fixable_modules:
        mod = modules.get(mid, {})
        after_module_scores[mid] = mod.get("scoreAfter", mod.get("score", 100))
        after_module_issues[mid] = mod.get("issuesAfter", mod.get("issues", 0))
    before_health_model = session.get("healthModel", calculate_health_model(after_module_scores, after_module_issues))
    after_health_model = calculate_after_health_model(before_health_model, after_module_scores, after_module_issues)

    _update_session(session_id, {
        "phase": "verifying",
        "progress": 95,
        "optimizeResults": optimize_results,
        "verificationResults": verification_results,
        "overallScoreAfter": overall_after,
        "issuesAfter": after_issues,
        "spaceRecovered": total_recovered,
        "healthModelAfter": after_health_model,
        "currentModule": None,
        "currentOperation": "Verifying",
        "currentPath": None,
        "bytesRecovered": total_recovered,
        "itemsProcessed": total_issues_fixed + total_items_fixed + total_entries_disabled,
        "itemsRemaining": 0,
    })
    _add_activity(session_id, "orchestrator", "verified", f"Verification complete. Issues after: {after_issues}", operation="Verified")
    _update_counters(session_id, {"itemsAnalyzed": total_issues_fixed + total_items_fixed + total_entries_disabled, "bytesRecovered": int(total_recovered)})

    # Invalidate dashboard cache so next metrics call is fresh
    try:
        from avs_backend.dashboard import _collect_metrics, _calculate_health_score
        _collect_metrics.cache_clear()
        _calculate_health_score.cache_clear()
    except Exception:
        pass

    # Record history
    history_entry = {
        "id": str(uuid.uuid4()),
        "date": _now_iso(),
        "healthBefore": overall_before,
        "healthAfter": overall_after,
        "storageRecovered": total_recovered,
        "registryFixed": total_issues_fixed,
        "startupOptimized": total_entries_disabled,
        "privacyCleaned": total_items_fixed,
        "durationMs": 0,
        "modulesUsed": list(optimize_results.keys()),
        "result": "success" if len(all_errors) == 0 else "partial",
    }

    _update_session(session_id, {
        "phase": "complete",
        "progress": 100,
        "completedAt": _now_iso(),
        "history": history_entry,
        "currentOperation": None,
        "currentPath": None,
    })
    _add_activity(session_id, "orchestrator", "completed", f"Optimization complete. Score: {overall_before} → {overall_after}", operation="Completed")
    _update_counters(session_id, {"storageRecovered": int(total_recovered), "itemsCleaned": total_items_fixed, "registryFixed": total_issues_fixed})

    # Log instrumentation summary
    inst = _get_instrumentation(session_id)
    if inst:
        total_duration = int((time.monotonic() - inst["sessionStart"]) * 1000)
        for mod_id, mod_data in inst.get("modules", {}).items():
            log.info(
                "[INSTRUMENT] %s: scan=%dms optimize=%dms verify=%dms filesScanned=%d filesCleaned=%d throughput=%.1f/s",
                mod_id,
                mod_data.get("scan_ms", 0),
                mod_data.get("optimize_ms", 0),
                mod_data.get("verify_ms", 0),
                mod_data.get("filesScanned", 0),
                mod_data.get("filesCleaned", 0),
                mod_data.get("scanThroughput", 0),
            )
        log.info(
            "[INSTRUMENT] Session total: %dms, maxUpdateGapMs=%d",
            total_duration,
            inst.get("maxUpdateGapMs", 0),
        )
        _update_session(session_id, {"instrumentation": inst})

    # Record in backend history
    try:
        from avs_backend.history.history_manager import add_history_entry, HistoryEntry, ModuleType, OptimizationType, OperationResult
        entry = HistoryEntry(
            date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            time=datetime.now(timezone.utc).strftime("%H:%M:%S"),
            module=ModuleType.DASHBOARD,
            optimization_type=OptimizationType.OPTIMIZE,
            files_deleted=total_items_fixed,
            space_saved=total_recovered,
            memory_freed=0,
            duration_ms=0,  # duration is tracked in orchestrator_full
            result=OperationResult.SUCCESS if not all_errors else OperationResult.PARTIAL,
            warnings=[],
            errors=all_errors[:10],
            details={
                "healthBefore": overall_before,
                "healthAfter": overall_after,
                "modulesUsed": list(optimize_results.keys()),
                "registryFixed": total_issues_fixed,
                "startupOptimized": total_entries_disabled,
                "privacyCleaned": total_items_fixed,
            },
        )
        add_history_entry(entry)
    except Exception as e:
        log.warning("Failed to record history: %s", e)

    return {
        "sessionId": session_id,
        "optimizeResults": optimize_results,
        "verificationResults": verification_results,
        "overallScoreBefore": overall_before,
        "overallScoreAfter": overall_after,
        "spaceRecovered": total_recovered,
        "itemsFixed": total_items_fixed,
        "entriesDisabled": total_entries_disabled,
        "issuesFixed": total_issues_fixed,
        "issuesAfter": after_issues,
        "errors": all_errors[:10],
        "history": history_entry,
        "success": len(all_errors) == 0,
        "healthModel": before_health_model,
        "healthModelAfter": after_health_model,
        "profile": profile,
    }


# ── RPC: orchestrator.status ────────────────────────────────────────

@register("orchestrator.status")
def orchestrator_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Poll session status."""
    session_id = params.get("sessionId") if params else None
    if not session_id:
        return {"error": "sessionId required"}
    session = _get_session(session_id)
    if not session:
        return {"error": "Session not found"}
    return {
        "sessionId": session_id,
        "phase": session.get("phase"),
        "progress": session.get("progress"),
        "currentModule": session.get("currentModule"),
        "currentOperation": session.get("currentOperation"),
        "currentPath": session.get("currentPath"),
        "itemsProcessed": session.get("itemsProcessed", 0),
        "itemsRemaining": session.get("itemsRemaining", 0),
        "bytesRecovered": session.get("bytesRecovered", 0),
        "overallScoreBefore": session.get("overallScoreBefore"),
        "overallScoreAfter": session.get("overallScoreAfter"),
        "issuesBefore": session.get("issuesBefore"),
        "issuesAfter": session.get("issuesAfter"),
        "spaceRecovered": session.get("spaceRecovered"),
        "completedAt": session.get("completedAt"),
        "error": session.get("error"),
        "cancelled": session.get("cancelled"),
        "profile": session.get("profile"),
        "healthModel": session.get("healthModel"),
        "healthModelAfter": session.get("healthModelAfter"),
        # Real-time streaming data
        "activityLog": list(session.get("activityLog", [])),
        "counters": dict(session.get("counters", {})),
        "moduleStatuses": dict(session.get("moduleStatuses", {})),
        "instrumentation": _get_instrumentation(session_id),
    }


# ── RPC: orchestrator.result ────────────────────────────────────────

@register("orchestrator.result")
def orchestrator_result(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get full session result."""
    session_id = params.get("sessionId") if params else None
    if not session_id:
        return {"error": "sessionId required"}
    session = _get_session(session_id)
    if not session:
        return {"error": "Session not found"}
    return {
        "sessionId": session_id,
        "phase": session.get("phase"),
        "modules": session.get("modules"),
        "scanResults": session.get("scanResults"),
        "optimizeResults": session.get("optimizeResults"),
        "overallScoreBefore": session.get("overallScoreBefore"),
        "overallScoreAfter": session.get("overallScoreAfter"),
        "issuesBefore": session.get("issuesBefore"),
        "issuesAfter": session.get("issuesAfter"),
        "spaceRecovered": session.get("spaceRecovered"),
        "recoverableSpace": session.get("recoverableSpace"),
        "history": session.get("history"),
        "startedAt": session.get("startedAt"),
        "completedAt": session.get("completedAt"),
        "error": session.get("error"),
        "cancelled": session.get("cancelled"),
        "profile": session.get("profile"),
        "healthModel": session.get("healthModel"),
        "healthModelAfter": session.get("healthModelAfter"),
    }


# ── RPC: orchestrator.cancel ────────────────────────────────────────

@register("orchestrator.cancel")
def orchestrator_cancel(params: dict[str, Any] | None) -> dict[str, Any]:
    """Cancel a running session."""
    session_id = params.get("sessionId") if params else None
    if not session_id:
        return {"error": "sessionId required"}
    _update_session(session_id, {"cancelled": True, "phase": "cancelled"})
    return {"sessionId": session_id, "cancelled": True}


# ── RPC: orchestrator.full (scan + optimize in one call) ─────────────

@register("orchestrator.full")
def orchestrator_full(params: dict[str, Any] | None) -> dict[str, Any]:
    """Run full scan + optimize pipeline in a single call.

    This is the one-click workflow:
    start → scan → optimize → verify → score → history → done

    Accepts optional 'profile' param: 'dashboard' | 'optimize' | 'protection'
    """
    profile = params.get("profile", "dashboard") if params else "dashboard"
    session = _new_session()
    session["profile"] = profile
    session_id = session["sessionId"]
    with _sessions_lock:
        _sessions[session_id] = session

    start_time = time.monotonic()

    # Phase 1: Scan
    scan_response = orchestrator_scan({"sessionId": session_id, "profile": profile})
    if scan_response.get("error"):
        return scan_response

    session = _get_session(session_id)
    if session and session.get("cancelled"):
        return {"sessionId": session_id, "cancelled": True}

    # Phase 2: Optimize
    opt_response = orchestrator_optimize({"sessionId": session_id})
    if opt_response.get("error"):
        return opt_response

    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    # Update history with duration
    history = opt_response.get("history", {})
    if history:
        history["durationMs"] = elapsed_ms
        _update_session(session_id, {"history": history})

    return {
        "sessionId": session_id,
        "scan": {
            "modules": scan_response.get("modules"),
            "overallScore": scan_response.get("overallScore"),
            "totalIssues": scan_response.get("totalIssues"),
            "recoverableSpace": scan_response.get("recoverableSpace"),
            "healthModel": scan_response.get("healthModel"),
        },
        "optimize": {
            "optimizeResults": opt_response.get("optimizeResults"),
            "overallScoreBefore": opt_response.get("overallScoreBefore"),
            "overallScoreAfter": opt_response.get("overallScoreAfter"),
            "spaceRecovered": opt_response.get("spaceRecovered"),
            "itemsFixed": opt_response.get("itemsFixed"),
            "entriesDisabled": opt_response.get("entriesDisabled"),
            "issuesFixed": opt_response.get("issuesFixed"),
            "issuesAfter": opt_response.get("issuesAfter"),
            "errors": opt_response.get("errors"),
            "success": opt_response.get("success"),
            "healthModel": opt_response.get("healthModel"),
            "healthModelAfter": opt_response.get("healthModelAfter"),
        },
        "history": history,
        "elapsedMs": elapsed_ms,
        "completedAt": _now_iso(),
        "profile": profile,
    }


# ── RPC: orchestrator.fullAsync (background thread + status polling) ─

@register("orchestrator.fullAsync")
def orchestrator_full_async(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start full pipeline in a background thread.

    Returns immediately with sessionId. Frontend polls orchestrator.status
    to get real-time progress, activity log, counters, and module statuses.
    When phase == 'complete', frontend calls orchestrator.result for final data.

    Accepts optional 'profile' param: 'dashboard' | 'optimize' | 'protection'
    """
    profile = params.get("profile", "dashboard") if params else "dashboard"
    scan_only = params.get("scanOnly", False) if params else False
    session = _new_session()
    session["profile"] = profile
    session_id = session["sessionId"]
    with _sessions_lock:
        _sessions[session_id] = session

    def _run_pipeline() -> None:
        start_time = time.monotonic()
        try:
            # Phase 1: Scan
            _add_activity(session_id, "orchestrator", "preparing", f"Starting optimization session (profile: {profile})...", operation="Preparing")
            scan_response = orchestrator_scan({"sessionId": session_id, "profile": profile})
            if scan_response.get("error"):
                _update_session(session_id, {"phase": "error", "error": scan_response["error"]})
                return

            session = _get_session(session_id)
            if session and session.get("cancelled"):
                return

            # Phase 2: Optimize (skip if scanOnly — Free version)
            if scan_only:
                _update_session(session_id, {
                    "phase": "complete",
                    "progress": 100,
                    "completedAt": _now_iso(),
                    "currentOperation": None,
                    "currentPath": None,
                })
                _add_activity(session_id, "orchestrator", "completed", "Scan complete. Upgrade to Professional to fix all issues automatically.", operation="Completed")
                return

            opt_response = orchestrator_optimize({"sessionId": session_id})
            if opt_response.get("error"):
                _update_session(session_id, {"phase": "error", "error": opt_response["error"]})
                return

            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            _update_elapsed(session_id, start_time)

            # Update history with duration
            history = opt_response.get("history", {})
            if history:
                history["durationMs"] = elapsed_ms
                _update_session(session_id, {"history": history})

        except Exception as e:
            log.error("FullAsync pipeline failed: %s", e)
            _update_session(session_id, {"phase": "error", "error": str(e)})
            _add_activity(session_id, "orchestrator", "error", f"Pipeline failed: {e}")

    thread = threading.Thread(target=_run_pipeline, daemon=True, name=f"orchestrator-{session_id}")
    thread.start()

    log.info("Orchestrator fullAsync started: %s", session_id)
    return {"sessionId": session_id, "startedAt": session["startedAt"]}
