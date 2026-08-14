"""
SC-8C4 Part 2 — Safe filesystem remediation tests.

All destructive operations run against pytest temporary directories only.
No user files are modified.
"""

from __future__ import annotations

import hashlib
import os
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.execution import (
    BackupManager,
    CancellationToken,
    DefaultExecutor,
    ExecutionRequest,
    ExecutionStatus,
    FilesystemContext,
)
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionPlanner,
    RemediationAction,
)
from avs_backend.scan_core.rules.aggregation import DetectionAggregator
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.enums import (
    ActionType,
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    Severity,
)
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.priority import FindingPrioritizer, RuleCapability
from avs_backend.scan_core.rules.result import RuleMatchStatus, RuleResult
from avs_backend.scan_core.rules.safety import SafetyAssessment


@dataclass
class _Snapshot:
    exists: bool = True
    is_accessible: bool = True
    is_locked: bool = False
    canonical_path: str = ""
    asset_id: str = "asset-0"
    size: Optional[int] = None
    content_hash: Optional[str] = None
    modified_time: Optional[datetime] = None
    snapshot_timestamp: Optional[datetime] = None
    snapshot_version: Optional[str] = None
    is_symlink: bool = False
    is_junction: bool = False
    is_reparse_point: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────


def _compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _make_confidence() -> Confidence:
    return Confidence(
        score=90.0,
        factors=(
            ConfidenceScore(
                factor=ConfidenceFactor.RULE_CERTAINTY,
                score=90.0,
                description="test",
            ),
        ),
    )


def _make_evidence() -> EvidenceCollection:
    return EvidenceCollection(
        items=(
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="Test",
                source="test",
                value="x",
                weight=1.0,
            ),
        )
    )


def _make_result(
    rule_id: str = "junk.temp.application", asset_id: str = "asset-0"
) -> RuleResult:
    return RuleResult(
        rule_id=rule_id,
        rule_version="1.0.0",
        asset_id=asset_id,
        status=RuleMatchStatus.MATCHED,
        severity=Severity.LOW,
        confidence=_make_confidence(),
        safety=SafetyAssessment.create_safe("safe"),
        reason="x",
        evidence=_make_evidence(),
        recommended_action=ActionType.DELETE,
        estimated_size=100,
        evaluated_at=datetime.now(UTC),
    )


def _rule_category_resolver(rule_id: str) -> RuleCategory:
    if rule_id.startswith("junk"):
        return RuleCategory.JUNK
    if rule_id.startswith("cache"):
        return RuleCategory.CACHE
    if rule_id.startswith("registry"):
        return RuleCategory.REGISTRY
    if rule_id.startswith("browser"):
        return RuleCategory.BROWSER
    if rule_id.startswith("startup"):
        return RuleCategory.STARTUP
    return RuleCategory.JUNK


def _make_action_plan(
    tmp_path: Path,
    canonical_path: Path,
    *,
    rule_id: str = "junk.temp.application",
    content: Optional[bytes] = None,
    asset_type: AssetType = AssetType.FILE,
) -> tuple[ActionPlan, dict[str, Any]]:
    """Create a single-action plan pointing at a temporary target."""
    if asset_type == AssetType.FILE and canonical_path.is_dir():
        raise ValueError("Expected a file path")

    if asset_type == AssetType.DIRECTORY:
        canonical_path.mkdir(parents=True, exist_ok=True)
        if content is not None:
            raise ValueError("Cannot set content for directory target")
        file_size = 0
        file_hash: Optional[str] = None
    else:
        canonical_path.parent.mkdir(parents=True, exist_ok=True)
        if content is None:
            content = b"junk data"
        canonical_path.write_bytes(content)
        file_size = len(content)
        file_hash = _compute_sha256(canonical_path)

    modified_time = datetime.fromtimestamp(canonical_path.stat().st_mtime, tz=UTC)

    lookup = {
        "asset-0": (
            asset_type,
            AssetCategory.FILESYSTEM,
            "Test",
            str(canonical_path),
        )
    }
    result = _make_result(rule_id=rule_id)
    agg = DetectionAggregator(
        asset_lookup=lambda aid: lookup.get(
            aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
        ),
        rule_category_resolver=_rule_category_resolver,
    ).aggregate([result])
    prio = FindingPrioritizer(
        rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
    ).prioritize(agg)
    plan = ActionPlanner(
        asset_snapshot_resolver=lambda aid: _Snapshot(
            canonical_path=str(canonical_path),
            asset_id=aid,
            size=file_size,
            content_hash=file_hash,
            modified_time=modified_time,
        ),
    ).plan(prio)

    ctx = FilesystemContext(
        exists=True,
        accessible=True,
        locked=False,
        canonical_path=str(canonical_path),
        asset_id="asset-0",
        size=file_size,
        modified_time=modified_time,
        content_hash=file_hash,
        symlink=False,
        junction=False,
        reparse_point=False,
    ).to_dict()
    ctx["safety_level"] = "safe"

    return plan, ctx


