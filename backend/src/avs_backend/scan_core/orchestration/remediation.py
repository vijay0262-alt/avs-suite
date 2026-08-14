"""SC-8C6 RemediationCoordinator — safe execution workflow."""

from __future__ import annotations

import dataclasses
import hashlib
import logging
import os
import threading

logger = logging.getLogger(__name__)
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

from avs_backend.scan_core.execution.backup import BackupManager, BackupRecord
from avs_backend.scan_core.execution.context import FilesystemContext
from avs_backend.scan_core.execution.executor import DefaultExecutor
from avs_backend.scan_core.execution.models import (
    CancellationToken,
    ExecutionRequest,
    ExecutionStatus,
    ExecutionSummary,
)
from avs_backend.scan_core.execution.registry_backup import RegistryBackup
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.metadata.database import MetadataDatabase
from avs_backend.scan_core.metadata.execution_repository import ExecutionRepository
from avs_backend.scan_core.rules.action import ActionPlan, RemediationAction
from avs_backend.scan_core.rules.action_preconditions import (
    NotJunction,
    NotReparsePoint,
    NotSymlink,
    PathWithinAllowedScope,
    PreconditionSet,
    SafetyLevelValid,
    SizeMatches,
    TargetAccessible,
    TargetExists,
    TargetIdentityMatches,
    TargetNotLocked,
)

from .remediation_models import (
    RemediationExecutionStatus,
    RemediationPreview,
    RemediationValidation,
    RollbackResult,
    RollbackSummary,
)


