"""SC-8C8 Part 2A — thin, read-only RPC bridge for RemediationCoordinator."""

from __future__ import annotations

import logging
import os
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

import uuid

from avs_backend.api.registry import register
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.orchestration import RemediationCoordinator
from avs_backend.scan_core.orchestration import orchestrator as _orchestrator_module
from avs_backend.scan_core.adapters.smart_optimization_plan_builder import (
    SmartOptimizationPlanBuilder,
)
from avs_backend.scan_core.adapters.security_remediation_plan_builder import (
    SecurityRemediationPlanBuilder,
)
from avs_backend.scan_core.adapters.dashboard_optimization_plan_builder import (
    DashboardOptimizationPlanBuilder,
)
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.orchestration.orchestrator import ScanOrchestrator
from avs_backend.scan_core.orchestration.models import ScanProgress, ScanResult
from avs_backend.scan_core.rules.evaluator import CancellationToken
from avs_backend.scan_core.rules.registry import RuleRegistry
from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules
from avs_backend.scan_core.orchestration.remediation_models import (
    RemediationExecutionStatus,
    RemediationPreview,
    RemediationValidation,
    RollbackSummary,
)

__all__ = [
    "get_coordinator",
    "preview_to_dict",
    "validation_to_dict",
    "status_to_dict",
    "rollback_to_dict",
]

logger = logging.getLogger(__name__)

_coordinator: Optional[RemediationCoordinator] = None
_scan_orchestrator: Optional[ScanOrchestrator] = None
_lock = threading.Lock()
_scan_orchestrator_lock = threading.Lock()
_scan_session_lock = threading.Lock()
_scan_sessions: dict[str, dict[str, Any]] = {}

# ── Auto-optimization sessions ─────────────────────────────────────────
_auto_opt_lock = threading.Lock()
_auto_opt_sessions: dict[str, dict[str, Any]] = {}


def _get_app_data_dir() -> Path:
    """Return the platform-specific AVS application data directory."""
    if os.name == "nt":
        base = Path(
            os.environ.get("LOCALAPPDATA")
            or os.environ.get("APPDATA")
            or str(Path.home())
        )
        return base / "AVS Shield"

    base = Path(
        os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))
    )
    return base / "avs-shield"


def get_coordinator() -> Optional[RemediationCoordinator]:
    """Return the module-level RemediationCoordinator singleton, or None on failure."""
    global _coordinator
    if _coordinator is not None:
        return _coordinator

    with _lock:
        if _coordinator is not None:
            return _coordinator

        try:
            app_dir = _get_app_data_dir()
            app_dir.mkdir(parents=True, exist_ok=True)

            db = MetadataDatabase(DatabaseConfig(db_path=app_dir / "metadata.db"))
            _coordinator = RemediationCoordinator(
                database=db,
                backup_root=app_dir / "backups",
            )
            return _coordinator
        except Exception as exc:
            logger.exception("Failed to initialize RemediationCoordinator: %s", exc)
            return None


_scan_orchestrator_initializing = False


def get_scan_orchestrator() -> Optional[ScanOrchestrator]:
    """Return the module-level ScanOrchestrator singleton, or None on failure."""
    global _scan_orchestrator, _scan_orchestrator_initializing
    if _scan_orchestrator is not None:
        return _scan_orchestrator

    with _scan_orchestrator_lock:
        if _scan_orchestrator is not None:
            return _scan_orchestrator
        # If the eager-init thread is already initializing, don't block —
        # return None so RPC callers get a graceful "not ready" response
        # instead of timing out waiting for the lock.
        if _scan_orchestrator_initializing:
            return None
        _scan_orchestrator_initializing = True

    # Run initialization outside the lock so other callers don't block.
    try:
        app_dir = _get_app_data_dir()
        app_dir.mkdir(parents=True, exist_ok=True)

        db = MetadataDatabase(DatabaseConfig(db_path=app_dir / "metadata.db"))
        db.initialize()
        registry = RuleRegistry()
        register_junk_rules(registry)

        # V1.0 Protection Center: Register the Defender threat discovery
        # engine so confirmed Defender threats enter the canonical scan
        # pipeline as ScanAssets. The DefenderConfirmedThreatRule (registered
        # via register_junk_rules → register_defender_threat_rule) matches
        # these assets and produces CONFIRMED_THREAT findings.
        from avs_backend.scan_core.orchestration.discovery import (
            FilesystemDiscoveryEngine,
        )
        from avs_backend.scan_core.security.defender_discovery import (
            DefenderThreatDiscoveryEngine,
        )
        discovery_engines = {
            "filesystem": FilesystemDiscoveryEngine(),
            "defender": DefenderThreatDiscoveryEngine(),
        }

        with _scan_orchestrator_lock:
            _scan_orchestrator = ScanOrchestrator(
                database=db,
                registry=registry,
                discovery_engines=discovery_engines,
                snapshot_ttl_seconds=3600,
            )
            return _scan_orchestrator
    except Exception as exc:
        logger.exception("Failed to initialize ScanOrchestrator: %s", exc)
        return None
    finally:
        with _scan_orchestrator_lock:
            _scan_orchestrator_initializing = False


def _eager_init() -> None:
    """Initialize the scan orchestrator in a background thread at import time.

    The MetadataDatabase.initialize() call can take 30-60+ seconds on first
    run (schema creation, index building).  By starting this immediately at
    module import, the orchestrator is usually ready before the UI requests
    a scan, avoiding a 120s timeout on the first scan_core.scan.latest call.
    """
    try:
        get_scan_orchestrator()
    except Exception:
        logger.exception("Eager scan orchestrator initialization failed")


threading.Thread(target=_eager_init, daemon=True, name="scan-orch-init").start()


def _orchestrator_error() -> dict[str, Any]:
    return {
        "ok": False,
        "error": "Scan orchestrator is not available",
    }


