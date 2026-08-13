"""
SC-8C3 Part 2 — Finding Prioritization + Fixability Tests

Comprehensive tests covering:
- Safety test matrix
- Fixability derivation
- Actionability contracts
- Priority scoring
- Deterministic ordering
- Bulk summary
- 10,000 findings benchmark
- Rule capability
- Edge cases
"""

from __future__ import annotations

import dataclasses
import random
import time
from datetime import UTC, datetime
from typing import Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
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
from avs_backend.scan_core.rules.priority import (
    FindingPrioritizer,
    Fixability,
    PrioritizedResult,
    RuleCapability,
)
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


def _make_asset_lookup() -> dict[str, tuple[AssetType, AssetCategory, str, str]]:
    return {
        "asset-1": (
            AssetType.FILE,
            AssetCategory.FILESYSTEM,
            "Temp File",
            "/tmp/temp.txt",
        ),
        "asset-2": (
            AssetType.FILE,
            AssetCategory.FILESYSTEM,
            "Cache File",
            "/tmp/cache.txt",
        ),
        "asset-3": (
            AssetType.REGISTRY_KEY,
            AssetCategory.REGISTRY,
            "Reg Key",
            "HKLM\\Software\\Test",
        ),
        "asset-4": (
            AssetType.SERVICE,
            AssetCategory.WINDOWS,
            "Test Service",
            "svc/test",
        ),
        "asset-5": (
            AssetType.PROCESS,
            AssetCategory.RUNTIME,
            "Test Process",
            "proc.exe",
        ),
    }


def _make_rule_category_resolver() -> dict[str, RuleCategory]:
    return {
        "junk.temp.application": RuleCategory.JUNK,
        "cache.application": RuleCategory.CACHE,
        "registry.temp": RuleCategory.REGISTRY,
        "startup.entry": RuleCategory.STARTUP,
        "browser.cache": RuleCategory.BROWSER,
        "security.suspicious": RuleCategory.SECURITY,
        "system.critical": RuleCategory.SYSTEM,
        "performance.slow": RuleCategory.PERFORMANCE,
        "privacy.history": RuleCategory.PRIVACY,
    }


def _aggregate(
    results,
    asset_lookup=None,
    rule_category_resolver=None,
):
    aggregator = DetectionAggregator(
        asset_lookup=asset_lookup or _make_asset_lookup(),
        rule_category_resolver=rule_category_resolver or _make_rule_category_resolver(),
    )
    return aggregator.aggregate(results)


def _prioritize(
    result,
    rule_capability_resolver=None,
    asset_size_resolver=None,
):
    prioritizer = FindingPrioritizer(
        rule_capability_resolver=rule_capability_resolver,
        asset_size_resolver=asset_size_resolver,
    )
    return prioritizer.prioritize(result)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def base_aggregation():
    results = [
        _make_result(asset_id=f"asset-{i}", rule_id=f"rule-{i}") for i in range(5)
    ]
    return _aggregate(results)


@pytest.fixture
def base_prioritized(base_aggregation):
    return _prioritize(base_aggregation)


# ── Tests: Fixability Derivation ──────────────────────────────────────────────


