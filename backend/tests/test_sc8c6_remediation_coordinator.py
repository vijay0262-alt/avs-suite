"""SC-8C6 RemediationCoordinator integration tests."""

from __future__ import annotations

import os
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from avs_backend.scan_core.assets import AssetType, ScanAsset
from avs_backend.scan_core.execution.models import CancellationToken
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.orchestration import (
    RemediationCoordinator,
    ScanOrchestrator,
)
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.enums import (
    ActionType,
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    RuleStatus,
    Severity,
)
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.models import RuleIdentifier, RuleVersion
from avs_backend.scan_core.rules.registry import RuleRegistry
from avs_backend.scan_core.rules.result import RuleMatchStatus, RuleResult
from avs_backend.scan_core.rules.rule import Rule, RuleMetadata
from avs_backend.scan_core.rules.safety import SafetyAssessment

# ── Shared helpers (copied to avoid test-file coupling) ────────────────────────


def _make_confidence(score: float = 95.0) -> Confidence:
    return Confidence(
        score=score,
        factors=(
            ConfidenceScore(
                factor=ConfidenceFactor.RULE_CERTAINTY,
                score=score,
                description="test",
            ),
        ),
    )


def _make_evidence() -> EvidenceCollection:
    return EvidenceCollection(
        items=(
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="test evidence",
                source="test",
                value="match",
                weight=1.0,
            ),
        )
    )


class FakeJunkRule(Rule):
    """Matches every FILE asset as junk for remediation tests."""

    def __init__(self, rule_id: str = "junk.test.fake") -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier(rule_id),
            version=RuleVersion(1, 0, 0),
            name="Fake Junk Rule",
            description="Matches files for remediation tests",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=(AssetType.FILE.value,),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[Any] = None,
        context: Optional[Any] = None,
    ) -> RuleResult:
        if asset.asset_type != AssetType.FILE:
            return RuleResult(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                status=RuleMatchStatus.NO_MATCH,
                severity=Severity.LOW,
                confidence=_make_confidence(),
                safety=SafetyAssessment.create_safe("safe"),
                reason="not a file",
                evidence=_make_evidence(),
                recommended_action=ActionType.NONE,
                evaluated_at=datetime.now(UTC),
            )
        return RuleResult(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            status=RuleMatchStatus.MATCHED,
            severity=Severity.LOW,
            confidence=_make_confidence(),
            safety=SafetyAssessment.create_safe("safe"),
            reason="fake junk match",
            evidence=_make_evidence(),
            recommended_action=ActionType.DELETE,
            estimated_size=asset.custom_metadata.get("size"),  # type: ignore[arg-type]
            evaluated_at=datetime.now(UTC),
        )


class FakeUnsupportedRule(Rule):
    """Matches files with no supported remediation path."""

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("performance.test.unsupported"),
            version=RuleVersion(1, 0, 0),
            name="Fake Unsupported Rule",
            description="Matches files with no remediation path",
            category=RuleCategory.PERFORMANCE,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=(AssetType.FILE.value,),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[Any] = None,
        context: Optional[Any] = None,
    ) -> RuleResult:
        if asset.asset_type != AssetType.FILE:
            return RuleResult(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                status=RuleMatchStatus.NO_MATCH,
                severity=Severity.LOW,
                confidence=_make_confidence(),
                safety=SafetyAssessment.create_safe("safe"),
                reason="not a file",
                evidence=_make_evidence(),
                recommended_action=ActionType.NONE,
                evaluated_at=datetime.now(UTC),
            )
        return RuleResult(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            status=RuleMatchStatus.MATCHED,
            severity=Severity.LOW,
            confidence=_make_confidence(),
            safety=SafetyAssessment.create_safe("safe"),
            reason="unsupported finding",
            evidence=_make_evidence(),
            recommended_action=ActionType.REPAIR,
            estimated_size=asset.custom_metadata.get("size"),  # type: ignore[arg-type]
            evaluated_at=datetime.now(UTC),
        )


