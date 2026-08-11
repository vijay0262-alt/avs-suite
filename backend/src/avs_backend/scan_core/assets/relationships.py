"""
Asset Relationships — SC-6A

Describes relationships between assets.
Never executes — only describes.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class RelationshipType(str, Enum):
    """Type of relationship between assets."""

    # Containment
    CONTAINS = "contains"
    BELONGS_TO = "belongs_to"

    # Dependency
    DEPENDS_ON = "depends_on"
    REQUIRED_BY = "required_by"

    # Execution
    LAUNCHES = "launches"
    LAUNCHED_BY = "launched_by"

    # Ownership
    OWNS = "owns"
    OWNED_BY = "owned_by"

    # Reference
    REFERENCES = "references"
    REFERENCED_BY = "referenced_by"

    # Hierarchy
    PARENT = "parent"
    CHILD = "child"

    # Locking
    LOCKS = "locks"
    LOCKED_BY = "locked_by"

    # Custom
    CUSTOM = "custom"


@dataclass(frozen=True)
class AssetRelationship:
    """
    Immutable relationship between two assets.

    Describes how assets relate to each other.
    Never executes actions — only describes connections.
    """

    source_asset_id: str
    target_asset_id: str
    relationship_type: RelationshipType
    metadata: Optional[dict[str, str]] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        result = {
            "source_asset_id": self.source_asset_id,
            "target_asset_id": self.target_asset_id,
            "relationship_type": self.relationship_type.value,
        }
        if self.metadata:
            result["metadata"] = self.metadata
        return result

    @classmethod
    def from_dict(cls, data: dict) -> AssetRelationship:
        """Create from dictionary."""
        return cls(
            source_asset_id=data["source_asset_id"],
            target_asset_id=data["target_asset_id"],
            relationship_type=RelationshipType(data["relationship_type"]),
            metadata=data.get("metadata"),
        )

    def __repr__(self) -> str:
        return (
            f"AssetRelationship("
            f"{self.source_asset_id[:8]}... "
            f"{self.relationship_type.value} "
            f"{self.target_asset_id[:8]}...)"
        )


# ── Relationship helpers ───────────────────────────────────────────


def create_parent_child_relationship(
    parent_id: str,
    child_id: str,
) -> tuple[AssetRelationship, AssetRelationship]:
    """
    Create bidirectional parent-child relationship.

    Returns (parent→child, child→parent) tuple.
    """
    parent_to_child = AssetRelationship(
        source_asset_id=parent_id,
        target_asset_id=child_id,
        relationship_type=RelationshipType.CHILD,
    )
    child_to_parent = AssetRelationship(
        source_asset_id=child_id,
        target_asset_id=parent_id,
        relationship_type=RelationshipType.PARENT,
    )
    return (parent_to_child, child_to_parent)


def create_dependency_relationship(
    dependent_id: str,
    dependency_id: str,
) -> tuple[AssetRelationship, AssetRelationship]:
    """
    Create bidirectional dependency relationship.

    Returns (dependent→dependency, dependency→dependent) tuple.
    """
    depends_on = AssetRelationship(
        source_asset_id=dependent_id,
        target_asset_id=dependency_id,
        relationship_type=RelationshipType.DEPENDS_ON,
    )
    required_by = AssetRelationship(
        source_asset_id=dependency_id,
        target_asset_id=dependent_id,
        relationship_type=RelationshipType.REQUIRED_BY,
    )
    return (depends_on, required_by)


def create_launch_relationship(
    launcher_id: str,
    launched_id: str,
) -> tuple[AssetRelationship, AssetRelationship]:
    """
    Create bidirectional launch relationship.

    Returns (launcher→launched, launched→launcher) tuple.
    """
    launches = AssetRelationship(
        source_asset_id=launcher_id,
        target_asset_id=launched_id,
        relationship_type=RelationshipType.LAUNCHES,
    )
    launched_by = AssetRelationship(
        source_asset_id=launched_id,
        target_asset_id=launcher_id,
        relationship_type=RelationshipType.LAUNCHED_BY,
    )
    return (launches, launched_by)


def create_lock_relationship(
    locker_id: str,
    locked_id: str,
) -> tuple[AssetRelationship, AssetRelationship]:
    """
    Create bidirectional lock relationship.

    Returns (locker→locked, locked→locker) tuple.
    """
    locks = AssetRelationship(
        source_asset_id=locker_id,
        target_asset_id=locked_id,
        relationship_type=RelationshipType.LOCKS,
    )
    locked_by = AssetRelationship(
        source_asset_id=locked_id,
        target_asset_id=locker_id,
        relationship_type=RelationshipType.LOCKED_BY,
    )
    return (locks, locked_by)
