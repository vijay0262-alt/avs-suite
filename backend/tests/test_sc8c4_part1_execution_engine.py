"""
SC-8C4 Part 1 — Safe Remediation Execution Engine Foundation Tests.

Tests the dry-run execution engine that consumes ActionPlan and SafetyGate.
No real system modification is performed in any test.
"""

from __future__ import annotations

import dataclasses
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable, Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.execution import (
    CancellationToken,
    DefaultExecutor,
    ExecutionRequest,
    ExecutionStatus,
    FilesystemContext,
)
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionPlanner,
    ActionSummary,
)
from avs_backend.scan_core.rules.aggregation import DetectionAggregator
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.enums import (
    ActionType,
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    SafetyBlocker,
    SafetyLevel,
    Severity,
)
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.priority import FindingPrioritizer, RuleCapability
from avs_backend.scan_core.rules.result import RuleMatchStatus, RuleResult
from avs_backend.scan_core.rules.safety import SafetyAssessment

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_confidence(score: float = 90.0) -> Confidence:
    return Confidence(
        score=score,
        factors=tuple(
            [
                ConfidenceScore(
                    factor=ConfidenceFactor.RULE_CERTAINTY,
                    score=score,
                    description="test",
                )
            ]
        ),
    )


def _make_safety(level: SafetyLevel = SafetyLevel.SAFE) -> SafetyAssessment:
    if level == SafetyLevel.BLOCKED:
        return SafetyAssessment.create_blocked(
            "System critical", [SafetyBlocker.SYSTEM_CRITICAL]
        )
    if level == SafetyLevel.REVIEW_REQUIRED:
        return SafetyAssessment.create_review_required("Manual review needed")
    if level == SafetyLevel.HIGH_RISK:
        return SafetyAssessment.create_high_risk("High risk action")
    if level == SafetyLevel.LOW_RISK:
        return SafetyAssessment.create_low_risk("Low risk action")
    return SafetyAssessment.create_safe("Safe to act")


def _make_evidence() -> EvidenceCollection:
    return EvidenceCollection(
        items=tuple(
            [
                Evidence(
                    evidence_type=EvidenceType.PATH_MATCH,
                    description="Test evidence",
                    source="test",
                    value="test-value",
                    weight=1.0,
                )
            ]
        )
    )


def _make_result(
    asset_id: str = "asset-1",
    rule_id: str = "junk.temp.application",
    rule_version: str = "1.0.0",
    severity: Severity = Severity.LOW,
    safety_level: SafetyLevel = SafetyLevel.SAFE,
    estimated_size: Optional[int] = 1024,
    status: RuleMatchStatus = RuleMatchStatus.MATCHED,
    priority_score: float = 50.0,
) -> RuleResult:
    return RuleResult(
        rule_id=rule_id,
        rule_version=rule_version,
        asset_id=asset_id,
        status=status,
        severity=severity,
        confidence=_make_confidence(),
        safety=_make_safety(safety_level),
        reason="Test detection reason",
        evidence=_make_evidence(),
        recommended_action=ActionType.DELETE,
        estimated_size=estimated_size,
        evaluated_at=datetime.now(UTC),
    )


def _make_asset_lookup(
    canonical_path: str, display_name: str = "Test Asset"
) -> dict[str, tuple[AssetType, AssetCategory, str, str]]:
    return {
        "asset-1": (
            AssetType.FILE,
            AssetCategory.FILESYSTEM,
            display_name,
            canonical_path,
        ),
    }


def _rule_category_resolver() -> dict[str, RuleCategory]:
    return {
        "junk.temp.application": RuleCategory.JUNK,
        "cache.application": RuleCategory.CACHE,
        "registry.temp": RuleCategory.REGISTRY,
        "startup.entry": RuleCategory.STARTUP,
        "browser.cache": RuleCategory.BROWSER,
    }


def _asset_lookup_resolver(
    lookup_map: dict[str, tuple[AssetType, AssetCategory, str, str]],
) -> Callable[[str], tuple[AssetType, AssetCategory, str, str]]:
    def resolver(asset_id: str) -> tuple[AssetType, AssetCategory, str, str]:
        result = lookup_map.get(asset_id)
        if result is not None:
            return result
        return (
            AssetType.UNKNOWN,
            AssetCategory.UNKNOWN,
            f"Unknown Asset ({asset_id[:8]})",
            "",
        )

    return resolver