@pytest.fixture
def backup_manager(tmp_path: Path) -> BackupManager:
    return BackupManager(tmp_path / "backups")


@pytest.fixture
def live_executor(backup_manager: BackupManager) -> DefaultExecutor:
    return DefaultExecutor(backup_manager=backup_manager)


@pytest.fixture
def dry_executor() -> DefaultExecutor:
    return DefaultExecutor()


# ── Core Success Cases ────────────────────────────────────────────────────────


class TestFileDeletion:
    def test_successful_file_deletion(self, live_executor, backup_manager, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target)
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        assert not target.exists()
        record = backup_manager.get(summary.results[0].backup_identity)
        assert record is not None
        assert Path(record.backup_location).exists()

    def test_successful_empty_directory_deletion(
        self, live_executor, backup_manager, tmp_path
    ):
        target = tmp_path / "empty_dir"
        plan, ctx = _make_action_plan(tmp_path, target, asset_type=AssetType.DIRECTORY)
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        assert not target.exists()

    def test_clear_cache_directory(self, live_executor, backup_manager, tmp_path):
        target = tmp_path / "cache"
        target.mkdir()
        (target / "a.txt").write_text("one")
        (target / "b.txt").write_text("two")
        (target / "empty_sub").mkdir()
        plan, ctx = _make_action_plan(
            tmp_path,
            target,
            rule_id="cache.temp",
            asset_type=AssetType.DIRECTORY,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        assert target.exists()
        assert not any(target.iterdir())


# ── Dry Run ───────────────────────────────────────────────────────────────────


class TestDryRun:
    def test_dry_run_does_not_delete(self, dry_executor, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target)
        request = ExecutionRequest(
            plan=plan,
            mode="dry_run",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.DRY_RUN
        assert target.exists()
        assert summary.results[0].dry_run_info is not None

    def test_dry_run_does_not_create_backup(self, dry_executor, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target)
        request = ExecutionRequest(
            plan=plan,
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.DRY_RUN
        assert summary.results[0].backup_identity is None
        assert summary.results[0].backup_location is None


# ── Path and Scope Safety ─────────────────────────────────────────────────────


class TestPathSafety:
    def _make_unsafe_request(
        self, executor, tmp_path, canonical_path: str, dry: bool = True
    ):
        lookup = {
            "asset-0": (
                AssetType.FILE,
                AssetCategory.FILESYSTEM,
                "Test",
                canonical_path,
            )
        }
        agg = DetectionAggregator(
            asset_lookup=lambda aid: lookup.get(
                aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
            ),
            rule_category_resolver=_rule_category_resolver,
        ).aggregate([_make_result()])
        prio = FindingPrioritizer(
            rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        ).prioritize(agg)
        plan = ActionPlanner(
            asset_snapshot_resolver=lambda aid: _Snapshot(
                canonical_path=canonical_path,
                asset_id=aid,
            ),
        ).plan(prio)
        ctx = FilesystemContext(
            exists=True,
            accessible=True,
            locked=False,
            canonical_path=canonical_path,
            asset_id="asset-0",
            safety_level="safe",
        ).to_dict()
        request = ExecutionRequest(
            plan=plan,
            mode="dry_run" if dry else "live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        return executor.execute(request)

    @pytest.mark.parametrize(
        "path",
        [
            r"C:\Windows\System32\kernel32.dll",
            r"C:\Program Files\App\bad.exe",
            r"C:\ProgramData\Secret\data.bin",
        ],
    )
    def test_protected_windows_paths_rejected(self, dry_executor, tmp_path, path):
        summary = self._make_unsafe_request(dry_executor, tmp_path, path, dry=True)
        assert summary.results[0].status in (
            ExecutionStatus.REJECTED,
            ExecutionStatus.FAILED,
        )

    def test_relative_path_rejected(self, dry_executor, tmp_path):
        summary = self._make_unsafe_request(dry_executor, tmp_path, "..\\test.txt")
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_traversal_rejected(self, dry_executor, tmp_path):
        summary = self._make_unsafe_request(
            dry_executor, tmp_path, r"C:\Users\Public\..\Windows\test.txt"
        )
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_unc_path_rejected(self, dry_executor, tmp_path):
        summary = self._make_unsafe_request(
            dry_executor, tmp_path, r"\\server\share\file.txt"
        )
        assert summary.results[0].status == ExecutionStatus.REJECTED


# ── Symlink and Reparse Point Safety ──────────────────────────────────────────


class TestReparseSafety:
    def test_symlink_rejected(self, live_executor, tmp_path):
        real = tmp_path / "real.txt"
        real.write_text("x")
        link = tmp_path / "link.txt"
        try:
            os.symlink(real, link)
        except OSError as exc:
            pytest.skip(f"Cannot create symlink on this system: {exc}")
        plan, ctx = _make_action_plan(tmp_path, link)
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        result = summary.results[0]
        assert result.status == ExecutionStatus.REJECTED
        assert result.error.code == "REJECTED"
        assert "symlink" in result.error.message.lower()
        assert result.backup_identity is None
        assert link.exists()
        assert real.exists()

    def test_directory_symlink_rejected(self, live_executor, tmp_path):
        real_dir = tmp_path / "real_dir"
        real_dir.mkdir()
        link_dir = tmp_path / "link_dir"
        try:
            os.symlink(real_dir, link_dir, target_is_directory=True)
        except OSError as exc:
            pytest.skip(f"Cannot create directory symlink: {exc}")
        plan, ctx = _make_action_plan(
            tmp_path, link_dir, asset_type=AssetType.DIRECTORY
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        result = summary.results[0]
        assert result.status == ExecutionStatus.REJECTED
        assert result.error.code == "REJECTED"
        assert "symlink" in result.error.message.lower()
        assert result.backup_identity is None
        assert link_dir.exists()
        assert real_dir.exists()


# ── TOCTOU and State Mismatch ─────────────────────────────────────────────────


class TestTOCTOU:
    def test_missing_target_fails(self, live_executor, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target)
        target.unlink()
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert "TARGET_MISSING" in summary.results[0].error.code

    def test_changed_size_fails(self, live_executor, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target, content=b"short")
        target.write_bytes(b"this is a much longer value")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert summary.results[0].error.code == "TOCTOU_SIZE_CHANGED"
        assert target.exists()

    def test_changed_mtime_fails(self, live_executor, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target, content=b"x")
        time.sleep(1.1)
        target.touch()
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert "TOCTOU_MTIME_CHANGED" in summary.results[0].error.code

    def test_changed_hash_fails(self, live_executor, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target, content=b"alpha")
        target.write_bytes(b"bravo")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert summary.results[0].error.code == "TOCTOU_HASH_CHANGED"
        assert target.exists()

    def test_directory_not_empty_fails(self, live_executor, tmp_path):
        target = tmp_path / "dir"
        target.mkdir()
        (target / "child.txt").write_text("x")
        plan, ctx = _make_action_plan(tmp_path, target, asset_type=AssetType.DIRECTORY)
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert target.exists()


# ── Permission and Locking ────────────────────────────────────────────────────


class TestPermissionAndLocking:
    def test_permission_denied_fails(self, live_executor, tmp_path):
        target = tmp_path / "readonly.txt"
        plan, ctx = _make_action_plan(tmp_path, target, content=b"x")
        os.chmod(target, 0o444)
        try:
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = live_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.FAILED
            assert summary.results[0].error.code == "PERMISSION_DENIED"
        finally:
            os.chmod(target, 0o666)

    @pytest.mark.skipif(
        sys.platform != "win32",
        reason="Windows file-handle lock behavior; Linux can unlink open files",
    )
    def test_locked_target_fails(self, live_executor, tmp_path):
        target = tmp_path / "locked.txt"
        plan, ctx = _make_action_plan(tmp_path, target, content=b"x")
        fh = open(target, "r+b")
        try:
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = live_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.FAILED
            assert summary.results[0].error.code == "LOCKED_TARGET"
        finally:
            fh.close()


# ── Backup, Rollback and Idempotency ──────────────────────────────────────────


class TestBackupAndIdempotency:
    def test_backup_and_rollback(self, live_executor, backup_manager, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target, content=b"original")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        assert not target.exists()
        record = backup_manager.get(summary.results[0].backup_identity)
        assert record is not None
        result = backup_manager.restore(record)
        assert result.success
        assert target.exists()
        assert target.read_bytes() == b"original"

    def test_idempotent_reexecution(self, live_executor, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target)
        # plan is already returned from _make_action_plan
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary1 = live_executor.execute(request)
        assert summary1.results[0].status == ExecutionStatus.COMPLETED
        summary2 = live_executor.execute(request)
        assert summary2.results[0].status == ExecutionStatus.SKIPPED

    def test_backup_integrity(self, live_executor, backup_manager, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target, content=b"verify me")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        record = backup_manager.get(summary.results[0].backup_identity)
        assert record is not None
        assert record.backup_hash == _compute_sha256(Path(record.backup_location))


# ── Cancellation ──────────────────────────────────────────────────────────────


class TestCancellation:
    def test_cancels_between_files(self, live_executor, tmp_path):
        target1 = tmp_path / "a.txt"
        target2 = tmp_path / "b.txt"
        target1.write_text("one")
        target2.write_text("two")
        lookup = {
            f"asset-{i}": (AssetType.FILE, AssetCategory.FILESYSTEM, "Test", str(p))
            for i, p in enumerate([target1, target2])
        }
        agg = DetectionAggregator(
            asset_lookup=lambda aid: lookup.get(
                aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
            ),
            rule_category_resolver=_rule_category_resolver,
        ).aggregate([_make_result(asset_id=f"asset-{i}") for i in range(2)])
        prio = FindingPrioritizer(
            rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        ).prioritize(agg)
        plan = ActionPlanner(
            asset_snapshot_resolver=lambda aid: _Snapshot(
                canonical_path=lookup[aid][3],
                asset_id=aid,
            ),
        ).plan(prio)
        token = CancellationToken()

        def context_provider(action: RemediationAction) -> dict[str, Any]:
            ctx = FilesystemContext(
                exists=True,
                accessible=True,
                locked=False,
                canonical_path=lookup[action.asset_id][3],
                asset_id=action.asset_id,
                safety_level="safe",
            ).to_dict()
            if action.asset_id == "asset-1":
                token.cancel()
            return ctx

        request = ExecutionRequest(
            plan=plan,
            mode="live",
            context_provider=context_provider,
            cancellation_token=token,
        )
        summary = live_executor.execute(request)
        assert any(r.status == ExecutionStatus.CANCELLED for r in summary.results)


# ── Audit Trail ───────────────────────────────────────────────────────────────


class TestAuditTrail:
    def test_result_contains_before_and_after_state(self, live_executor, tmp_path):
        target = tmp_path / "junk.txt"
        plan, ctx = _make_action_plan(tmp_path, target, content=b"x")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_executor.execute(request)
        result = summary.results[0]
        assert result.before_state.get("exists") is True
        assert result.after_state.get("exists") is False
        assert result.operation == "delete_file"
        assert result.backup_identity is not None
        assert result.backup_location is not None
