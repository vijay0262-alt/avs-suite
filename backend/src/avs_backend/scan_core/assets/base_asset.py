"""
Base ScanAsset — SC-6A

Universal base class for all discovered objects in AVS Shield.

Every FileAsset, RegistryAsset, BrowserAsset, WindowsAsset, RuntimeAsset
must inherit from ScanAsset.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Optional

from .asset_types import AssetType, AssetCategory, AssetSource, get_category_for_type
from .metadata import AssetMetadata
from .relationships import AssetRelationship


@dataclass
class ScanAsset:
    """
    Universal base class for all discovered assets.

    Mandatory fields that every asset must have.
    Subclasses add domain-specific fields.
    """

    # ── Identity ───────────────────────────────────────────────────
    asset_id: str
    asset_type: AssetType
    asset_category: AssetCategory
    asset_source: AssetSource

    # ── Display ────────────────────────────────────────────────────
    display_name: str
    canonical_path: str

    # ── Timestamps ─────────────────────────────────────────────────
    created_at: Optional[datetime] = None
    modified_at: Optional[datetime] = None
    discovered_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    # ── Versioning ─────────────────────────────────────────────────
    metadata_version: int = 1

    # ── State ──────────────────────────────────────────────────────
    exists: bool = True
    accessible: bool = True
    locked: bool = False
    hidden: bool = False
    system: bool = False

    # ── Extensibility ──────────────────────────────────────────────
    tags: set[str] = field(default_factory=set)
    custom_metadata: AssetMetadata = field(default_factory=AssetMetadata)
    relationships: list[AssetRelationship] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Validate and normalize after initialization."""
        # Auto-derive category if not set
        if not self.asset_category or self.asset_category == AssetCategory.UNKNOWN:
            self.asset_category = get_category_for_type(self.asset_type)

    # ── Tag management ─────────────────────────────────────────────

    def add_tag(self, tag: str) -> None:
        """Add a tag to this asset."""
        self.tags.add(tag.lower())

    def remove_tag(self, tag: str) -> None:
        """Remove a tag from this asset."""
        self.tags.discard(tag.lower())

    def has_tag(self, tag: str) -> bool:
        """Check if asset has a specific tag."""
        return tag.lower() in self.tags

    def has_any_tag(self, *tags: str) -> bool:
        """Check if asset has any of the specified tags."""
        return any(self.has_tag(tag) for tag in tags)

    def has_all_tags(self, *tags: str) -> bool:
        """Check if asset has all of the specified tags."""
        return all(self.has_tag(tag) for tag in tags)

    # ── Relationship management ────────────────────────────────────

    def add_relationship(self, relationship: AssetRelationship) -> None:
        """Add a relationship to this asset."""
        if relationship not in self.relationships:
            self.relationships.append(relationship)

    def get_relationships_by_type(self, rel_type: str) -> list[AssetRelationship]:
        """Get all relationships of a specific type."""
        return [
            rel for rel in self.relationships
            if rel.relationship_type.value == rel_type
        ]

    def get_related_asset_ids(self, rel_type: Optional[str] = None) -> list[str]:
        """Get IDs of all related assets, optionally filtered by relationship type."""
        if rel_type:
            return [
                rel.target_asset_id for rel in self.relationships
                if rel.relationship_type.value == rel_type
            ]
        return [rel.target_asset_id for rel in self.relationships]

    # ── Common interface ───────────────────────────────────────────

    @property
    def asset_name(self) -> str:
        """Alias for display_name."""
        return self.display_name

    @property
    def asset_tags(self) -> set[str]:
        """Alias for tags."""
        return self.tags

    @property
    def asset_metadata(self) -> AssetMetadata:
        """Alias for custom_metadata."""
        return self.custom_metadata

    def serialize(self) -> dict:
        """
        Serialize asset to dictionary.

        Delegates to serialization module for versioning support.
        """
        from .serialization import serialize_asset
        return serialize_asset(self)

    def validate(self) -> tuple[bool, list[str]]:
        """
        Validate asset structure.

        Returns (is_valid, errors) tuple.
        Delegates to validation module.
        """
        from .validation import validate_asset
        result = validate_asset(self)
        return (result.is_valid, result.errors)

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"id={self.asset_id[:8]}..., "
            f"type={self.asset_type.value}, "
            f"name={self.display_name})"
        )
