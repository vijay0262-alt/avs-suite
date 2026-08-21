"""SC-8C5 Scan Orchestrator integration tests."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

from avs_backend.scan_core.assets import AssetType, ScanAsset
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.models import FileEntry
from avs_backend.scan_core.orchestration import (
    ScanOrchestrator,
    ScanProgress,
    ScanResult,
)
from avs_backend.scan_core.orchestration.discovery import FilesystemDiscoveryEngine
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

# ── Helpers ────────────────────────────────────────────────────────────────────


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


def _make_orchestrator(
    tmp_path: Path, registry: Optional[RuleRegistry] = None
) -> ScanOrchestrator:
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    reg = registry or RuleRegistry()
    return ScanOrchestrator(database=db, registry=reg)


class FakeJunkRule(Rule):
    """A rule that matches every FILE asset as junk."""

    def __init__(self, rule_id: str = "junk.test.fake") -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier(rule_id),
            version=RuleVersion(1, 0, 0),
            name="Fake Junk Rule",
            description="Matches files for orchestration tests",
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
                estimated_size=asset.custom_metadata.get("size"),  # type: ignore[arg-type]
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
    """A rule whose category is not supported by the capability contract."""

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


class FailingRule(Rule):
    """A rule that always raises to test failure isolation."""

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("test.failing.rule"),
            version=RuleVersion(1, 0, 0),
            name="Failing Rule",
            description="Always raises",
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
        raise RuntimeError("simulated rule failure")


@dataclass
class FailingDiscoveryEngine:
    """Discovery engine that raises to test failure isolation."""

    name: str = "failing"

    def enumerate(
        self,
        scan_context: Any,
        cancellation_token: Any,
        on_progress: Optional[Any] = None,
    ) -> Any:
        raise RuntimeError("simulated discovery failure")


@dataclass
class CancellingDiscoveryEngine:
    """Discovery engine that cancels after yielding one raw entry."""

    name: str = "cancelling"

    def enumerate(
        self,
        scan_context: Any,
        cancellation_token: Any,
        on_progress: Optional[Any] = None,
    ) -> Any:
        entry = FileEntry(
            path=r"C:\fake\cancelled.tmp",
            name="cancelled.tmp",
            size=0,
            extension="tmp",
            created_time=0.0,
            modified_time=0.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir=r"C:\fake",
            depth=1,
        )
        yield entry
        cancellation_token.cancel()


class FakeRawAsset:
    """Raw asset type used only for the cancelling engine tests."""

    def __init__(self, asset_id: str, canonical_path: str) -> None:
        self.asset_id = asset_id
        self.canonical_path = canonical_path
        self.size = 0


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_quick_scan_discovers_and_plans(tmp_path: Path) -> None:
    target = tmp_path / "junk"
    target.mkdir()
    for i in range(3):
        (target / f"file{i}.tmp").write_bytes(b"junk")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_quick(scope=[str(target)])

    assert isinstance(result, ScanResult)
    assert result.scan_type == "quick"
    assert result.statistics["assets_discovered"] >= 3
    assert result.action_plan_id is not None
    assert result.statistics["actions_planned"] > 0
    assert not result.cancelled
    assert all(isinstance(f, dict) for f in result.findings)


def test_full_scan_scope(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    (target / "a.tmp").write_bytes(b"x")
    (target / "b.tmp").write_bytes(b"y")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])

    assert result.scan_type == "full"
    assert result.statistics["assets_discovered"] >= 2
    assert result.statistics["findings_count"] >= 2
    assert result.statistics["actions_planned"] >= 2
    assert not result.cancelled


def test_empty_scan(tmp_path: Path) -> None:
    target = tmp_path / "empty"
    target.mkdir()

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])

    assert result.statistics["findings_count"] == 0
    assert result.statistics["actions_total"] == 0
    assert result.action_plan_id is not None


def test_partial_discovery_failure_isolated(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    (target / "keep.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    orchestrator = ScanOrchestrator(
        database=db,
        registry=registry,
        discovery_engines={
            "failing": FailingDiscoveryEngine(),
            "filesystem": FilesystemDiscoveryEngine(),
        },
    )
    result = orchestrator.scan_full(scope=[str(target)])

    assert result.statistics["assets_discovered"] >= 1
    assert any(
        e.phase == "discovery" and e.component == "failing" for e in result.errors
    )
    assert not result.cancelled


def test_rule_failure_isolation(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    (target / "file.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    registry.register(FailingRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])

    assert result.statistics["assets_discovered"] >= 1
    assert result.statistics["errors_count"] >= 1
    assert not result.cancelled


def test_cancellation_stops_scan(tmp_path: Path) -> None:
    registry = RuleRegistry()
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    orchestrator = ScanOrchestrator(
        database=db,
        registry=registry,
        discovery_engines={"cancelling": CancellingDiscoveryEngine()},
    )
    result = orchestrator.scan_full(scope=[str(tmp_path)])

    assert result.cancelled
    assert result.statistics["assets_discovered"] <= 1


def test_progress_callback(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    for i in range(10):
        (target / f"file{i}.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)

    progress_events: list[ScanProgress] = []
    orchestrator.scan_full(
        scope=[str(target)],
        on_progress=progress_events.append,
    )

    assert len(progress_events) > 0
    assert any(e.phase == "discovery" for e in progress_events)
    assert all(e.scan_id == progress_events[0].scan_id for e in progress_events)


def test_deterministic_counts(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    for i in range(5):
        (target / f"file{i}.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)

    result1 = orchestrator.scan_full(scope=[str(target)])
    result2 = orchestrator.scan_full(scope=[str(target)])

    assert result1.scan_id != result2.scan_id
    assert (
        result1.statistics["assets_discovered"]
        == result2.statistics["assets_discovered"]
    )
    assert result1.statistics["findings_count"] == result2.statistics["findings_count"]
    assert (
        result1.statistics["actions_planned"] == result2.statistics["actions_planned"]
    )


def test_persistence(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    (target / "file.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])

    assert orchestrator._context_repo.get(result.scan_id) is not None
    assert orchestrator._asset_repo.count() >= 1
    assert orchestrator._snapshot_repo.count_for_scan(result.scan_id) >= 1
    assert result.action_plan_id is not None
    loaded = orchestrator._action_plan_repo.load(result.action_plan_id)
    assert loaded is not None
    assert len(loaded.actions) == result.statistics["actions_total"]


def test_actionability_generation(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    for i in range(3):
        (target / f"file{i}.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])

    assert result.actionability_summary["total"] >= 3
    assert result.actionability_summary["actionable"] >= 3
    assert result.actionability_summary["not_fixable"] == 0


def test_unsupported_findings_remain_detection_only(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    for i in range(3):
        (target / f"file{i}.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeUnsupportedRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])

    assert result.statistics["findings_count"] >= 3
    assert result.actionability_summary["not_fixable"] >= 3
    assert result.actionability_summary["actionable"] == 0


def test_remediation_not_executed(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    test_file = target / "file.tmp"
    test_file.write_bytes(b"keep me")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])

    assert result.statistics["actions_planned"] >= 1
    assert test_file.read_bytes() == b"keep me"
    assert result.action_plan_id is not None


def test_privacy_safe_output(tmp_path: Path) -> None:
    target = tmp_path / "data"
    target.mkdir()
    (target / "file.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)
    result = orchestrator.scan_full(scope=[str(target)])

    data = result.to_dict()
    assert "machine_id_hash" not in data
    assert "user_id_hash" not in data
    assert "username" not in str(data).lower()


def test_scan_1k_assets(tmp_path: Path) -> None:
    target = tmp_path / "1k"
    target.mkdir()
    for i in range(1000):
        (target / f"file{i:04d}.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)

    start = datetime.now(UTC)
    result = orchestrator.scan_full(scope=[str(target)])
    elapsed = (datetime.now(UTC) - start).total_seconds()

    assert result.statistics["assets_discovered"] >= 1000
    assert result.statistics["findings_count"] >= 1000
    assert result.statistics["actions_planned"] >= 1000
    assert elapsed < 60.0


def test_scan_10k_assets(tmp_path: Path) -> None:
    target = tmp_path / "10k"
    target.mkdir()
    for i in range(10000):
        (target / f"file{i:05d}.tmp").write_bytes(b"x")

    registry = RuleRegistry()
    registry.register(FakeJunkRule())
    orchestrator = _make_orchestrator(tmp_path, registry)

    start = datetime.now(UTC)
    result = orchestrator.scan_full(scope=[str(target)])
    elapsed = (datetime.now(UTC) - start).total_seconds()

    assert result.statistics["assets_discovered"] >= 10000
    assert result.statistics["findings_count"] >= 10000
    assert result.statistics["actions_planned"] >= 10000
    # Performance threshold: 10k assets should complete in reasonable time.
    # Use a generous threshold that catches real regressions (e.g. O(n²))
    # while absorbing CI variability (xdist I/O contention, slow CI disks).
    # Local dev: ~30-60s. CI Windows with xdist: up to ~250s.
    max_elapsed = 300.0 if os.environ.get("CI") else 120.0
    assert elapsed < max_elapsed, f"10k scan took {elapsed:.1f}s (limit {max_elapsed}s)"


def test_cancel_scan_api(tmp_path: Path) -> None:
    orchestrator = _make_orchestrator(tmp_path, RuleRegistry())
    assert orchestrator.cancel_scan("unknown") is False
    assert orchestrator.cancel_scan("also-unknown") is False
