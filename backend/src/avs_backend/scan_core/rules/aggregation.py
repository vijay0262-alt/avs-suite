"""
SC-8C3 Part 1 — Detection Result Aggregation Layer

Converts raw RuleResults into trusted, deterministic, user-facing
detection findings.

Architecture:
  RuleEvaluator -> RuleResults -> DetectionAggregator -> DetectionFindings

This layer:
- NEVER modifies system state
- NEVER executes cleanup or actions
- NEVER calls cleaners, optimizer, or Electron APIs
- ONLY reads RuleResults and produces aggregated domain objects
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Callable, Optional

from .confidence import Confidence
from .enums import RuleCategory, Severity
from .evidence import EvidenceCollection
from .result import RuleMatchStatus, RuleResult
from .safety import SafetyAssessment

if TYPE_CHECKING:
    from ..assets import AssetCategory, AssetType


# ── Type Aliases ──────────────────────────────────────────────────────────────

AssetLookup = Callable[
    [str],
    tuple["AssetType", "AssetCategory", str, str],
]
"""
Resolve asset metadata from asset_id.

Returns (asset_type, asset_category, display_name, canonical_path).
"""

RuleCategoryResolver = Callable[[str], RuleCategory]
"""
Resolve rule category from rule_id.

Returns RuleCategory for grouping purposes.
"""


# ── Domain Models ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class DetectionFinding:
    """
    A single, deduplicated detection finding.

    Produced by aggregating one or more RuleResults.
    Preserves all original assessment data from the source RuleResult.
    """

    # ── Deterministic Identity ────────────────────────────────────────────
    finding_id: str

    # ── Asset Identity ────────────────────────────────────────────────────
    asset_id: str
    asset_type: "AssetType"
    asset_category: "AssetCategory"
    display_name: str
    canonical_path: str

    # ── Rule Identity ─────────────────────────────────────────────────────
    rule_id: str
    rule_version: str
    rule_category: RuleCategory

    # ── Assessment (copied verbatim from RuleResult) ──────────────────────
    status: RuleMatchStatus
    severity: Severity
    confidence: Confidence
    safety: SafetyAssessment
    reason: str
    evidence: EvidenceCollection
    recommended_action: Any  # ActionType — avoid circular import

    # ── Size ──────────────────────────────────────────────────────────────
    estimated_size: Optional[int]

    # ── Provenance ────────────────────────────────────────────────────────
    detected_at: datetime
    source_result: RuleResult = field(repr=False)

    @property
    def is_blocked(self) -> bool:
        """Check if action is blocked."""
        return self.safety.is_blocked

    @property
    def requires_review(self) -> bool:
        """Check if action requires manual review."""
        return self.safety.requires_review

    @property
    def is_actionable(self) -> bool:
        """Check if action can be performed (SAFE or LOW_RISK)."""
        return self.safety.is_actionable

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "finding_id": self.finding_id,
            "asset_id": self.asset_id,
            "asset_type": self.asset_type.value,
            "asset_category": self.asset_category.value,
            "display_name": self.display_name,
            "canonical_path": self.canonical_path,
            "rule_id": self.rule_id,
            "rule_version": self.rule_version,
            "rule_category": self.rule_category.value,
            "status": self.status.value,
            "severity": self.severity.value,
            "confidence": self.confidence.to_dict(),
            "safety": self.safety.to_dict(),
            "reason": self.reason,
            "evidence": self.evidence.to_dict(),
            "recommended_action": self.recommended_action.value,
            "estimated_size": self.estimated_size,
            "detected_at": self.detected_at.isoformat(),
            "is_blocked": self.is_blocked,
            "requires_review": self.requires_review,
            "is_actionable": self.is_actionable,
        }


@dataclass(frozen=True)
class FindingGroup:
    """
    Presentation/aggregation structure for a group of findings.

    Groups are READ-ONLY and must NOT make security or cleanup decisions.
    """

    group_by: str
    group_value: str
    findings: tuple[DetectionFinding, ...]

    def __post_init__(self) -> None:
        """Ensure findings is always a tuple."""
        if isinstance(object.__getattribute__(self, "findings"), list):
            object.__setattr__(self, "findings", tuple(self.findings))

    @property
    def count(self) -> int:
        """Number of findings in this group."""
        return len(self.findings)

    @property
    def total_size(self) -> Optional[int]:
        """
        Total affected size for this group.

        Returns None if any finding has unknown size.
        """
        known_sizes = [
            f.estimated_size for f in self.findings if f.estimated_size is not None
        ]
        if len(known_sizes) != len(self.findings):
            return None
        return sum(known_sizes)

    @property
    def unique_assets(self) -> int:
        """Number of unique assets in this group."""
        return len({f.asset_id for f in self.findings})

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "group_by": self.group_by,
            "group_value": self.group_value,
            "count": self.count,
            "unique_assets": self.unique_assets,
            "total_size": self.total_size,
            "findings": [f.to_dict() for f in self.findings],
        }


@dataclass(frozen=True)
class DetectionSummary:
    """
    Aggregated statistics derived from actual findings.

    All values are computed from the underlying findings.
    No statistics are fabricated.
    """

    # ── Counts ────────────────────────────────────────────────────────────
    total_findings: int
    unique_assets: int

    # ── Size ──────────────────────────────────────────────────────────────
    total_known_size: int
    total_unknown_size_count: int
    total_size: Optional[int]

    size_by_category: dict[str, Optional[int]]
    size_by_severity: dict[str, Optional[int]]
    size_by_rule: dict[str, Optional[int]]

    # ── Counts by Dimension ───────────────────────────────────────────────
    findings_by_category: dict[str, int]
    findings_by_severity: dict[str, int]
    findings_by_safety: dict[str, int]
    findings_by_confidence: dict[str, int]

    # ── Special Counts ────────────────────────────────────────────────────
    fixable_findings: int
    blocked_findings: int
    review_required_findings: int

    # ── Provenance ────────────────────────────────────────────────────────
    generated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "total_findings": self.total_findings,
            "unique_assets": self.unique_assets,
            "total_known_size": self.total_known_size,
            "total_unknown_size_count": self.total_unknown_size_count,
            "total_size": self.total_size,
            "size_by_category": dict(self.size_by_category),
            "size_by_severity": dict(self.size_by_severity),
            "size_by_rule": dict(self.size_by_rule),
            "findings_by_category": dict(self.findings_by_category),
            "findings_by_severity": dict(self.findings_by_severity),
            "findings_by_safety": dict(self.findings_by_safety),
            "findings_by_confidence": dict(self.findings_by_confidence),
            "fixable_findings": self.fixable_findings,
            "blocked_findings": self.blocked_findings,
            "review_required_findings": self.review_required_findings,
            "generated_at": self.generated_at.isoformat(),
        }


@dataclass(frozen=True)
class AggregationResult:
    """
    Complete result of detection aggregation.

    Contains all findings, groups, and summary statistics.
    """

    findings: tuple[DetectionFinding, ...]
    groups: tuple[FindingGroup, ...]
    summary: DetectionSummary

    def __post_init__(self) -> None:
        """Ensure collections are tuples."""
        if isinstance(object.__getattribute__(self, "findings"), list):
            object.__setattr__(self, "findings", tuple(self.findings))
        if isinstance(object.__getattribute__(self, "groups"), list):
            object.__setattr__(self, "groups", tuple(self.groups))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "findings": [f.to_dict() for f in self.findings],
            "groups": [g.to_dict() for g in self.groups],
            "summary": self.summary.to_dict(),
        }


# ── Aggregator ────────────────────────────────────────────────────────────────


class DetectionAggregator:
    """
    Converts raw RuleResults into trusted, deterministic detection findings.

    Guarantees:
    - Deterministic identity: same asset+rule+version -> same finding_id
    - Deterministic deduplication: no duplicates within a batch
    - Deterministic ordering: sorted by (asset_id, rule_id, rule_version)
    - Deterministic grouping: sorted group keys and findings
    - Immutability: all output objects are frozen/read-only
    - Safety preservation: severity, confidence, safety copied verbatim

    Does NOT:
    - Modify system state
    - Execute cleanup or actions
    - Call cleaners, optimizer, or Electron APIs
    """

    def __init__(
        self,
        asset_lookup: Optional[AssetLookup] = None,
        rule_category_resolver: Optional[RuleCategoryResolver] = None,
    ) -> None:
        """
        Initialize aggregator.

        Args:
            asset_lookup: Optional callable to resolve asset metadata from asset_id.
                          Required for grouping by asset type/category.
            rule_category_resolver: Optional callable to resolve rule category
                                    from rule_id. Required for grouping by category.
        """
        self._asset_lookup = asset_lookup
        self._rule_category_resolver = rule_category_resolver

    def aggregate(self, rule_results: list[RuleResult]) -> AggregationResult:
        """
        Aggregate RuleResults into findings, groups, and summary.

        Args:
            rule_results: Raw rule evaluation results.

        Returns:
            AggregationResult with findings, groups, and summary.
        """
        # Step 1: Filter to matched results only
        matched = [r for r in rule_results if r.matched]

        # Step 2: Deterministic deduplication by (asset_id, rule_id, rule_version)
        deduped: dict[tuple[str, str, str], RuleResult] = {}
        for result in matched:
            key = (result.asset_id, result.rule_id, result.rule_version)
            if key not in deduped:
                deduped[key] = result

        # Step 3: Build findings
        findings_list: list[DetectionFinding] = []
        for result in deduped.values():
            finding = self._build_finding(result)
            findings_list.append(finding)

        # Step 4: Sort deterministically
        findings_list.sort(key=lambda f: (f.asset_id, f.rule_id, f.rule_version))
        findings_tuple = tuple(findings_list)

        # Step 5: Build groups
        groups = self._build_groups(findings_tuple)

        # Step 6: Build summary
        summary = self._build_summary(findings_tuple)

        return AggregationResult(
            findings=findings_tuple,
            groups=groups,
            summary=summary,
        )

    def _build_finding(self, result: RuleResult) -> DetectionFinding:
        """
        Build a single DetectionFinding from a RuleResult.
        """
        asset_type, asset_category, display_name, canonical_path = self._resolve_asset(
            result.asset_id
        )
        rule_category = self._resolve_rule_category(result.rule_id)
        finding_id = self._build_finding_id(result)

        return DetectionFinding(
            finding_id=finding_id,
            asset_id=result.asset_id,
            asset_type=asset_type,
            asset_category=asset_category,
            display_name=display_name,
            canonical_path=canonical_path,
            rule_id=result.rule_id,
            rule_version=result.rule_version,
            rule_category=rule_category,
            status=result.status,
            severity=result.severity,
            confidence=result.confidence,
            safety=result.safety,
            reason=result.reason,
            evidence=result.evidence,
            recommended_action=result.recommended_action,
            estimated_size=result.estimated_size,
            detected_at=result.evaluated_at,
            source_result=result,
        )

    def _build_finding_id(self, result: RuleResult) -> str:
        """
        Build deterministic finding identity.

        Format: asset_id|rule_id|rule_version

        This ensures identical inputs always produce identical IDs.
        """
        return f"{result.asset_id}|{result.rule_id}|{result.rule_version}"

    def _resolve_asset(
        self, asset_id: str
    ) -> tuple["AssetType", "AssetCategory", str, str]:
        """
        Resolve asset metadata.

        Falls back to UNKNOWN if no lookup is configured.
        """
        if self._asset_lookup is not None:
            try:
                return self._asset_lookup(asset_id)
            except Exception:
                pass

        from ..assets.asset_types import AssetCategory, AssetType

        return (
            AssetType.UNKNOWN,
            AssetCategory.UNKNOWN,
            f"Unknown Asset ({asset_id[:8]})",
            "",
        )

    def _resolve_rule_category(self, rule_id: str) -> RuleCategory:
        """
        Resolve rule category.

        Falls back to CUSTOM if no resolver is configured.
        """
        if self._rule_category_resolver is not None:
            try:
                return self._rule_category_resolver(rule_id)
            except Exception:
                pass

        # Attempt heuristic from rule_id prefix
        prefix = rule_id.split(".")[0].lower()
        mapping = {
            "junk": RuleCategory.JUNK,
            "cache": RuleCategory.CACHE,
            "temporary": RuleCategory.TEMPORARY,
            "temp": RuleCategory.TEMPORARY,
            "privacy": RuleCategory.PRIVACY,
            "registry": RuleCategory.REGISTRY,
            "startup": RuleCategory.STARTUP,
            "browser": RuleCategory.BROWSER,
            "performance": RuleCategory.PERFORMANCE,
            "security": RuleCategory.SECURITY,
            "system": RuleCategory.SYSTEM,
            "network": RuleCategory.NETWORK,
            "suspicious": RuleCategory.SUSPICIOUS,
        }
        return mapping.get(prefix, RuleCategory.CUSTOM)

    def _build_groups(
        self, findings: tuple[DetectionFinding, ...]
    ) -> tuple[FindingGroup, ...]:
        """
        Build deterministic groups by category, severity, rule, and asset type.
        """
        group_keys = ["rule_category", "severity", "rule_id", "asset_type"]
        groups: list[FindingGroup] = []

        for group_by in group_keys:
            bucket: dict[str, list[DetectionFinding]] = {}
            for finding in findings:
                key = self._get_group_key(finding, group_by)
                bucket.setdefault(key, []).append(finding)

            for group_value in sorted(bucket.keys()):
                group_findings = tuple(bucket[group_value])
                groups.append(
                    FindingGroup(
                        group_by=group_by,
                        group_value=group_value,
                        findings=group_findings,
                    )
                )

        return tuple(groups)

    def _get_group_key(self, finding: DetectionFinding, group_by: str) -> str:
        """Get string value for a grouping dimension."""
        if group_by == "rule_category":
            return finding.rule_category.value
        if group_by == "severity":
            return finding.severity.value
        if group_by == "rule_id":
            return finding.rule_id
        if group_by == "asset_type":
            return finding.asset_type.value
        return "unknown"

    def _build_summary(
        self, findings: tuple[DetectionFinding, ...]
    ) -> DetectionSummary:
        """
        Build summary statistics from findings.
        """
        total_findings = len(findings)
        unique_assets = len({f.asset_id for f in findings})

        # Size accounting
        known_sizes = [
            f.estimated_size for f in findings if f.estimated_size is not None
        ]
        unknown_count = total_findings - len(known_sizes)
        total_known = sum(known_sizes) if known_sizes else 0
        total_size: Optional[int] = None if unknown_count > 0 else total_known

        size_by_category = self._aggregate_size_by(
            findings, lambda f: f.rule_category.value
        )
        size_by_severity = self._aggregate_size_by(findings, lambda f: f.severity.value)
        size_by_rule = self._aggregate_size_by(findings, lambda f: f.rule_id)

        findings_by_category = self._count_by(findings, lambda f: f.rule_category.value)
        findings_by_severity = self._count_by(findings, lambda f: f.severity.value)
        findings_by_safety = self._count_by(findings, lambda f: f.safety.level.value)
        findings_by_confidence = self._count_by(findings, lambda f: f.confidence.level)

        fixable_findings = sum(1 for f in findings if f.is_actionable)
        blocked_findings = sum(1 for f in findings if f.is_blocked)
        review_required_findings = sum(1 for f in findings if f.requires_review)

        return DetectionSummary(
            total_findings=total_findings,
            unique_assets=unique_assets,
            total_known_size=total_known,
            total_unknown_size_count=unknown_count,
            total_size=total_size,
            size_by_category=size_by_category,
            size_by_severity=size_by_severity,
            size_by_rule=size_by_rule,
            findings_by_category=findings_by_category,
            findings_by_severity=findings_by_severity,
            findings_by_safety=findings_by_safety,
            findings_by_confidence=findings_by_confidence,
            fixable_findings=fixable_findings,
            blocked_findings=blocked_findings,
            review_required_findings=review_required_findings,
            generated_at=datetime.now(UTC),
        )

    def _aggregate_size_by(
        self,
        findings: tuple[DetectionFinding, ...],
        key_func: Callable[[DetectionFinding], str],
    ) -> dict[str, Optional[int]]:
        """
        Aggregate size by a dimension.

        Returns dict mapping dimension value to total size.
        If any finding in a group has unknown size, that group's size is None.
        """
        buckets: dict[str, list[Optional[int]]] = {}
        for finding in findings:
            key = key_func(finding)
            buckets.setdefault(key, []).append(finding.estimated_size)

        result: dict[str, Optional[int]] = {}
        for key, sizes in sorted(buckets.items()):
            known = [s for s in sizes if s is not None]
            if len(known) != len(sizes):
                result[key] = None
            else:
                result[key] = sum(known)
        return result

    def _count_by(
        self,
        findings: tuple[DetectionFinding, ...],
        key_func: Callable[[DetectionFinding], str],
    ) -> dict[str, int]:
        """Count findings by a dimension."""
        counts: dict[str, int] = {}
        for finding in findings:
            key = key_func(finding)
            counts[key] = counts.get(key, 0) + 1
        return dict(sorted(counts.items()))