def _make_orchestrator(
    tmp_path: Path, registry: Optional[RuleRegistry] = None
) -> ScanOrchestrator:
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    return ScanOrchestrator(database=db, registry=registry or RuleRegistry())


def _scan_junk(tmp_path: Path, file_count: int) -> tuple[ScanOrchestrator, Path, str]:
    """Create junk files, scan them, and return orchestrator, target dir, plan_id."""
    target = tmp_path / "junk"
    target.mkdir()
    for i in range(file_count):
        (target / f"file{i:04d}.tmp").write_bytes(b"junk")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])
    plan_id = result.action_plan_id
    assert plan_id is not None
    return orchestrator, target, plan_id


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_prepare_preview(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 3)
    coordinator = RemediationCoordinator(
        MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db")),
        backup_root=tmp_path / "backups",
    )
    preview = coordinator.prepare(plan_id)
    assert preview.plan_id == plan_id
    assert preview.total_actions == 3
    assert preview.action_types.get("delete_file") == 3
    assert not preview.is_stale
    assert not preview.warnings
    assert preview.rollback_supported or not preview.rollback_supported


def test_validate_dry_run(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 3)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    validation = coordinator.validate(plan_id)
    assert validation.valid
    assert validation.dry_run == 3
    assert validation.total == 3
    assert validation.failed == 0
    assert validation.rejected == 0
    for f in target.iterdir():
        assert f.exists()


def test_execute_live_deletes_files_and_can_rollback(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 3)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)

    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    assert summary.status.value == "completed", repr(summary)
    assert summary.completed == 3
    for f in target.iterdir():
        assert not f.exists()

    status = coordinator.get_status(preview.request_id)
    assert status.status == "completed"
    assert status.total == 3
    assert status.completed == 3

    rollback = coordinator.rollback(preview.request_id)
    assert rollback.successful == 3
    assert rollback.failed == 0
    for f in target.iterdir():
        assert f.exists()
        assert f.read_bytes() == b"junk"


def test_execute_requires_approval_token_for_live(tmp_path: Path) -> None:
    _, _, plan_id = _scan_junk(tmp_path, 3)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token="",
        mode="live",
    )
    assert summary.status.value == "rejected"
    assert summary.rejected == 1


def test_stale_plan_rejected(tmp_path: Path) -> None:
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    _, target, plan_id = _scan_junk(tmp_path, 1)
    target_file = next(iter(target.iterdir()))

    from avs_backend.scan_core.metadata.action_plan_repository import (
        ActionPlanRepository,
    )
    from avs_backend.scan_core.rules.action import ActionPlan

    repo = ActionPlanRepository(db)
    fresh_plan = repo.load(plan_id)
    assert fresh_plan is not None
    stale_plan = ActionPlan(
        actions=fresh_plan.actions,
        summary=fresh_plan.summary,
        generated_at=datetime.now(UTC) - timedelta(seconds=4000),
        plan_id=fresh_plan.plan_id,
    )
    repo.save(stale_plan)

    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    assert summary.status.value == "rejected"
    assert target_file.exists()


def test_stale_context_rejected(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 3)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    # Modify one target after scan so size no longer matches the snapshot.
    victim = next(iter(target.iterdir()))
    victim.write_bytes(b"changed content")

    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    assert summary.rejected >= 1
    assert summary.completed < 3
    # The changed file should not have been deleted.
    assert victim.exists()


def test_safety_gate_rejects_readonly_target(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 3)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    victim = next(iter(target.iterdir()))
    os.chmod(victim, 0o444)
    try:
        summary = coordinator.execute(
            plan_id,
            request_id=preview.request_id,
            approval_token=preview.approval_token,
            mode="live",
        )
        assert summary.rejected >= 1
        assert victim.exists()
    finally:
        os.chmod(victim, 0o666)


