"""
SC-8C4 Part 1 — Default execution engine.

The DefaultExecutor consumes an ActionPlan, verifies it through a SafetyGate,
evaluates typed preconditions, and returns structured ExecutionResults.

Dry-run is the default mode. No destructive operations are performed.
"""

from __future__ import annotations

import dataclasses
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)

from avs_backend.scan_core.rules.safety_gate import (
    SafetyGate,
    SafetyGateResult,
    create_safety_gate,
)

from .backup import BackupManager
from .context import default_context_for_action, normalize_context
from .ledger import ExecutionLedger
from .models import (
    ExecutionCancelledError,
    ExecutionError,
    ExecutionRequest,
    ExecutionResult,
    ExecutionStatus,
    ExecutionSummary,
)
from .registry_backup import RegistryBackup
from .state_machine import ExecutionState
from .target_executors import get_target_executor


@dataclass(frozen=True)
class DefaultExecutor:
    """
    Default remediation execution engine.

    Guarantees:
    - Dry-run by default
    - SafetyGate cannot be bypassed
    - All typed preconditions are evaluated
    - Deterministic execution order
    - Cooperative cancellation
    - Failure isolation
    - Idempotency via ExecutionLedger
    """

    safety_gate: SafetyGate = field(default_factory=create_safety_gate)
    ledger: ExecutionLedger = field(default_factory=ExecutionLedger)
    backup_manager: Optional[BackupManager] = None
    registry_backup: Optional[RegistryBackup] = None
    action_plan_repository: Optional[Any] = None
    execution_repository: Optional[Any] = None

    def execute(self, request: ExecutionRequest) -> ExecutionSummary:
        """
        Execute the requested ActionPlan and return an immutable summary.

        Persists the plan before live execution begins, seeds the ledger from
        prior completed actions to avoid duplicate execution, and records every
        action result and the final summary. Dry-run requests are persisted for
        audit as well.
        """
        execution_id = str(uuid.uuid4())
        started_at = datetime.now(UTC)
        results: list[ExecutionResult] = []
        persistence_failed = False

        try:
            # 1. Persist plan before any execution begins.
            if self.action_plan_repository is not None:
                self.action_plan_repository.save(
                    request.plan, status=ExecutionState.PLANNED
                )

            # 2. Persist execution request.
            if self.execution_repository is not None:
                self.execution_repository.save_request(
                    request, status=ExecutionState.PLANNED
                )

            # 3. Mark running and seed ledger with previously-completed actions.
            if self.execution_repository is not None:
                self.execution_repository.update_request_status(
                    request.request_id, ExecutionState.RUNNING, started_at=started_at
                )
                completed_ids = self.execution_repository.get_completed_action_ids(
                    request.plan.plan_id
                )
                for action_id in completed_ids:
                    self.ledger.seed_completed(action_id, execution_id)

            if request.plan.is_stale():
                summary = ExecutionSummary(
                    execution_id=execution_id,
                    request_id=request.request_id,
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
                    started_at=started_at,
                    completed_at=datetime.now(UTC),
                    ledger=self.ledger,
                    reason="Action plan is stale and cannot be executed",
                )
                self._finalize_persistence(request, summary, started_at)
                return summary

            # Deterministic order: priority desc, then action_id asc
            sorted_actions = sorted(
                request.plan.actions,
                key=lambda a: (-a.priority_score, a.action_id),
            )

            for action in sorted_actions:
                if self._is_cancelled(request):
                    result = self._make_cancelled_result(
                        execution_id, action, started_at
                    )
                    results.append(result)
                    self.ledger.record(result)
                    self._persist_action_result(request.request_id, result)
                    continue

                try:
                    result = self._execute_action(execution_id, action, request)
                except ExecutionCancelledError:
                    result = self._make_cancelled_result(
                        execution_id, action, started_at
                    )
                except Exception as exc:
                    result = ExecutionResult(
                        execution_id=execution_id,
                        action_id=action.action_id,
                        finding_id=action.finding_id,
                        asset_id=action.asset_id,
                        action_type=action.action_type.value,
                        target=action.target.to_dict(),
                        status=ExecutionStatus.FAILED,
                        reason=f"Unexpected executor failure: {exc}",
                        timestamp=datetime.now(UTC),
                        error=ExecutionError(
                            code="EXECUTOR_EXCEPTION",
                            message=str(exc),
                            details={"exception_type": type(exc).__name__},
                        ),
                        verification={},
                        dry_run_info=None,
                    )

                results.append(result)
                self.ledger.record(result)
                if not self._persist_action_result(request.request_id, result):
                    persistence_failed = True

            completed_at = datetime.now(UTC)
            summary = self._build_summary(
                execution_id,
                request,
                tuple(results),
                self.ledger,
                started_at,
                completed_at,
            )
            if not self._finalize_persistence(request, summary, started_at):
                persistence_failed = True
            if persistence_failed:
                return dataclasses.replace(
                    summary,
                    status=ExecutionStatus.FAILED,
                    reason=f"Execution completed but audit persistence failed",
                    ledger=None,
                )
            return summary

        except Exception as exc:
            completed_at = datetime.now(UTC)
            summary = ExecutionSummary(
                execution_id=execution_id,
                request_id=request.request_id,
                status=ExecutionStatus.FAILED,
                total=0,
                completed=0,
                failed=1,
                rejected=0,
                skipped=0,
                requires_review=0,
                cancelled=0,
                dry_run=0,
                results=(),
                started_at=started_at,
                completed_at=completed_at,
                ledger=self.ledger,
                reason=f"Executor persistence or coordination failure: {exc}",
            )
            self._finalize_persistence(request, summary, started_at)
            return summary

    def _persist_action_result(
        self,
        request_id: str,
        result: ExecutionResult,
    ) -> bool:
        """Persist a single action result; report failures but never mask execution outcome."""
        if self.execution_repository is None:
            return True
        try:
            self.execution_repository.save_action_result(request_id, result)
            return True
        except Exception as exc:
            logger.error(f"Failed to persist action result for {request_id}: {exc}")
            return False

    def _finalize_persistence(
        self,
        request: ExecutionRequest,
        summary: ExecutionSummary,
        started_at: datetime,
    ) -> bool:
        """Persist summary and mark the execution request final."""
        if self.execution_repository is None:
            return True
        try:
            self.execution_repository.save_summary(request.request_id, summary)
            self.execution_repository.update_request_status(
                request.request_id,
                summary.status.value,
                started_at=started_at,
                completed_at=summary.completed_at,
            )
            return True
        except Exception as exc:
            logger.error(
                f"Failed to finalize persistence for {request.request_id}: {exc}"
            )
            return False

    def _execute_action(
        self,
        execution_id: str,
        action: Any,
        request: ExecutionRequest,
    ) -> ExecutionResult:
        """Execute a single action through the full safety pipeline."""
        # 1. Idempotency check
        if self.ledger.has(action.action_id):
            return ExecutionResult(
                execution_id=execution_id,
                action_id=action.action_id,
                finding_id=action.finding_id,
                asset_id=action.asset_id,
                action_type=action.action_type.value,
                target=action.target.to_dict(),
                status=ExecutionStatus.SKIPPED,
                reason="Action already recorded in execution ledger",
                timestamp=datetime.now(UTC),
                error=None,
                verification={},
                dry_run_info=None,
            )

        # Build execution context.
        context = self._resolve_context(action, request)
        if context is None:
            return ExecutionResult(
                execution_id=execution_id,
                action_id=action.action_id,
                finding_id=action.finding_id,
                asset_id=action.asset_id,
                action_type=action.action_type.value,
                target=action.target.to_dict(),
                status=ExecutionStatus.REJECTED,
                reason="Live execution requires a fresh execution context",
                timestamp=datetime.now(UTC),
                error=ExecutionError(
                    code="MISSING_EXECUTION_CONTEXT",
                    message="No execution context provided for live mode",
                ),
                verification={},
                dry_run_info=None,
            )

        # If the fresh context did not carry an observation time, inject the
        # canonical timestamp from the persisted plan so SnapshotFresh can
        # still evaluate meaningfully. Fall back to the plan generation time
        # when the snapshot itself has no explicit timestamp.
        plan_timestamp = getattr(request.plan, "snapshot_timestamp", None)
        if plan_timestamp is None:
            plan_timestamp = getattr(request.plan, "generated_at", None)
        if plan_timestamp is not None:
            context.setdefault("observed_at", plan_timestamp)
            context.setdefault("snapshot_timestamp", plan_timestamp)

        # 2. Evaluate typed preconditions for verification information
        preconditions = getattr(action, "preconditions", None)
        verification: dict[str, Any] = {}
        if preconditions is not None and hasattr(preconditions, "evaluate"):
            passed, failed = preconditions.evaluate(context)
            all_contracts = preconditions.to_contract_strings()
            verification = {
                "all_preconditions": list(all_contracts),
                "failed_preconditions": failed,
                "precondition_passed": passed,
            }
        else:
            verification = {"precondition_passed": True}

        # 3. SafetyGate is the authoritative approval step; cannot be bypassed
        plan_metadata: dict[str, Any] = {
            "generated_at": request.plan.generated_at,
            "request_id": request.request_id,
        }
        safety_result = self.safety_gate.evaluate(action, context, plan_metadata)

        if safety_result == SafetyGateResult.REJECTED:
            return ExecutionResult(
                execution_id=execution_id,
                action_id=action.action_id,
                finding_id=action.finding_id,
                asset_id=action.asset_id,
                action_type=action.action_type.value,
                target=action.target.to_dict(),
                status=ExecutionStatus.REJECTED,
                reason="Rejected by SafetyGate",
                timestamp=datetime.now(UTC),
                error=None,
                verification=verification,
                dry_run_info=None,
            )

        if safety_result == SafetyGateResult.REQUIRES_REVIEW:
            return ExecutionResult(
                execution_id=execution_id,
                action_id=action.action_id,
                finding_id=action.finding_id,
                asset_id=action.asset_id,
                action_type=action.action_type.value,
                target=action.target.to_dict(),
                status=ExecutionStatus.REQUIRES_REVIEW,
                reason="Requires human review before execution",
                timestamp=datetime.now(UTC),
                error=None,
                verification=verification,
                dry_run_info=None,
            )

        # 4. Dry-run or live execution through stub target executor
        target_executor = get_target_executor(action.action_type.value)
        if target_executor is None:
            return ExecutionResult(
                execution_id=execution_id,
                action_id=action.action_id,
                finding_id=action.finding_id,
                asset_id=action.asset_id,
                action_type=action.action_type.value,
                target=action.target.to_dict(),
                status=ExecutionStatus.FAILED,
                reason=f"No target executor for {action.action_type.value}",
                timestamp=datetime.now(UTC),
                error=ExecutionError(
                    code="NO_TARGET_EXECUTOR",
                    message=f"No executor registered for {action.action_type.value}",
                    details={"action_type": action.action_type.value},
                ),
                verification=verification,
                dry_run_info=None,
            )

        # Mark the context as authorized by the SafetyGate/DefaultExecutor path.
        # Direct calls to target executors without this marker will be rejected
        # in live mode.
        context["__safety_authorized"] = True

        target_result = target_executor.execute(
            action,
            context,
            mode=request.mode,
            cancellation_token=request.cancellation_token,
            backup_manager=self.backup_manager,
            registry_backup=self.registry_backup,
            execution_id=execution_id,
        )

        return ExecutionResult(
            execution_id=execution_id,
            action_id=action.action_id,
            finding_id=action.finding_id,
            asset_id=action.asset_id,
            action_type=action.action_type.value,
            operation=target_result.operation or action.action_type.value,
            target=action.target.to_dict(),
            status=target_result.status,
            reason=target_result.reason,
            timestamp=datetime.now(UTC),
            error=target_result.error,
            verification=verification,
            dry_run_info=target_result.dry_run_info,
            before_state=target_result.before_state,
            after_state=target_result.after_state,
            backup_identity=target_result.backup_identity,
            backup_location=target_result.backup_location,
            backup_hash=target_result.backup_hash,
        )

    def _resolve_context(
        self,
        action: Any,
        request: ExecutionRequest,
    ) -> Optional[dict[str, Any]]:
        """Resolve execution context for an action."""
        if action.action_id in request.execution_context:
            return normalize_context(request.execution_context[action.action_id])

        if request.context_provider is not None:
            provided = request.context_provider(action)
            if provided is not None:
                return normalize_context(provided)

        # Dry-run may use best-effort defaults; live mode requires fresh context.
        if request.mode != "live":
            return default_context_for_action(action)

        return None

    def _is_cancelled(self, request: ExecutionRequest) -> bool:
        """Return True if the request has been cancelled."""
        token = request.cancellation_token
        if token is not None:
            return token.is_cancelled()
        return False

    def _make_cancelled_result(
        self,
        execution_id: str,
        action: Any,
        started_at: datetime,
    ) -> ExecutionResult:
        """Create a CANCELLED result for an action."""
        return ExecutionResult(
            execution_id=execution_id,
            action_id=action.action_id,
            finding_id=action.finding_id,
            asset_id=action.asset_id,
            action_type=action.action_type.value,
            target=action.target.to_dict(),
            status=ExecutionStatus.CANCELLED,
            reason="Execution cancelled before this action",
            timestamp=datetime.now(UTC),
            error=None,
            verification={},
            dry_run_info=None,
        )

    def _build_summary(
        self,
        execution_id: str,
        request: ExecutionRequest,
        results: tuple[ExecutionResult, ...],
        ledger: ExecutionLedger,
        started_at: datetime,
        completed_at: datetime,
    ) -> ExecutionSummary:
        """Build an immutable ExecutionSummary from results."""
        total = len(results)
        completed = sum(1 for r in results if r.status == ExecutionStatus.COMPLETED)
        failed = sum(1 for r in results if r.status == ExecutionStatus.FAILED)
        rejected = sum(1 for r in results if r.status == ExecutionStatus.REJECTED)
        skipped = sum(1 for r in results if r.status == ExecutionStatus.SKIPPED)
        requires_review = sum(
            1 for r in results if r.status == ExecutionStatus.REQUIRES_REVIEW
        )
        cancelled = sum(1 for r in results if r.status == ExecutionStatus.CANCELLED)
        dry_run = sum(1 for r in results if r.status == ExecutionStatus.DRY_RUN)

        if total == 0:
            batch_status = ExecutionStatus.DRY_RUN
        elif cancelled:
            batch_status = ExecutionStatus.CANCELLED
        elif failed:
            batch_status = ExecutionStatus.FAILED
        elif rejected == total:
            batch_status = ExecutionStatus.REJECTED
        elif requires_review == total:
            batch_status = ExecutionStatus.REQUIRES_REVIEW
        elif skipped == total:
            batch_status = ExecutionStatus.SKIPPED
        elif dry_run == total:
            batch_status = ExecutionStatus.DRY_RUN
        elif completed == total:
            batch_status = ExecutionStatus.COMPLETED
        else:
            batch_status = ExecutionStatus.DRY_RUN

        return ExecutionSummary(
            execution_id=execution_id,
            request_id=request.request_id,
            status=batch_status,
            total=total,
            completed=completed,
            failed=failed,
            rejected=rejected,
            skipped=skipped,
            requires_review=requires_review,
            cancelled=cancelled,
            dry_run=dry_run,
            results=results,
            started_at=started_at,
            completed_at=completed_at,
            ledger=ledger,
            reason=f"Batch executed in {request.mode} mode",
        )