def _rule_category_resolver_fn(
    resolver_map: dict[str, RuleCategory],
) -> Callable[[str], RuleCategory]:
    def resolver(rule_id: str) -> RuleCategory:
        return resolver_map.get(rule_id, RuleCategory.CUSTOM)

    return resolver


def _aggregate(
    results,
    asset_lookup=None,
    rule_category=None,
):
    lookup = asset_lookup or _make_asset_lookup(r"C:\temp\junk.txt")
    if not callable(lookup):
        lookup = _asset_lookup_resolver(lookup)
    resolver = rule_category or _rule_category_resolver()
    if not callable(resolver):
        resolver = _rule_category_resolver_fn(resolver)
    aggregator = DetectionAggregator(
        asset_lookup=lookup,
        rule_category_resolver=resolver,
    )
    return aggregator.aggregate(results)


def _prioritize(result, rule_capability_resolver=None):
    return FindingPrioritizer(
        rule_capability_resolver=rule_capability_resolver,
    ).prioritize(result)


@dataclass
class _Snapshot:
    """Test asset snapshot."""

    exists: bool = True
    is_locked: bool = False
    is_accessible: bool = True
    canonical_path: str = r"C:\temp\junk.txt"
    asset_id: str = "asset-1"
    snapshot_timestamp: Optional[datetime] = None
    snapshot_version: Optional[str] = None
    content_hash: Optional[str] = None
    size: Optional[int] = None
    modified_time: Optional[datetime] = None


def _plan(result, asset_snapshot_resolver=None, snapshot_ttl_seconds: int = 3600):
    return ActionPlanner(
        asset_snapshot_resolver=asset_snapshot_resolver,
        snapshot_ttl_seconds=snapshot_ttl_seconds,
    ).plan(result)


def _make_single_action_plan(
    canonical_path: str = r"C:\temp\junk.txt",
    safety_level: SafetyLevel = SafetyLevel.SAFE,
) -> ActionPlan:
    lookup = _make_asset_lookup(canonical_path)
    result = _make_result(safety_level=safety_level)
    agg = _aggregate([result], asset_lookup=lookup)
    prio = _prioritize(
        agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
    )
    return _plan(
        prio,
        asset_snapshot_resolver=lambda aid: _Snapshot(
            asset_id=aid,
            canonical_path=canonical_path,
            size=1024,
            content_hash="abc123",
        ),
    )


def _make_context(
    canonical_path: str = r"C:\temp\junk.txt",
    asset_id: str = "asset-1",
    exists: bool = True,
    accessible: bool = True,
    locked: bool = False,
    size: Optional[int] = 1024,
    content_hash: Optional[str] = "abc123",
) -> dict[str, Any]:
    return FilesystemContext(
        exists=exists,
        accessible=accessible,
        locked=locked,
        canonical_path=canonical_path,
        asset_id=asset_id,
        size=size,
        content_hash=content_hash,
    ).to_dict()


# ── Fixture ───────────────────────────────────────────────────────────────────


@pytest.fixture
def executor():
    """Fresh DefaultExecutor for each test."""
    return DefaultExecutor()


@pytest.fixture
def safe_plan():
    """Single safe planned action."""
    return _make_single_action_plan()


# ── Executor Contract ─────────────────────────────────────────────────────────


class TestExecutorContract:
    """Tests for the executor interface and result structure."""

    def test_execution_request_is_immutable(self) -> None:
        """ExecutionRequest is a frozen dataclass."""
        plan = _make_single_action_plan()
        request = ExecutionRequest(plan=plan)
        with pytest.raises(dataclasses.FrozenInstanceError):
            request.mode = "live"  # type: ignore[misc]

    def test_execution_result_preserves_required_fields(
        self, executor, safe_plan
    ) -> None:
        """ExecutionResult contains all required information."""
        action = safe_plan.actions[0]
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: _make_context()},
        )
        summary = executor.execute(request)
        assert len(summary.results) == 1
        result = summary.results[0]
        assert result.action_id == action.action_id
        assert result.finding_id == action.finding_id
        assert result.asset_id == action.asset_id
        assert result.action_type == action.action_type.value
        assert result.target == action.target.to_dict()
        assert result.status == ExecutionStatus.DRY_RUN
        assert result.timestamp is not None
        assert result.verification is not None
        assert "precondition_passed" in result.verification

    def test_execution_summary_aggregates_results(self, executor, safe_plan) -> None:
        """ExecutionSummary aggregates per-action results."""
        action = safe_plan.actions[0]
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: _make_context()},
        )
        summary = executor.execute(request)
        assert summary.total == 1
        assert summary.dry_run == 1
        assert summary.status == ExecutionStatus.DRY_RUN
        assert summary.ledger is not None