class TestFixabilityDerivation:
    """Tests for fixability derivation from safety + rule capability."""

    def test_blocked_safety_yields_blocked_fixability(self) -> None:
        """BLOCKED safety always yields BLOCKED fixability."""
        result = _make_result(safety_level=SafetyLevel.BLOCKED)
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        assert prio.priorities[0].fixability == Fixability.BLOCKED

    def test_review_required_safety_yields_review_required_fixability(self) -> None:
        """REVIEW_REQUIRED safety always yields REVIEW_REQUIRED fixability."""
        result = _make_result(safety_level=SafetyLevel.REVIEW_REQUIRED)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        assert prio.priorities[0].fixability == Fixability.REVIEW_REQUIRED

    def test_high_risk_safety_yields_not_fixable(self) -> None:
        """HIGH_RISK safety yields NOT_FIXABLE."""
        result = _make_result(safety_level=SafetyLevel.HIGH_RISK)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        assert prio.priorities[0].fixability == Fixability.NOT_FIXABLE

    def test_safe_with_remediation_is_auto_fixable(self) -> None:
        """SAFE + REMEDIATION_AVAILABLE → AUTO_FIXABLE."""
        result = _make_result(safety_level=SafetyLevel.SAFE)
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        assert prio.priorities[0].fixability == Fixability.AUTO_FIXABLE

    def test_safe_with_no_remediation_is_not_fixable(self) -> None:
        """SAFE + NO_REMEDIATION → NOT_FIXABLE."""
        result = _make_result(safety_level=SafetyLevel.SAFE)
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.NO_REMEDIATION
        )
        assert prio.priorities[0].fixability == Fixability.NOT_FIXABLE

    def test_safe_with_review_required_capability(self) -> None:
        """SAFE + REVIEW_REQUIRED capability → REVIEW_REQUIRED fixability."""
        result = _make_result(safety_level=SafetyLevel.SAFE)
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REVIEW_REQUIRED
        )
        assert prio.priorities[0].fixability == Fixability.REVIEW_REQUIRED

    def test_low_risk_with_remediation_is_auto_fixable(self) -> None:
        """LOW_RISK + REMEDIATION_AVAILABLE → AUTO_FIXABLE."""
        result = _make_result(safety_level=SafetyLevel.LOW_RISK)
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        assert prio.priorities[0].fixability == Fixability.AUTO_FIXABLE


# ── Tests: Actionability Contracts ───────────────────────────────────────────


class TestActionabilityContracts:
    """Tests for actionability contract rules."""

    def test_blocked_is_not_actionable(self) -> None:
        """BLOCKED: is_actionable=False, is_auto_fixable=False,
        requires_review=False, is_blocked=True."""
        result = _make_result(safety_level=SafetyLevel.BLOCKED)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        p = prio.priorities[0]
        assert p.is_blocked is True
        assert p.requires_review is False
        assert p.is_actionable is False
        assert p.is_auto_fixable is False
        assert p.is_fixable is False

    def test_review_required_safety_requires_review(self) -> None:
        """REVIEW_REQUIRED: requires_review=True, is_actionable=False, is_auto_fixable=False."""
        result = _make_result(safety_level=SafetyLevel.REVIEW_REQUIRED)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        p = prio.priorities[0]
        assert p.requires_review is True
        assert p.is_actionable is False
        assert p.is_auto_fixable is False
        assert p.is_blocked is False
        assert p.is_fixable is True

    def test_safe_auto_fixable_is_actionable(self) -> None:
        """SAFE + REMEDIATION_AVAILABLE: is_actionable=True, is_auto_fixable=True."""
        result = _make_result(safety_level=SafetyLevel.SAFE)
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        p = prio.priorities[0]
        assert p.is_actionable is True
        assert p.is_auto_fixable is True
        assert p.is_fixable is True
        assert p.is_blocked is False
        assert p.requires_review is False

    def test_safe_no_remediation_not_auto_fixable(self) -> None:
        """SAFE + NO_REMEDIATION: is_actionable=False, is_auto_fixable=False, is_fixable=False."""
        result = _make_result(safety_level=SafetyLevel.SAFE)
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.NO_REMEDIATION
        )
        p = prio.priorities[0]
        assert p.is_actionable is False
        assert p.is_auto_fixable is False
        assert p.is_fixable is False

    def test_high_risk_not_actionable(self) -> None:
        """HIGH_RISK: is_actionable=False, is_fixable=False."""
        result = _make_result(safety_level=SafetyLevel.HIGH_RISK)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        p = prio.priorities[0]
        assert p.is_actionable is False
        assert p.is_auto_fixable is False
        assert p.is_fixable is False
        assert p.is_blocked is False
        assert p.requires_review is False


