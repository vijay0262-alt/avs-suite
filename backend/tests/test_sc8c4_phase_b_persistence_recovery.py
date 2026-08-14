"""
SC-8C4 Phase B — Persistence and recovery regression tests.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from avs_backend.scan_core.execution import (
    BackupManager,
    DefaultExecutor,
    ExecutionRequest,
    ExecutionStatus,
)
from avs_backend.scan_core.execution.state_machine import (
    ExecutionState,
    InvalidExecutionStateTransition,
    can_transition,
    classify_recovery_state,
    is_final_state,
)
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.metadata.execution_repository import ExecutionRepository
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionState,
    ActionSummary,
    ActionType,
    FilesystemActionTarget,
    RemediationAction,
)
from avs_backend.scan_core.rules.action_preconditions import PreconditionSet
from avs_backend.scan_core.rules.priority import Fixability, RuleCapability


@pytest.fixture
def database(tmp_path: Path) -> MetadataDatabase:
    config = DatabaseConfig(db_path=tmp_path / "metadata.db")
    db = MetadataDatabase(config)
    assert db.initialize() is True
    yield db
    db.close()


@pytest.fixture
def action_plan_repo(database: MetadataDatabase) -> ActionPlanRepository:
    return ActionPlanRepository(database)


@pytest.fixture
def execution_repo(database: MetadataDatabase) -> ExecutionRepository:
    return ExecutionRepository(database)


def _make_action(tmp_path: Path, index: int = 0) -> RemediationAction:
    target = FilesystemActionTarget(
        asset_id="asset-0",
        canonical_path=str(tmp_path / f"file-{index}.txt"),
        allowed_location=str(tmp_path),
        scope="test",
    )
    return RemediationAction(
        action_id=f"action-{index}",
        action_type=ActionType.DELETE_FILE,
        state=ActionState.PLANNED,
        target=target,
        finding_id="f1",
        rule_id="r1",
        rule_version="1",
        asset_id="asset-0",
        priority_score=1.0,
        fixability=Fixability.AUTO_FIXABLE,
        is_blocked=False,
        requires_review=False,
        is_actionable=True,
        is_auto_fixable=True,
        is_fixable=True,
        rule_capability=RuleCapability.REMEDIATION_AVAILABLE,
        preconditions=PreconditionSet(conditions=()),
        safety_assessment="safe",
        reason="test",
        estimated_size=10,
        backup_required=False,
        rollback_supported=False,
        backup_location=None,
        backup_identity=None,
        computed_at=datetime.now(UTC),
        metadata={},
    )


def _make_plan(tmp_path: Path, n: int = 1) -> ActionPlan:
    actions = tuple(_make_action(tmp_path, i) for i in range(n))
    summary = ActionSummary(
        total_findings=n,
        actions_planned=n,
        auto_fixable_actions=n,
        review_required_actions=0,
        blocked_actions=0,
        not_fixable_actions=0,
        unknown_fixability_actions=0,
        actions_by_type={},
        estimated_affected_size=0,
        highest_priority_action_id=None,
        highest_severity_action_id=None,
        largest_affected_action_id=None,
        generated_at=datetime.now(UTC),
    )
    return ActionPlan(
        actions=actions,
        summary=summary,
        generated_at=datetime.now(UTC),
    )


def _make_executor(
    tmp_path: Path,
    action_plan_repo: ActionPlanRepository | None = None,
    execution_repo: ExecutionRepository | None = None,
) -> DefaultExecutor:
    return DefaultExecutor(
        backup_manager=BackupManager(tmp_path / "backups"),
        action_plan_repository=action_plan_repo,
        execution_repository=execution_repo,
    )


class TestActionPlanPersistence:
    """ActionPlan save/load and audit behavior."""

    def test_save_and_load_action_plan(
        self, tmp_path: Path, action_plan_repo: ActionPlanRepository
    ):
        plan = _make_plan(tmp_path, 2)
        assert action_plan_repo.save(plan) is True

        loaded = action_plan_repo.load(plan.plan_id)
        assert loaded is not None
        assert loaded.to_dict() == plan.to_dict()

    def test_list_remediation_actions(
        self, tmp_path: Path, action_plan_repo: ActionPlanRepository
    ):
        plan = _make_plan(tmp_path, 3)
        action_plan_repo.save(plan)

        actions = action_plan_repo.list_actions(plan.plan_id)
        assert len(actions) == 3
        assert {a.action_id for a in actions} == {"action-0", "action-1", "action-2"}

    def test_update_plan_status(
        self, tmp_path: Path, action_plan_repo: ActionPlanRepository
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)
        assert action_plan_repo.update_status(plan.plan_id, "EXECUTED") is True
        rows = action_plan_repo.list_plans(status="EXECUTED")
        assert len(rows) == 1

    def test_load_missing_plan(self, action_plan_repo: ActionPlanRepository):
        assert action_plan_repo.load("missing") is None

    def test_corrupted_plan_data_raises(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        database: MetadataDatabase,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)

        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE action_plans SET plan_data = ? WHERE plan_id = ?",
            ("not valid json", plan.plan_id),
        )
        conn.commit()
        cursor.close()

        with pytest.raises(RuntimeError):
            action_plan_repo.load(plan.plan_id)

    def test_future_schema_version_rejected(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        database: MetadataDatabase,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)

        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE action_plans SET schema_version = ? WHERE plan_id = ?",
            (99, plan.plan_id),
        )
        conn.commit()
        cursor.close()

        with pytest.raises(RuntimeError):
            action_plan_repo.load(plan.plan_id)


class TestExecutionPersistence:
    """ExecutionRequest, result, and summary persistence."""

    def test_save_and_load_request(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)
        request = ExecutionRequest(plan=plan, mode="dry_run")
        assert execution_repo.save_request(request) is True

        audit = execution_repo.get_request_audit(request.request_id)
        assert audit["request"] is not None
        assert audit["request"]["mode"] == "dry_run"

    def test_action_result_round_trip(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
        database: MetadataDatabase,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)
        request = ExecutionRequest(plan=plan, mode="dry_run")
        execution_repo.save_request(request)
        executor = _make_executor(tmp_path, action_plan_repo, execution_repo)
        executor.execute(request)

        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM execution_results WHERE request_id = ?",
            (request.request_id,),
        )
        assert cursor.fetchone()[0] == 1
        cursor.close()

    def test_summary_persisted(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
        database: MetadataDatabase,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)
        request = ExecutionRequest(plan=plan, mode="dry_run")
        executor = _make_executor(tmp_path, action_plan_repo, execution_repo)
        summary = executor.execute(request)

        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT status FROM execution_summaries WHERE request_id = ?",
            (request.request_id,),
        )
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == summary.status.value
        cursor.close()

    def test_request_status_transitions(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)
        request = ExecutionRequest(plan=plan, mode="dry_run")
        execution_repo.save_request(request, status=ExecutionState.PLANNED)

        execution_repo.update_request_status(request.request_id, ExecutionState.RUNNING)
        assert (
            execution_repo.get_request_status(request.request_id)
            == ExecutionState.RUNNING
        )

        execution_repo.update_request_status(
            request.request_id, ExecutionState.COMPLETED
        )
        assert (
            execution_repo.get_request_status(request.request_id)
            == ExecutionState.COMPLETED
        )

    def test_invalid_state_transition(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)
        request = ExecutionRequest(plan=plan, mode="dry_run")
        execution_repo.save_request(request, status=ExecutionState.PLANNED)

        with pytest.raises(InvalidExecutionStateTransition):
            execution_repo.update_request_status(
                request.request_id, ExecutionState.ROLLED_BACK
            )

    def test_get_completed_action_ids(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)

        target_path = Path(tmp_path / "file-0.txt")
        target_path.write_bytes(b"data")
        action = plan.actions[0]
        context = {
            action.action_id: {
                "exists": True,
                "accessible": True,
                "locked": False,
                "canonical_path": str(target_path),
                "asset_id": "asset-0",
            }
        }
        request = ExecutionRequest(plan=plan, mode="live", execution_context=context)
        executor = _make_executor(tmp_path, action_plan_repo, execution_repo)
        summary = executor.execute(request)

        assert summary.results[0].status == ExecutionStatus.COMPLETED
        completed = execution_repo.get_completed_action_ids(plan.plan_id)
        assert action.action_id in completed

    def test_duplicate_execution_prevention(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)

        target_path = Path(tmp_path / "file-0.txt")
        target_path.write_bytes(b"data")
        action = plan.actions[0]
        context = {
            action.action_id: {
                "exists": True,
                "accessible": True,
                "locked": False,
                "canonical_path": str(target_path),
                "asset_id": "asset-0",
            }
        }

        # First run completes the action.
        request1 = ExecutionRequest(plan=plan, mode="live", execution_context=context)
        executor1 = _make_executor(tmp_path, action_plan_repo, execution_repo)
        executor1.execute(request1)
        assert not target_path.exists()

        # Recreate the file for the second run; the executor must not re-execute.
        target_path.write_bytes(b"data")
        request2 = ExecutionRequest(plan=plan, mode="live", execution_context=context)
        executor2 = _make_executor(tmp_path, action_plan_repo, execution_repo)
        summary2 = executor2.execute(request2)

        # The file was NOT deleted a second time because the action was skipped.
        assert target_path.exists()
        assert summary2.results[0].status == ExecutionStatus.SKIPPED


class TestRecovery:
    """Restart, recovery, and audit history."""

    def test_incomplete_request_detected(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)
        request = ExecutionRequest(plan=plan, mode="live")
        execution_repo.save_request(request, status=ExecutionState.PLANNED)
        execution_repo.update_request_status(request.request_id, ExecutionState.RUNNING)

        incomplete = execution_repo.get_incomplete_requests(plan.plan_id)
        assert len(incomplete) == 1
        assert incomplete[0]["request_id"] == request.request_id

    def test_completed_request_not_incomplete(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)
        request = ExecutionRequest(plan=plan, mode="dry_run")
        execution_repo.save_request(request, status=ExecutionState.PLANNED)
        execution_repo.update_request_status(request.request_id, ExecutionState.RUNNING)
        execution_repo.update_request_status(
            request.request_id, ExecutionState.COMPLETED
        )

        assert execution_repo.get_incomplete_requests(plan.plan_id) == []

    def test_audit_history_preserved(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        action_plan_repo.save(plan)

        summaries = []
        for _ in range(3):
            request = ExecutionRequest(plan=plan, mode="dry_run")
            executor = _make_executor(tmp_path, action_plan_repo, execution_repo)
            summaries.append(executor.execute(request))

        # Verify all three summaries were persisted for this plan.
        conn = execution_repo.db.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM execution_summaries "
            "WHERE request_id IN ("
            "SELECT request_id FROM execution_requests WHERE plan_id = ?"
            ")",
            (plan.plan_id,),
        )
        assert cursor.fetchone()[0] == 3
        cursor.close()

    def test_stale_plan_persistence(
        self,
        tmp_path: Path,
        action_plan_repo: ActionPlanRepository,
        execution_repo: ExecutionRepository,
    ):
        plan = _make_plan(tmp_path)
        # Make the plan stale by backdating generated_at.
        stale_time = datetime(2020, 1, 1, tzinfo=UTC)
        stale_plan = ActionPlan(
            actions=plan.actions,
            summary=plan.summary,
            generated_at=stale_time,
            snapshot_timestamp=stale_time,
            snapshot_ttl_seconds=plan.snapshot_ttl_seconds,
            plan_id=plan.plan_id,
        )

        action_plan_repo.save(stale_plan)
        request = ExecutionRequest(plan=stale_plan, mode="dry_run")
        executor = _make_executor(tmp_path, action_plan_repo, execution_repo)
        summary = executor.execute(request)

        assert summary.status == ExecutionStatus.REJECTED
        assert (
            execution_repo.get_request_status(request.request_id)
            == ExecutionStatus.REJECTED.value
        )

    def test_classify_recovery_state(self):
        assert classify_recovery_state(ExecutionState.COMPLETED, 0, 0) == "completed"
        assert classify_recovery_state(ExecutionState.RUNNING, 0, 3) == "interrupt_safe"
        assert classify_recovery_state(ExecutionState.RUNNING, 1, 3) == "interrupt_safe"
        assert classify_recovery_state(ExecutionState.RUNNING, 5, 3) == "manual_review"


class TestStateMachine:
    """Execution lifecycle state machine."""

    def test_allowed_transitions(self):
        assert can_transition(ExecutionState.PLANNED, ExecutionState.RUNNING) is True
        assert can_transition(ExecutionState.RUNNING, ExecutionState.COMPLETED) is True
        assert can_transition(ExecutionState.RUNNING, ExecutionState.FAILED) is True
        assert can_transition(ExecutionState.RUNNING, ExecutionState.CANCELLED) is True
        assert (
            can_transition(ExecutionState.RUNNING, ExecutionState.ROLLED_BACK) is True
        )

    def test_forbidden_transitions(self):
        assert can_transition(ExecutionState.COMPLETED, ExecutionState.FAILED) is False
        assert can_transition(ExecutionState.PLANNED, ExecutionState.COMPLETED) is False
        assert can_transition(ExecutionState.FAILED, ExecutionState.RUNNING) is False

    def test_final_states(self):
        assert is_final_state(ExecutionState.COMPLETED) is True
        assert is_final_state(ExecutionState.RUNNING) is False


class TestSchemaMigration:
    """Metadata database schema versioning and migration."""

    def test_schema_version_bumped(self, database: MetadataDatabase):
        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(version) FROM schema_migrations")
        version = cursor.fetchone()[0]
        cursor.close()
        assert version >= 2

    def test_phase_b_tables_exist(self, database: MetadataDatabase):
        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?, ?, ?, ?, ?)",
            (
                "action_plans",
                "remediation_actions",
                "execution_requests",
                "execution_summaries",
                "execution_results",
            ),
        )
        tables = {row[0] for row in cursor.fetchall()}
        cursor.close()
        assert tables == {
            "action_plans",
            "remediation_actions",
            "execution_requests",
            "execution_summaries",
            "execution_results",
        }