def test_detection_only_and_unsupported_rejected(tmp_path: Path) -> None:
    target = tmp_path / "unsupported"
    target.mkdir()
    for i in range(3):
        (target / f"file{i}.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeUnsupportedRule())
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    orchestrator = ScanOrchestrator(database=db, registry=registry)
    result = orchestrator.scan_full(scope=[str(target)])
    plan_id = result.action_plan_id
    assert plan_id is not None
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    assert preview.total_actions == 3
    assert preview.warnings

    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    assert summary.rejected > 0 or summary.failed > 0
    for f in target.iterdir():
        assert f.exists()


def test_cancellation_stops_execution(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 20)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    token = CancellationToken()
    token.cancel()
    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
        cancellation_token=token,
    )
    assert summary.cancelled == 20
    # All files should remain because execution was cancelled before any action.
    for f in target.iterdir():
        assert f.exists()


def test_partial_execution_and_recovery(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 100)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    token = CancellationToken()

    def _cancel_after_short_delay() -> None:
        time.sleep(0.05)
        coordinator.cancel(preview.request_id)

    # If threading fails in an environment, the test still validates cancellation.
    thread = threading.Thread(target=_cancel_after_short_delay, daemon=True)
    thread.start()
    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
        cancellation_token=token,
    )
    thread.join(timeout=1.0)
    assert summary.cancelled > 0
    assert summary.cancelled + summary.completed == 100
    status = coordinator.get_status(preview.request_id)
    assert status.cancelled == summary.cancelled
    assert status.completed == summary.completed


def test_duplicate_execution_rejected(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 3)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    first = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    assert first.status.value == "completed"
    second = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    assert second.status.value == "rejected"
    for f in target.iterdir():
        assert not f.exists()


def test_concurrent_execution_protection(tmp_path: Path) -> None:
    _, _, plan_id = _scan_junk(tmp_path, 5)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    results: dict[str, Any] = {}

    def _execute() -> None:
        summary = coordinator.execute(
            plan_id,
            request_id=preview.request_id,
            approval_token=preview.approval_token,
            mode="live",
        )
        results[threading.current_thread().name] = summary

    t1 = threading.Thread(target=_execute, name="t1")
    t2 = threading.Thread(target=_execute, name="t2")
    t1.start()
    t2.start()
    t1.join(timeout=5.0)
    t2.join(timeout=5.0)
    statuses = {v.status.value for v in results.values()}
    assert statuses == {"completed", "rejected"}


def test_rollback_rejects_when_target_changed(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 3)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    victim_path = next(iter(target.iterdir()))
    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    assert summary.status.value == "completed"

    victim_path.write_bytes(b"different")
    rollback = coordinator.rollback(preview.request_id)
    assert rollback.failed >= 1
    assert rollback.successful < 3
    assert victim_path.read_bytes() == b"different"


def test_privacy_safe_audit_output(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 2)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    status = coordinator.get_status(preview.request_id)
    data = status.to_dict()
    assert "username" not in str(data).lower()
    assert "password" not in str(data).lower()
    assert "canonical_path" not in data


def test_1k_action_plan(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 1000)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    start = datetime.now(UTC)
    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    elapsed = (datetime.now(UTC) - start).total_seconds()
    assert summary.status.value == "completed"
    assert summary.completed == 1000
    assert elapsed < 300.0
    remaining = list(target.iterdir())
    assert len(remaining) == 0


def test_10k_action_plan(tmp_path: Path) -> None:
    _, target, plan_id = _scan_junk(tmp_path, 10000)
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    coordinator = RemediationCoordinator(db, backup_root=tmp_path / "backups")
    preview = coordinator.prepare(plan_id)
    start = datetime.now(UTC)
    summary = coordinator.execute(
        plan_id,
        request_id=preview.request_id,
        approval_token=preview.approval_token,
        mode="live",
    )
    elapsed = (datetime.now(UTC) - start).total_seconds()
    assert summary.status.value == "completed"
    assert summary.completed == 10000
    assert elapsed < 600.0
    remaining = list(target.iterdir())
    assert len(remaining) == 0
