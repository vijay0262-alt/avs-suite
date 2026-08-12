"""
SC-8C1 Rule Evaluation Infrastructure

Defines evaluation results, statistics, and error handling for rule evaluation.

NO RULE EXECUTION.
NO SYSTEM MODIFICATION.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, UTC
from enum import Enum
from typing import Optional, TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .result import RuleResult


class EvaluationStatus(str, Enum):
    """Status of a rule evaluation attempt."""
    
    SUCCESS = "success"              # Rule evaluated successfully
    FAILED = "failed"                # Rule evaluation raised exception
    SKIPPED_NOT_APPLICABLE = "skipped_not_applicable"  # Rule not applicable
    SKIPPED_DISABLED = "skipped_disabled"              # Rule disabled
    CANCELLED = "cancelled"          # Evaluation cancelled


@dataclass(frozen=True)
class EvaluationError:
    """
    Structured error information for failed rule evaluation.
    
    Does NOT expose sensitive data or filesystem contents.
    """
    
    rule_id: str
    rule_version: str
    asset_id: str
    error_type: str
    error_message: str
    evaluation_stage: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "rule_id": self.rule_id,
            "rule_version": self.rule_version,
            "asset_id": self.asset_id,
            "error_type": self.error_type,
            "error_message": self.error_message,
            "evaluation_stage": self.evaluation_stage,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass(frozen=True)
class EvaluationResult:
    """
    Result of evaluating a single rule against a single asset.
    
    Distinguishes between:
    - Rule matched
    - Rule did not match
    - Rule not applicable
    - Rule disabled
    - Rule evaluation failed
    """
    
    status: EvaluationStatus
    rule_id: str
    asset_id: str
    rule_result: Optional[RuleResult] = None
    error: Optional[EvaluationError] = None
    duration_ms: float = 0.0
    
    @property
    def is_success(self) -> bool:
        """Check if evaluation succeeded."""
        return self.status == EvaluationStatus.SUCCESS
    
    @property
    def is_match(self) -> bool:
        """Check if rule matched (only valid if success)."""
        if not self.is_success or not self.rule_result:
            return False
        return self.rule_result.matched
    
    @classmethod
    def success(
        cls,
        rule_id: str,
        asset_id: str,
        rule_result: RuleResult,
        duration_ms: float = 0.0,
    ) -> EvaluationResult:
        """Create successful evaluation result."""
        return cls(
            status=EvaluationStatus.SUCCESS,
            rule_id=rule_id,
            asset_id=asset_id,
            rule_result=rule_result,
            duration_ms=duration_ms,
        )
    
    @classmethod
    def failed(
        cls,
        rule_id: str,
        asset_id: str,
        error: EvaluationError,
        duration_ms: float = 0.0,
    ) -> EvaluationResult:
        """Create failed evaluation result."""
        return cls(
            status=EvaluationStatus.FAILED,
            rule_id=rule_id,
            asset_id=asset_id,
            error=error,
            duration_ms=duration_ms,
        )
    
    @classmethod
    def skipped_not_applicable(
        cls,
        rule_id: str,
        asset_id: str,
    ) -> EvaluationResult:
        """Create skipped (not applicable) result."""
        return cls(
            status=EvaluationStatus.SKIPPED_NOT_APPLICABLE,
            rule_id=rule_id,
            asset_id=asset_id,
        )
    
    @classmethod
    def skipped_disabled(
        cls,
        rule_id: str,
        asset_id: str,
    ) -> EvaluationResult:
        """Create skipped (disabled) result."""
        return cls(
            status=EvaluationStatus.SKIPPED_DISABLED,
            rule_id=rule_id,
            asset_id=asset_id,
        )
    
    @classmethod
    def cancelled(
        cls,
        rule_id: str,
        asset_id: str,
    ) -> EvaluationResult:
        """Create cancelled result."""
        return cls(
            status=EvaluationStatus.CANCELLED,
            rule_id=rule_id,
            asset_id=asset_id,
        )


@dataclass
class EvaluationStatistics:
    """
    Statistics for rule evaluation operation.
    
    Separate from Health Score statistics.
    """
    
    # Asset counts
    assets_considered: int = 0
    assets_evaluated: int = 0
    
    # Rule counts
    rules_considered: int = 0
    rules_applicable: int = 0
    rules_evaluated: int = 0
    
    # Result counts
    matches: int = 0
    no_matches: int = 0
    failures: int = 0
    skipped: int = 0
    cancelled: int = 0
    
    # Timing
    evaluation_duration_ms: float = 0.0
    
    # Timestamps
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    @property
    def rules_per_second(self) -> float:
        """Calculate rules evaluated per second."""
        if self.evaluation_duration_ms <= 0:
            return 0.0
        return (self.rules_evaluated / self.evaluation_duration_ms) * 1000.0
    
    @property
    def assets_per_second(self) -> float:
        """Calculate assets evaluated per second."""
        if self.evaluation_duration_ms <= 0:
            return 0.0
        return (self.assets_evaluated / self.evaluation_duration_ms) * 1000.0
    
    def record_match(self) -> None:
        """Record a match."""
        self.matches += 1
    
    def record_no_match(self) -> None:
        """Record a no-match."""
        self.no_matches += 1
    
    def record_failure(self) -> None:
        """Record a failure."""
        self.failures += 1
    
    def record_skipped(self) -> None:
        """Record a skip."""
        self.skipped += 1
    
    def record_cancelled(self) -> None:
        """Record a cancellation."""
        self.cancelled += 1
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "assets_considered": self.assets_considered,
            "assets_evaluated": self.assets_evaluated,
            "rules_considered": self.rules_considered,
            "rules_applicable": self.rules_applicable,
            "rules_evaluated": self.rules_evaluated,
            "matches": self.matches,
            "no_matches": self.no_matches,
            "failures": self.failures,
            "skipped": self.skipped,
            "cancelled": self.cancelled,
            "evaluation_duration_ms": self.evaluation_duration_ms,
            "rules_per_second": self.rules_per_second,
            "assets_per_second": self.assets_per_second,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


@dataclass(frozen=True)
class EvaluationBatch:
    """
    Results from evaluating multiple rules against multiple assets.
    
    Contains all evaluation results and statistics.
    """
    
    results: list[EvaluationResult]
    statistics: EvaluationStatistics
    errors: list[EvaluationError] = field(default_factory=list)
    
    def get_matches(self) -> list[RuleResult]:
        """Get all matched rule results."""
        matches: list[RuleResult] = []
        for result in self.results:
            if result.is_match and result.rule_result:
                matches.append(result.rule_result)
        return matches
    
    def get_errors(self) -> list[EvaluationError]:
        """Get all evaluation errors."""
        return self.errors
    
    def get_failed_results(self) -> list[EvaluationResult]:
        """Get all failed evaluation results."""
        return [r for r in self.results if r.status == EvaluationStatus.FAILED]
