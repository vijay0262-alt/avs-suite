"""
Universal Asset Model — SC-6A

The common language of the AVS Shield platform.
Every discovered object becomes a ScanAsset.

This package defines:
- Base ScanAsset class
- Deterministic identity generation
- Asset types and categories
- Metadata and relationships
- Serialization with versioning
- Validation helpers

No Metadata Cache. No Rule Engine. No Storage.
Architecture only.
"""

from .base_asset import ScanAsset
from .asset_types import AssetType, AssetCategory, AssetSource
from .identity import (
    generate_asset_id,
    AssetIdentity,
    generate_file_asset_id,
    generate_directory_asset_id,
    generate_registry_key_asset_id,
    generate_registry_value_asset_id,
    generate_process_asset_id,
    generate_browser_installation_asset_id,
    generate_service_asset_id,
    generate_driver_asset_id,
)
from .metadata import AssetMetadata, MetadataValue
from .relationships import AssetRelationship, RelationshipType
from .serialization import serialize_asset, deserialize_asset
from .validation import validate_asset, ValidationError, ValidationResult

__all__ = [
    "ScanAsset",
    "AssetType",
    "AssetCategory",
    "AssetSource",
    "generate_asset_id",
    "AssetIdentity",
    "generate_file_asset_id",
    "generate_directory_asset_id",
    "generate_registry_key_asset_id",
    "generate_registry_value_asset_id",
    "generate_process_asset_id",
    "generate_browser_installation_asset_id",
    "generate_service_asset_id",
    "generate_driver_asset_id",
    "AssetMetadata",
    "MetadataValue",
    "AssetRelationship",
    "RelationshipType",
    "serialize_asset",
    "deserialize_asset",
    "validate_asset",
    "ValidationError",
    "ValidationResult",
]
