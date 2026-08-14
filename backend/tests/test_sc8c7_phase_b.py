"""SC-8C7 Phase B focused regression tests."""

from __future__ import annotations

import hashlib
import os
import types
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.context.asset_snapshot import AssetSnapshot, SnapshotState
from avs_backend.scan_core.execution.models import (
    CancellationToken,
    ExecutionCancelledError,
    ExecutionError,
    ExecutionRequest,
    ExecutionStatus,
)
from avs_backend.scan_core.execution.target_executors import BaseTargetExecutor
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.metadata.execution_repository import ExecutionRepository
from avs_backend.scan_core.orchestration.orchestrator import ScanOrchestrator
from avs_backend.scan_core.rules.action import ActionPlanner
from avs_backend.scan_core.rules.action_path_validation import (
    PathValidationError,
    validate_filesystem_path,
)
from avs_backend.scan_core.rules.action_preconditions import SnapshotFresh
from avs_backend.scan_core.rules.enums import ActionType
from avs_backend.scan_core.rules.priority import RuleCapability
from avs_backend.scan_core.rules.registry import RuleRegistry
from avs_backend.scan_core.rules.safety_gate import create_safety_gate
from avs_backend.scan_core.rules.tests.test_action_part4_safety import (
    _aggregate,
    _make_result,
    _plan,
    _planned_action_for_path,
    _prioritize,
)


