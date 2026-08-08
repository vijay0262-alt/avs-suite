"""OptimizationOrchestrator — unified backend optimization pipeline.

Single entry point for all optimization workflows:
  Dashboard → orchestrator.start → scan → optimize → verify → score → history
  AI Smart Optimize → orchestrator.start → same pipeline
  Protection Center → orchestrator.start → same pipeline

The orchestrator runs REAL backend modules (junk cleaner, privacy cleaner,
registry cleaner, startup manager, performance optimizer, disk analyzer,
security check, system info). No simulated progress.

RPC methods:
  orchestrator.start    → begin a new session, returns sessionId
  orchestrator.scan     → run all module scans, return results
  orchestrator.optimize → run all module optimizations, return results
  orchestrator.status   → poll session status / progress
  orchestrator.result   → get final session result (scores, history, summary)
  orchestrator.cancel   → cancel a running session
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.orchestrator")

# ── Session state ───────────────────────────────────────────────────

_sessions: dict[str, dict[str, Any]] = {}
_sessions_lock = threading.Lock()


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
    }


def _get_session(session_id: str) -> dict[str, Any] | None:
    with _sessions_lock:
        return _sessions.get(session_id)


def _update_session(session_id: str, patch: dict[str, Any]) -> None:
    with _sessions_lock:
        s = _sessions.get(session_id)
        if s:
            s.update(patch)


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

def _scan_junk() -> dict[str, Any]:
    """Run junk cleaner scan via the cleaner module."""
    from avs_backend.cleaner import _ensure_singletons, _scan_manager, _cleaners
    _ensure_singletons()
    cleaners = _cleaners or []
    if _scan_manager is None:
        return {"issues": 0, "size": 0, "error": "Scan manager not ready"}
    cleaner_ids = [c.id for c in cleaners]
    task_id = _scan_manager.start(only=cleaner_ids)
    # Wait for scan to complete (poll)
    for _ in range(120):  # max 60 seconds
        snap = _scan_manager.snapshot(task_id)
        if snap is None:
            break
        if snap.status.value in ("completed", "done", "cancelled", "error"):
            break
        time.sleep(0.5)
    snap = _scan_manager.snapshot(task_id)
    if snap is None:
        return {"issues": 0, "size": 0, "error": "Scan snapshot unavailable"}
    total_files = snap.total_files
    total_bytes = snap.total_bytes
    return {
        "issues": total_files,
        "size": total_bytes,
        "cleaners": cleaner_ids,
    }


def _scan_privacy() -> dict[str, Any]:
    """Run privacy cleaner scan."""
    from avs_backend.privacy.privacy_cleaner import scan_privacy_items
    from threading import Event
    result = scan_privacy_items(Event(), None, None)
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


def _scan_registry() -> dict[str, Any]:
    """Run registry cleaner scan."""
    from avs_backend.registry_cleaner.registry_scanner import scan_registry
    result = scan_registry(None)
    return {
        "issues": len(result.issues),
        "size": 0,
        "items": [issue.to_dict() for issue in result.issues],
        "categoryBreakdown": result.breakdown(),
    }


def _scan_startup() -> dict[str, Any]:
    """Run startup manager scan."""
    from avs_backend.startup.startup_manager import scan_startup_entries
    entries = scan_startup_entries()
    high_impact = [e for e in entries if e.impact.value == "high" and e.enabled]
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
            for e in entries
        ],
    }


def _scan_performance() -> dict[str, Any]:
    """Run performance monitor scan."""
    from avs_backend.performance.live_monitor import get_system_metrics, generate_alerts
    metrics = get_system_metrics()
    alerts = generate_alerts(metrics)
    mem_info = None
    try:
        from avs_backend.performance.memory_optimizer import get_memory_info
        mem_info = get_memory_info()
    except Exception:
        pass
    ram_recovery = 0
    if mem_info:
        ram_recovery = max(0, mem_info.used_ram - mem_info.total_ram * 0.5)
    return {
        "issues": len(alerts),
        "size": int(ram_recovery),
        "metrics": metrics,
        "alerts": [{"type": a.alert_type, "message": a.message} for a in alerts] if alerts else [],
        "memoryInfo": {
            "total": mem_info.total_ram if mem_info else 0,
            "used": mem_info.used_ram if mem_info else 0,
            "usage": mem_info.memory_load_percent if mem_info else 0,
        } if mem_info else None,
    }


def _scan_disk() -> dict[str, Any]:
    """Run disk analyzer scan using psutil directly."""
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
            except OSError:
                continue
    except Exception as e:
        log.warning("Disk scan failed: %s", e)
    full = [d for d in drives if d.get("percent", 0) > 80]
    return {
        "issues": len(full),
        "size": sum(d.get("used", 0) for d in drives),
        "drives": drives,
    }


def _scan_security() -> dict[str, Any]:
    """Run security check via dashboard metrics."""
    from avs_backend.dashboard import _collect_metrics
    metrics = _collect_metrics()
    sec = metrics.get("security", {}) if isinstance(metrics, dict) else {}
    pending = sec.get("updates", {}).get("pendingUpdates", 0)
    defender = 0 if sec.get("defender", {}).get("enabled") else 1
    firewall = 0 if sec.get("firewall", {}).get("enabled") else 1
    return {
        "issues": pending + defender + firewall,
        "size": 0,
        "details": sec,
    }


def _scan_system() -> dict[str, Any]:
    """Run system info scan using psutil directly."""
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

def _optimize_junk(scan_result: dict[str, Any]) -> dict[str, Any]:
    """Execute junk cleaning."""
    from avs_backend.dashboard import dashboard_optimize_execute
    result = dashboard_optimize_execute(None)
    return {
        "success": result.get("success", False),
        "bytesRecovered": result.get("totalRecovered", 0),
        "itemsRemoved": 0,
        "errors": [],
        "details": result,
    }


def _optimize_privacy(scan_result: dict[str, Any]) -> dict[str, Any]:
    """Execute privacy cleaning."""
    from avs_backend.privacy.privacy_cleaner import PrivacyItem, PrivacyCategory, RiskLevel, clean_privacy_items
    from threading import Event
    items_data = scan_result.get("items", [])
    if not items_data:
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
    result = clean_privacy_items(items, Event(), None)
    errors = result.errors or []
    return {
        "success": len(errors) == 0,
        "bytesRecovered": result.space_freed or 0,
        "itemsRemoved": result.items_cleaned or 0,
        "errors": errors,
    }


def _optimize_registry(scan_result: dict[str, Any]) -> dict[str, Any]:
    """Execute registry cleaning."""
    from avs_backend.registry_cleaner.registry_scanner import RegistryIssue, fix_issues
    issues_data = scan_result.get("items", [])
    if not issues_data:
        return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "errors": []}
    issues = [RegistryIssue.from_dict(d) for d in issues_data]
    result = fix_issues(issues)
    errors = result.get("errors", []) or []
    return {
        "success": len(errors) == 0,
        "bytesRecovered": 0,
        "itemsRemoved": result.get("fixed", 0),
        "errors": errors,
    }


def _optimize_startup(scan_result: dict[str, Any]) -> dict[str, Any]:
    """Execute startup optimization — disable high-impact enabled entries."""
    from avs_backend.startup.startup_manager import disable_startup_entry, StartupEntry, StartupStatus, StartupImpact, StartupSource
    entries_data = scan_result.get("entries", [])
    to_disable = [e for e in entries_data if e.get("enabled") and e.get("impact") == "high"]
    disabled = 0
    errors: list[str] = []
    for entry_data in to_disable:
        try:
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
    return {
        "success": len(errors) == 0,
        "bytesRecovered": 0,
        "itemsRemoved": 0,
        "entriesDisabled": disabled,
        "errors": errors[:10],
    }


def _optimize_performance(scan_result: dict[str, Any]) -> dict[str, Any]:
    """Execute memory optimization."""
    from avs_backend.performance.memory_optimizer import optimize_memory
    from threading import Event
    result = optimize_memory(Event(), None)
    errors = result.errors or []
    success = result.status.value in ("completed", "success") or (len(errors) == 0 and (result.memory_freed > 0 or result.processes_optimized > 0))
    return {
        "success": success,
        "bytesRecovered": result.memory_freed or 0,
        "itemsRemoved": 0,
        "issuesFixed": result.processes_optimized or 0,
        "errors": errors,
    }


def _optimize_disk(scan_result: dict[str, Any]) -> dict[str, Any]:
    """Disk analyzer is informational — no auto-fix."""
    return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "errors": [], "reason": "No auto-fix — use Disk Analyzer page to review"}


def _optimize_security(scan_result: dict[str, Any]) -> dict[str, Any]:
    """Security check requires manual action."""
    return {"success": True, "bytesRecovered": 0, "itemsRemoved": 0, "errors": [], "reason": "Requires manual action via Windows Security"}


def _optimize_system(scan_result: dict[str, Any]) -> dict[str, Any]:
    """System info is informational."""
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
    """Calculate post-optimization score."""
    items_fixed = (
        optimize_result.get("itemsRemoved", 0)
        + optimize_result.get("entriesDisabled", 0)
        + optimize_result.get("issuesFixed", 0)
    )
    bytes_recovered = optimize_result.get("bytesRecovered", 0)
    before_issues = scan_result.get("issues", 0)

    if items_fixed > 0 and before_issues > 0:
        if items_fixed >= before_issues:
            return 100
        ratio = items_fixed / before_issues
        boost = max(10, int(ratio * (100 - before_score)))
        return min(100, before_score + boost)

    if bytes_recovered > 0 and items_fixed == 0:
        return min(100, before_score + 5)

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
    """Run all module scans sequentially. Returns full scan results."""
    session_id = params.get("sessionId") if params else None
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

    _update_session(session_id, {"phase": "scanning", "progress": 0})

    modules_result = {}
    total_issues = 0
    total_recoverable = 0
    scores = []

    for i, mid in enumerate(MODULE_ORDER):
        session = _get_session(session_id)
        if session and session.get("cancelled"):
            break

        _update_session(session_id, {
            "currentModule": mid,
            "progress": int((i / len(MODULE_ORDER)) * 100),
        })

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
                continue

            result = scan_fn()
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
            scores.append(100)  # Don't penalize for scan failure

    overall = int(sum(scores) / len(scores)) if scores else 0
    _update_session(session_id, {
        "phase": "scanned",
        "progress": 100,
        "modules": modules_result,
        "scanResults": {mid: m.get("scanResult", {}) for mid, m in modules_result.items()},
        "issuesBefore": total_issues,
        "recoverableSpace": total_recoverable,
        "overallScoreBefore": overall,
        "currentModule": None,
    })

    return {
        "sessionId": session_id,
        "modules": modules_result,
        "overallScore": overall,
        "totalIssues": total_issues,
        "recoverableSpace": total_recoverable,
    }


# ── RPC: orchestrator.optimize ──────────────────────────────────────

@register("orchestrator.optimize")
def orchestrator_optimize(params: dict[str, Any] | None) -> dict[str, Any]:
    """Run all module optimizations sequentially. Returns full results."""
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
    _update_session(session_id, {"phase": "optimizing", "progress": 0})

    optimize_results = {}
    total_recovered = 0
    total_items_fixed = 0
    total_entries_disabled = 0
    total_issues_fixed = 0
    all_errors: list[str] = []

    fixable = [mid for mid in MODULE_ORDER
               if mid in modules and modules[mid].get("canAutoFix")
               and modules[mid].get("status") == "complete"
               and (modules[mid].get("issues", 0) > 0 or modules[mid].get("size", 0) > 0)]

    for i, mid in enumerate(fixable):
        session = _get_session(session_id)
        if session and session.get("cancelled"):
            break

        _update_session(session_id, {
            "currentModule": mid,
            "progress": int((i / max(1, len(fixable))) * 100),
        })

        try:
            opt_fn = OPTIMIZE_FNS.get(mid)
            if opt_fn is None:
                continue
            scan_result = scan_results.get(mid, {})
            result = opt_fn(scan_result)
            optimize_results[mid] = result
            total_recovered += result.get("bytesRecovered", 0)
            total_items_fixed += result.get("itemsRemoved", 0)
            total_entries_disabled += result.get("entriesDisabled", 0)
            total_issues_fixed += result.get("issuesFixed", 0)
            if result.get("errors"):
                all_errors.extend(result["errors"][:5])
        except Exception as e:
            log.error("Optimize failed for module %s: %s", mid, e)
            optimize_results[mid] = {
                "success": False,
                "bytesRecovered": 0,
                "itemsRemoved": 0,
                "errors": [str(e)],
            }
            all_errors.append(str(e))

    # Calculate after-scores
    after_scores = []
    after_issues = 0
    for mid in MODULE_ORDER:
        mod = modules.get(mid, {})
        before_score = mod.get("score", 100)
        before_issues = mod.get("issues", 0)
        opt_result = optimize_results.get(mid)
        scan_result = scan_results.get(mid, {})

        if opt_result:
            after_score = _calculate_after_score(mid, before_score, scan_result, opt_result)
            items_fixed = (
                opt_result.get("itemsRemoved", 0)
                + opt_result.get("entriesDisabled", 0)
                + opt_result.get("issuesFixed", 0)
            )
            remaining = max(0, before_issues - items_fixed)
            after_issues += remaining
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

    _update_session(session_id, {
        "phase": "verifying",
        "progress": 95,
        "optimizeResults": optimize_results,
        "overallScoreAfter": overall_after,
        "issuesAfter": after_issues,
        "spaceRecovered": total_recovered,
        "currentModule": None,
    })

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
    })

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
        "overallScoreBefore": session.get("overallScoreBefore"),
        "overallScoreAfter": session.get("overallScoreAfter"),
        "issuesBefore": session.get("issuesBefore"),
        "issuesAfter": session.get("issuesAfter"),
        "spaceRecovered": session.get("spaceRecovered"),
        "completedAt": session.get("completedAt"),
        "error": session.get("error"),
        "cancelled": session.get("cancelled"),
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
def orchestrator_full(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Run full scan + optimize pipeline in a single call.

    This is the one-click workflow:
    start → scan → optimize → verify → score → history → done
    """
    session = _new_session()
    session_id = session["sessionId"]
    with _sessions_lock:
        _sessions[session_id] = session

    start_time = time.monotonic()

    # Phase 1: Scan
    scan_response = orchestrator_scan({"sessionId": session_id})
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
        },
        "history": history,
        "elapsedMs": elapsed_ms,
        "completedAt": _now_iso(),
    }