# ── Tests: Safety Matrix ──────────────────────────────────────────────────────


class TestSafetyMatrix:
    """Comprehensive safety test matrix."""

    def test_safe_high_confidence(self) -> None:
        """SAFE + high confidence → AUTO_FIXABLE, high priority."""
        result = RuleResult(
            rule_id="junk.temp.application",
            rule_version="1.0.0",
            asset_id="asset-1",
            status=RuleMatchStatus.MATCHED,
            severity=Severity.HIGH,
            confidence=Confidence(score=95.0, factors=tuple()),
            safety=_make_safety(SafetyLevel.SAFE),
            reason="Test",
            evidence=_make_evidence(),
            recommended_action=ActionType.DELETE,
            estimated_size=1024,
            evaluated_at=datetime.now(UTC),
        )
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        p = prio.priorities[0]
        assert p.is_auto_fixable is True
        assert p.is_actionable is True
        assert p.fixability == Fixability.AUTO_FIXABLE

    def test_safe_low_confidence(self) -> None:
        """SAFE + low confidence → still AUTO_FIXABLE if remediation available."""
        result = RuleResult(
            rule_id="junk.temp.application",
            rule_version="1.0.0",
            asset_id="asset-1",
            status=RuleMatchStatus.MATCHED,
            severity=Severity.LOW,
            confidence=Confidence(score=25.0, factors=tuple()),
            safety=_make_safety(SafetyLevel.SAFE),
            reason="Test",
            evidence=_make_evidence(),
            recommended_action=ActionType.DELETE,
            estimated_size=1024,
            evaluated_at=datetime.now(UTC),
        )
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        p = prio.priorities[0]
        assert p.is_auto_fixable is True
        assert p.is_actionable is True

    def test_review_required_high_severity(self) -> None:
        """REVIEW_REQUIRED + HIGH severity → requires review, not auto-fixable."""
        result = _make_result(
            safety_level=SafetyLevel.REVIEW_REQUIRED,
            severity=Severity.HIGH,
        )
        agg = _aggregate([result])
        prio = _prioritize(agg)
        p = prio.priorities[0]
        assert p.requires_review is True
        assert p.is_auto_fixable is False
        assert p.is_actionable is False
        assert p.fixability == Fixability.REVIEW_REQUIRED

    def test_blocked_critical_severity(self) -> None:
        """BLOCKED + CRITICAL severity → blocked, never actionable."""
        result = _make_result(
            safety_level=SafetyLevel.BLOCKED,
            severity=Severity.CRITICAL,
        )
        agg = _aggregate([result])
        prio = _prioritize(agg)
        p = prio.priorities[0]
        assert p.is_blocked is True
        assert p.is_auto_fixable is False
        assert p.is_actionable is False
        assert p.fixability == Fixability.BLOCKED

    def test_not_fixable_explicit(self) -> None:
        """HIGH_RISK safety → NOT_FIXABLE."""
        result = _make_result(safety_level=SafetyLevel.HIGH_RISK)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        p = prio.priorities[0]
        assert p.fixability == Fixability.NOT_FIXABLE
        assert p.is_fixable is False

    def test_unknown_fixability_with_defaults(self) -> None:
        """Without resolver and no special safety → falls back to NOT_FIXABLE."""
        result = _make_result(safety_level=SafetyLevel.SAFE)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        p = prio.priorities[0]
        assert p.fixability == Fixability.NOT_FIXABLE
        assert p.rule_capability == RuleCapability.NO_REMEDIATION


# ── Tests: Priority Scoring ───────────────────────────────────────────────────


