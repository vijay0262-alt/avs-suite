"""
SC-8A Rule Engine — Safety Model

Safety assessment for rule matches.
Safety is separate from severity and confidence.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .enums import SafetyLevel, SafetyBlocker


@dataclass(frozen=True)
class SafetyAssessment:
    """
    Safety assessment for performing an action on a matched asset.
    
    Safety is SEPARATE from:
    - Severity (how serious the finding is)
    - Confidence (how certain we are about the match)
    
    A detection can be:
    - matched = True
    - severity = CRITICAL
    - confidence = 95.0
    - safety = BLOCKED
    
    This is valid and expected for system-critical assets.
    """
    
    level: SafetyLevel
    reason: str
    blockers: tuple[SafetyBlocker, ...] = field(default_factory=tuple)
    
    def __post_init__(self) -> None:
        """Validate safety assessment."""
        if not self.reason:
            raise ValueError("Safety reason cannot be empty")
        
        # Convert list to tuple for immutability
        if isinstance(object.__getattribute__(self, 'blockers'), list):
            object.__setattr__(self, 'blockers', tuple(object.__getattribute__(self, 'blockers')))
        
        # If level is BLOCKED, must have at least one blocker
        if self.level == SafetyLevel.BLOCKED and not self.blockers:
            raise ValueError("BLOCKED safety level must have at least one blocker")
    
    @property
    def is_safe(self) -> bool:
        """Check if action is safe to perform."""
        return self.level == SafetyLevel.SAFE
    
    @property
    def is_blocked(self) -> bool:
        """Check if action is blocked."""
        return self.level == SafetyLevel.BLOCKED
    
    @property
    def requires_review(self) -> bool:
        """Check if action requires manual review."""
        return self.level == SafetyLevel.REVIEW_REQUIRED
    
    @property
    def is_actionable(self) -> bool:
        """Check if action can be performed (SAFE or LOW_RISK)."""
        return self.level in (SafetyLevel.SAFE, SafetyLevel.LOW_RISK)
    
    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "level": self.level.value,
            "reason": self.reason,
            "blockers": [blocker.value for blocker in self.blockers],
            "is_safe": self.is_safe,
            "is_blocked": self.is_blocked,
            "requires_review": self.requires_review,
            "is_actionable": self.is_actionable,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SafetyAssessment:
        """Deserialize from dictionary."""
        blockers = [SafetyBlocker(b) for b in data.get("blockers", [])]
        return cls(
            level=SafetyLevel(data["level"]),
            reason=data["reason"],
            blockers=tuple(blockers),
        )
    
    @classmethod
    def create_safe(cls, reason: str) -> SafetyAssessment:
        """Create a SAFE assessment."""
        return cls(level=SafetyLevel.SAFE, reason=reason, blockers=tuple())
    
    @classmethod
    def create_blocked(cls, reason: str, blockers: list[SafetyBlocker]) -> SafetyAssessment:
        """Create a BLOCKED assessment."""
        if not blockers:
            raise ValueError("BLOCKED assessment must have at least one blocker")
        return cls(level=SafetyLevel.BLOCKED, reason=reason, blockers=tuple(blockers))
    
    @classmethod
    def create_review_required(cls, reason: str) -> SafetyAssessment:
        """Create a REVIEW_REQUIRED assessment."""
        return cls(level=SafetyLevel.REVIEW_REQUIRED, reason=reason, blockers=tuple())
