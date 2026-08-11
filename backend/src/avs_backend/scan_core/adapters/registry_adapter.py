"""
Registry Adapter — SC-6B

Converts registry models (RegistryKeyAsset, RegistryValueAsset) to ScanAsset.
"""

from __future__ import annotations

from typing import Any
from datetime import datetime

from .base_adapter import BaseAssetAdapter
from ..registry.models import RegistryKeyAsset, RegistryValueAsset, RegistryHive
from ..assets import (
    ScanAsset,
    AssetType,
    AssetCategory,
    AssetSource,
    generate_registry_key_asset_id,
    generate_registry_value_asset_id,
    AssetRelationship,
    RelationshipType,
)


class RegistryAdapter(BaseAssetAdapter):
    """Adapter for registry models."""

    def supports(self, obj: Any) -> bool:
        """Check if object is a registry model."""
        return isinstance(obj, (RegistryKeyAsset, RegistryValueAsset))

    def convert(self, obj: Any) -> ScanAsset:
        """Convert registry model to ScanAsset."""
        if isinstance(obj, RegistryKeyAsset):
            return self._convert_registry_key(obj)
        elif isinstance(obj, RegistryValueAsset):
            return self._convert_registry_value(obj)
        else:
            raise ValueError(f"Unsupported type: {type(obj)}")

    def _convert_registry_key(self, key: RegistryKeyAsset) -> ScanAsset:
        """Convert RegistryKeyAsset to ScanAsset."""
        # Generate deterministic asset ID
        asset_id = generate_registry_key_asset_id(
            key.hive.value,
            key.key_path
        )

        # Create base asset
        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.REGISTRY_KEY,
            asset_category=AssetCategory.REGISTRY,
            asset_source=AssetSource.REGISTRY_ENUMERATOR,
            display_name=key.key_name,
            canonical_path=key.full_path.lower().replace("\\", "/"),
            modified_at=datetime.fromtimestamp(key.last_write_time) if key.last_write_time else None,
            exists=True,
            accessible=not key.permission_denied,
            locked=key.permission_denied,
            hidden=False,
            system=True,
        )

        # Add tags
        asset.add_tag("registry")
        asset.add_tag("registry_key")
        asset.add_tag("system")

        if key.is_wow6432node:
            asset.add_tag("wow6432node")
        if key.permission_denied:
            asset.add_tag("permission_denied")

        # Add metadata
        asset.custom_metadata.set("hive", key.hive.value)
        asset.custom_metadata.set("hive_abbrev", key.hive.abbrev)
        asset.custom_metadata.set("key_path", key.key_path)
        asset.custom_metadata.set("subkey_count", key.subkey_count)
        asset.custom_metadata.set("value_count", key.value_count)
        asset.custom_metadata.set("depth", key.depth)
        asset.custom_metadata.set("parent_path", key.parent_path)
        asset.custom_metadata.set("is_wow6432node", key.is_wow6432node)

        # Add parent relationship if not root
        if key.parent_path:
            parent_id = generate_registry_key_asset_id(
                key.hive.value,
                key.parent_path
            )
            parent_rel = AssetRelationship(
                source_asset_id=asset_id,
                target_asset_id=parent_id,
                relationship_type=RelationshipType.PARENT,
            )
            asset.add_relationship(parent_rel)

        return asset

    def _convert_registry_value(self, value: RegistryValueAsset) -> ScanAsset:
        """Convert RegistryValueAsset to ScanAsset."""
        # Generate deterministic asset ID
        asset_id = generate_registry_value_asset_id(
            value.hive.value,
            value.key_path,
            value.value_name
        )

        # Create base asset
        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.REGISTRY_VALUE,
            asset_category=AssetCategory.REGISTRY,
            asset_source=AssetSource.REGISTRY_ENUMERATOR,
            display_name=value.asset_name,
            canonical_path=value.full_path.lower().replace("\\", "/"),
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=True,
        )

        # Add tags
        asset.add_tag("registry")
        asset.add_tag("registry_value")
        asset.add_tag("system")

        if value.is_default:
            asset.add_tag("default_value")

        # Add metadata
        asset.custom_metadata.set("hive", value.hive.value)
        asset.custom_metadata.set("hive_abbrev", value.hive.abbrev)
        asset.custom_metadata.set("key_path", value.key_path)
        asset.custom_metadata.set("value_name", value.value_name)
        asset.custom_metadata.set("value_type", value.value_type.value)
        asset.custom_metadata.set("value_data", value.value_data)
        asset.custom_metadata.set("data_size", value.data_size)
        asset.custom_metadata.set("is_default", value.is_default)

        # Add belongs_to relationship to parent key
        parent_key_id = generate_registry_key_asset_id(
            value.hive.value,
            value.key_path
        )
        belongs_to_rel = AssetRelationship(
            source_asset_id=asset_id,
            target_asset_id=parent_key_id,
            relationship_type=RelationshipType.BELONGS_TO,
        )
        asset.add_relationship(belongs_to_rel)

        return asset