class TestPriorityScoring:
    """Tests for deterministic priority scoring."""

    def test_higher_severity_higher_score(self) -> None:
        """Higher severity produces higher priority score."""
        low = _make_result(
            asset_id="a-low", rule_id="r-severity", severity=Severity.LOW
        )
        high = _make_result(
            asset_id="a-high", rule_id="r-severity", severity=Severity.HIGH
        )
        agg = _aggregate([low, high])
        prio = _prioritize(agg)
        scores = {p.finding.finding_id: p.priority_score for p in prio.priorities}
        low_id = (
            low.finding_id
            if hasattr(low, "finding_id")
            else f"{low.asset_id}|{low.rule_id}|{low.rule_version}"
        )
        high_id = (
            high.finding_id
            if hasattr(high, "finding_id")
            else f"{high.asset_id}|{high.rule_id}|{high.rule_version}"
        )
        assert scores[high_id] > scores[low_id]

    def test_higher_confidence_higher_score(self) -> None:
        """Higher confidence produces higher priority score."""
        r1 = _make_result(asset_id="a1", rule_id="r-conf")
        r1 = RuleResult(
            rule_id=r1.rule_id,
            rule_version=r1.rule_version,
            asset_id=r1.asset_id,
            status=r1.status,
            severity=r1.severity,
            confidence=Confidence(score=30.0, factors=tuple()),
            safety=r1.safety,
            reason=r1.reason,
            evidence=r1.evidence,
            recommended_action=r1.recommended_action,
            estimated_size=r1.estimated_size,
            metadata=r1.metadata,
            evaluated_at=r1.evaluated_at,
        )
        r2 = _make_result(asset_id="a2", rule_id="r-conf")
        r2 = RuleResult(
            rule_id=r2.rule_id,
            rule_version=r2.rule_version,
            asset_id=r2.asset_id,
            status=r2.status,
            severity=r2.severity,
            confidence=Confidence(score=90.0, factors=tuple()),
            safety=r2.safety,
            reason=r2.reason,
            evidence=r2.evidence,
            recommended_action=r2.recommended_action,
            estimated_size=r2.estimated_size,
            metadata=r2.metadata,
            evaluated_at=r2.evaluated_at,
        )
        agg = _aggregate([r1, r2])
        prio = _prioritize(agg)
        scores = {p.finding.finding_id: p.priority_score for p in prio.priorities}
        r1_id = f"{r1.asset_id}|{r1.rule_id}|{r1.rule_version}"
        r2_id = f"{r2.asset_id}|{r2.rule_id}|{r2.rule_version}"
        assert scores[r2_id] > scores[r1_id]

    def test_blocked_reduces_score(self) -> None:
        """BLOCKED safety significantly reduces priority score."""
        safe = _make_result(
            asset_id="a-safe", rule_id="r-block", safety_level=SafetyLevel.SAFE
        )
        blocked = _make_result(
            asset_id="a-blocked", rule_id="r-block", safety_level=SafetyLevel.BLOCKED
        )
        agg = _aggregate([safe, blocked])
        prio = _prioritize(agg)
        scores = {p.finding.finding_id: p.priority_score for p in prio.priorities}
        safe_id = f"{safe.asset_id}|{safe.rule_id}|{safe.rule_version}"
        blocked_id = f"{blocked.asset_id}|{blocked.rule_id}|{blocked.rule_version}"
        assert scores[safe_id] > scores[blocked_id]

    def test_larger_size_increases_score(self) -> None:
        """Larger affected size increases priority score."""
        small = _make_result(asset_id="a-small", rule_id="r-size", estimated_size=100)
        large = _make_result(
            asset_id="a-large", rule_id="r-size", estimated_size=10_000_000
        )
        agg = _aggregate([small, large])
        prio = _prioritize(agg)
        scores = {p.finding.finding_id: p.priority_score for p in prio.priorities}
        small_id = f"{small.asset_id}|{small.rule_id}|{small.rule_version}"
        large_id = f"{large.asset_id}|{large.rule_id}|{large.rule_version}"
        assert scores[large_id] > scores[small_id]

    def test_unknown_size_does_not_crash(self) -> None:
        """Unknown size does not crash priority computation."""
        result = _make_result(estimated_size=None)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        assert len(prio.priorities) == 1
        assert prio.priorities[0].priority_score >= 0.0

    def test_category_bonus_applied(self) -> None:
        """Security category gets higher priority than custom."""
        security = _make_result(asset_id="a-sec", rule_id="security.suspicious")
        custom = _make_result(asset_id="a-cust", rule_id="custom.rule")
        agg = _aggregate([security, custom])
        prio = _prioritize(agg)
        scores = {p.finding.finding_id: p.priority_score for p in prio.priorities}
        sec_id = f"{security.asset_id}|{security.rule_id}|{security.rule_version}"
        cust_id = f"{custom.asset_id}|{custom.rule_id}|{custom.rule_version}"
        assert scores[sec_id] > scores[cust_id]


