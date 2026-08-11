"""
Asset Validation — SC-6A

Validation helpers for asset integrity.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base_asset import ScanAsset


class ValidationError(Exception):
    """Raised when asset validation fails."""

    pass


@dataclass
class ValidationResult:
    """Result of asset validation."""

    is_valid: bool
    errors: list[str]
    warnings: list[str]

    @classmethod
    def success(cls) -> ValidationResult:
        """Create a successful validation result."""
        return cls(is_valid=True, errors=[], warnings=[])

    @classmethod
    def failure(cls, errors: list[str], warnings: list[str] | None = None) -> ValidationResult:
        """Create a failed validation result."""
        return cls(is_valid=False, errors=errors, warnings=warnings or [])


def validate_asset(asset: ScanAsset) -> ValidationResult:
    """
    Validate asset structure and integrity.

    Checks:
    - Required fields present
    - Asset ID not empty
    - Asset type valid
    - Canonical path not empty
    - Timestamps valid
    - Relationships valid
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Check required fields
    if not asset.asset_id:
        errors.append("Missing asset_id")

    if not asset.asset_type:
        errors.append("Missing asset_type")

    if not asset.display_name:
        errors.append("Missing display_name")

    if not asset.canonical_path:
        errors.append("Missing canonical_path")

    if not asset.asset_source:
        errors.append("Missing asset_source")

    # Validate asset_id format (should be 64-char hex)
    if asset.asset_id and len(asset.asset_id) != 64:
        warnings.append(f"asset_id length is {len(asset.asset_id)}, expected 64 (SHA-256 hex)")

    if asset.asset_id and not all(c in "0123456789abcdef" for c in asset.asset_id):
        warnings.append("asset_id contains non-hex characters")

    # Validate timestamps
    if asset.created_at and asset.modified_at:
        if asset.created_at > asset.modified_at:
            errors.append("created_at is after modified_at")

    if asset.created_at and asset.discovered_at:
        if asset.created_at > asset.discovered_at:
            warnings.append("created_at is after discovered_at (unusual but possible)")

    # Validate relationships
    for i, rel in enumerate(asset.relationships):
        if not rel.source_asset_id:
            errors.append(f"Relationship {i}: missing source_asset_id")
        if not rel.target_asset_id:
            errors.append(f"Relationship {i}: missing target_asset_id")
        if rel.source_asset_id == rel.target_asset_id:
            warnings.append(f"Relationship {i}: self-referential (source == target)")

    # Validate state consistency
    if not asset.exists and asset.accessible:
        warnings.append("Asset marked as non-existent but accessible")

    if errors:
        return ValidationResult.failure(errors, warnings)
    return ValidationResult(is_valid=True, errors=[], warnings=warnings)


def validate_asset_id(asset_id: str) -> bool:
    """
    Validate asset ID format.

    Asset IDs should be 64-character lowercase hex strings (SHA-256).
    """
    if not asset_id:
        return False
    if len(asset_id) != 64:
        return False
    return all(c in "0123456789abcdef" for c in asset_id)


def validate_relationship_integrity(
    assets: list[ScanAsset],
) -> ValidationResult:
    """
    Validate relationship integrity across multiple assets.

    Checks:
    - All referenced asset IDs exist in the asset list
    - No broken relationships
    """
    errors: list[str] = []
    warnings: list[str] = []

    asset_ids = {asset.asset_id for asset in assets}

    for asset in assets:
        for rel in asset.relationships:
            # Check if target exists
            if rel.target_asset_id not in asset_ids:
                errors.append(
                    f"Asset {asset.asset_id[:8]}... has relationship to "
                    f"non-existent asset {rel.target_asset_id[:8]}..."
                )

            # Check if source matches current asset
            if rel.source_asset_id != asset.asset_id:
                errors.append(
                    f"Asset {asset.asset_id[:8]}... has relationship with "
                    f"mismatched source_asset_id {rel.source_asset_id[:8]}..."
                )

    if errors:
        return ValidationResult.failure(errors, warnings)
    return ValidationResult(is_valid=True, errors=[], warnings=warnings)


def find_duplicate_assets(assets: list[ScanAsset]) -> list[tuple[str, list[ScanAsset]]]:
    """
    Find duplicate assets (same asset_id).

    Returns list of (asset_id, [duplicate_assets]) tuples.
    """
    from collections import defaultdict

    id_to_assets: dict[str, list[ScanAsset]] = defaultdict(list)
    for asset in assets:
        id_to_assets[asset.asset_id].append(asset)

    duplicates = [
        (asset_id, asset_list)
        for asset_id, asset_list in id_to_assets.items()
        if len(asset_list) > 1
    ]

    return duplicates
