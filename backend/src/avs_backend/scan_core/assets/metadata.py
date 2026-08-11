"""
Asset Metadata — SC-6A

Typed, extensible metadata for assets.
Supports any future engine attaching additional metadata.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Union
from datetime import datetime


# Supported metadata value types
MetadataValue = Union[str, int, float, bool, datetime, list[Any], dict[str, Any], None]


@dataclass
class AssetMetadata:
    """
    Extensible metadata container for assets.

    Supports typed values and arbitrary keys.
    Future engines can attach domain-specific metadata.
    """

    data: dict[str, MetadataValue] = field(default_factory=dict)

    def get(self, key: str, default: MetadataValue = None) -> MetadataValue:
        """Get metadata value by key."""
        return self.data.get(key, default)

    def set(self, key: str, value: MetadataValue) -> None:
        """Set metadata value."""
        self.data[key] = value

    def has(self, key: str) -> bool:
        """Check if metadata key exists."""
        return key in self.data

    def remove(self, key: str) -> None:
        """Remove metadata key."""
        self.data.pop(key, None)

    def keys(self) -> list[str]:
        """Get all metadata keys."""
        return list(self.data.keys())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        result: dict[str, Any] = {}
        for key, value in self.data.items():
            if isinstance(value, datetime):
                result[key] = value.isoformat()
            else:
                result[key] = value
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AssetMetadata:
        """Create from dictionary."""
        metadata = cls()
        for key, value in data.items():
            # Try to parse ISO datetime strings
            if isinstance(value, str) and _is_iso_datetime(value):
                try:
                    metadata.set(key, datetime.fromisoformat(value))
                except ValueError:
                    metadata.set(key, value)
            else:
                metadata.set(key, value)
        return metadata

    def merge(self, other: AssetMetadata) -> None:
        """Merge another metadata object into this one."""
        self.data.update(other.data)

    def __len__(self) -> int:
        """Return number of metadata entries."""
        return len(self.data)

    def __contains__(self, key: str) -> bool:
        """Check if key exists."""
        return key in self.data

    def __repr__(self) -> str:
        return f"AssetMetadata({len(self.data)} entries)"


def _is_iso_datetime(value: str) -> bool:
    """Check if string looks like an ISO datetime."""
    if not value:
        return False
    # Simple heuristic: contains 'T' and has date-like format
    return "T" in value and len(value) >= 19 and value[4] == "-" and value[7] == "-"