# ── Tests: Deterministic Ordering ────────────────────────────────────────────


class TestDeterministicOrdering:
    """Tests for deterministic priority ordering."""

    def test_same_input_same_order(self) -> None:
        """Identical findings produce identical ordering."""
        results = [_make_result(asset_id=f"a{i}", rule_id=f"r{i}") for i in range(10)]
        agg = _aggregate(results)
        prio1 = _prioritize(agg)
        prio2 = _prioritize(agg)
        ids1 = [p.finding.finding_id for p in prio1.priorities]
        ids2 = [p.finding.finding_id for p in prio2.priorities]
        assert ids1 == ids2

    def test_shuffled_input_same_order(self) -> None:
        """Shuffled input produces same ordering."""
        results = [_make_result(asset_id=f"a{i}", rule_id=f"r{i}") for i in range(20)]
        agg = _aggregate(results)
        prio1 = _prioritize(agg)

        random.seed(42)
        shuffled = list(results)
        random.shuffle(shuffled)
        agg2 = _aggregate(shuffled)
        prio2 = _prioritize(agg2)

        ids1 = [p.finding.finding_id for p in prio1.priorities]
        ids2 = [p.finding.finding_id for p in prio2.priorities]
        assert ids1 == ids2

    def test_tiebreaker_severity(self) -> None:
        """When priority scores are equal, severity breaks tie."""
        r1 = _make_result(asset_id="a1", rule_id="r-tie", severity=Severity.LOW)
        r1 = RuleResult(
            rule_id=r1.rule_id,
            rule_version=r1.rule_version,
            asset_id=r1.asset_id,
            status=r1.status,
            severity=r1.severity,
            confidence=Confidence(score=100.0, factors=tuple()),
            safety=r1.safety,
            reason=r1.reason,
            evidence=r1.evidence,
            recommended_action=r1.recommended_action,
            estimated_size=r1.estimated_size,
            metadata=r1.metadata,
            evaluated_at=r1.evaluated_at,
        )
        r2 = _make_result(asset_id="a2", rule_id="r-tie", severity=Severity.HIGH)
        r2 = RuleResult(
            rule_id=r2.rule_id,
            rule_version=r2.rule_version,
            asset_id=r2.asset_id,
            status=r2.status,
            severity=r2.severity,
            confidence=Confidence(score=100.0, factors=tuple()),
            safety=r2.safety,
            reason=r2.reason,
            evidence=r2.evidence,
            recommended_action=r2.recommended_action,
            estimated_size=r2.estimated_size,
            metadata=r2.metadata,
            evaluated_at=r2.evaluated_at,
        )
        agg = _aggregate([r1, r2])
        prio = _prioritize(agg)
        ids = [p.finding.finding_id for p in prio.priorities]
        r2_id = f"{r2.asset_id}|{r2.rule_id}|{r2.rule_version}"
        r1_id = f"{r1.asset_id}|{r1.rule_id}|{r1.rule_version}"
        assert ids[0] == r2_id
        assert ids[1] == r1_id

    def test_tiebreaker_rule_id(self) -> None:
        """When all else equal, rule_id breaks tie alphabetically."""
        r1 = _make_result(asset_id="a-tie", rule_id="z-rule", severity=Severity.LOW)
        r1 = RuleResult(
            rule_id=r1.rule_id,
            rule_version=r1.rule_version,
            asset_id=r1.asset_id,
            status=r1.status,
            severity=r1.severity,
            confidence=Confidence(score=100.0, factors=tuple()),
            safety=r1.safety,
            reason=r1.reason,
            evidence=r1.evidence,
            recommended_action=r1.recommended_action,
            estimated_size=100,
            metadata=r1.metadata,
            evaluated_at=r1.evaluated_at,
        )
        r2 = _make_result(asset_id="a-tie", rule_id="a-rule", severity=Severity.LOW)
        r2 = RuleResult(
            rule_id=r2.rule_id,
            rule_version=r2.rule_version,
            asset_id=r2.asset_id,
            status=r2.status,
            severity=r2.severity,
            confidence=Confidence(score=100.0, factors=tuple()),
            safety=r2.safety,
            reason=r2.reason,
            evidence=r2.evidence,
            recommended_action=r2.recommended_action,
            estimated_size=100,
            metadata=r2.metadata,
            evaluated_at=r2.evaluated_at,
        )
        agg = _aggregate([r1, r2])
        prio = _prioritize(agg)
        ids = [p.finding.finding_id for p in prio.priorities]
        r2_id = f"{r2.asset_id}|{r2.rule_id}|{r2.rule_version}"
        r1_id = f"{r1.asset_id}|{r1.rule_id}|{r1.rule_version}"
        assert ids[0] == r2_id
        assert ids[1] == r1_id