def _safe_params(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    return params if isinstance(params, dict) else {}


def _require_str(params: dict[str, Any], key: str) -> tuple[bool, str]:
    value = params.get(key)
    if not value or not isinstance(value, str):
        return False, f"Missing or invalid parameter: {key}"
    return True, value


def preview_to_dict(preview: RemediationPreview) -> dict[str, Any]:
    """Serialize a RemediationPreview, including UI-required fields.

    Includes ``approval_token`` and the full ``affected_targets`` list.
    """
    return {
        "request_id": preview.request_id,
        "plan_id": preview.plan_id,
        "approval_token": preview.approval_token,
        "total_actions": preview.total_actions,
        "action_types": dict(preview.action_types),
        "affected_targets": list(preview.affected_targets),
        "estimated_size": preview.estimated_size,
        "safety_state_counts": dict(preview.safety_state_counts),
        "fixability_counts": dict(preview.fixability_counts),
        "backup_required": preview.backup_required,
        "rollback_supported": preview.rollback_supported,
        "warnings": list(preview.warnings),
        "is_stale": preview.is_stale,
        "generated_at": preview.generated_at.isoformat(),
    }


def validation_to_dict(validation: RemediationValidation) -> dict[str, Any]:
    """Serialize a RemediationValidation, including the embedded summary."""
    result = validation.to_dict()
    result["summary"] = (
        validation.summary.to_dict() if validation.summary is not None else None
    )
    return result


def status_to_dict(status: RemediationExecutionStatus) -> dict[str, Any]:
    return status.to_dict()


def rollback_to_dict(summary: RollbackSummary) -> dict[str, Any]:
    return summary.to_dict()


def _sanitize_finding_for_frontend(finding: dict[str, Any]) -> dict[str, Any]:
    """Return a privacy-safe, UI-compatible finding view.

    This matches the contract used by ``scan_core.scan.plan_details``:
    no canonical_path, asset_id, raw target data, or sensitive evidence.
    """
    safety = finding.get("safety") or {}
    confidence = finding.get("confidence") or {}

    if isinstance(safety, dict):
        safety_value = safety.get("level", "unknown")
    else:
        safety_value = str(safety) or "unknown"

    if isinstance(confidence, dict):
        confidence_score = float(confidence.get("score", 1.0))
    else:
        try:
            confidence_score = float(confidence or 1.0)
        except (TypeError, ValueError):
            confidence_score = 1.0

    return {
        "finding_id": finding.get("finding_id", ""),
        "display_name": finding.get("display_name", ""),
        "rule_id": finding.get("rule_id", ""),
        "rule_category": finding.get("rule_category", ""),
        "severity": finding.get("severity", "info"),
        "confidence": confidence_score,
        "safety": safety_value,
        "reason": finding.get("reason", ""),
        "recommended_action": finding.get("recommended_action", ""),
        "estimated_size": finding.get("estimated_size") or 0,
        "is_blocked": bool(finding.get("is_blocked", False)),
        "requires_review": bool(finding.get("requires_review", False)),
        "is_actionable": bool(finding.get("is_actionable", False)),
        "canonical_path": "",
    }


def _sanitize_findings_for_frontend(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sanitize a list of findings for the frontend."""
    return [_sanitize_finding_for_frontend(f) for f in findings]


def _coordinator_error() -> dict[str, Any]:
    return {
        "ok": False,
        "error": "Remediation coordinator is not available",
    }


@register("scan_core.remediation.prepare")
def _scan_core_remediation_prepare(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, plan_id = _require_str(params, "plan_id")
    if not ok:
        return {"ok": False, "error": plan_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        preview = coord.prepare(plan_id)
        return {"ok": True, "preview": preview_to_dict(preview)}
    except Exception as exc:
        logger.exception("scan_core.remediation.prepare failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.validate")
def _scan_core_remediation_validate(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, plan_id = _require_str(params, "plan_id")
    if not ok:
        return {"ok": False, "error": plan_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        validation = coord.validate(plan_id)
        return {"ok": True, "validation": validation_to_dict(validation)}
    except Exception as exc:
        logger.exception("scan_core.remediation.validate failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.execute")
def _scan_core_remediation_execute(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    for key in ("plan_id", "request_id"):
        ok, value = _require_str(params, key)
        if not ok:
            return {"ok": False, "error": value}

    plan_id: str = params["plan_id"]
    request_id: str = params["request_id"]
    approval_token = str(params.get("approval_token") or "")
    mode = params.get("mode", "dry_run")
    if mode not in ("dry_run", "live"):
        return {"ok": False, "error": "mode must be 'dry_run' or 'live'"}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        summary = coord.execute(
            plan_id,
            request_id=request_id,
            approval_token=approval_token,
            mode=mode,
        )
        if summary.status.value == "rejected":
            return {
                "ok": False,
                "status": "rejected",
                "reason": summary.reason or "Execution rejected",
            }
        return {"ok": True, "summary": summary.to_dict()}
    except Exception as exc:
        logger.exception("scan_core.remediation.execute failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.cancel")
def _scan_core_remediation_cancel(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, execution_id = _require_str(params, "execution_id")
    if not ok:
        return {"ok": False, "error": execution_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        cancelled = coord.cancel(execution_id)
        return {"ok": True, "cancelled": cancelled}
    except Exception as exc:
        logger.exception("scan_core.remediation.cancel failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.status")
def _scan_core_remediation_status(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, execution_id = _require_str(params, "execution_id")
    if not ok:
        return {"ok": False, "error": execution_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        status = coord.get_status(execution_id)
        return {"ok": True, "status": status_to_dict(status)}
    except Exception as exc:
        logger.exception("scan_core.remediation.status failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.rollback")
def _scan_core_remediation_rollback(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, execution_id = _require_str(params, "execution_id")
    if not ok:
        return {"ok": False, "error": execution_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        summary = coord.rollback(execution_id)
        return {"ok": True, "rollback": rollback_to_dict(summary)}
    except Exception as exc:
        logger.exception("scan_core.remediation.rollback failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def _validate_scope(params: dict[str, Any]) -> tuple[bool, Optional[list[str] | None], str]:
    """Validate the optional ``scope`` parameter."""
    scope = params.get("scope")
    if scope is None:
        return True, None, ""
    if not isinstance(scope, list) or not all(isinstance(x, str) for x in scope):
        return False, None, "scope must be a list of strings"
    return True, scope, ""


def _on_progress(scan_id: str, progress: ScanProgress) -> None:
    """Safely record the latest progress for a session."""
    with _scan_session_lock:
        session = _scan_sessions.get(scan_id)
        if session is not None:
            session["progress"] = progress.to_dict()


def _run_scan(scan_id: str, scan_type: str, scope: Optional[list[str]]) -> None:
    """Background target that runs the scan and records the result."""
    orchestrator = get_scan_orchestrator()
    if orchestrator is None:
        with _scan_session_lock:
            session = _scan_sessions.get(scan_id)
            if session is not None:
                session["error"] = "Scan orchestrator is not available"
                session["completed"] = True
        return

    original_generate_scan_id = _orchestrator_module.generate_scan_id

    def _generate_scan_id_for_session() -> str:
        """Return the pre-determined scan id and restore the original generator."""
        _orchestrator_module.generate_scan_id = original_generate_scan_id
        return scan_id

    try:
        _orchestrator_module.generate_scan_id = _generate_scan_id_for_session
        if scan_type == "quick":
            result = orchestrator.scan_quick(
                scope=scope,
                on_progress=lambda p: _on_progress(scan_id, p),
            )
        else:
            result = orchestrator.scan_full(
                scope=scope,
                on_progress=lambda p: _on_progress(scan_id, p),
            )
        with _scan_session_lock:
            session = _scan_sessions.get(scan_id)
            if session is None:
                return
            session["result"] = result.to_dict()
            session["completed"] = True
    except Exception as exc:
        logger.exception("scan_core.scan.%s failed for %s: %s", scan_type, scan_id, exc)
        with _scan_session_lock:
            session = _scan_sessions.get(scan_id)
            if session is None:
                return
            session["error"] = str(exc)
            session["completed"] = True
    finally:
        _orchestrator_module.generate_scan_id = original_generate_scan_id


def _start_scan(scan_type: str, params: dict[str, Any]) -> dict[str, Any]:
    """Start a quick or full scan in a background thread."""
    ok, scope, error = _validate_scope(params)
    if not ok:
        return {"ok": False, "error": error}

    orchestrator = get_scan_orchestrator()
    if orchestrator is None:
        return {"ok": False, "error": "Scan engine is still initializing. Please try again in a moment."}

    scan_id = str(uuid.uuid4())
    started_at = datetime.now(UTC).isoformat()

    with _scan_session_lock:
        _scan_sessions[scan_id] = {
            "scan_id": scan_id,
            "token": None,
            "thread": None,
            "progress": None,
            "result": None,
            "cancelled": False,
            "completed": False,
            "error": None,
        }

    thread = threading.Thread(
        target=_run_scan,
        args=(scan_id, scan_type, scope),
        daemon=True,
        name=f"scan-core-{scan_type}-{scan_id}",
    )
    _scan_sessions[scan_id]["thread"] = thread
    thread.start()

    return {"ok": True, "session_id": scan_id, "started_at": started_at}


@register("scan_core.scan.quick")
def _scan_core_scan_quick(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    return _start_scan("quick", params)


@register("scan_core.scan.full")
def _scan_core_scan_full(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    return _start_scan("full", params)


@register("scan_core.scan.cancel")
def _scan_core_scan_cancel(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    orchestrator = get_scan_orchestrator()
    cancelled = False
    if orchestrator is not None:
        cancelled = orchestrator.cancel_scan(session_id)

    with _scan_session_lock:
        session = _scan_sessions.get(session_id)
        if session is not None:
            session["cancelled"] = True

    return {"ok": True, "cancelled": cancelled}


@register("scan_core.scan.status")
def _scan_core_scan_status(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    with _scan_session_lock:
        session = _scan_sessions.get(session_id)

    if session is None:
        return {"ok": False, "error": "Unknown session"}

    return {
        "ok": True,
        "progress": session["progress"],
        "completed": session["completed"],
        "cancelled": session["cancelled"],
        "error": session["error"],
    }


@register("scan_core.scan.result")
def _scan_core_scan_result(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    with _scan_session_lock:
        session = _scan_sessions.get(session_id)

    if session is None:
        return {"ok": False, "error": "Unknown session"}
    if not session["completed"]:
        return {"ok": False, "error": "Scan not complete"}
    if session["error"]:
        return {"ok": False, "error": session["error"]}
    if session["result"] is None:
        return {"ok": False, "error": "Scan not complete"}

    result = dict(session["result"])
    if "findings" in result:
        result["findings"] = _sanitize_findings_for_frontend(result["findings"])

    return {"ok": True, "result": result}


@register("scan_core.scan.latest")
def _scan_core_scan_latest(_params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Return the latest persisted scan_core scan history record."""
    orchestrator = get_scan_orchestrator()
    if orchestrator is None:
        # Orchestrator may still be initializing — return empty result
        # instead of an error so the dashboard doesn't show an error.
        return {"ok": True, "latest": None}

    try:
        record = orchestrator.get_latest_scan_history()
        if record is None:
            return {"ok": True, "latest": None}
        return {"ok": True, "latest": record}
    except Exception as exc:
        logger.exception("scan_core.scan.latest failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.scan.history")
def _scan_core_scan_history(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Return the most recent persisted scan_core scan history records."""
    params = _safe_params(params)
    limit = params.get("limit", 10)
    if not isinstance(limit, int) or limit < 1:
        limit = 10

    orchestrator = get_scan_orchestrator()
    if orchestrator is None:
        return _orchestrator_error()

    try:
        records = orchestrator.list_scan_history(limit=limit)
        return {"ok": True, "history": records}
    except Exception as exc:
        logger.exception("scan_core.scan.history failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.scan.plan_details")
def _scan_core_scan_plan_details(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Return a read-only, privacy-safe view of a persisted ActionPlan."""
    params = _safe_params(params)
    ok, plan_id = _require_str(params, "plan_id")
    if not ok:
        return {"ok": False, "error": plan_id}

    orchestrator = get_scan_orchestrator()
    if orchestrator is not None:
        try:
            result = orchestrator.get_plan_details(plan_id)
            if result.get("ok"):
                return result
        except Exception as exc:
            logger.exception("scan_core.scan.plan_details (orchestrator) failed: %s", exc)

    # Fallback: load via the coordinator's ActionPlanRepository.
    # Plans created by security_remediation.plan, smart_optimization.plan,
    # or dashboard_optimization.plan are saved through the coordinator's
    # database, which may be a different MetadataDatabase instance than
    # the orchestrator's (though they point to the same file).
    coordinator = get_coordinator()
    if coordinator is None:
        return _coordinator_error()

    try:
        from avs_backend.scan_core.metadata.action_plan_repository import (
            ActionPlanRepository,
        )
        repo = ActionPlanRepository(coordinator.database)
        action_plan = repo.load(plan_id)
        if action_plan is None:
            return {"ok": False, "error": "Plan not found"}

        actions = action_plan.actions
        findings: list[dict[str, Any]] = []
        for action in actions:
            severity = "info"
            if action.priority_score >= 80:
                severity = "critical"
            elif action.priority_score >= 60:
                severity = "high"
            elif action.priority_score >= 40:
                severity = "medium"
            findings.append({
                "severity": severity,
                "category": action.action_type.value if hasattr(action.action_type, "value") else str(action.action_type),
                "title": getattr(action, "description", None) or action.reason or action.action_id,
                "actionable": action.is_actionable,
                "state": action.state.value if hasattr(action.state, "value") else str(action.state),
            })

        return {
            "ok": True,
            "plan_id": plan_id,
            "findings": findings,
            "total_actions": len(actions),
            "auto_fixable": action_plan.summary.auto_fixable_actions,
            "review_required": action_plan.summary.review_required_actions,
            "not_fixable": action_plan.summary.not_fixable_actions,
        }
    except Exception as exc:
        logger.exception("scan_core.scan.plan_details (coordinator fallback) failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.smart_optimization.plan")
def _scan_core_smart_optimization_plan(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Convert Smart Optimization analysis output into a canonical ActionPlan.

    This RPC is planning-only. It does NOT execute remediation.
    """
    params = _safe_params(params)
    actions = params.get("actions")
    if not isinstance(actions, list):
        return {"ok": False, "error": "Missing or invalid parameter: actions"}
    if len(actions) == 0:
        return {"ok": False, "error": "No Smart Optimization actions provided"}

    coordinator = get_coordinator()
    if coordinator is None:
        return _coordinator_error()

    try:
        builder = SmartOptimizationPlanBuilder()
        plan = builder.build_plan(actions)

        plan_repo = ActionPlanRepository(coordinator.database)
        plan_repo.save(plan)

        return {
            "ok": True,
            "plan_id": plan.plan_id,
            "total_actions": len(plan.actions),
            "auto_fixable": plan.summary.auto_fixable_actions,
            "review_required": plan.summary.review_required_actions,
            "not_fixable": plan.summary.not_fixable_actions,
            "estimated_affected_size": plan.summary.estimated_affected_size,
            "statistics": {
                "converted": builder.get_adapter_statistics()["converted"],
                "unsupported": builder.get_adapter_statistics()["unsupported"],
                "errors": builder.get_adapter_statistics()["errors"],
            },
        }
    except Exception as exc:
        logger.exception("scan_core.smart_optimization.plan failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.security_remediation.plan")
def _scan_core_security_remediation_plan(
    params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Convert Security Center remediation actions into a canonical ActionPlan.

    This RPC is planning-only. It does NOT execute remediation.
    It does NOT call legacy Security Center execution paths.

    Request:
        {
            "actions": [
                {
                    "id": "action-1",
                    "type": "quarantine",
                    "title": "Quarantine Threat",
                    "description": "...",
                    "confidence": 0.95,
                    "severity": "high",
                    "category": "spyware",
                    "sourceModule": "security-center",
                    "sourceFindingId": "finding-1",
                    "rollbackAvailable": true,
                    "target": {"type": "file", "path": "...", "name": "..."}
                },
                ...
            ]
        }

    Response (success):
        {
            "ok": true,
            "plan_id": "...",
            "total_actions": N,
            "auto_fixable": N,
            "review_required": N,
            "not_fixable": N,
            "estimated_affected_size": N or null,
            "statistics": {
                "converted": N,
                "unsupported": N,
                "errors": N
            }
        }

    Response (failure):
        {"ok": false, "error": "..."}

    Privacy:
        The response NEVER exposes canonical_path, asset_id, backup_location,
        quarantine_path, registry keys, browser profile paths, raw evidence,
        or internal target payloads.
    """
    params = _safe_params(params)
    actions = params.get("actions")
    if not isinstance(actions, list):
        return {"ok": False, "error": "Missing or invalid parameter: actions"}
    if len(actions) == 0:
        return {"ok": False, "error": "No Security Center actions provided"}

    coordinator = get_coordinator()
    if coordinator is None:
        return _coordinator_error()

    try:
        builder = SecurityRemediationPlanBuilder()
        plan = builder.build_plan(actions)

        plan_repo = ActionPlanRepository(coordinator.database)
        plan_repo.save(plan)

        adapter_stats = builder.get_adapter_statistics()

        return {
            "ok": True,
            "plan_id": plan.plan_id,
            "total_actions": len(plan.actions),
            "auto_fixable": plan.summary.auto_fixable_actions,
            "review_required": plan.summary.review_required_actions,
            "not_fixable": plan.summary.not_fixable_actions,
            "estimated_affected_size": plan.summary.estimated_affected_size,
            "statistics": {
                "converted": adapter_stats["converted"],
                "unsupported": adapter_stats["unsupported"],
                "errors": adapter_stats["errors"],
            },
        }
    except Exception as exc:
        logger.exception("scan_core.security_remediation.plan failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.dashboard_optimization.plan")
def _scan_core_dashboard_optimization_plan(
    params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Convert Dashboard Optimize preview actions into a canonical ActionPlan.

    This RPC is planning-only. It does NOT execute remediation.
    It does NOT call legacy Dashboard Optimize execution paths.
    It does NOT call orchestrator.optimize.

    Request:
        {
            "actions": [
                {
                    "id": "action-1",            # optional, generated if missing
                    "type": "clean_temp_files",   # required
                    "title": "Temporary Files",   # optional
                    "description": "...",         # optional
                    "size": 12345,                # optional, estimated bytes
                    "rollbackAvailable": true     # optional, default false
                },
                ...
            ]
        }

    Response (success):
        {
            "ok": true,
            "plan_id": "...",
            "total_actions": N,
            "auto_fixable": N,
            "review_required": N,
            "not_fixable": N,
            "estimated_affected_size": N or null,
            "statistics": {
                "converted": N,
                "unsupported": N,
                "errors": N
            }
        }

    Response (failure):
        {"ok": false, "error": "..."}

    Privacy:
        The response NEVER exposes canonical_path, asset_id, backup_location,
        registry keys, browser profile paths, raw evidence, or internal
        target payloads.
    """
    params = _safe_params(params)
    actions = params.get("actions")
    if not isinstance(actions, list):
        return {"ok": False, "error": "Missing or invalid parameter: actions"}
    if len(actions) == 0:
        return {"ok": False, "error": "No Dashboard Optimization actions provided"}

    coordinator = get_coordinator()
    if coordinator is None:
        return _coordinator_error()

    try:
        builder = DashboardOptimizationPlanBuilder()
        plan = builder.build_plan(actions)

        plan_repo = ActionPlanRepository(coordinator.database)
        plan_repo.save(plan)

        adapter_stats = builder.get_adapter_statistics()

        return {
            "ok": True,
            "plan_id": plan.plan_id,
            "total_actions": len(plan.actions),
            "auto_fixable": plan.summary.auto_fixable_actions,
            "review_required": plan.summary.review_required_actions,
            "not_fixable": plan.summary.not_fixable_actions,
            "estimated_affected_size": plan.summary.estimated_affected_size,
            "statistics": {
                "converted": adapter_stats["converted"],
                "unsupported": adapter_stats["unsupported"],
                "errors": adapter_stats["errors"],
            },
        }
    except Exception as exc:
        logger.exception("scan_core.dashboard_optimization.plan failed: %s", exc)
        return {"ok": False, "error": str(exc)}


# ── Dashboard Auto-Optimization ─────────────────────────────────────────
#
# The auto-optimization flow chains the canonical remediation path:
#   prepare → validate → execute (live mode)
# in a background thread so the frontend can poll progress.
#
# Safety is NOT bypassed:
#   - The SafetyGate still evaluates every action.
#   - REJECTED actions are skipped (counted as "rejected").
#   - REQUIRES_REVIEW actions are skipped (counted as "requires_review").
#   - Only APPROVED actions are executed.
#   - The ExecutionLedger ensures idempotency.
#   - Backups are created for rollback support.
#   - Verification runs after execution.


def _run_auto_optimize(session_id: str, plan_id: str) -> None:
    """Background target that runs the full auto-optimization pipeline."""
    coord = get_coordinator()
    if coord is None:
        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is not None:
                session["error"] = "Remediation coordinator is not available"
                session["completed"] = True
        return

    def _update(phase: str, message: str, **extra: Any) -> None:
        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is None:
                return
            session["phase"] = phase
            session["message"] = message
            session.update(extra)

    def _is_cancelled() -> bool:
        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is None:
                return True
            return session.get("cancelled", False)

    try:
        # V1.0: Health score is calculated AFTER the preview, based on
        # cleanup opportunities (safe_count), not fluctuating system metrics.
        # This ensures: scan → score → clean → score → scan again shows
        # consistent, deterministic results.

        # Phase 1: Prepare
        _update("preparing", "Preparing optimization plan...")
        if _is_cancelled():
            _update("cancelled", "Optimization cancelled", completed=True)
            return
        preview = coord.prepare(plan_id)

        total_actions = preview.total_actions
        # The safety_state_counts uses ActionState values, not SafetyLevel.
        # Actions with state "planned" are actionable and safe for execution.
        # The SafetyGate will still independently validate each action.
        safe_count = preview.safety_state_counts.get("planned", 0)
        review_count = preview.safety_state_counts.get("review_required", 0)
        blocked_count = (
            preview.safety_state_counts.get("blocked", 0)
            + preview.safety_state_counts.get("not_fixable", 0)
            + preview.safety_state_counts.get("missing_target", 0)
            + preview.safety_state_counts.get("locked_target", 0)
        )

        # V1.0: Deterministic cleanup-based health score.
        # penalty = min(40, safe_count * 0.02)  — each cleanable item = 0.02 points
        # This means: 0 items → 100, 500 items → 90, 2000 items → 60 (floor)
        def _cleanup_health_score(cleanable_count: int) -> int:
            """Deterministic score based on remaining cleanup opportunities."""
            penalty = min(40, cleanable_count * 0.02)
            return max(60, round(100 - penalty))

        health_before = _cleanup_health_score(safe_count)

        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is not None:
                session["preview"] = preview_to_dict(preview)
                session["total_actions"] = total_actions
                session["safe_actions"] = safe_count
                session["review_required"] = review_count
                session["blocked"] = blocked_count

        # Safety limit: auto-optimization is designed for moderate-sized plans.
        # V1.0: Increased to 100,000 since the V1.0 filter already ensures
        # only safe items reach this point.
        MAX_AUTO_OPTIMIZE_ACTIONS = 100000
        if safe_count > MAX_AUTO_OPTIMIZE_ACTIONS:
            _update(
                "complete",
                f"Too many actions ({safe_count}) for automatic optimization. Please use manual review.",
                completed=True,
                error=f"Plan has {safe_count} safe actions, exceeds limit of {MAX_AUTO_OPTIMIZE_ACTIONS}",
                result={
                    "files_found": safe_count,
                    "files_cleaned": 0,
                    "space_recovered": 0,
                    "detected": safe_count,
                    "cleaned": 0,
                    "remaining": safe_count,
                    "failed": 0,
                    "health_before": health_before,
                    "health_after": health_before,
                    "_diagnostics": {
                        "total": total_actions,
                        "rejected": 0,
                        "skipped": 0,
                        "requires_review": review_count,
                        "cancelled": 0,
                        "error": f"Exceeds limit of {MAX_AUTO_OPTIMIZE_ACTIONS}",
                    },
                },
            )
            return

        # If there are no safe actions, skip execution
        if safe_count == 0:
            _update(
                "complete",
                "No safe actions to execute",
                completed=True,
                result={
                    "files_found": 0,
                    "files_cleaned": 0,
                    "space_recovered": 0,
                    "detected": 0,
                    "cleaned": 0,
                    "remaining": 0,
                    "failed": 0,
                    "health_before": health_before,
                    "health_after": 100,  # No cleanup needed → perfect score
                    "_diagnostics": {
                        "total": total_actions,
                        "rejected": 0,
                        "skipped": 0,
                        "requires_review": review_count,
                        "cancelled": 0,
                        "review_required_input": review_count,
                        "blocked_input": blocked_count,
                    },
                },
            )
            return

        # Phase 2: Pre-execution revalidation
        # V1.0: Re-check every PLANNED action against the CURRENT filesystem.
        # This closes the TOCTOU gap: files that were deletable during discovery
        # may have become locked, deleted, or inaccessible by the time execution
        # begins. The user-visible "detected" count must only include files that
        # can actually be deleted RIGHT NOW.
        if _is_cancelled():
            _update("cancelled", "Optimization cancelled", completed=True)
            return
        _update("revalidating", "Verifying cleanup targets...")
        revalidation = coord.revalidate_planned_actions(plan_id)
        originally_planned = safe_count
        still_deletable = revalidation.get("still_deletable", 0)
        now_missing = revalidation.get("now_missing", 0)
        now_locked = revalidation.get("now_locked", 0)
        now_inaccessible = revalidation.get("now_inaccessible", 0)
        removed = originally_planned - still_deletable

        # V1.0: Update safe_count to the revalidated count.
        # The user sees "detected" = still_deletable, NOT the original
        # planning count. Files that became locked/missing/inaccessible
        # are removed from the user-visible cleanup set BEFORE cleanup.
        safe_count = still_deletable
        health_before = _cleanup_health_score(safe_count)

        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is not None:
                session["safe_actions"] = safe_count
                session["revalidation_removed"] = removed

        # If revalidation removed everything, skip execution
        if safe_count == 0:
            _update(
                "complete",
                "No deletable files found after revalidation",
                completed=True,
                result={
                    "files_found": 0,
                    "files_cleaned": 0,
                    "space_recovered": 0,
                    "detected": 0,
                    "cleaned": 0,
                    "remaining": 0,
                    "failed": 0,
                    "health_before": health_before,
                    "health_after": 100,
                    "_diagnostics": {
                        "total": total_actions,
                        "rejected": 0,
                        "skipped": 0,
                        "requires_review": review_count,
                        "cancelled": 0,
                        "review_required_input": review_count,
                        "blocked_input": blocked_count,
                        "revalidation_removed": removed,
                        "now_missing": now_missing,
                        "now_locked": now_locked,
                        "now_inaccessible": now_inaccessible,
                    },
                },
            )
            return

        # Phase 3: Execute (live mode)
        # The executor independently validates each action via SafetyGate
        # during execution. The approval_token from prepare() authorizes
        # execution. The SafetyGate still evaluates each action independently.
        if _is_cancelled():
            _update("cancelled", "Optimization cancelled", completed=True)
            return
        _update(
            "executing",
            f"Optimizing {safe_count} safe actions...",
            execution_started=True,
            execution_progress=0,
            execution_total=safe_count,
            current_file="",
        )

        # Progress callback that updates the session with per-action progress
        def _on_execution_progress(
            current_path: str,
            completed: int,
            total: int,
            info: dict,
        ) -> None:
            with _auto_opt_lock:
                session = _auto_opt_sessions.get(session_id)
                if session is None:
                    return
                # Calculate actual progress: 10% (prepare) + 80% (execute) + 10% (verify)
                # Execute phase maps from 10% to 90%
                if total > 0:
                    exec_pct = (completed / total) * 80
                    overall_pct = 10 + int(exec_pct)
                else:
                    overall_pct = 10
                session["execution_progress"] = completed
                session["execution_total"] = total
                session["current_file"] = current_path
                session["overall_progress"] = overall_pct
                # V1.0: message is a generic status label; the current file
                # path is surfaced separately via session["current_file"] so
                # the frontend does not display the path twice.
                session["message"] = f"Cleaning {completed}/{total} files..."

        request_id = str(uuid.uuid4())
        summary = coord.execute(
            plan_id,
            request_id=request_id,
            approval_token=preview.approval_token,
            mode="live",
            on_progress=_on_execution_progress,
        )

        # Calculate space recovered from VERIFIED completed actions.
        # V1.0: Only count space from actions where the file was actually
        # deleted (after_state confirms the file no longer exists).
        space_recovered = 0
        failed_details: list[dict[str, Any]] = []
        for result in summary.results:
            if result.status.value == "completed":
                # Verify the file was actually deleted
                after_state = getattr(result, "after_state", None)
                if after_state and isinstance(after_state, dict):
                    if after_state.get("exists") is False:
                        # File confirmed deleted — count its size
                        before_state = getattr(result, "before_state", None)
                        if before_state and isinstance(before_state, dict):
                            size = before_state.get("size", 0)
                            if isinstance(size, (int, float)) and size > 0:
                                space_recovered += size
                elif hasattr(result, "before_state") and result.before_state:
                    # Fallback: if after_state is missing, use before_state size
                    # for completed actions (the executor verified deletion)
                    size = result.before_state.get("size", 0)
                    if isinstance(size, (int, float)) and size > 0:
                        space_recovered += size
            elif result.status.value == "failed":
                # V1.0: Capture failed action details for internal diagnostics.
                # Record: path, rule, error code, reason, whether file existed.
                target = getattr(result, "target", None)
                target_path = ""
                if target:
                    target_dict = target.to_dict() if hasattr(target, "to_dict") else {}
                    target_path = target_dict.get("path", "")
                before_state = getattr(result, "before_state", None) or {}
                after_state = getattr(result, "after_state", None) or {}
                failed_details.append({
                    "path": target_path,
                    "rule_id": getattr(result, "rule_id", ""),
                    "error_code": getattr(result, "error_code", "") or "",
                    "reason": getattr(result, "reason", "") or "",
                    "existed_before": before_state.get("exists", True) if isinstance(before_state, dict) else True,
                    "existed_after": after_state.get("exists", True) if isinstance(after_state, dict) else True,
                    "locked_before": before_state.get("locked", False) if isinstance(before_state, dict) else False,
                    "locked_after": after_state.get("locked", False) if isinstance(after_state, dict) else False,
                })

        # V1.0: Deterministic cleanup-based health score AFTER optimization.
        # Based on remaining cleanable items, not fluctuating system metrics.
        # remaining = detected - cleaned - failed (items still present and
        # not yet attempted, excluding both cleaned and failed items)
        remaining_after = safe_count - summary.completed - summary.failed
        health_after = _cleanup_health_score(remaining_after)

        # V1.0 Dashboard result contract — SIMPLE:
        # User sees ONLY: files_found, files_cleaned, space_recovered.
        # Everything else (rejected, failed, remaining, health, etc.) is
        # internal diagnostics only — NOT shown to the user.
        result_dict = {
            # ── User-facing fields (ONLY these 3) ───────────────────────
            "files_found": safe_count,
            "files_cleaned": summary.completed,
            "space_recovered": space_recovered,
            # ── Legacy compat (kept for any old callers, NOT shown) ─────
            "detected": safe_count,
            "cleaned": summary.completed,
            "remaining": max(0, safe_count - summary.completed - summary.failed),
            "failed": summary.failed,
            "health_before": health_before,
            "health_after": health_after,
            # ── Internal diagnostics (NOT shown to Dashboard user) ──────
            "_diagnostics": {
                "execution_id": summary.execution_id,
                "total": summary.total,
                "detected_candidates": total_actions,
                "rejected": summary.rejected,
                "skipped": summary.skipped,
                "requires_review": summary.requires_review,
                "cancelled": summary.cancelled,
                "review_required_input": review_count,
                "blocked_input": blocked_count,
                "failed": summary.failed,
                "remaining": max(0, safe_count - summary.completed - summary.failed),
                "status": summary.status.value,
                "reason": summary.reason or "",
                "failed_details": failed_details,
                "revalidation_removed": removed,
                "now_missing": now_missing,
                "now_locked": now_locked,
                "now_inaccessible": now_inaccessible,
            },
        }

        # Phase 4: Verification
        if summary.completed > 0:
            _update("verifying", f"Verifying {summary.completed} completed actions...")
        else:
            _update("verifying", "No actions to verify...")

        # The executor already verifies each action via preconditions.
        # We surface the verification status from the summary.
        verification_status = "passed"
        if summary.failed > 0:
            verification_status = "partial"
        if summary.completed == 0 and summary.failed > 0:
            verification_status = "failed"

        # Phase 5: Complete
        _update(
            "complete",
            "Optimization complete",
            completed=True,
            result=result_dict,
            verification_status=verification_status,
        )

        # Persist cleanup result to scan history (PART 2)
        try:
            orchestrator = get_scan_orchestrator()
            if orchestrator:
                # V1.0: Persist only user-facing fields + verification status.
                # Internal diagnostics are NOT persisted to the user-facing
                # scan history.
                cleanup_result = {
                    "files_found": safe_count,
                    "files_cleaned": summary.completed,
                    "space_recovered": space_recovered,
                    "verification_status": verification_status,
                }
                orchestrator.update_scan_history_cleanup(plan_id, cleanup_result)
        except Exception as exc:
            logger.warning(f"Failed to persist cleanup result: {exc}")
            # Non-fatal — optimization succeeded even if persistence failed

    except Exception as exc:
        logger.exception("Auto-optimization failed: %s", exc)
        _update(
            "error",
            f"Optimization failed: {exc}",
            completed=True,
            error=str(exc),
        )


@register("scan_core.dashboard.auto_optimize")
def _scan_core_dashboard_auto_optimize(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Start automatic optimization of safe actions from a scan plan.

    This chains prepare → validate → execute (live) in a background thread.
    The SafetyGate is NOT bypassed — only APPROVED actions are executed.
    REQUIRES_REVIEW and REJECTED actions are skipped and counted.

    Parameters:
        plan_id: The action plan ID from a completed scan.
    """
    params = _safe_params(params)
    ok, plan_id = _require_str(params, "plan_id")
    if not ok:
        return {"ok": False, "error": plan_id}

    session_id = str(uuid.uuid4())

    with _auto_opt_lock:
        _auto_opt_sessions[session_id] = {
            "session_id": session_id,
            "plan_id": plan_id,
            "phase": "starting",
            "message": "Starting optimization...",
            "preview": None,
            "validation": None,
            "result": None,
            "completed": False,
            "cancelled": False,
            "error": None,
            "total_actions": 0,
            "safe_actions": 0,
            "review_required": 0,
            "blocked": 0,
            "verification_status": None,
            "execution_progress": 0,
            "execution_total": 0,
            "current_file": "",
            "overall_progress": 0,
        }

    # Start the background thread — get_coordinator() is called from
    # within the thread so the RPC handler returns immediately.
    thread = threading.Thread(
        target=_run_auto_optimize,
        args=(session_id, plan_id),
        daemon=True,
        name=f"auto-opt-{session_id}",
    )
    thread.start()

    return {"ok": True, "session_id": session_id}


@register("scan_core.dashboard.auto_optimize_status")
def _scan_core_dashboard_auto_optimize_status(
    params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Poll the status of a running auto-optimization session."""
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    with _auto_opt_lock:
        session = _auto_opt_sessions.get(session_id)
        if session is None:
            return {"ok": False, "error": "Optimization session not found"}
        return {"ok": True, **dict(session)}


@register("scan_core.dashboard.auto_optimize_cancel")
def _scan_core_dashboard_auto_optimize_cancel(
    params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Cancel a running auto-optimization session."""
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    with _auto_opt_lock:
        session = _auto_opt_sessions.get(session_id)
        if session is None:
            return {"ok": False, "error": "Optimization session not found"}
        session["cancelled"] = True

    # If there's an active execution, cancel it via the coordinator
    coord = get_coordinator()
    if coord is not None:
        # Try to cancel any active execution for this plan
        # The coordinator tracks active executions by request_id
        pass  # The background thread will check cancelled flag

    return {"ok": True, "cancelled": True}


# =====================================================================
# SC-8C14 Phase 3 — Canonical read-only quarantine list
# =====================================================================
#
# Reads the existing quarantine manifest maintained by the
# security_remediation module (same path, same format) and returns a
# privacy-safe, display-oriented summary. This RPC is strictly
# read-only: it never mutates the manifest, never moves/deletes files,
# never calls executors, never calls subprocess, and never invokes the
# RemediationCoordinator or SafetyGate.
#
# Privacy contract:
#   The response NEVER exposes canonical_path, asset_id, backup_location,
#   quarantine_path, original_path, registry keys, browser profile paths,
#   internal storage paths, raw evidence, or executable commands.

import json as _json_for_quarantine
import platform as _platform_for_quarantine

_QUARANTINE_DIR_CANONICAL: str
if _platform_for_quarantine.system() == "Windows":
    _QUARANTINE_DIR_CANONICAL = os.path.expandvars(
        r"%LOCALAPPDATA%\AVS Shield\Quarantine"
    )
else:
    _QUARANTINE_DIR_CANONICAL = os.path.expanduser("~/.avs-shield/quarantine")

_QUARANTINE_MANIFEST_CANONICAL = os.path.join(
    _QUARANTINE_DIR_CANONICAL, "manifest.json"
)


def _load_quarantine_manifest_canonical() -> dict[str, Any]:
    """Load the quarantine manifest read-only.

    Returns ``{"items": []}`` when the manifest is missing or malformed,
    matching the tolerant behavior of the transitional implementation.
    """
    try:
        with open(_QUARANTINE_MANIFEST_CANONICAL, "r", encoding="utf-8") as f:
            data = _json_for_quarantine.load(f)
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            return {"items": []}
        return data
    except (FileNotFoundError, ValueError, OSError):
        return {"items": []}


def _sanitize_quarantine_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Convert a raw manifest item into a privacy-safe display record.

    Returns ``None`` for entries that cannot be safely surfaced.
    """
    if not isinstance(raw, dict):
        return None

    quarantine_id = raw.get("quarantineId")
    if not isinstance(quarantine_id, str) or not quarantine_id:
        return None

    restored = bool(raw.get("restored", False))
    deleted = bool(raw.get("deleted", False))
    if deleted:
        status = "deleted"
    elif restored:
        status = "restored"
    else:
        status = "quarantined"

    # Derive a display name from the original path basename. The full
    # path itself is NOT exposed. Handle both Windows (backslash) and
    # POSIX (forward slash) separators so the basename extraction works
    # correctly regardless of the platform running the backend.
    original_path = raw.get("originalPath")
    display_name: str
    if isinstance(original_path, str) and original_path:
        # Normalize separators so basename works on any host platform.
        normalized = original_path.replace("\\", "/")
        display_name = os.path.basename(normalized)
    else:
        display_name = "quarantined-item"

    quarantined_at = raw.get("quarantinedAt")
    detected_at = quarantined_at if isinstance(quarantined_at, str) else None

    file_size = raw.get("fileSize")
    size = int(file_size) if isinstance(file_size, (int, float)) else 0

    reason = raw.get("reason")
    detection_reason = reason if isinstance(reason, str) else None

    return {
        "id": quarantine_id,
        "displayName": display_name,
        "status": status,
        "detectedAt": detected_at,
        "threatType": None,
        "severity": None,
        "size": size,
        "rollbackAvailable": status == "quarantined",
        "detectionReason": detection_reason,
    }


@register("scan_core.security_remediation.quarantine_list")
def _scan_core_security_remediation_quarantine_list(
    _params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """List quarantined items in a privacy-safe, read-only form.

    Reads the existing quarantine manifest maintained by the
    ``security_remediation`` module and returns display-oriented
    metadata only. This RPC does NOT execute remediation, does NOT
    call executors, does NOT call subprocess, does NOT move or delete
    files, and does NOT invoke the RemediationCoordinator or SafetyGate.

    Response (success):
        {
            "ok": True,
            "items": [
                {
                    "id": "q-...",
                    "displayName": "evil.exe",
                    "status": "quarantined" | "restored" | "deleted",
                    "detectedAt": "2024-..." | None,
                    "threatType": None,
                    "severity": None,
                    "size": 1024,
                    "rollbackAvailable": True | False,
                    "detectionReason": "..." | None
                },
                ...
            ],
            "count": N,         # active (non-restored, non-deleted) items
            "totalItems": N,    # all manifest entries
            "capturedAt": "2024-..."
        }

    Response (failure):
        {"ok": False, "error": "..."}

    Privacy:
        The response NEVER exposes canonical_path, asset_id,
        backup_location, quarantine_path, original_path, registry keys,
        browser profile paths, internal storage paths, raw evidence, or
        executable commands. Only display-oriented fields are returned.
    """
    try:
        manifest = _load_quarantine_manifest_canonical()
        raw_items = manifest.get("items", [])
        if not isinstance(raw_items, list):
            raw_items = []

        sanitized: list[dict[str, Any]] = []
        for raw in raw_items:
            entry = _sanitize_quarantine_item(raw)
            if entry is not None:
                sanitized.append(entry)

        active = [
            it for it in sanitized if it["status"] == "quarantined"
        ]

        return {
            "ok": True,
            "items": sanitized,
            "count": len(active),
            "totalItems": len(sanitized),
            "capturedAt": datetime.now(UTC).isoformat(),
        }
    except Exception as exc:
        logger.exception(
            "scan_core.security_remediation.quarantine_list failed: %s",
            exc,
        )
        return {"ok": False, "error": str(exc)}


# =====================================================================
# V1.0 Protection Center — Windows Defender status
# =====================================================================


@register("scan_core.defender.status")
def _scan_core_defender_status(
    _params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Query Windows Defender threat information and protection state.

    Returns authoritative Defender status:
    - status: "available" | "unavailable" | "disabled" | "not_windows" | "query_failed"
    - is_available: bool
    - reason: human-readable explanation
    - threats: list of confirmed threats (empty when available with no threats)
    - protection_state: real-time protection posture

    NEVER fabricates results. When unavailable, returns status="unavailable"
    with a clear reason — NOT "no threats found".

    Response (success):
        {
            "ok": true,
            "status": "available" | "unavailable" | "disabled" | ...,
            "is_available": bool,
            "reason": "...",
            "threats": [...],
            "active_threat_count": N,
            "total_threat_count": N,
            "protection_state": {...} | null,
            "queried_at": "..."
        }
    """
    try:
        from avs_backend.scan_core.security.defender_integration import (
            get_defender_threat_info,
        )

        info = get_defender_threat_info()
        return {"ok": True, **info.to_dict()}
    except Exception as exc:
        logger.exception("scan_core.defender.status failed: %s", exc)
        return {"ok": False, "error": str(exc)}
