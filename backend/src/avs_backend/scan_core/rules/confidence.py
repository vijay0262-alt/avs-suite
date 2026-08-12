"""
SC-8A Rule Engine — Confidence Model

Structured confidence scoring with explainability.
Confidence must be traceable and justified.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .enums import ConfidenceFactor


@dataclass(frozen=True)
class ConfidenceScore:
    """
    Single confidence factor contributing to overall confidence.
    """
    
    factor: ConfidenceFactor
    score: float
    description: str
    
    def __post_init__(self) -> None:
        """Validate confidence score."""
        if self.score < 0.0 or self.score > 100.0:
            raise ValueError(f"Confidence score must be between 0.0 and 100.0, got {self.score}")
        
        if not self.description:
            raise ValueError("Confidence score description cannot be empty")
    
    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "factor": self.factor.value,
            "score": self.score,
            "description": self.description,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ConfidenceScore:
        """Deserialize from dictionary."""
        return cls(
            factor=ConfidenceFactor(data["factor"]),
            score=data["score"],
            description=data["description"],
        )


@dataclass(frozen=True)
class Confidence:
    """
    Confidence assessment for a rule match.
    
    Confidence represents how certain we are that the rule match is correct.
    
    Score: 0-100
    - 0-20: Very low confidence
    - 21-40: Low confidence
    - 41-60: Medium confidence
    - 61-80: High confidence
    - 81-100: Very high confidence
    
    Confidence is separate from severity and safety.
    """
    
    score: float
    factors: tuple[ConfidenceScore, ...] = field(default_factory=tuple)
    
    def __post_init__(self) -> None:
        """Validate confidence."""
        if self.score < 0.0 or self.score > 100.0:
            raise ValueError(f"Confidence score must be between 0.0 and 100.0, got {self.score}")
        
        # Convert list to tuple for immutability
        if isinstance(object.__getattribute__(self, 'factors'), list):
            object.__setattr__(self, 'factors', tuple(object.__getattribute__(self, 'factors')))
    
    @property
    def level(self) -> str:
        """Get confidence level as string."""
        if self.score <= 20.0:
            return "very_low"
        elif self.score <= 40.0:
            return "low"
        elif self.score <= 60.0:
            return "medium"
        elif self.score <= 80.0:
            return "high"
        else:
            return "very_high"
    
    @property
    def is_high(self) -> bool:
        """Check if confidence is high or very high."""
        return self.score > 60.0
    
    @property
    def is_low(self) -> bool:
        """Check if confidence is low or very low."""
        return self.score <= 40.0
    
    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "score": self.score,
            "level": self.level,
            "factors": [factor.to_dict() for factor in self.factors],
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Confidence:
        """Deserialize from dictionary."""
        factors = [ConfidenceScore.from_dict(f) for f in data.get("factors", [])]
        return cls(
            score=data["score"],
            factors=tuple(factors),
        )
    
    @classmethod
    def create(cls, score: float, factors: list[ConfidenceScore]) -> Confidence:
        """Create confidence with factors."""
        return cls(score=score, factors=tuple(factors))