# ── Dry Run ───────────────────────────────────────────────────────────────────


class TestDryRun:
    """Tests for dry-run default mode."""

    def test_dry_run_is_default(self, executor, safe_plan) -> None:
        """Default mode is dry_run and returns DRY_RUN status."""
        action = safe_plan.actions[0]
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: _make_context()},
        )
        summary = executor.execute(request)
        assert summary.status == ExecutionStatus.DRY_RUN
        assert all(r.status == ExecutionStatus.DRY_RUN for r in summary.results)

    def test_dry_run_does_not_modify_filesystem(self, executor, safe_plan) -> None:
        """Dry-run does not perform destructive filesystem operations."""
        action = safe_plan.actions[0]
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: _make_context()},
        )
        summary = executor.execute(request)
        assert all(r.status == ExecutionStatus.DRY_RUN for r in summary.results)
        for result in summary.results:
            dry = result.dry_run_info
            assert dry is not None
            assert dry.get("operation") == result.action_type


# ── Safety Gate Integration ───────────────────────────────────────────────────


class TestSafetyGateIntegration:
    """Tests that SafetyGate cannot be bypassed."""

    def test_safety_gate_rejects_blocked_action(self, executor) -> None:
        """BLOCKED action is rejected by the executor."""
        plan = _make_single_action_plan(safety_level=SafetyLevel.BLOCKED)
        action = plan.actions[0]
        request = ExecutionRequest(
            plan=plan, execution_context={action.action_id: _make_context()}
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED
        assert "SafetyGate" in summary.results[0].reason

    def test_safety_gate_returns_review_required(self, executor) -> None:
        """REVIEW_REQUIRED action returns REQUIRES_REVIEW."""
        plan = _make_single_action_plan(safety_level=SafetyLevel.REVIEW_REQUIRED)
        action = plan.actions[0]
        request = ExecutionRequest(
            plan=plan, execution_context={action.action_id: _make_context()}
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REQUIRES_REVIEW

    def test_safety_gate_rejects_stale_plan(self, executor, safe_plan) -> None:
        """Stale plans are rejected at the executor level."""
        old_time = datetime.now(UTC) - timedelta(seconds=7200)
        stale_plan = dataclasses.replace(
            safe_plan,
            generated_at=old_time,
            snapshot_timestamp=old_time,
            snapshot_ttl_seconds=60,
        )
        summary = executor.execute(ExecutionRequest(plan=stale_plan))
        assert summary.status == ExecutionStatus.REJECTED
        assert "stale" in summary.reason.lower()

    def test_100_actions_cannot_bypass_safety_gate(self, executor) -> None:
        """A large plan must route each action through the SafetyGate."""
        results = [_make_result(asset_id=f"asset-{i}") for i in range(100)]
        lookup = {
            f"asset-{i}": (
                AssetType.FILE,
                AssetCategory.FILESYSTEM,
                "Test",
                r"C:\temp\junk.txt",
            )
            for i in range(100)
        }
        agg = _aggregate(results, asset_lookup=lookup)
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(
            prio,
            asset_snapshot_resolver=lambda aid: _Snapshot(
                asset_id=aid, canonical_path=r"C:\temp\junk.txt"
            ),
        )

        # Inject an unsafe execution-time path for one action.
        unsafe_action = plan.actions[50]
        contexts = {
            a.action_id: _make_context(
                canonical_path=r"C:\temp\junk.txt", asset_id=a.asset_id
            )
            for a in plan.actions
        }
        contexts[unsafe_action.action_id] = _make_context(
            canonical_path=r"C:\Windows\System32\kernel32.dll",
            asset_id=unsafe_action.asset_id,
        )

        request = ExecutionRequest(plan=plan, execution_context=contexts)
        summary = executor.execute(request)
        assert summary.total == 100
        assert any(r.status == ExecutionStatus.REJECTED for r in summary.results)
        assert summary.rejected >= 1
        # All other actions should be DRY_RUN
        dry_run_count = sum(
            1 for r in summary.results if r.status == ExecutionStatus.DRY_RUN
        )
        assert dry_run_count == 99


# ── Precondition / Context Tests ──────────────────────────────────────────────


class TestPreconditionEvaluation:
    """Tests for typed precondition evaluation at execution time."""

    def test_missing_target_rejected(self, executor, safe_plan) -> None:
        """Missing target (exists=False) is rejected."""
        action = safe_plan.actions[0]
        context = _make_context(exists=False)
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: context},
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_locked_target_rejected(self, executor, safe_plan) -> None:
        """Locked target is rejected."""
        action = safe_plan.actions[0]
        context = _make_context(locked=True, accessible=False)
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: context},
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_identity_mismatch_rejected(self, executor, safe_plan) -> None:
        """Mismatched asset_id is rejected."""
        action = safe_plan.actions[0]
        context = _make_context(asset_id="different-asset")
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: context},
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_changed_size_rejected(self, executor, safe_plan) -> None:
        """Changed file size is rejected via SizeMatches precondition."""
        action = safe_plan.actions[0]
        context = _make_context(size=9999)
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: context},
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED
        failed = summary.results[0].verification.get("failed_preconditions", [])
        assert any("size_matches" in c for c in failed)

    def test_changed_hash_rejected(self, executor, safe_plan) -> None:
        """Changed content hash is rejected via HashMatches precondition."""
        action = safe_plan.actions[0]
        context = _make_context(content_hash="changed")
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: context},
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED


