"""
Asset Serialization — SC-6A

Serialization with schema versioning.
Supports forward and backward compatibility.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .base_asset import ScanAsset

from .asset_types import AssetType, AssetCategory, AssetSource
from .metadata import AssetMetadata
from .relationships import AssetRelationship, RelationshipType


CURRENT_SCHEMA_VERSION = 1


def serialize_asset(asset: ScanAsset) -> dict[str, Any]:
    """
    Serialize ScanAsset to dictionary.

    Includes schema version for forward/backward compatibility.
    """
    data: dict[str, Any] = {
        "schema_version": CURRENT_SCHEMA_VERSION,
        "asset_id": asset.asset_id,
        "asset_type": asset.asset_type.value,
        "asset_category": asset.asset_category.value,
        "asset_source": asset.asset_source.value,
        "display_name": asset.display_name,
        "canonical_path": asset.canonical_path,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "modified_at": asset.modified_at.isoformat() if asset.modified_at else None,
        "discovered_at": asset.discovered_at.isoformat(),
        "metadata_version": asset.metadata_version,
        "exists": asset.exists,
        "accessible": asset.accessible,
        "locked": asset.locked,
        "hidden": asset.hidden,
        "system": asset.system,
        "tags": list(asset.tags),
        "custom_metadata": asset.custom_metadata.to_dict(),
        "relationships": [rel.to_dict() for rel in asset.relationships],
    }

    # Include subclass-specific fields
    # Subclasses should override serialize() to add their fields
    for key, value in asset.__dict__.items():
        if key not in data and not key.startswith("_"):
            # Serialize datetime objects
            if isinstance(value, datetime):
                data[key] = value.isoformat()
            # Skip complex objects that aren't serializable
            elif isinstance(value, (str, int, float, bool, type(None))):
                data[key] = value
            elif isinstance(value, (list, tuple, set)):
                data[key] = list(value)
            elif isinstance(value, dict):
                data[key] = value

    return data


def deserialize_asset(data: dict[str, Any]) -> dict[str, Any]:
    """
    Deserialize dictionary to ScanAsset constructor kwargs.

    Handles schema versioning and migrations.
    Returns dict suitable for ScanAsset(**kwargs).
    """
    schema_version = data.get("schema_version", 1)

    # Apply migrations if needed
    if schema_version < CURRENT_SCHEMA_VERSION:
        data = _migrate_schema(data, schema_version, CURRENT_SCHEMA_VERSION)

    # Parse enums
    kwargs: dict[str, Any] = {
        "asset_id": data["asset_id"],
        "asset_type": AssetType(data["asset_type"]),
        "asset_category": AssetCategory(data["asset_category"]),
        "asset_source": AssetSource(data["asset_source"]),
        "display_name": data["display_name"],
        "canonical_path": data["canonical_path"],
        "metadata_version": data.get("metadata_version", 1),
        "exists": data.get("exists", True),
        "accessible": data.get("accessible", True),
        "locked": data.get("locked", False),
        "hidden": data.get("hidden", False),
        "system": data.get("system", False),
    }

    # Parse timestamps
    if data.get("created_at"):
        kwargs["created_at"] = datetime.fromisoformat(data["created_at"])
    if data.get("modified_at"):
        kwargs["modified_at"] = datetime.fromisoformat(data["modified_at"])
    if data.get("discovered_at"):
        kwargs["discovered_at"] = datetime.fromisoformat(data["discovered_at"])

    # Parse tags
    kwargs["tags"] = set(data.get("tags", []))

    # Parse custom metadata
    kwargs["custom_metadata"] = AssetMetadata.from_dict(data.get("custom_metadata", {}))

    # Parse relationships
    relationships = []
    for rel_data in data.get("relationships", []):
        relationships.append(AssetRelationship.from_dict(rel_data))
    kwargs["relationships"] = relationships

    # Include any additional fields for subclasses
    for key, value in data.items():
        if key not in kwargs and key != "schema_version":
            kwargs[key] = value

    return kwargs


def to_json(asset: ScanAsset, indent: int = 2) -> str:
    """Serialize asset to JSON string."""
    data = serialize_asset(asset)
    return json.dumps(data, indent=indent, ensure_ascii=False)


def from_json(json_str: str) -> dict[str, Any]:
    """Deserialize JSON string to ScanAsset constructor kwargs."""
    data = json.loads(json_str)
    return deserialize_asset(data)


def _migrate_schema(
    data: dict[str, Any],
    from_version: int,
    to_version: int,
) -> dict[str, Any]:
    """
    Migrate asset data from one schema version to another.

    Currently no migrations needed (only v1 exists).
    Future versions will add migration logic here.
    """
    # Placeholder for future migrations
    # Example:
    # if from_version == 1 and to_version >= 2:
    #     data = _migrate_v1_to_v2(data)
    # if from_version <= 2 and to_version >= 3:
    #     data = _migrate_v2_to_v3(data)

    data["schema_version"] = to_version
    return data
