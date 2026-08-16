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


def get_scan_orchestrator() -> Optional[ScanOrchestrator]:
    """Return the module-level ScanOrchestrator singleton, or None on failure."""
    global _scan_orchestrator
    if _scan_orchestrator is not None:
        return _scan_orchestrator

    with _scan_orchestrator_lock:
        if _scan_orchestrator is not None:
            return _scan_orchestrator

        try:
            app_dir = _get_app_data_dir()
            app_dir.mkdir(parents=True, exist_ok=True)

            db = MetadataDatabase(DatabaseConfig(db_path=app_dir / "metadata.db"))
            db.initialize()
            registry = RuleRegistry()
            register_junk_rules(registry)
            _scan_orchestrator = ScanOrchestrator(
                database=db,
                registry=registry,
                snapshot_ttl_seconds=3600,
            )
            return _scan_orchestrator
        except Exception as exc:
            logger.exception("Failed to initialize ScanOrchestrator: %s", exc)
            return None


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
        return _orchestrator_error()

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
        return _orchestrator_error()

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
    if orchestrator is None:
        return _orchestrator_error()

    try:
        return orchestrator.get_plan_details(plan_id)
    except Exception as exc:
        logger.exception("scan_core.scan.plan_details failed: %s", exc)
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
