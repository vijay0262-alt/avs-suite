"""
SC-8C3 Part 2 — Finding Prioritization + Fixability Contracts

Extends the aggregation layer with deterministic priority scoring,
fixability classification, and actionability contracts.

Architecture:
  RuleResults -> Aggregation -> [Prioritization + Fixability] -> Future Action Engine

This layer:
- NEVER modifies system state
- NEVER executes cleanup or actions
- NEVER calls cleaners, optimizer, or Electron APIs
- ONLY reads AggregationResult and produces prioritized domain objects
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable, Optional

from .aggregation import AggregationResult, DetectionFinding
from .enums import RuleCategory, SafetyLevel, Severity
from .safety import SafetyAssessment

if TYPE_CHECKING:
    pass


# ── Type Aliases ──────────────────────────────────────────────────────────────

RuleCapabilityResolver = Callable[[str], "RuleCapability"]
"""
Resolve rule capability from rule_id.

Returns RuleCapability describing whether the rule has a future
remediation strategy.
"""

AssetSizeResolver = Callable[[str], Optional[int]]
"""
Resolve asset size from asset_id.

Returns estimated size in bytes, or None if unknown.
"""


# ── Enumerations ──────────────────────────────────────────────────────────────


class RuleCapability(Enum):
    """
    Describes whether a rule has a future remediation strategy.

    This is a CONTRACT ONLY — it does NOT connect to actual cleaners.
    """

    NO_REMEDIATION = "no_remediation"
    REMEDIATION_AVAILABLE = "remediation_available"
    REVIEW_REQUIRED = "review_required"


class Fixability(Enum):
    """
    Fixability state of a detection finding.

    Derived from SafetyAssessment + RuleCapability.
    """

    AUTO_FIXABLE = "auto_fixable"
    REVIEW_REQUIRED = "review_required"
    BLOCKED = "blocked"
    NOT_FIXABLE = "not_fixable"
    UNKNOWN = "unknown"


# ── Severity Priority Mapping ─────────────────────────────────────────────────

# Deterministic severity scores.
# Higher = more important.
# Documented weights: critical issues demand immediate attention,
# high issues are serious, medium are notable, low are minor,
# info are purely informational.
SEVERITY_PRIORITY_SCORE: dict[Severity, int] = {
    Severity.CRITICAL: 100,
    Severity.HIGH: 80,
    Severity.MEDIUM: 60,
    Severity.LOW: 40,
    Severity.INFO: 20,
}

SEVERITY_ORDER: dict[Severity, int] = {
    Severity.CRITICAL: 0,
    Severity.HIGH: 1,
    Severity.MEDIUM: 2,
    Severity.LOW: 3,
    Severity.INFO: 4,
}

# ── Safety Modifier Mapping ───────────────────────────────────────────────────

# Deterministic safety modifiers.
# SAFE findings are fully eligible for action.
# LOW_RISK findings are nearly as eligible.
# REVIEW_REQUIRED findings are eligible but need human approval.
# HIGH_RISK findings are poorly eligible.
# BLOCKED findings are ineligible.
SAFETY_PRIORITY_MODIFIER: dict[str, float] = {
    "safe": 1.0,
    "low_risk": 0.9,
    "review_required": 0.5,
    "high_risk": 0.3,
    "blocked": 0.1,
}

# ── Category Priority Bonus ───────────────────────────────────────────────────

# Small deterministic bonus for categories that typically represent
# higher-impact or higher-visibility findings.
CATEGORY_PRIORITY_BONUS: dict[RuleCategory, int] = {
    RuleCategory.SECURITY: 10,
    RuleCategory.SYSTEM: 8,
    RuleCategory.SUSPICIOUS: 8,
    RuleCategory.PERFORMANCE: 5,
    RuleCategory.JUNK: 2,
    RuleCategory.CACHE: 1,
    RuleCategory.STARTUP: 3,
    RuleCategory.BROWSER: 2,
    RuleCategory.PRIVACY: 4,
    RuleCategory.REGISTRY: 3,
    RuleCategory.NETWORK: 4,
    RuleCategory.TEMPORARY: 1,
    RuleCategory.CUSTOM: 0,
}

# ── Priority Constants ────────────────────────────────────────────────────────

# Size bonus: log10(size + 1) * multiplier, capped at max.
SIZE_BONUS_MULTIPLIER = 5.0
SIZE_BONUS_CAP = 20

# Confidence is already 0-100 from the Confidence model.


# ── Domain Models ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class FindingPriority:
    """
    Priority assessment for a single detection finding.

    Priority is a DERIVED presentation/workflow value.
    It must NOT replace severity, confidence, or safety.
    """

    finding: DetectionFinding
    priority_score: float
    fixability: Fixability
    is_blocked: bool
    requires_review: bool
    is_actionable: bool
    is_auto_fixable: bool
    is_fixable: bool
    rule_capability: RuleCapability
    computed_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "finding_id": self.finding.finding_id,
            "priority_score": self.priority_score,
            "fixability": self.fixability.value,
            "is_blocked": self.is_blocked,
            "requires_review": self.requires_review,
            "is_actionable": self.is_actionable,
            "is_auto_fixable": self.is_auto_fixable,
            "is_fixable": self.is_fixable,
            "rule_capability": self.rule_capability.value,
            "computed_at": self.computed_at.isoformat(),
        }


@dataclass(frozen=True)
class PrioritizedSummary:
    """
    Extended summary with priority and fixability counts.

    All values are derived from actual findings.
    No statistics are fabricated.
    """

    # ── Base counts (from DetectionSummary) ────────────────────────────────
    total_findings: int
    unique_assets: int
    total_known_size: int
    total_unknown_size_count: int
    total_size: Optional[int]

    size_by_category: dict[str, Optional[int]]
    size_by_severity: dict[str, Optional[int]]
    size_by_rule: dict[str, Optional[int]]

    findings_by_category: dict[str, int]
    findings_by_severity: dict[str, int]
    findings_by_safety: dict[str, int]
    findings_by_confidence: dict[str, int]

    fixable_findings: int
    blocked_findings: int
    review_required_findings: int

    # ── Priority counts ────────────────────────────────────────────────────
    auto_fixable_findings: int
    review_required_fixability: int
    blocked_fixability: int
    not_fixable_findings: int
    unknown_fixability: int

    # ── Extremes ──────────────────────────────────────────────────────────
    highest_priority_finding_id: Optional[str]
    highest_severity_finding_id: Optional[str]
    largest_affected_finding_id: Optional[str]

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
            "auto_fixable_findings": self.auto_fixable_findings,
            "review_required_fixability": self.review_required_fixability,
            "blocked_fixability": self.blocked_fixability,
            "not_fixable_findings": self.not_fixable_findings,
            "unknown_fixability": self.unknown_fixability,
            "highest_priority_finding_id": self.highest_priority_finding_id,
            "highest_severity_finding_id": self.highest_severity_finding_id,
            "largest_affected_finding_id": self.largest_affected_finding_id,
            "generated_at": self.generated_at.isoformat(),
        }


@dataclass(frozen=True)
class PrioritizedResult:
    """
    Complete result of finding prioritization.

    Contains prioritized findings and extended summary.
    """

    priorities: tuple[FindingPriority, ...]
    summary: PrioritizedSummary

    def __post_init__(self) -> None:
        """Ensure collections are tuples."""
        if isinstance(object.__getattribute__(self, "priorities"), list):
            object.__setattr__(self, "priorities", tuple(self.priorities))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "priorities": [p.to_dict() for p in self.priorities],
            "summary": self.summary.to_dict(),
        }


# ── Prioritizer ───────────────────────────────────────────────────────────────


class FindingPrioritizer:
    """
    Computes deterministic priority scores and fixability for findings.

    Guarantees:
    - Deterministic priority: identical findings → identical scores
    - Deterministic ordering: stable sort with explicit tiebreakers
    - Safety preservation: SafetyAssessment remains authoritative
    - Immutability: all output objects are frozen/read-only
    - Zero system modification

    Does NOT:
    - Modify system state
    - Execute cleanup or actions
    - Call cleaners, optimizer, or Electron APIs
    """

    def __init__(
        self,
        rule_capability_resolver: Optional[RuleCapabilityResolver] = None,
        asset_size_resolver: Optional[AssetSizeResolver] = None,
    ) -> None:
        """
        Initialize prioritizer.

        Args:
            rule_capability_resolver: Optional callable to resolve rule
                capability from rule_id. Falls back to NO_REMEDIATION.
            asset_size_resolver: Optional callable to resolve asset size
                from asset_id. Falls back to estimated_size from finding.
        """
        self._rule_capability_resolver = rule_capability_resolver
        self._asset_size_resolver = asset_size_resolver

    def prioritize(self, result: AggregationResult) -> PrioritizedResult:
        """
        Prioritize findings from an AggregationResult.

        Args:
            result: AggregationResult from DetectionAggregator.

        Returns:
            PrioritizedResult with prioritized findings and extended summary.
        """
        # Step 1: Compute priority for each finding
        priorities_list: list[FindingPriority] = []
        for finding in result.findings:
            priority = self._compute_priority(finding)
            priorities_list.append(priority)

        # Step 2: Sort deterministically with tiebreakers
        priorities_list.sort(key=self._priority_sort_key)
        priorities_tuple = tuple(priorities_list)

        # Step 3: Build extended summary
        summary = self._build_prioritized_summary(result, priorities_tuple)

        return PrioritizedResult(
            priorities=priorities_tuple,
            summary=summary,
        )

    def _compute_priority(self, finding: DetectionFinding) -> FindingPriority:
        """
        Compute priority score and fixability for a single finding.
        """
        rule_capability = self._resolve_rule_capability(finding.rule_id)
        fixability = self._derive_fixability(finding.safety, rule_capability)
        is_blocked = finding.safety.is_blocked
        requires_review = finding.safety.requires_review
        is_actionable = self._compute_is_actionable(finding.safety, fixability)
        is_auto_fixable = self._compute_is_auto_fixable(finding.safety, fixability)
        is_fixable = self._compute_is_fixable(fixability)

        priority_score = self._compute_priority_score(
            finding=finding,
            fixability=fixability,
            rule_capability=rule_capability,
        )

        return FindingPriority(
            finding=finding,
            priority_score=priority_score,
            fixability=fixability,
            is_blocked=is_blocked,
            requires_review=requires_review,
            is_actionable=is_actionable,
            is_auto_fixable=is_auto_fixable,
            is_fixable=is_fixable,
            rule_capability=rule_capability,
            computed_at=datetime.now(UTC),
        )

    def _compute_priority_score(
        self,
        finding: DetectionFinding,
        fixability: Fixability,
        rule_capability: RuleCapability,
    ) -> float:
        """
        Compute deterministic priority score.

        Formula:
          base = SEVERITY_PRIORITY_SCORE[severity]
          confidence_mod = confidence.score / 100
          safety_mod = SAFETY_PRIORITY_MODIFIER[safety.level.value]
          size_bonus = min(log10(size + 1) * 5, 20)  [if size known]
          category_bonus = CATEGORY_PRIORITY_BONUS[rule_category]

          score = base * confidence_mod * safety_mod + size_bonus + category_bonus
        """
        base = float(SEVERITY_PRIORITY_SCORE[finding.severity])
        confidence_mod = finding.confidence.score / 100.0
        safety_mod = SAFETY_PRIORITY_MODIFIER[finding.safety.level.value]

        size_bonus = 0.0
        size = self._resolve_size(finding)
        if size is not None and size > 0:
            size_bonus = min(
                math.log10(float(size) + 1.0) * SIZE_BONUS_MULTIPLIER, SIZE_BONUS_CAP
            )

        category_bonus = float(CATEGORY_PRIORITY_BONUS[finding.rule_category])

        return base * confidence_mod * safety_mod + size_bonus + category_bonus

    def _derive_fixability(
        self, safety: SafetyAssessment, rule_capability: RuleCapability
    ) -> Fixability:
        """
        Derive fixability from safety assessment and rule capability.

        SafetyAssessment is authoritative:
        - BLOCKED safety → BLOCKED fixability
        - REVIEW_REQUIRED safety → REVIEW_REQUIRED fixability
        - HIGH_RISK safety → NOT_FIXABLE
        - SAFE/LOW_RISK → depends on rule capability
        """
        if safety.is_blocked:
            return Fixability.BLOCKED
        if safety.requires_review:
            return Fixability.REVIEW_REQUIRED
        if safety.level == SafetyLevel.HIGH_RISK:
            return Fixability.NOT_FIXABLE
        # SAFE or LOW_RISK
        if rule_capability == RuleCapability.REMEDIATION_AVAILABLE:
            return Fixability.AUTO_FIXABLE
        if rule_capability == RuleCapability.REVIEW_REQUIRED:
            return Fixability.REVIEW_REQUIRED
        return Fixability.NOT_FIXABLE

    def _compute_is_actionable(
        self, safety: SafetyAssessment, fixability: Fixability
    ) -> bool:
        """
        Compute is_actionable.

        Actionable means the finding can potentially be acted upon.
        Safety is authoritative: blocked or review-required safety
        is never actionable regardless of fixability.
        """
        if safety.is_blocked or safety.requires_review:
            return False
        return fixability in (Fixability.AUTO_FIXABLE, Fixability.REVIEW_REQUIRED)

    def _compute_is_auto_fixable(
        self, safety: SafetyAssessment, fixability: Fixability
    ) -> bool:
        """
        Compute is_auto_fixable.

        Auto-fixable means the finding can be acted upon automatically
        without human review.
        """
        if safety.is_blocked or safety.requires_review:
            return False
        return fixability == Fixability.AUTO_FIXABLE

    def _compute_is_fixable(self, fixability: Fixability) -> bool:
        """
        Compute is_fixable.

        Fixable means the finding has a remediation path, either
        automatic or manual.
        """
        return fixability in (Fixability.AUTO_FIXABLE, Fixability.REVIEW_REQUIRED)

    def _resolve_rule_capability(self, rule_id: str) -> RuleCapability:
        """
        Resolve rule capability.

        Falls back to NO_REMEDIATION if no resolver is configured.
        """
        if self._rule_capability_resolver is not None:
            try:
                return self._rule_capability_resolver(rule_id)
            except Exception:
                pass
        return RuleCapability.NO_REMEDIATION

    def _resolve_size(self, finding: DetectionFinding) -> Optional[int]:
        """
        Resolve asset size.

        Uses asset_size_resolver if available, otherwise falls back
        to finding.estimated_size.
        """
        if self._asset_size_resolver is not None:
            try:
                size = self._asset_size_resolver(finding.asset_id)
                if size is not None:
                    return size
            except Exception:
                pass
        return finding.estimated_size

    def _priority_sort_key(self, priority: FindingPriority) -> tuple:
        """
        Build deterministic sort key for priority ordering.

        Tiebreakers (applied in order):
          1. priority_score (descending → negate)
          2. severity order (descending → negate)
          3. confidence score (descending → negate)
          4. affected size (descending → negate, None last)
          5. category alphabetical (ascending)
          6. rule_id alphabetical (ascending)
          7. asset_id alphabetical (ascending)
        """
        f = priority.finding
        size = self._resolve_size(f)
        size_key = -float(size) if size is not None else float("inf")

        return (
            -priority.priority_score,
            -SEVERITY_ORDER[f.severity],
            -f.confidence.score,
            size_key,
            f.rule_category.value,
            f.rule_id,
            f.asset_id,
        )

    def _build_prioritized_summary(
        self,
        result: AggregationResult,
        priorities: tuple[FindingPriority, ...],
    ) -> PrioritizedSummary:
        """
        Build extended summary with priority and fixability counts.
        """
        total_findings = len(priorities)
        unique_assets = len({p.finding.asset_id for p in priorities})

        # Base counts from original summary
        base = result.summary

        # Fixability counts
        auto_fixable = sum(1 for p in priorities if p.is_auto_fixable)
        review_req_fix = sum(
            1 for p in priorities if p.requires_review and not p.is_blocked
        )
        blocked_fix = sum(1 for p in priorities if p.is_blocked)
        not_fixable = sum(
            1 for p in priorities if p.fixability == Fixability.NOT_FIXABLE
        )
        unknown_fix = sum(1 for p in priorities if p.fixability == Fixability.UNKNOWN)

        # Extremes
        highest_priority_id = self._find_extreme_finding_id(
            priorities, lambda p: -p.priority_score
        )
        highest_severity_id = self._find_extreme_finding_id(
            priorities, lambda p: -SEVERITY_ORDER[p.finding.severity]
        )
        largest_affected_id = self._find_extreme_finding_id(
            priorities,
            lambda p: -(self._resolve_size(p.finding) or 0),
        )

        return PrioritizedSummary(
            total_findings=total_findings,
            unique_assets=unique_assets,
            total_known_size=base.total_known_size,
            total_unknown_size_count=base.total_unknown_size_count,
            total_size=base.total_size,
            size_by_category=base.size_by_category,
            size_by_severity=base.size_by_severity,
            size_by_rule=base.size_by_rule,
            findings_by_category=base.findings_by_category,
            findings_by_severity=base.findings_by_severity,
            findings_by_safety=base.findings_by_safety,
            findings_by_confidence=base.findings_by_confidence,
            fixable_findings=base.fixable_findings,
            blocked_findings=base.blocked_findings,
            review_required_findings=base.review_required_findings,
            auto_fixable_findings=auto_fixable,
            review_required_fixability=review_req_fix,
            blocked_fixability=blocked_fix,
            not_fixable_findings=not_fixable,
            unknown_fixability=unknown_fix,
            highest_priority_finding_id=highest_priority_id,
            highest_severity_finding_id=highest_severity_id,
            largest_affected_finding_id=largest_affected_id,
            generated_at=datetime.now(UTC),
        )

    def _find_extreme_finding_id(
        self,
        priorities: tuple[FindingPriority, ...],
        key_func: Callable[[FindingPriority], Any],
    ) -> Optional[str]:
        """
        Find the finding_id of the extreme element according to key_func.

        Returns None if priorities is empty.
        """
        if not priorities:
            return None
        best = min(priorities, key=key_func)
        return best.finding.finding_id


# ── Convenience Functions ─────────────────────────────────────────────────────


def prioritize_findings(
    result: AggregationResult,
    rule_capability_resolver: Optional[RuleCapabilityResolver] = None,
    asset_size_resolver: Optional[AssetSizeResolver] = None,
) -> PrioritizedResult:
    """
    Convenience function to prioritize findings from an AggregationResult.

    Creates a FindingPrioritizer and runs prioritization.
    """
    prioritizer = FindingPrioritizer(
        rule_capability_resolver=rule_capability_resolver,
        asset_size_resolver=asset_size_resolver,
    )
    return prioritizer.prioritize(result)