# ── Cancellation ──────────────────────────────────────────────────────────────


class TestCancellation:
    """Tests for cooperative cancellation."""

    def test_cancellation_before_execution(self, executor, safe_plan) -> None:
        """Cancellation before execution marks all actions CANCELLED."""
        token = CancellationToken()
        token.cancel()
        action = safe_plan.actions[0]
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: _make_context()},
            cancellation_token=token,
        )
        summary = executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.CANCELLED

    def test_cancellation_between_actions(self, executor) -> None:
        """Cancellation between actions stops further execution."""
        results = [_make_result(asset_id=f"asset-{i}") for i in range(10)]
        lookup = {
            f"asset-{i}": (
                AssetType.FILE,
                AssetCategory.FILESYSTEM,
                "Test",
                r"C:\temp\junk.txt",
            )
            for i in range(10)
        }
        agg = _aggregate(results, asset_lookup=lookup)
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(
            prio,
            asset_snapshot_resolver=lambda aid: _Snapshot(
                asset_id=aid, canonical_path=r"C:\temp\junk.txt"
            ),
        )

        token = CancellationToken()
        call_count = 0

        def context_provider(action):
            nonlocal call_count
            call_count += 1
            if call_count >= 4:
                token.cancel()
            return _make_context(asset_id=action.asset_id)

        request = ExecutionRequest(
            plan=plan,
            context_provider=context_provider,
            cancellation_token=token,
        )
        summary = executor.execute(request)
        assert any(r.status == ExecutionStatus.DRY_RUN for r in summary.results)
        assert any(r.status == ExecutionStatus.CANCELLED for r in summary.results)
        assert summary.cancelled > 0
        assert summary.dry_run >= 3


# ── Failure Isolation ─────────────────────────────────────────────────────────


class TestFailureIsolation:
    """Tests that one failed action does not crash the batch."""

    def test_one_failure_does_not_stop_batch(self, executor) -> None:
        """A single action failure is recorded and the batch continues."""
        results = [_make_result(asset_id=f"asset-{i}") for i in range(5)]
        lookup = {
            f"asset-{i}": (
                AssetType.FILE,
                AssetCategory.FILESYSTEM,
                "Test",
                r"C:\temp\junk.txt",
            )
            for i in range(5)
        }
        agg = _aggregate(results, asset_lookup=lookup)
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(
            prio,
            asset_snapshot_resolver=lambda aid: _Snapshot(
                asset_id=aid, canonical_path=r"C:\temp\junk.txt"
            ),
        )

        def context_provider(action):
            if action.asset_id == "asset-2":
                raise ValueError("Simulated context failure")
            return _make_context(asset_id=action.asset_id)

        request = ExecutionRequest(plan=plan, context_provider=context_provider)
        summary = executor.execute(request)
        assert summary.total == 5
        assert summary.failed == 1
        assert summary.dry_run == 4
        failed = [r for r in summary.results if r.status == ExecutionStatus.FAILED]
        assert failed[0].asset_id == "asset-2"


# ── Deterministic Order ───────────────────────────────────────────────────────