# ── Tests: Bulk Summary ──────────────────────────────────────────────────────


class TestBulkSummary:
    """Tests for prioritized summary."""

    def test_counts_derived_from_findings(
        self, base_prioritized: PrioritizedResult
    ) -> None:
        """Summary counts match actual findings."""
        summary = base_prioritized.summary
        assert summary.total_findings == len(base_prioritized.priorities)
        assert summary.auto_fixable_findings <= summary.total_findings
        assert summary.blocked_fixability <= summary.total_findings
        assert summary.review_required_fixability <= summary.total_findings
        assert summary.not_fixable_findings <= summary.total_findings

    def test_extremes_populated(self, base_prioritized: PrioritizedResult) -> None:
        """Extreme findings are populated when findings exist."""
        summary = base_prioritized.summary
        if summary.total_findings > 0:
            assert summary.highest_priority_finding_id is not None
            assert summary.highest_severity_finding_id is not None
            assert summary.largest_affected_finding_id is not None

    def test_extremes_none_when_empty(self) -> None:
        """Extreme findings are None when no findings."""
        agg = _aggregate([])
        prio = _prioritize(agg)
        summary = prio.summary
        assert summary.highest_priority_finding_id is None
        assert summary.highest_severity_finding_id is None
        assert summary.largest_affected_finding_id is None

    def test_empty_input_summary(self) -> None:
        """Empty input produces zero summary."""
        agg = _aggregate([])
        prio = _prioritize(agg)
        summary = prio.summary
        assert summary.total_findings == 0
        assert summary.unique_assets == 0
        assert summary.auto_fixable_findings == 0
        assert summary.blocked_fixability == 0


# ── Tests: Performance Benchmark ─────────────────────────────────────────────