def _sha256_file(path: "Path") -> str:
    """Compute SHA-256 of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _make_asset_snapshot(
    observed_at: datetime,
    size: int = 100,
    content_fingerprint: Optional[str] = None,
) -> AssetSnapshot:
    return AssetSnapshot(
        asset_id="asset-1",
        scan_id="scan-1",
        observed_at=observed_at,
        state=SnapshotState.DISCOVERED,
        exists=True,
        accessible=True,
        locked=False,
        size=size,
        modified_time=observed_at,
        content_fingerprint=content_fingerprint,
        metadata_fingerprint="",
        attributes={"canonical_path": r"C:\temp\junk.txt"},
    )


class TestSnapshotFreshnessConsistency:
    """H-2: Snapshot freshness uses observed_at and is enforced consistently."""

    def test_action_plan_uses_observed_at_when_snapshot_timestamp_missing(self) -> None:
        now = datetime.now(UTC)
        snapshot = _make_asset_snapshot(observed_at=now)
        result = _make_result(asset_id="asset-1")
        agg = _aggregate(
            [result],
            asset_lookup={
                "asset-1": (
                    AssetType.FILE,
                    AssetCategory.FILESYSTEM,
                    "Test",
                    r"C:\temp\junk.txt",
                ),
            },
        )
        prio = _prioritize(
            agg,
            rule_capability_resolver=lambda _r: RuleCapability.REMEDIATION_AVAILABLE,
        )
        plan = _plan(prio, asset_snapshot_resolver=lambda _aid: snapshot)
        assert plan.snapshot_timestamp == now

    def test_snapshot_fresh_precondition_present_for_filesystem(self) -> None:
        now = datetime.now(UTC)
        snapshot = _make_asset_snapshot(observed_at=now)
        result = _make_result(asset_id="asset-1")
        agg = _aggregate(
            [result],
            asset_lookup={
                "asset-1": (
                    AssetType.FILE,
                    AssetCategory.FILESYSTEM,
                    "Test",
                    r"C:\temp\junk.txt",
                ),
            },
        )
        prio = _prioritize(
            agg,
            rule_capability_resolver=lambda _r: RuleCapability.REMEDIATION_AVAILABLE,
        )
        plan = _plan(prio, asset_snapshot_resolver=lambda _aid: snapshot)
        contracts = plan.actions[0].preconditions.to_contract_strings()
        assert any("snapshot_fresh" in c for c in contracts)

    def test_snapshot_fresh_rejects_stale_observed_at(self) -> None:
        stale = datetime.now(UTC) - timedelta(seconds=7200)
        fresh = SnapshotFresh(max_age_seconds=3600)
        assert fresh.evaluate({"observed_at": stale}) is False

    def test_snapshot_fresh_accepts_recent_observed_at(self) -> None:
        recent = datetime.now(UTC) - timedelta(seconds=10)
        fresh = SnapshotFresh(max_age_seconds=3600)
        assert fresh.evaluate({"observed_at": recent}) is True

    def test_stale_plan_rejected_by_safety_gate(self) -> None:
        action = _planned_action_for_path(r"C:\temp\junk.txt")
        stale = datetime.now(UTC) - timedelta(seconds=120)
        gate = create_safety_gate(snapshot_ttl_seconds=60)
        result = gate.evaluate(
            action,
            {},
            {"generated_at": stale, "request_id": "r1"},
        )
        assert result.value == "rejected"


class TestBaseTargetExecutor:
    """H-4: BaseTargetExecutor must not pretend live success."""

    def test_base_target_executor_rejects_live(self) -> None:
        class FakeAction:
            action_type = ActionType.DELETE
            target = type("Target", (object,), {"to_dict": lambda self: {}})()

        result = BaseTargetExecutor.execute(
            FakeAction(),
            {},
            mode="live",
        )
        assert result.status == ExecutionStatus.FAILED
        assert isinstance(result.error, ExecutionError)
        assert result.error.code == "UNSUPPORTED_LIVE_EXECUTION"

    def test_base_target_executor_allows_dry_run(self) -> None:
        class FakeAction:
            action_type = ActionType.DELETE
            target = type("Target", (object,), {"to_dict": lambda self: {}})()

        result = BaseTargetExecutor.execute(
            FakeAction(),
            {},
            mode="dry_run",
        )
        assert result.status == ExecutionStatus.DRY_RUN


class TestConfigurableSnapshotTtl:
    """M-1: Snapshot TTL is configurable and validated."""

    def test_scan_orchestrator_accepts_custom_ttl(self, tmp_path) -> None:
        db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "db.sqlite"))
        db.initialize()
        orch = ScanOrchestrator(
            database=db,
            registry=RuleRegistry(),
            snapshot_ttl_seconds=600,
        )
        assert orch._snapshot_ttl_seconds == 600

    def test_scan_orchestrator_rejects_invalid_ttl(self, tmp_path) -> None:
        db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "db.sqlite"))
        db.initialize()
        with pytest.raises(ValueError):
            ScanOrchestrator(
                database=db,
                registry=RuleRegistry(),
                snapshot_ttl_seconds=0,
            )
        with pytest.raises(ValueError):
            ScanOrchestrator(
                database=db,
                registry=RuleRegistry(),
                snapshot_ttl_seconds=-1,
            )

    def test_action_planner_passes_ttl_to_plan(self) -> None:
        now = datetime.now(UTC)
        snapshot = _make_asset_snapshot(observed_at=now)
        result = _make_result(asset_id="asset-1")
        agg = _aggregate(
            [result],
            asset_lookup={
                "asset-1": (
                    AssetType.FILE,
                    AssetCategory.FILESYSTEM,
                    "Test",
                    r"C:\temp\junk.txt",
                ),
            },
        )
        prio = _prioritize(
            agg,
            rule_capability_resolver=lambda _r: RuleCapability.REMEDIATION_AVAILABLE,
        )
        planner = ActionPlanner(
            asset_snapshot_resolver=lambda _aid: snapshot,
            snapshot_ttl_seconds=600,
        )
        plan = planner.plan(prio)
        assert plan.snapshot_ttl_seconds == 600


class TestEnvVarExpansionHardening:
    """M-5: Environment expansion cannot bypass forbidden-root checks."""

    @pytest.mark.skipif(os.name != "nt", reason="Windows env expansion test")
    def test_expanded_forbidden_root_rejected(self, monkeypatch) -> None:
        monkeypatch.setenv("TEST_FORBIDDEN", r"C:\Windows")
        with pytest.raises(PathValidationError):
            validate_filesystem_path(r"%TEST_FORBIDDEN%\Temp\cache.tmp")

    @pytest.mark.skipif(os.name != "nt", reason="Windows env expansion test")
    def test_expanded_traversal_rejected(self, monkeypatch) -> None:
        monkeypatch.setenv("TEST_TRAV", "..")
        with pytest.raises(PathValidationError):
            validate_filesystem_path(r"C:\temp\%TEST_TRAV%\Windows")

    def test_non_expanding_path_still_validates(self) -> None:
        validate_filesystem_path(r"C:\Users\Test\Cache")

    def test_unset_env_var_left_untouched(self) -> None:
        path = r"%THIS_DOES_NOT_EXIST%\Cache"
        validate_filesystem_path(path, allow_relative=True)


class TestTargetExecutorAuthorization:
    """H-3: Direct live calls to target executors are rejected."""

    def test_filesystem_executor_rejects_unauthorized_live(self, tmp_path) -> None:
        from avs_backend.scan_core.execution.filesystem_executor import (
            FilesystemExecutor,
        )

        target_file = tmp_path / "junk.txt"
        target_file.write_text("junk")
        action = types.SimpleNamespace(
            action_id="a1",
            asset_id="asset-1",
            action_type=types.SimpleNamespace(value="delete_file"),
            target=types.SimpleNamespace(
                asset_id="asset-1",
                canonical_path=str(target_file),
                to_dict=lambda: {},
            ),
        )
        ctx = {
            "exists": True,
            "accessible": True,
            "locked": False,
            "canonical_path": str(target_file),
            "asset_id": "asset-1",
            "safety_level": "safe",
        }
        result = FilesystemExecutor.execute(
            action,
            ctx,
            mode="live",
            backup_manager=None,
            execution_id="e1",
        )
        assert result.status == ExecutionStatus.REJECTED
        assert result.error.code == "UNAUTHORIZED_DIRECT_EXECUTION"

    def test_registry_executor_rejects_unauthorized_live(self) -> None:
        from avs_backend.scan_core.execution.registry_executor import RegistryExecutor

        action = types.SimpleNamespace(
            action_id="a1",
            asset_id="asset-1",
            action_type=types.SimpleNamespace(value="remove_registry_value"),
            target=types.SimpleNamespace(
                asset_id="asset-1",
                hive="HKCU",
                key_path=r"Software\AVS\Test",
                value_name="val",
                view="default",
                to_dict=lambda: {},
            ),
        )
        ctx = {
            "registry_hive": "HKCU",
            "registry_key": r"Software\AVS\Test",
            "registry_value": "val",
            "registry_view": "default",
            "registry_key_exists": True,
            "registry_value_exists": True,
            "asset_id": "asset-1",
            "safety_level": "safe",
        }
        result = RegistryExecutor.execute(
            action,
            ctx,
            mode="live",
            registry_backup=None,
            execution_id="e1",
        )
        assert result.status == ExecutionStatus.REJECTED
        assert result.error.code == "UNAUTHORIZED_DIRECT_EXECUTION"


class TestEndToEndIntegration:
    """H-12: Focused end-to-end execution with dry-run, live, and rollback."""

    def test_plan_dry_run_live_and_rollback(self, tmp_path) -> None:
        from avs_backend.scan_core.execution.backup import BackupManager
        from avs_backend.scan_core.execution.executor import DefaultExecutor
        from avs_backend.scan_core.execution.models import (
            ExecutionRequest,
            ExecutionStatus,
        )

        target = tmp_path / "junk.txt"
        target.write_text("junk data")
        now = datetime.now(UTC)
        snapshot = _make_asset_snapshot(
            observed_at=now,
            size=target.stat().st_size,
            content_fingerprint=_sha256_file(target),
        )
        result = _make_result(asset_id="asset-1")
        agg = _aggregate(
            [result],
            asset_lookup={
                "asset-1": (
                    AssetType.FILE,
                    AssetCategory.FILESYSTEM,
                    "Test",
                    str(target),
                ),
            },
        )
        prio = _prioritize(
            agg,
            rule_capability_resolver=lambda _r: RuleCapability.REMEDIATION_AVAILABLE,
        )
        plan = _plan(prio, asset_snapshot_resolver=lambda _aid: snapshot)
        backup_mgr = BackupManager(tmp_path / "backups")
        dry_executor = DefaultExecutor(backup_manager=None)
        live_executor = DefaultExecutor(backup_manager=backup_mgr)

        # Dry-run does not modify.
        request = ExecutionRequest(
            plan=plan,
            mode="dry_run",
            execution_context={
                plan.actions[0].action_id: {
                    "exists": True,
                    "accessible": True,
                    "locked": False,
                    "canonical_path": str(target),
                    "asset_id": "asset-1",
                    "safety_level": "safe",
                    "size": target.stat().st_size,
                    "modified_time": now,
                    "content_hash": _sha256_file(target),
                }
            },
        )
        dry = dry_executor.execute(request)
        assert dry.results[0].status == ExecutionStatus.DRY_RUN
        assert target.exists()

        # Live execution removes the file and creates a backup.
        live_request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={
                plan.actions[0].action_id: {
                    "exists": True,
                    "accessible": True,
                    "locked": False,
                    "canonical_path": str(target),
                    "asset_id": "asset-1",
                    "safety_level": "safe",
                    "size": target.stat().st_size,
                    "modified_time": now,
                    "content_hash": _sha256_file(target),
                }
            },
        )
        live = live_executor.execute(live_request)
        assert live.results[0].status == ExecutionStatus.COMPLETED
        assert not target.exists()

        # Rollback restores the file.
        backup_id = live.results[0].backup_identity
        record = backup_mgr.get(backup_id)
        assert record is not None
        restore = backup_mgr.restore(record)
        assert restore.success is True
        assert target.exists()
        assert _sha256_file(target) == record.backup_hash

    def test_changed_target_blocked_by_safety(self, tmp_path) -> None:
        from avs_backend.scan_core.execution.backup import BackupManager
        from avs_backend.scan_core.execution.executor import DefaultExecutor
        from avs_backend.scan_core.execution.models import (
            ExecutionRequest,
            ExecutionStatus,
        )

        target = tmp_path / "junk.txt"
        target.write_text("original")
        now = datetime.now(UTC)
        original_hash = _sha256_file(target)
        snapshot = _make_asset_snapshot(
            observed_at=now,
            size=target.stat().st_size,
            content_fingerprint=original_hash,
        )
        result = _make_result(asset_id="asset-1")
        agg = _aggregate(
            [result],
            asset_lookup={
                "asset-1": (
                    AssetType.FILE,
                    AssetCategory.FILESYSTEM,
                    "Test",
                    str(target),
                ),
            },
        )
        prio = _prioritize(
            agg,
            rule_capability_resolver=lambda _r: RuleCapability.REMEDIATION_AVAILABLE,
        )
        plan = _plan(prio, asset_snapshot_resolver=lambda _aid: snapshot)
        backup_mgr = BackupManager(tmp_path / "backups")
        executor = DefaultExecutor(backup_manager=backup_mgr)

        # Mutate the target before live execution.
        target.write_text("modified")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={
                plan.actions[0].action_id: {
                    "exists": True,
                    "accessible": True,
                    "locked": False,
                    "canonical_path": str(target),
                    "asset_id": "asset-1",
                    "safety_level": "safe",
                    "size": 8,  # stale size
                    "content_hash": "stale-hash",
                }
            },
        )
        live = executor.execute(request)
        assert live.results[0].status != ExecutionStatus.COMPLETED
        assert target.exists()


class TestConcurrentExecution:
    """H-13: Two attempts to execute the same action must not duplicate."""

    def test_second_execution_is_skipped(self, tmp_path) -> None:
        from avs_backend.scan_core.execution.backup import BackupManager
        from avs_backend.scan_core.execution.executor import DefaultExecutor
        from avs_backend.scan_core.execution.models import (
            ExecutionRequest,
            ExecutionStatus,
        )

        target = tmp_path / "junk.txt"
        target.write_text("junk data")
        now = datetime.now(UTC)
        snapshot = _make_asset_snapshot(
            observed_at=now,
            size=target.stat().st_size,
            content_fingerprint=_sha256_file(target),
        )
        result = _make_result(asset_id="asset-1")
        agg = _aggregate(
            [result],
            asset_lookup={
                "asset-1": (
                    AssetType.FILE,
                    AssetCategory.FILESYSTEM,
                    "Test",
                    str(target),
                ),
            },
        )
        prio = _prioritize(
            agg,
            rule_capability_resolver=lambda _r: RuleCapability.REMEDIATION_AVAILABLE,
        )
        plan = _plan(prio, asset_snapshot_resolver=lambda _aid: snapshot)
        backup_mgr = BackupManager(tmp_path / "backups")
        executor = DefaultExecutor(backup_manager=backup_mgr)

        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={
                plan.actions[0].action_id: {
                    "exists": True,
                    "accessible": True,
                    "locked": False,
                    "canonical_path": str(target),
                    "asset_id": "asset-1",
                    "safety_level": "safe",
                    "size": target.stat().st_size,
                    "modified_time": now,
                    "content_hash": _sha256_file(target),
                }
            },
        )
        first = executor.execute(request)
        assert first.results[0].status == ExecutionStatus.COMPLETED
        second = executor.execute(request)
        assert second.results[0].status == ExecutionStatus.SKIPPED


class TestExtendedWindowsPaths:
    """H-14: Extended Windows path safety."""

    @pytest.mark.parametrize(
        "path",
        [
            r"\\?\C:\Windows",
            r"\\.\C:",
            r"\\?\UNC\server\share",
            r"\\server\share\secret",
            r"C:\temp\..\Windows",
            r"C:\..\\temp",
            r"//?/c:/windows",
            r"C:\Windows\System32",
        ],
    )
    def test_unsafe_windows_paths_rejected(self, path: str) -> None:
        with pytest.raises(PathValidationError):
            validate_filesystem_path(path)


class TestDatabaseDurability:
    """H-6: ExecutionRepository writes are committed and recoverable."""

    def test_execution_records_are_durable(self, tmp_path) -> None:
        db = MetadataDatabase(
            DatabaseConfig(
                db_path=tmp_path / "durability.db",
                enable_wal=True,
                busy_timeout_ms=5000,
            )
        )
        assert db.initialize() is True

        now = datetime.now(UTC).isoformat()
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO action_plans
            (plan_id, generated_at, status, plan_data, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("plan-1", now, "PLANNED", "{}", now),
        )
        cursor.execute(
            """
            INSERT INTO remediation_actions
            (plan_id, action_id, action_type, asset_id, state, action_data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("plan-1", "a1", "delete", "asset-1", "PLANNED", "{}", now),
        )
        conn.commit()
        cursor.close()

        repo = ExecutionRepository(db)
        plan = types.SimpleNamespace(plan_id="plan-1")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={"a1": {"exists": True}},
        )

        assert repo.save_request(request) is True
        assert repo.get_request_status(request.request_id) == "planned"

        assert repo.update_request_status(request.request_id, "running") is True
        assert repo.get_request_status(request.request_id) == "running"

        incomplete = repo.get_incomplete_requests(plan_id="plan-1")
        assert any(r["request_id"] == request.request_id for r in incomplete)

        assert repo.update_request_status(request.request_id, "completed") is True
        assert repo.get_request_status(request.request_id) == "completed"

        result = types.SimpleNamespace(
            action_id="a1",
            status=ExecutionStatus.COMPLETED,
            to_dict=lambda: {"action_id": "a1", "status": "completed"},
            backup_identity=None,
            backup_location=None,
            error=None,
        )
        assert repo.save_action_result(request.request_id, result) is True

        # Upsert: the second write overwrites the first.
        result2 = types.SimpleNamespace(
            action_id="a1",
            status=ExecutionStatus.FAILED,
            to_dict=lambda: {"action_id": "a1", "status": "failed"},
            backup_identity=None,
            backup_location=None,
            error=None,
        )
        assert repo.save_action_result(request.request_id, result2) is True
        audit = repo.get_request_audit(request.request_id)
        assert audit["action_results"][0]["status"] == "failed"

        summary = types.SimpleNamespace(
            status=ExecutionStatus.COMPLETED,
            started_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
            to_dict=lambda: {
                "status": "completed",
                "total": 1,
                "completed": 1,
            },
        )
        assert repo.save_summary(request.request_id, summary) is True
        audit = repo.get_request_audit(request.request_id)
        assert audit["summary"] is not None

        incomplete = repo.get_incomplete_requests(plan_id="plan-1")
        assert not any(r["request_id"] == request.request_id for r in incomplete)