class TestExecutionOrder:
    """Tests for deterministic execution order."""

    def test_actions_sorted_by_priority_then_action_id(self, executor) -> None:
        """Actions execute in priority desc, action_id asc order."""
        results = [
            _make_result(
                asset_id=f"asset-{i}",
                priority_score=float(i * 10),
            )
            for i in range(5)
        ]
        # Reverse priority order in lookup to ensure sorting is applied
        lookup = {
            f"asset-{i}": (
                AssetType.FILE,
                AssetCategory.FILESYSTEM,
                "Test",
                r"C:\temp\junk.txt",
            )
            for i in range(5)
        }
        agg = _aggregate(results, asset_lookup=lookup)
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(
            prio,
            asset_snapshot_resolver=lambda aid: _Snapshot(
                asset_id=aid, canonical_path=r"C:\temp\junk.txt"
            ),
        )

        request = ExecutionRequest(plan=plan)
        summary = executor.execute(request)
        expected_order = sorted(
            plan.actions,
            key=lambda a: (-a.priority_score, a.action_id),
        )
        actual_order = [r.action_id for r in summary.results]
        assert actual_order == [a.action_id for a in expected_order]


# ── Idempotency ───────────────────────────────────────────────────────────────


class TestIdempotency:
    """Tests for execution idempotency via the ledger."""

    def test_same_action_not_executed_twice(self, executor, safe_plan) -> None:
        """Re-executing the same plan skips already recorded actions."""
        action = safe_plan.actions[0]
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: _make_context()},
        )
        first = executor.execute(request)
        second = executor.execute(request)
        assert first.results[0].status == ExecutionStatus.DRY_RUN
        assert second.results[0].status == ExecutionStatus.SKIPPED
        assert executor.ledger.count() == 1

    def test_ledger_records_all_attempts(self, executor, safe_plan) -> None:
        """Ledger tracks each action execution attempt."""
        action = safe_plan.actions[0]
        request = ExecutionRequest(
            plan=safe_plan,
            execution_context={action.action_id: _make_context()},
        )
        executor.execute(request)
        assert executor.ledger.has(action.action_id)


# ── Edge Cases ────────────────────────────────────────────────────────────────


class TestEdgeCases:
    """Edge case tests for the execution engine."""

    def test_empty_plan(self, executor) -> None:
        """Empty plan returns an empty but structured summary."""
        empty_plan = ActionPlan(
            actions=(),
            summary=ActionSummary(
                total_findings=0,
                actions_planned=0,
                auto_fixable_actions=0,
                review_required_actions=0,
                blocked_actions=0,
                not_fixable_actions=0,
                unknown_fixability_actions=0,
                actions_by_type={},
                estimated_affected_size=None,
                highest_priority_action_id=None,
                highest_severity_action_id=None,
                largest_affected_action_id=None,
                generated_at=datetime.now(UTC),
            ),
            generated_at=datetime.now(UTC),
        )
        summary = executor.execute(ExecutionRequest(plan=empty_plan))
        assert summary.total == 0
        assert summary.results == ()

    def test_10k_dry_run_performance(self, executor) -> None:
        """10,000 dry-run actions complete in reasonable time."""
        results = [_make_result(asset_id=f"asset-{i}") for i in range(10_000)]
        lookup = {
            f"asset-{i}": (
                AssetType.FILE,
                AssetCategory.FILESYSTEM,
                "Test",
                r"C:\temp\junk-{i}.txt",
            )
            for i in range(10_000)
        }
        for i in range(10_000):
            lookup[f"asset-{i}"] = (
                AssetType.FILE,
                AssetCategory.FILESYSTEM,
                "Test",
                f"C:\\temp\\junk-{i}.txt",
            )
        agg = _aggregate(results, asset_lookup=lookup)
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(
            prio,
            asset_snapshot_resolver=lambda aid: _Snapshot(
                asset_id=aid,
                canonical_path=lookup[aid][3],
            ),
        )

        request = ExecutionRequest(plan=plan)
        start = time.perf_counter()
        summary = executor.execute(request)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        assert elapsed_ms < 30000.0, f"Executor took {elapsed_ms:.1f}ms"
        assert summary.total == 10_000
        assert summary.dry_run == 10_000


# ── Security Invariants ───────────────────────────────────────────────────────


class TestSecurityInvariants:
    """Tests proving the execution engine's security guarantees."""

    def test_no_system_modification_in_source(self) -> None:
        """Execution engine source does not contain destructive calls."""
        import inspect

        import avs_backend.scan_core.execution.target_executors as te

        source = inspect.getsource(te)
        forbidden = [
            "os.remove",
            "os.unlink",
            "shutil.rmtree",
            "subprocess",
            "winreg.Delete",
        ]
        for term in forbidden:
            assert (
                term not in source
            ), f"Found forbidden term '{term}' in target_executors"