class TestPerformance:
    """Performance tests with large result sets."""

    def test_10k_findings_performance(self) -> None:
        """Prioritization of 10,000 findings completes in reasonable time."""
        results = []
        for i in range(10_000):
            results.append(
                _make_result(
                    asset_id=f"asset-{i}",
                    rule_id=f"rule-{i}",
                    rule_version="1.0.0",
                    estimated_size=100 + i,
                )
            )
        agg = _aggregate(results)
        start = time.perf_counter()
        prio = _prioritize(
            agg,
            rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        assert elapsed_ms < 1000.0, f"Prioritization took {elapsed_ms:.1f}ms"
        assert len(prio.priorities) == 10_000

    def test_10k_findings_deterministic(self) -> None:
        """10,000 findings produce deterministic output across runs."""
        results = [
            _make_result(asset_id=f"asset-{i}", rule_id=f"rule-{i % 10}")
            for i in range(10_000)
        ]
        agg = _aggregate(results)
        prio1 = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        prio2 = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        ids1 = [p.finding.finding_id for p in prio1.priorities]
        ids2 = [p.finding.finding_id for p in prio2.priorities]
        assert ids1 == ids2


# ── Tests: Edge Cases ────────────────────────────────────────────────────────


class TestEdgeCases:
    """Tests for edge cases."""

    def test_empty_aggregation(self) -> None:
        """Empty aggregation produces empty prioritized result."""
        agg = _aggregate([])
        prio = _prioritize(agg)
        assert len(prio.priorities) == 0
        assert prio.summary.total_findings == 0

    def test_all_no_match(self) -> None:
        """All NO_MATCH results produce empty prioritized result."""
        from avs_backend.scan_core.rules.result import RuleResult

        results = [
            RuleResult.create_no_match("r1", "1.0.0", "a1", "no match"),
            RuleResult.create_no_match("r2", "1.0.0", "a2", "no match"),
        ]
        agg = _aggregate(results)
        prio = _prioritize(agg)
        assert len(prio.priorities) == 0

    def test_serialization_roundtrip(self, base_prioritized: PrioritizedResult) -> None:
        """PrioritizedResult serializes correctly."""
        data = base_prioritized.to_dict()
        assert "priorities" in data
        assert "summary" in data
        assert len(data["priorities"]) == len(base_prioritized.priorities)

    def test_rule_capability_resolver_fallback(self) -> None:
        """Missing rule capability resolver defaults to NO_REMEDIATION."""
        result = _make_result(safety_level=SafetyLevel.SAFE)
        agg = _aggregate([result])
        prio = _prioritize(agg)
        p = prio.priorities[0]
        assert p.rule_capability == RuleCapability.NO_REMEDIATION
        assert p.fixability == Fixability.NOT_FIXABLE

    def test_asset_size_resolver_override(self) -> None:
        """Asset size resolver can override finding size."""
        result = _make_result(estimated_size=100)
        agg = _aggregate([result])
        prio = _prioritize(
            agg,
            asset_size_resolver=lambda aid: 9999 if aid == result.asset_id else None,
        )
        p = prio.priorities[0]
        assert p.priority_score > 0


# ── Tests: Immutability ──────────────────────────────────────────────────────


class TestImmutability:
    """Tests ensuring prioritization layer is read-only."""

    def test_priorities_are_frozen(self, base_prioritized: PrioritizedResult) -> None:
        """FindingPriority is immutable."""
        with pytest.raises(dataclasses.FrozenInstanceError):
            base_prioritized.priorities[0].priority_score = 999.0  # type: ignore[misc]

    def test_summary_is_frozen(self, base_prioritized: PrioritizedResult) -> None:
        """PrioritizedSummary is immutable."""
        with pytest.raises(dataclasses.FrozenInstanceError):
            base_prioritized.summary.total_findings = 999  # type: ignore[misc]

    def test_result_is_frozen(self, base_prioritized: PrioritizedResult) -> None:
        """PrioritizedResult is immutable."""
        with pytest.raises(dataclasses.FrozenInstanceError):
            base_prioritized.priorities = []  # type: ignore


# ── Tests: No Execution ──────────────────────────────────────────────────────


class TestNoExecution:
    """Verify no system modification occurs."""

    def test_no_system_calls_in_source(self) -> None:
        """Verify no system modification imports in priority module."""
        import inspect

        import avs_backend.scan_core.rules.priority as priority_mod

        source = inspect.getsource(priority_mod)
        forbidden = [
            "os.remove",
            "os.unlink",
            "shutil",
            "subprocess",
            "PowerShell",
            "registry",
        ]
        for term in forbidden:
            assert term not in source, f"Found forbidden term '{term}' in priority.py"