class TestBackupCancellation:
    """H-15: Cancellation is cooperative and safe around backup."""

    def test_backup_create_respects_cancellation(self, tmp_path) -> None:
        from avs_backend.scan_core.execution.backup import BackupManager

        target = tmp_path / "junk.txt"
        target.write_text("data")
        backup_mgr = BackupManager(tmp_path / "backups")
        action = types.SimpleNamespace(
            action_id="a1",
            asset_id="asset-1",
        )
        token = CancellationToken()
        token.cancel()
        with pytest.raises(ExecutionCancelledError):
            backup_mgr.create_backup(
                str(target),
                action,
                "e1",
                {},
                cancellation_token=token,
            )

    def test_cancellation_before_backup_skips_deletion(self, tmp_path) -> None:
        from avs_backend.scan_core.execution.backup import BackupManager
        from avs_backend.scan_core.execution.executor import DefaultExecutor
        from avs_backend.scan_core.execution.models import ExecutionRequest

        target = tmp_path / "junk.txt"
        target.write_text("junk data")
        now = datetime.now(UTC)
        snapshot = _make_asset_snapshot(
            observed_at=now,
            size=target.stat().st_size,
            content_fingerprint=_sha256_file(target),
        )
        result = _make_result(asset_id="asset-1")
        agg = _aggregate(
            [result],
            asset_lookup={
                "asset-1": (
                    AssetType.FILE,
                    AssetCategory.FILESYSTEM,
                    "Test",
                    str(target),
                ),
            },
        )
        prio = _prioritize(
            agg,
            rule_capability_resolver=lambda _r: RuleCapability.REMEDIATION_AVAILABLE,
        )
        plan = _plan(prio, asset_snapshot_resolver=lambda _aid: snapshot)
        backup_mgr = BackupManager(tmp_path / "backups")
        executor = DefaultExecutor(backup_manager=backup_mgr)

        token = CancellationToken()
        token.cancel()
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={
                plan.actions[0].action_id: {
                    "exists": True,
                    "accessible": True,
                    "locked": False,
                    "canonical_path": str(target),
                    "asset_id": "asset-1",
                    "safety_level": "safe",
                    "size": target.stat().st_size,
                    "modified_time": now,
                    "content_hash": _sha256_file(target),
                }
            },
            cancellation_token=token,
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.CANCELLED
        assert target.exists()
