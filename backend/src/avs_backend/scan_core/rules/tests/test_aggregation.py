"""
SC-8C3 Part 1 — Detection Aggregation Tests

Comprehensive tests covering:
- Single finding
- Multiple findings
- Duplicate findings
- Same asset + different rules
- Different assets + same rule
- Grouping
- Size aggregation
- Unknown size
- Severity aggregation
- Safety aggregation
- Confidence aggregation
- Blocked findings
- Review-required findings
- Deterministic IDs
- Deterministic ordering
- Empty result set
- Large result set (10,000 benchmark)
- Malformed/invalid result handling
"""

from __future__ import annotations

import dataclasses
import time
from datetime import UTC, datetime
from typing import Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.rules.aggregation import (
    AssetLookup,
    DetectionAggregator,
    RuleCategoryResolver,
)
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


def _make_asset_lookup() -> AssetLookup:
    """Create a simple asset lookup for testing."""
    mapping: dict[str, tuple[AssetType, AssetCategory, str, str]] = {
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

    def lookup(asset_id: str) -> tuple[AssetType, AssetCategory, str, str]:
        return mapping.get(
            asset_id, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, "Unknown", "")
        )

    return lookup


def _make_rule_category_resolver() -> RuleCategoryResolver:
    mapping = {
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

    def resolver(rule_id: str) -> RuleCategory:
        return mapping.get(rule_id, RuleCategory.CUSTOM)

    return resolver


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def asset_lookup() -> AssetLookup:
    return _make_asset_lookup()


@pytest.fixture
def rule_category_resolver() -> RuleCategoryResolver:
    return _make_rule_category_resolver()


@pytest.fixture
def aggregator(
    asset_lookup: AssetLookup,
    rule_category_resolver: RuleCategoryResolver,
) -> DetectionAggregator:
    return DetectionAggregator(
        asset_lookup=asset_lookup,
        rule_category_resolver=rule_category_resolver,
    )


# ── Tests: Single Finding ─────────────────────────────────────────────────────


class TestSingleFinding:
    """Tests for single finding aggregation."""

    def test_single_matched_finding(self, aggregator: DetectionAggregator) -> None:
        """Single matched result produces one finding."""
        result = _make_result()
        output = aggregator.aggregate([result])

        assert len(output.findings) == 1
        assert len(output.groups) > 0
        assert output.summary.total_findings == 1

    def test_single_finding_fields(self, aggregator: DetectionAggregator) -> None:
        """Finding preserves all fields from RuleResult."""
        result = _make_result(
            asset_id="asset-1",
            rule_id="junk.temp.application",
            rule_version="1.0.0",
            severity=Severity.HIGH,
            estimated_size=2048,
        )
        output = aggregator.aggregate([result])
        finding = output.findings[0]

        assert finding.finding_id == "asset-1|junk.temp.application|1.0.0"
        assert finding.asset_id == "asset-1"
        assert finding.rule_id == "junk.temp.application"
        assert finding.rule_version == "1.0.0"
        assert finding.severity == Severity.HIGH
        assert finding.estimated_size == 2048
        assert finding.source_result is result

    def test_no_match_excluded(self, aggregator: DetectionAggregator) -> None:
        """NO_MATCH results are excluded from findings."""
        result = RuleResult.create_no_match(
            rule_id="junk.temp.application",
            rule_version="1.0.0",
            asset_id="asset-1",
            reason="No match",
        )
        output = aggregator.aggregate([result])

        assert len(output.findings) == 0
        assert output.summary.total_findings == 0


# ── Tests: Duplicates ────────────────────────────────────────────────────────


class TestDeduplication:
    """Tests for deterministic deduplication."""

    def test_duplicate_results_single_finding(
        self, aggregator: DetectionAggregator
    ) -> None:
        """Duplicate RuleResults produce a single finding."""
        result1 = _make_result()
        result2 = _make_result()
        output = aggregator.aggregate([result1, result2])

        assert len(output.findings) == 1

    def test_same_asset_different_rules_separate(
        self, aggregator: DetectionAggregator
    ) -> None:
        """Same asset + different rules produce separate findings."""
        result1 = _make_result(rule_id="junk.temp.application")
        result2 = _make_result(rule_id="cache.application")
        output = aggregator.aggregate([result1, result2])

        assert len(output.findings) == 2
        assert output.findings[0].rule_id != output.findings[1].rule_id

    def test_same_rule_different_assets_separate(
        self, aggregator: DetectionAggregator
    ) -> None:
        """Same rule + different assets produce separate findings."""
        result1 = _make_result(asset_id="asset-1")
        result2 = _make_result(asset_id="asset-2")
        output = aggregator.aggregate([result1, result2])

        assert len(output.findings) == 2
        assert output.findings[0].asset_id != output.findings[1].asset_id

    def test_same_asset_rule_different_version_separate(
        self, aggregator: DetectionAggregator
    ) -> None:
        """Same asset + rule but different version produces separate findings."""
        result1 = _make_result(rule_version="1.0.0")
        result2 = _make_result(rule_version="2.0.0")
        output = aggregator.aggregate([result1, result2])

        assert len(output.findings) == 2


# ── Tests: Deterministic Identity ────────────────────────────────────────────


class TestDeterministicIdentity:
    """Tests for deterministic finding IDs."""

    def test_same_input_same_id(self, aggregator: DetectionAggregator) -> None:
        """Identical inputs produce identical finding IDs."""
        result1 = _make_result()
        result2 = _make_result()
        output1 = aggregator.aggregate([result1])
        output2 = aggregator.aggregate([result2])

        assert output1.findings[0].finding_id == output2.findings[0].finding_id

    def test_different_input_different_id(
        self, aggregator: DetectionAggregator
    ) -> None:
        """Different inputs produce different finding IDs."""
        result1 = _make_result(asset_id="asset-1")
        result2 = _make_result(asset_id="asset-2")
        output = aggregator.aggregate([result1, result2])

        assert output.findings[0].finding_id != output.findings[1].finding_id

    def test_finding_id_format(self, aggregator: DetectionAggregator) -> None:
        """Finding ID follows expected format."""
        result = _make_result(asset_id="a1", rule_id="r1", rule_version="v1")
        output = aggregator.aggregate([result])

        assert output.findings[0].finding_id == "a1|r1|v1"


# ── Tests: Deterministic Ordering ────────────────────────────────────────────


class TestDeterministicOrdering:
    """Tests for deterministic ordering."""

    def test_ordering_by_asset_then_rule(self, aggregator: DetectionAggregator) -> None:
        """Findings are sorted by (asset_id, rule_id, rule_version)."""
        results = [
            _make_result(asset_id="z", rule_id="z", rule_version="2"),
            _make_result(asset_id="a", rule_id="z", rule_version="1"),
            _make_result(asset_id="a", rule_id="a", rule_version="2"),
            _make_result(asset_id="a", rule_id="a", rule_version="1"),
        ]
        output = aggregator.aggregate(results)

        ids = [f.finding_id for f in output.findings]
        assert ids == sorted(ids)

    def test_repeated_executions_same_order(
        self, aggregator: DetectionAggregator
    ) -> None:
        """Repeated aggregations produce identical ordering."""
        results = [
            _make_result(asset_id="c", rule_id="b", rule_version="2"),
            _make_result(asset_id="a", rule_id="c", rule_version="1"),
            _make_result(asset_id="b", rule_id="a", rule_version="3"),
        ]
        output1 = aggregator.aggregate(results)
        output2 = aggregator.aggregate(results)

        assert [f.finding_id for f in output1.findings] == [
            f.finding_id for f in output2.findings
        ]


# ── Tests: Grouping ──────────────────────────────────────────────────────────


class TestGrouping:
    """Tests for grouping functionality."""

    def test_groups_by_category(self, aggregator: DetectionAggregator) -> None:
        """Findings are grouped by rule category."""
        results = [
            _make_result(rule_id="junk.temp.application"),
            _make_result(rule_id="cache.application"),
        ]
        output = aggregator.aggregate(results)
        category_groups = [g for g in output.groups if g.group_by == "rule_category"]

        assert len(category_groups) >= 2

    def test_groups_by_severity(self, aggregator: DetectionAggregator) -> None:
        """Findings are grouped by severity."""
        results = [
            _make_result(asset_id="a1", rule_id="r1", severity=Severity.HIGH),
            _make_result(asset_id="a2", rule_id="r2", severity=Severity.LOW),
        ]
        output = aggregator.aggregate(results)
        severity_groups = [g for g in output.groups if g.group_by == "severity"]

        assert len(severity_groups) >= 2

    def test_groups_by_rule(self, aggregator: DetectionAggregator) -> None:
        """Findings are grouped by rule ID."""
        results = [
            _make_result(rule_id="junk.temp.application"),
            _make_result(rule_id="junk.temp.application"),
        ]
        output = aggregator.aggregate(results)
        rule_groups = [g for g in output.groups if g.group_by == "rule_id"]

        assert len(rule_groups) >= 1

    def test_groups_by_asset_type(self, aggregator: DetectionAggregator) -> None:
        """Findings are grouped by asset type."""
        results = [
            _make_result(asset_id="asset-1"),
            _make_result(asset_id="asset-3"),
        ]
        output = aggregator.aggregate(results)
        asset_groups = [g for g in output.groups if g.group_by == "asset_type"]

        assert len(asset_groups) >= 2

    def test_groups_are_deterministic(self, aggregator: DetectionAggregator) -> None:
        """Group keys and ordering are deterministic."""
        results = [
            _make_result(rule_id="z.rule"),
            _make_result(rule_id="a.rule"),
        ]
        output1 = aggregator.aggregate(results)
        output2 = aggregator.aggregate(results)

        assert [g.group_value for g in output1.groups] == [
            g.group_value for g in output2.groups
        ]

    def test_findings_not_lost_in_grouping(
        self, aggregator: DetectionAggregator
    ) -> None:
        """All findings appear in at least one group."""
        results = [_make_result(), _make_result(rule_id="cache.application")]
        output = aggregator.aggregate(results)

        total_in_groups = sum(g.count for g in output.groups)
        # Each finding appears in 4 groups (category, severity, rule, asset_type)
        assert total_in_groups == len(output.findings) * 4


# ── Tests: Size Accounting ───────────────────────────────────────────────────


class TestSizeAccounting:
    """Tests for size aggregation."""

    def test_total_size_sum(self, aggregator: DetectionAggregator) -> None:
        """Total size is sum of all finding sizes."""
        results = [
            _make_result(asset_id="a1", rule_id="r1", estimated_size=100),
            _make_result(asset_id="a2", rule_id="r2", estimated_size=200),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.total_known_size == 300
        assert output.summary.total_size == 300

    def test_unknown_size_handling(self, aggregator: DetectionAggregator) -> None:
        """Unknown sizes are tracked explicitly, not treated as zero."""
        results = [
            _make_result(asset_id="a1", rule_id="r1", estimated_size=100),
            _make_result(asset_id="a2", rule_id="r2", estimated_size=None),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.total_unknown_size_count == 1
        assert output.summary.total_size is None
        assert output.summary.total_known_size == 100

    def test_size_by_severity(self, aggregator: DetectionAggregator) -> None:
        """Size is correctly aggregated by severity."""
        results = [
            _make_result(
                asset_id="a1", rule_id="r1", severity=Severity.HIGH, estimated_size=100
            ),
            _make_result(
                asset_id="a2", rule_id="r2", severity=Severity.HIGH, estimated_size=200
            ),
            _make_result(
                asset_id="a3", rule_id="r3", severity=Severity.LOW, estimated_size=50
            ),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.size_by_severity.get("high") == 300
        assert output.summary.size_by_severity.get("low") == 50

    def test_size_by_rule(self, aggregator: DetectionAggregator) -> None:
        """Size is correctly aggregated by rule."""
        results = [
            _make_result(
                asset_id="a1", rule_id="junk.temp.application", estimated_size=100
            ),
            _make_result(
                asset_id="a2", rule_id="junk.temp.application", estimated_size=200
            ),
            _make_result(asset_id="a3", rule_id="cache.application", estimated_size=50),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.size_by_rule.get("junk.temp.application") == 300
        assert output.summary.size_by_rule.get("cache.application") == 50

    def test_no_double_counting_duplicates(
        self, aggregator: DetectionAggregator
    ) -> None:
        """Duplicate results are not double-counted in size."""
        result = _make_result(estimated_size=1000)
        output = aggregator.aggregate([result, result, result])

        assert output.summary.total_known_size == 1000


# ── Tests: Severity / Safety / Confidence Aggregation ─────────────────────────


class TestDimensionAggregation:
    """Tests for severity, safety, and confidence aggregation."""

    def test_severity_counts(self, aggregator: DetectionAggregator) -> None:
        """Severity counts are correct."""
        results = [
            _make_result(asset_id="a1", rule_id="r1", severity=Severity.HIGH),
            _make_result(asset_id="a2", rule_id="r2", severity=Severity.HIGH),
            _make_result(asset_id="a3", rule_id="r3", severity=Severity.LOW),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.findings_by_severity.get("high") == 2
        assert output.summary.findings_by_severity.get("low") == 1

    def test_safety_blocked_count(self, aggregator: DetectionAggregator) -> None:
        """Blocked findings are counted correctly."""
        results = [
            _make_result(asset_id="a1", rule_id="r1", safety_level=SafetyLevel.BLOCKED),
            _make_result(asset_id="a2", rule_id="r2", safety_level=SafetyLevel.SAFE),
            _make_result(asset_id="a3", rule_id="r3", safety_level=SafetyLevel.BLOCKED),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.blocked_findings == 2
        assert output.summary.fixable_findings == 1

    def test_safety_review_required_count(
        self, aggregator: DetectionAggregator
    ) -> None:
        """Review-required findings are counted correctly."""
        results = [
            _make_result(
                asset_id="a1", rule_id="r1", safety_level=SafetyLevel.REVIEW_REQUIRED
            ),
            _make_result(
                asset_id="a2", rule_id="r2", safety_level=SafetyLevel.REVIEW_REQUIRED
            ),
            _make_result(asset_id="a3", rule_id="r3", safety_level=SafetyLevel.SAFE),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.review_required_findings == 2
        assert output.summary.fixable_findings == 1

    def test_confidence_counts(self, aggregator: DetectionAggregator) -> None:
        """Confidence counts are correct."""
        results: list[RuleResult] = [
            _make_result(asset_id="a1", rule_id="r1"),
            RuleResult(
                rule_id="r2",
                rule_version="1.0.0",
                asset_id="a2",
                status=RuleMatchStatus.MATCHED,
                severity=Severity.LOW,
                confidence=Confidence(score=25.0, factors=tuple()),
                safety=_make_safety(),
                reason="Low confidence",
                evidence=_make_evidence(),
                recommended_action=ActionType.DELETE,
                evaluated_at=datetime.now(UTC),
            ),
            _make_result(asset_id="a3", rule_id="r3"),
        ]
        output = aggregator.aggregate(results)

        assert (output.summary.findings_by_confidence.get("very_high") or 0) >= 1
        very_low = output.summary.findings_by_confidence.get("low")
        assert very_low is not None and very_low >= 1

    def test_safety_preserved_verbatim(self, aggregator: DetectionAggregator) -> None:
        """Severity, confidence, and safety are copied exactly."""
        safety = _make_safety(SafetyLevel.BLOCKED)
        result = RuleResult(
            rule_id="security.suspicious",
            rule_version="1.0.0",
            asset_id="asset-1",
            status=RuleMatchStatus.MATCHED_BLOCKED,
            severity=Severity.CRITICAL,
            confidence=_make_confidence(99.0),
            safety=safety,
            reason="Critical blocked",
            evidence=_make_evidence(),
            recommended_action=ActionType.QUARANTINE,
            evaluated_at=datetime.now(UTC),
        )
        output = aggregator.aggregate([result])
        finding = output.findings[0]

        assert finding.severity == Severity.CRITICAL
        assert finding.safety == safety
        assert finding.confidence.score == 99.0
        assert finding.is_blocked is True


# ── Tests: Empty / Edge Cases ─────────────────────────────────────────────────


class TestEdgeCases:
    """Tests for empty sets and edge cases."""

    def test_empty_input(self, aggregator: DetectionAggregator) -> None:
        """Empty input produces empty findings and zero summary."""
        output = aggregator.aggregate([])

        assert len(output.findings) == 0
        assert output.summary.total_findings == 0
        assert output.summary.unique_assets == 0
        assert output.summary.total_size == 0

    def test_all_no_match(self, aggregator: DetectionAggregator) -> None:
        """All NO_MATCH results produce empty findings."""
        results = [
            RuleResult.create_no_match("r1", "1.0.0", "a1", "no match"),
            RuleResult.create_no_match("r2", "1.0.0", "a2", "no match"),
        ]
        output = aggregator.aggregate(results)

        assert len(output.findings) == 0

    def test_mixed_match_and_no_match(self, aggregator: DetectionAggregator) -> None:
        """Mixed match and no-match results only include matches."""
        results = [
            RuleResult.create_no_match("r1", "1.0.0", "a1", "no match"),
            _make_result(asset_id="a2"),
        ]
        output = aggregator.aggregate(results)

        assert len(output.findings) == 1
        assert output.findings[0].asset_id == "a2"

    def test_unique_assets_count(self, aggregator: DetectionAggregator) -> None:
        """Unique assets count is correct."""
        results = [
            _make_result(asset_id="a1"),
            _make_result(asset_id="a1"),
            _make_result(asset_id="a2"),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.unique_assets == 2


# ── Tests: Performance Benchmark ─────────────────────────────────────────────


class TestPerformance:
    """Performance tests with large result sets."""

    def test_10k_results_performance(self, aggregator: DetectionAggregator) -> None:
        """Aggregation of 10,000 RuleResults completes in reasonable time."""
        results = []
        for i in range(10_000):
            asset_id = f"asset-{i % 1000}"
            rule_id = f"rule-{i % 50}"
            results.append(
                _make_result(
                    asset_id=asset_id,
                    rule_id=rule_id,
                    rule_version="1.0.0",
                    estimated_size=100 + i,
                )
            )

        start = time.perf_counter()
        output = aggregator.aggregate(results)
        elapsed_ms = (time.perf_counter() - start) * 1000.0

        # Should complete in well under 1 second
        assert elapsed_ms < 1000.0, f"Aggregation took {elapsed_ms:.1f}ms"
        # Verify deduplication worked
        assert output.summary.total_findings < 10_000
        assert output.summary.unique_assets <= 1000

    def test_10k_results_deterministic(self, aggregator: DetectionAggregator) -> None:
        """10,000 results produce deterministic output across runs."""
        results = [
            _make_result(asset_id=f"asset-{i}", rule_id=f"rule-{i % 10}")
            for i in range(10_000)
        ]
        output1 = aggregator.aggregate(results)
        output2 = aggregator.aggregate(results)

        assert len(output1.findings) == len(output2.findings)
        assert [f.finding_id for f in output1.findings] == [
            f.finding_id for f in output2.findings
        ]


# ── Tests: Malformed / Invalid Results ───────────────────────────────────────


class TestMalformedResults:
    """Tests for malformed or invalid RuleResults."""

    def test_empty_asset_id_rejected(self) -> None:
        """RuleResult with empty asset_id is rejected by RuleResult itself."""
        with pytest.raises(ValueError):
            _make_result(asset_id="")

    def test_empty_rule_id_rejected(self) -> None:
        """RuleResult with empty rule_id is rejected by RuleResult itself."""
        with pytest.raises(ValueError):
            _make_result(rule_id="")

    def test_aggregator_with_none_asset_lookup(self) -> None:
        """Aggregator works without asset_lookup (falls back to UNKNOWN)."""
        aggregator = DetectionAggregator()
        result = _make_result()
        output = aggregator.aggregate([result])

        assert len(output.findings) == 1
        assert output.findings[0].asset_type == AssetType.UNKNOWN

    def test_aggregator_with_none_rule_category_resolver(self) -> None:
        """Aggregator works without rule_category_resolver (falls back to heuristic)."""
        aggregator = DetectionAggregator()
        result = _make_result(rule_id="unknown.rule")
        output = aggregator.aggregate([result])

        assert len(output.findings) == 1
        assert output.findings[0].rule_category == RuleCategory.CUSTOM

    def test_aggregator_asset_lookup_exception(self) -> None:
        """Aggregator handles asset_lookup exceptions gracefully."""

        def bad_lookup(asset_id: str) -> tuple[AssetType, AssetCategory, str, str]:
            raise RuntimeError("lookup failed")

        aggregator = DetectionAggregator(asset_lookup=bad_lookup)
        result = _make_result()
        output = aggregator.aggregate([result])

        assert len(output.findings) == 1
        assert output.findings[0].asset_type == AssetType.UNKNOWN


# ── Tests: AggregationResult Serialization ───────────────────────────────────


class TestSerialization:
    """Tests for serialization of aggregation results."""

    def test_finding_to_dict(self, aggregator: DetectionAggregator) -> None:
        """DetectionFinding serializes correctly."""
        result = _make_result()
        output = aggregator.aggregate([result])
        finding = output.findings[0]
        data = finding.to_dict()

        assert data["finding_id"] == finding.finding_id
        assert data["asset_id"] == finding.asset_id
        assert data["severity"] == finding.severity.value
        assert "confidence" in data
        assert "safety" in data

    def test_group_to_dict(self, aggregator: DetectionAggregator) -> None:
        """FindingGroup serializes correctly."""
        result = _make_result()
        output = aggregator.aggregate([result])
        group = output.groups[0]
        data = group.to_dict()

        assert data["group_by"] == group.group_by
        assert data["count"] == group.count
        assert "findings" in data

    def test_summary_to_dict(self, aggregator: DetectionAggregator) -> None:
        """DetectionSummary serializes correctly."""
        result = _make_result()
        output = aggregator.aggregate([result])
        summary = output.summary
        data = summary.to_dict()

        assert data["total_findings"] == 1
        assert "findings_by_severity" in data
        assert "size_by_category" in data

    def test_aggregation_result_to_dict(self, aggregator: DetectionAggregator) -> None:
        """AggregationResult serializes correctly."""
        result = _make_result()
        output = aggregator.aggregate([result])
        data = output.to_dict()

        assert "findings" in data
        assert "groups" in data
        assert "summary" in data


# ── Tests: Immutability ──────────────────────────────────────────────────────


class TestImmutability:
    """Tests ensuring aggregation layer is read-only."""

    def test_findings_are_frozen(self, aggregator: DetectionAggregator) -> None:
        """DetectionFinding is immutable."""
        result = _make_result()
        output = aggregator.aggregate([result])
        finding = output.findings[0]

        with pytest.raises(dataclasses.FrozenInstanceError):
            finding.finding_id = "new-id"  # type: ignore[misc]

    def test_summary_is_frozen(self, aggregator: DetectionAggregator) -> None:
        """DetectionSummary is immutable."""
        result = _make_result()
        output = aggregator.aggregate([result])

        with pytest.raises(dataclasses.FrozenInstanceError):
            output.summary.total_findings = 999  # type: ignore[misc]

    def test_groups_are_frozen(self, aggregator: DetectionAggregator) -> None:
        """FindingGroup is immutable."""
        result = _make_result()
        output = aggregator.aggregate([result])
        group = output.groups[0]

        with pytest.raises(dataclasses.FrozenInstanceError):
            group.group_value = "new-value"  # type: ignore[misc]


# ── Tests: Fixable / Blocked / Review ────────────────────────────────────────


class TestSafetyCounts:
    """Tests for fixable, blocked, and review-required counts."""

    def test_fixable_findings_count(self, aggregator: DetectionAggregator) -> None:
        """Fixable findings are correctly counted."""
        results = [
            _make_result(asset_id="a1", rule_id="r1", safety_level=SafetyLevel.SAFE),
            _make_result(
                asset_id="a2", rule_id="r2", safety_level=SafetyLevel.LOW_RISK
            ),
            _make_result(asset_id="a3", rule_id="r3", safety_level=SafetyLevel.BLOCKED),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.fixable_findings == 2
        assert output.summary.blocked_findings == 1
        assert output.summary.review_required_findings == 0

    def test_review_required_count(self, aggregator: DetectionAggregator) -> None:
        """Review-required findings are counted correctly."""
        results = [
            _make_result(
                asset_id="a1", rule_id="r1", safety_level=SafetyLevel.REVIEW_REQUIRED
            ),
            _make_result(
                asset_id="a2", rule_id="r2", safety_level=SafetyLevel.REVIEW_REQUIRED
            ),
            _make_result(
                asset_id="a3", rule_id="r3", safety_level=SafetyLevel.HIGH_RISK
            ),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.review_required_findings == 2
        assert output.summary.fixable_findings == 0

    def test_high_risk_not_actionable(self, aggregator: DetectionAggregator) -> None:
        """HIGH_RISK is not counted as fixable."""
        results = [_make_result(safety_level=SafetyLevel.HIGH_RISK)]
        output = aggregator.aggregate(results)

        assert output.summary.fixable_findings == 0
        assert output.summary.blocked_findings == 0
        assert output.summary.review_required_findings == 0


# ── Tests: Category Aggregation ──────────────────────────────────────────────


class TestCategoryAggregation:
    """Tests for category-level aggregation."""

    def test_findings_by_category(self, aggregator: DetectionAggregator) -> None:
        """Findings are counted by category."""
        results = [
            _make_result(asset_id="a1", rule_id="junk.temp.application"),
            _make_result(asset_id="a2", rule_id="junk.temp.application"),
            _make_result(asset_id="a3", rule_id="cache.application"),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.findings_by_category.get("junk") == 2
        assert output.summary.findings_by_category.get("cache") == 1

    def test_size_by_category(self, aggregator: DetectionAggregator) -> None:
        """Size is aggregated by category."""
        results = [
            _make_result(rule_id="junk.temp.application", estimated_size=100),
            _make_result(rule_id="cache.application", estimated_size=200),
        ]
        output = aggregator.aggregate(results)

        assert output.summary.size_by_category.get("junk") == 100
        assert output.summary.size_by_category.get("cache") == 200