@dataclass
class RemediationCoordinator:
    """Backend coordinator connecting ActionPlan -> approval -> safe execution."""

    database: MetadataDatabase
    backup_root: Path
    executor: Optional[DefaultExecutor] = field(default=None, repr=False)

    def __post_init__(self) -> None:
        self.database.initialize()
        self._plan_repo = ActionPlanRepository(self.database)
        self._exec_repo = ExecutionRepository(self.database)
        self._backup_manager = BackupManager(self.backup_root)
        self._registry_backup = RegistryBackup()
        self._executor = self.executor or DefaultExecutor(
            backup_manager=self._backup_manager,
            registry_backup=self._registry_backup,
            action_plan_repository=self._plan_repo,
            execution_repository=self._exec_repo,
        )
        self._tokens: dict[str, CancellationToken] = {}
        self._active: set[str] = set()
        self._lock = threading.Lock()

    # ── Public API ──────────────────────────────────────────────────────────

    def prepare(self, plan_id: str) -> RemediationPreview:
        """Return a non-mutating preview of the planned remediation."""
        plan = self._load_plan(plan_id)
        request_id = str(uuid.uuid4())
        approval_token = str(uuid.uuid4())
        return self._build_preview(plan, request_id, approval_token)

    def validate(self, plan_id: str) -> RemediationValidation:
        """Dry-run the plan through the executor and report safety results."""
        plan = self._load_plan(plan_id)
        request_id = str(uuid.uuid4())
        request = ExecutionRequest(
            plan=plan,
            request_id=request_id,
            mode="dry_run",
            context_provider=self._context_provider(plan),
        )
        summary = self._executor.execute(request)
        return self._validation_from_summary(summary)

    def execute(
        self,
        plan_id: str,
        *,
        request_id: str,
        approval_token: str,
        mode: str = "dry_run",
        cancellation_token: Optional[CancellationToken] = None,
    ) -> ExecutionSummary:
        """Execute a plan after explicit approval and fresh re-validation."""
        plan = self._load_plan(plan_id)

        if plan.is_stale():
            return self._rejected_summary(
                request_id, "ActionPlan is stale and cannot be executed"
            )

        if mode == "live" and not approval_token:
            return self._rejected_summary(
                request_id, "Live execution requires explicit approval_token"
            )

        with self._lock:
            if request_id in self._active or self._is_request_final(request_id):
                return self._rejected_summary(
                    request_id, "Execution request is already active or completed"
                )
            self._active.add(request_id)

        token = cancellation_token or CancellationToken()
        self._tokens[request_id] = token
        try:
            request = ExecutionRequest(
                plan=plan,
                request_id=request_id,
                mode=mode,
                context_provider=self._context_provider(plan),
                cancellation_token=token,
            )
            summary = self._executor.execute(request)
            return self._finalize_status(request_id, summary)
        finally:
            self._active.discard(request_id)
            self._tokens.pop(request_id, None)

    def _finalize_status(
        self, request_id: str, summary: ExecutionSummary
    ) -> ExecutionSummary:
        """Persist a serializable execution status independent of the executor."""
        try:
            sanitized = dataclasses.replace(summary, ledger=None)
            self._exec_repo.save_summary(request_id, sanitized)
            self._exec_repo.update_request_status(
                request_id,
                sanitized.status.value,
                started_at=sanitized.started_at,
                completed_at=sanitized.completed_at,
            )
            return summary
        except Exception as exc:
            logger.error(
                f"Coordinator status persistence failed for {request_id}: {exc}"
            )
            return dataclasses.replace(
                summary,
                status=ExecutionStatus.FAILED,
                reason=f"Execution completed but coordinator audit persistence failed: {exc}",
                ledger=None,
            )

    def cancel(self, execution_id: str) -> bool:
        """Request cancellation of a running execution."""
        token = self._tokens.get(execution_id)
        if token is not None:
            token.cancel()
            return True
        return False

    def get_status(self, execution_id: str) -> RemediationExecutionStatus:
        """Return the persisted status for an execution request."""
        audit = self._exec_repo.get_request_audit(execution_id, include_raw=True)
        request_row = audit.get("request") or {}
        summary_row = audit.get("summary") or {}
        summary_data: dict[str, Any] = {}
        if summary_row and summary_row.get("summary_data"):
            try:
                import json

                summary_data = json.loads(summary_row["summary_data"])
            except Exception:
                summary_data = {}

        def _ts(value: Any) -> Optional[datetime]:
            if not value:
                return None
            if isinstance(value, datetime):
                return value
            try:
                return datetime.fromisoformat(value)
            except Exception:
                return None

        started = _ts(request_row.get("started_at"))
        completed = _ts(
            request_row.get("completed_at") or summary_row.get("completed_at")
        )

        return RemediationExecutionStatus(
            execution_id=execution_id,
            plan_id=request_row.get("plan_id", ""),
            status=request_row.get("status", "unknown"),
            total=summary_data.get("total", 0),
            completed=summary_data.get("completed", 0),
            failed=summary_data.get("failed", 0),
            rejected=summary_data.get("rejected", 0),
            skipped=summary_data.get("skipped", 0),
            requires_review=summary_data.get("requires_review", 0),
            cancelled=summary_data.get("cancelled", 0),
            dry_run=summary_data.get("dry_run", 0),
            started_at=started,
            completed_at=completed,
            reason=summary_data.get("reason", ""),
        )

    def rollback(self, execution_id: str) -> RollbackSummary:
        """Rollback completed filesystem actions for a prior execution."""
        audit = self._exec_repo.get_request_audit(execution_id, include_raw=True)
        summary_row = audit.get("summary") or {}
        if not summary_row or not summary_row.get("summary_data"):
            return RollbackSummary(
                execution_id=execution_id,
                total=0,
                successful=0,
                failed=1,
                results=(
                    RollbackResult(
                        action_id="",
                        backup_identity="",
                        success=False,
                        reason="No execution summary found for rollback",
                    ),
                ),
            )

        import json

        summary_data = json.loads(summary_row["summary_data"])
        results: list[RollbackResult] = []

        for result in summary_data.get("results", []):
            action_id = result.get("action_id", "")
            backup_identity = result.get("backup_identity") or ""
            backup_location = result.get("backup_location") or ""
            before_state = result.get("before_state") or {}
            action_type = result.get("action_type", "")
            status = result.get("status", "")

            if status != "completed" or not backup_identity or not backup_location:
                continue

            original_path = before_state.get("canonical_path") or ""
            if not original_path:
                continue

            record = BackupRecord(
                backup_id=backup_identity,
                execution_id=execution_id,
                action_id=action_id,
                asset_id=result.get("asset_id", ""),
                original_path=original_path,
                original_size=before_state.get("size", 0),
                original_modified_time=None,
                backup_location=backup_location,
                backup_hash=result.get("backup_hash"),
                created_at=datetime.now(UTC),
                is_directory=before_state.get("is_dir", False)
                or action_type in ("delete_directory", "clear_cache"),
            )

            if not self._safe_to_restore(Path(original_path), Path(backup_location)):
                results.append(
                    RollbackResult(
                        action_id=action_id,
                        backup_identity=backup_identity,
                        success=False,
                        reason="Target path exists and differs from backup; refusing to overwrite",
                        restored_path=original_path,
                    )
                )
                continue

            try:
                restore_result = self._backup_manager.restore(record)
                results.append(
                    RollbackResult(
                        action_id=action_id,
                        backup_identity=backup_identity,
                        success=restore_result.success,
                        reason=restore_result.reason,
                        restored_path=original_path,
                    )
                )
            except Exception as exc:
                results.append(
                    RollbackResult(
                        action_id=action_id,
                        backup_identity=backup_identity,
                        success=False,
                        reason=f"Rollback failed: {exc}",
                        restored_path=original_path,
                    )
                )

        successful = sum(1 for r in results if r.success)
        return RollbackSummary(
            execution_id=execution_id,
            total=len(results),
            successful=successful,
            failed=len(results) - successful,
            results=tuple(results),
        )

    # ── Internal helpers ────────────────────────────────────────────────────

    def _load_plan(self, plan_id: str) -> ActionPlan:
        plan = self._plan_repo.load(plan_id)
        if plan is None:
            raise ValueError(f"ActionPlan {plan_id} not found")
        return self._rebuild_preconditions(plan)

    def _rebuild_preconditions(self, plan: ActionPlan) -> ActionPlan:
        """Replace placeholder preconditions with typed, re-evaluatable ones."""
        new_actions: list[RemediationAction] = []
        for action in plan.actions:
            conditions: list[Any] = [
                TargetExists(expected=True),
                TargetAccessible(expected=True),
                TargetNotLocked(expected=True),
                TargetIdentityMatches(expected_asset_id=action.asset_id),
                NotSymlink(),
                NotJunction(),
                NotReparsePoint(),
                SafetyLevelValid(allowed_levels=("safe", "low_risk")),
            ]
            target = action.target
            allowed_location = getattr(target, "allowed_location", "")
            canonical_path = getattr(target, "canonical_path", "")
            if allowed_location:
                conditions.append(
                    PathWithinAllowedScope(
                        allowed_location=str(allowed_location),
                        canonical_path=str(canonical_path),
                    )
                )
            if action.estimated_size is not None:
                conditions.append(SizeMatches(expected_size=action.estimated_size))
            new_action = dataclasses.replace(
                action,
                preconditions=PreconditionSet(conditions=tuple(conditions)),
            )
            new_actions.append(new_action)
        return dataclasses.replace(plan, actions=tuple(new_actions))

    def _build_preview(
        self, plan: ActionPlan, request_id: str, approval_token: str
    ) -> RemediationPreview:
        action_types: dict[str, int] = {}
        safety_counts: dict[str, int] = {}
        fixability_counts: dict[str, int] = {}
        estimated_size = 0
        targets: list[dict[str, Any]] = []
        warnings: list[str] = []
        backup_required = False
        rollback_supported = False

        for action in plan.actions:
            atype = action.action_type.value
            action_types[atype] = action_types.get(atype, 0) + 1
            safety_counts[action.state.value] = (
                safety_counts.get(action.state.value, 0) + 1
            )
            fixability_counts[action.fixability.value] = (
                fixability_counts.get(action.fixability.value, 0) + 1
            )
            estimated_size += action.estimated_size or 0
            if hasattr(action.target, "to_dict"):
                targets.append(action.target.to_dict())
            if action.backup_required:
                backup_required = True
            if action.rollback_supported:
                rollback_supported = True
            if action.is_blocked:
                warnings.append(f"Action {action.action_id} is blocked")
            elif action.requires_review:
                warnings.append(f"Action {action.action_id} requires review")
            elif not action.is_actionable:
                warnings.append(f"Action {action.action_id} is not actionable")

        if plan.is_stale():
            warnings.append("ActionPlan is stale")

        return RemediationPreview(
            request_id=request_id,
            plan_id=plan.plan_id or "",
            approval_token=approval_token,
            total_actions=len(plan.actions),
            action_types=action_types,
            affected_targets=tuple(targets),
            estimated_size=estimated_size,
            safety_state_counts=safety_counts,
            fixability_counts=fixability_counts,
            backup_required=backup_required,
            rollback_supported=rollback_supported,
            warnings=tuple(warnings),
            is_stale=plan.is_stale(),
            generated_at=plan.generated_at,
        )

    def _validation_from_summary(
        self, summary: ExecutionSummary
    ) -> RemediationValidation:
        warnings: list[str] = []
        for result in summary.results:
            if result.status == ExecutionStatus.REJECTED:
                warnings.append(f"Action {result.action_id} rejected: {result.reason}")
            elif result.status == ExecutionStatus.REQUIRES_REVIEW:
                warnings.append(
                    f"Action {result.action_id} requires review: {result.reason}"
                )
            elif result.status == ExecutionStatus.FAILED:
                warnings.append(f"Action {result.action_id} failed: {result.reason}")

        rejected = summary.rejected
        failed = summary.failed
        requires_review = summary.requires_review
        valid = rejected == 0 and failed == 0 and requires_review == 0

        return RemediationValidation(
            valid=valid,
            status=summary.status.value,
            total=summary.total,
            completed=summary.completed,
            failed=failed,
            rejected=rejected,
            requires_review=requires_review,
            dry_run=summary.dry_run,
            warnings=tuple(warnings),
            summary=summary,
        )

    def _context_provider(self, plan: ActionPlan):
        """Return a callable that re-reads fresh live state for an action."""

        def _provide(action: Any) -> Optional[dict[str, Any]]:
            action_type = getattr(action, "action_type", None)
            if action_type is None:
                return None
            action_type_value = action_type.value
            target = getattr(action, "target", None)
            if target is None:
                return None

            if action_type_value in (
                "delete_file",
                "delete_directory",
                "clear_cache",
            ):
                return self._filesystem_context(target, action.asset_id)
            # Registry / browser / startup targets are not supported by this
            # coordinator yet; returning None lets the executor reject live mode.
            return None

        return _provide

    def _filesystem_context(
        self, target: Any, asset_id: str
    ) -> Optional[dict[str, Any]]:
        canonical = getattr(target, "canonical_path", "")
        if not canonical:
            return None
        try:
            path = Path(canonical)
            exists = os.path.lexists(path)
            is_symlink = os.path.islink(path) if exists else False
            is_junction = (
                os.path.isjunction(path)
                if exists and hasattr(os, "isjunction")
                else False
            )
            is_reparse = False
            is_file = path.is_file() and not is_symlink if exists else False
            is_dir = path.is_dir() and not is_symlink if exists else False
            size = os.path.getsize(path) if is_file else (0 if is_dir else 0)
            mtime = (
                datetime.fromtimestamp(os.path.getmtime(path), UTC) if exists else None
            )
            accessible = os.access(path, os.W_OK) if exists else False
            locked = False

            ctx = FilesystemContext(
                exists=exists,
                accessible=accessible,
                locked=locked,
                canonical_path=canonical,
                asset_id=asset_id,
                size=size,
                modified_time=mtime,
                symlink=is_symlink,
                junction=is_junction,
                reparse_point=is_reparse,
                safety_level="safe",
            )
            return ctx.to_dict()
        except (OSError, ValueError):
            return None

    def _rejected_summary(self, request_id: str, reason: str) -> ExecutionSummary:
        return ExecutionSummary(
            execution_id=str(uuid.uuid4()),
            request_id=request_id,
            status=ExecutionStatus.REJECTED,
            total=0,
            completed=0,
            failed=0,
            rejected=1,
            skipped=0,
            requires_review=0,
            cancelled=0,
            dry_run=0,
            results=(),
            started_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
            ledger=None,
            reason=reason,
        )

    def _is_request_final(self, request_id: str) -> bool:
        status = self._exec_repo.get_request_status(request_id)
        if status is None:
            return False
        from avs_backend.scan_core.execution.state_machine import is_final_state

        return is_final_state(status)

    def _safe_to_restore(self, original_path: Path, backup_path: Path) -> bool:
        """Refuse to overwrite a target that now differs from the backup."""
        if not original_path.exists():
            return True
        if not backup_path.exists():
            return False
        if original_path.is_file() and backup_path.is_file():
            return _sha256(original_path) == _sha256(backup_path)
        # For directories allow only if the original is currently empty or missing.
        if original_path.is_dir():
            return not any(original_path.iterdir())
        return False


def _sha256(path: Path) -> str:
    """Compute SHA-256 of a file without loading it entirely into memory."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()
