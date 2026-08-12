"""
SC-8A Rule Engine — Evidence Model

Structured evidence supporting rule matches.
Evidence must be human-readable and traceable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Any, Optional

from .enums import EvidenceType


@dataclass(frozen=True)
class Evidence:
    """
    Single piece of evidence supporting a rule match.
    
    Evidence must be:
    - Human-readable
    - Traceable to a source
    - Non-sensitive (no passwords, tokens, etc.)
    """
    
    evidence_type: EvidenceType
    description: str
    source: str
    value: str
    weight: float = 1.0
    timestamp: Optional[datetime] = None
    
    def __post_init__(self) -> None:
        """Validate evidence."""
        if not self.description:
            raise ValueError("Evidence description cannot be empty")
        
        if not self.source:
            raise ValueError("Evidence source cannot be empty")
        
        if self.weight < 0.0 or self.weight > 1.0:
            raise ValueError(f"Evidence weight must be between 0.0 and 1.0, got {self.weight}")
    
    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "evidence_type": self.evidence_type.value,
            "description": self.description,
            "source": self.source,
            "value": self.value,
            "weight": self.weight,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Evidence:
        """Deserialize from dictionary."""
        return cls(
            evidence_type=EvidenceType(data["evidence_type"]),
            description=data["description"],
            source=data["source"],
            value=data["value"],
            weight=data.get("weight", 1.0),
            timestamp=datetime.fromisoformat(data["timestamp"]) if data.get("timestamp") else None,
        )


@dataclass(frozen=True)
class EvidenceCollection:
    """
    Collection of evidence items supporting a rule match.
    
    Provides aggregation and summary capabilities.
    """
    
    items: tuple[Evidence, ...] = field(default_factory=tuple)
    
    def __post_init__(self) -> None:
        """Validate collection."""
        # Convert list to tuple for immutability
        if isinstance(object.__getattribute__(self, 'items'), list):
            object.__setattr__(self, 'items', tuple(object.__getattribute__(self, 'items')))
    
    @property
    def count(self) -> int:
        """Get number of evidence items."""
        return len(self.items)
    
    @property
    def total_weight(self) -> float:
        """Get total weight of all evidence."""
        return sum(item.weight for item in self.items)
    
    @property
    def average_weight(self) -> float:
        """Get average weight of evidence."""
        if not self.items:
            return 0.0
        return self.total_weight / len(self.items)
    
    def get_by_type(self, evidence_type: EvidenceType) -> tuple[Evidence, ...]:
        """Get all evidence of a specific type."""
        return tuple(item for item in self.items if item.evidence_type == evidence_type)
    
    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "items": [item.to_dict() for item in self.items],
            "count": self.count,
            "total_weight": self.total_weight,
            "average_weight": self.average_weight,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> EvidenceCollection:
        """Deserialize from dictionary."""
        items = [Evidence.from_dict(item) for item in data.get("items", [])]
        return cls(items=tuple(items))
    
    @classmethod
    def create(cls, items: list[Evidence]) -> EvidenceCollection:
        """Create collection from list of evidence."""
        return cls(items=tuple(items))
