"""
SC-8A Rule Engine — Rule Result Model

Immutable rule evaluation results.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, UTC
from enum import Enum
from typing import Any, Optional

from .enums import Severity, ActionType
from .evidence import EvidenceCollection
from .confidence import Confidence
from .safety import SafetyAssessment


class RuleMatchStatus(str, Enum):
    """
    Status of a rule match.
    
    Clearly distinguishes between:
    - NO_MATCH: Rule did not match
    - MATCHED: Rule matched
    - MATCHED_BLOCKED: Rule matched but action is blocked
    - MATCHED_REVIEW: Rule matched but requires manual review
    """
    
    NO_MATCH = "no_match"
    MATCHED = "matched"
    MATCHED_BLOCKED = "matched_blocked"
    MATCHED_REVIEW = "matched_review"


@dataclass(frozen=True)
class RuleResult:
    """
    Immutable result of rule evaluation.
    
    Contains:
    - Rule identification
    - Asset identification
    - Match status
    - Severity, confidence, safety
    - Evidence
    - Recommended action
    - Metadata
    
    A RuleResult is DESCRIPTIVE only — it never executes actions.
    """
    
    # Rule identification
    rule_id: str
    rule_version: str
    
    # Asset identification
    asset_id: str
    
    # Match status
    status: RuleMatchStatus
    
    # Assessment (only meaningful if matched)
    severity: Severity
    confidence: Confidence
    safety: SafetyAssessment
    
    # Explanation
    reason: str
    evidence: EvidenceCollection
    
    # Recommendation (DESCRIPTION only, never executed)
    recommended_action: ActionType
    
    # Optional metadata
    estimated_size: Optional[int] = None
    metadata: dict[str, Any] = field(default_factory=dict)
    
    # Timestamp
    evaluated_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    
    def __post_init__(self) -> None:
        """Validate rule result."""
        if not self.rule_id:
            raise ValueError("Rule ID cannot be empty")
        
        if not self.rule_version:
            raise ValueError("Rule version cannot be empty")
        
        if not self.asset_id:
            raise ValueError("Asset ID cannot be empty")
        
        if not self.reason:
            raise ValueError("Reason cannot be empty")
        
        # Convert mutable dict to immutable (shallow copy)
        if self.metadata and not isinstance(self.metadata, dict):
            raise ValueError("Metadata must be a dictionary")
    
    @property
    def matched(self) -> bool:
        """Check if rule matched."""
        return self.status != RuleMatchStatus.NO_MATCH
    
    @property
    def is_blocked(self) -> bool:
        """Check if action is blocked."""
        return self.status == RuleMatchStatus.MATCHED_BLOCKED
    
    @property
    def requires_review(self) -> bool:
        """Check if result requires manual review."""
        return self.status == RuleMatchStatus.MATCHED_REVIEW
    
    @property
    def is_actionable(self) -> bool:
        """Check if result is actionable (matched and not blocked/review)."""
        return self.status == RuleMatchStatus.MATCHED and self.safety.is_actionable
    
    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "rule_id": self.rule_id,
            "rule_version": self.rule_version,
            "asset_id": self.asset_id,
            "status": self.status.value,
            "matched": self.matched,
            "severity": self.severity.value,
            "confidence": self.confidence.to_dict(),
            "safety": self.safety.to_dict(),
            "reason": self.reason,
            "evidence": self.evidence.to_dict(),
            "recommended_action": self.recommended_action.value,
            "estimated_size": self.estimated_size,
            "metadata": dict(self.metadata),
            "evaluated_at": self.evaluated_at.isoformat(),
            "is_blocked": self.is_blocked,
            "requires_review": self.requires_review,
            "is_actionable": self.is_actionable,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RuleResult:
        """Deserialize from dictionary."""
        return cls(
            rule_id=data["rule_id"],
            rule_version=data["rule_version"],
            asset_id=data["asset_id"],
            status=RuleMatchStatus(data["status"]),
            severity=Severity(data["severity"]),
            confidence=Confidence.from_dict(data["confidence"]),
            safety=SafetyAssessment.from_dict(data["safety"]),
            reason=data["reason"],
            evidence=EvidenceCollection.from_dict(data["evidence"]),
            recommended_action=ActionType(data["recommended_action"]),
            estimated_size=data.get("estimated_size"),
            metadata=data.get("metadata", {}),
            evaluated_at=datetime.fromisoformat(data["evaluated_at"]) if data.get("evaluated_at") else datetime.now(UTC),
        )
    
    @classmethod
    def create_no_match(
        cls,
        rule_id: str,
        rule_version: str,
        asset_id: str,
        reason: str,
    ) -> RuleResult:
        """Create a NO_MATCH result."""
        return cls(
            rule_id=rule_id,
            rule_version=rule_version,
            asset_id=asset_id,
            status=RuleMatchStatus.NO_MATCH,
            severity=Severity.INFO,
            confidence=Confidence(score=0.0),
            safety=SafetyAssessment.create_safe("No match"),
            reason=reason,
            evidence=EvidenceCollection(),
            recommended_action=ActionType.NONE,
        )
    
    @classmethod
    def create_matched(
        cls,
        rule_id: str,
        rule_version: str,
        asset_id: str,
        severity: Severity,
        confidence: Confidence,
        safety: SafetyAssessment,
        reason: str,
        evidence: EvidenceCollection,
        recommended_action: ActionType,
        estimated_size: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> RuleResult:
        """Create a MATCHED result."""
        # Determine status based on safety
        if safety.is_blocked:
            status = RuleMatchStatus.MATCHED_BLOCKED
        elif safety.requires_review:
            status = RuleMatchStatus.MATCHED_REVIEW
        else:
            status = RuleMatchStatus.MATCHED
        
        return cls(
            rule_id=rule_id,
            rule_version=rule_version,
            asset_id=asset_id,
            status=status,
            severity=severity,
            confidence=confidence,
            safety=safety,
            reason=reason,
            evidence=evidence,
            recommended_action=recommended_action,
            estimated_size=estimated_size,
            metadata=metadata or {},
        )
