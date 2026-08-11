"""
Filesystem Adapter — SC-6B

Converts filesystem models (FileEntry, DirectoryEntry, DriveEntry) to ScanAsset.
"""

from __future__ import annotations

from typing import Any
from datetime import datetime

from .base_adapter import BaseAssetAdapter
from ..models import FileEntry, DirectoryEntry, EntryType
from ..assets import (
    ScanAsset,
    AssetType,
    AssetCategory,
    AssetSource,
    generate_file_asset_id,
    generate_directory_asset_id,
)


class FilesystemAdapter(BaseAssetAdapter):
    """Adapter for filesystem models."""

    def supports(self, obj: Any) -> bool:
        """Check if object is a filesystem model."""
        return isinstance(obj, (FileEntry, DirectoryEntry))

    def convert(self, obj: Any) -> ScanAsset:
        """Convert filesystem model to ScanAsset."""
        if isinstance(obj, FileEntry):
            return self._convert_file_entry(obj)
        elif isinstance(obj, DirectoryEntry):
            return self._convert_directory_entry(obj)
        else:
            raise ValueError(f"Unsupported type: {type(obj)}")

    def _convert_file_entry(self, entry: FileEntry) -> ScanAsset:
        """Convert FileEntry to ScanAsset."""
        # Generate deterministic asset ID
        asset_id = generate_file_asset_id(entry.path)

        # Determine asset type
        if entry.is_symlink:
            asset_type = AssetType.SYMLINK
        else:
            asset_type = AssetType.FILE

        # Create base asset
        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=asset_type,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name=entry.name,
            canonical_path=entry.path.lower().replace("\\", "/"),
            created_at=datetime.fromtimestamp(entry.created_time),
            modified_at=datetime.fromtimestamp(entry.modified_time),
            exists=True,
            accessible=not entry.is_locked,
            locked=entry.is_locked,
            hidden=entry.is_hidden,
            system=entry.is_system,
        )

        # Add tags
        asset.add_tag("filesystem")
        asset.add_tag("file")

        if entry.is_temporary:
            asset.add_tag("temporary")
        if entry.is_system:
            asset.add_tag("system")
        if entry.is_hidden:
            asset.add_tag("hidden")
        if entry.is_symlink:
            asset.add_tag("symlink")
        if entry.is_locked:
            asset.add_tag("locked")
        if entry.is_read_only:
            asset.add_tag("readonly")

        # Add metadata
        asset.custom_metadata.set("size", entry.size)
        asset.custom_metadata.set("extension", entry.extension)
        asset.custom_metadata.set("depth", entry.depth)
        asset.custom_metadata.set("is_archive", entry.is_archive)
        asset.custom_metadata.set("is_read_only", entry.is_read_only)

        if entry.is_symlink and entry.symlink_target:
            asset.custom_metadata.set("symlink_target", entry.symlink_target)
            asset.custom_metadata.set("is_broken_symlink", entry.is_broken_symlink)

        return asset

    def _convert_directory_entry(self, entry: DirectoryEntry) -> ScanAsset:
        """Convert DirectoryEntry to ScanAsset."""
        # Generate deterministic asset ID
        asset_id = generate_directory_asset_id(entry.path)

        # Determine asset type
        if entry.is_symlink:
            asset_type = AssetType.JUNCTION
        else:
            asset_type = AssetType.DIRECTORY

        # Create base asset
        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=asset_type,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name=entry.name,
            canonical_path=entry.path.lower().replace("\\", "/"),
            created_at=datetime.fromtimestamp(entry.created_time),
            modified_at=datetime.fromtimestamp(entry.modified_time),
            exists=True,
            accessible=True,
            locked=False,
            hidden=entry.is_hidden,
            system=entry.is_system,
        )

        # Add tags
        asset.add_tag("filesystem")
        asset.add_tag("directory")

        if entry.is_system:
            asset.add_tag("system")
        if entry.is_hidden:
            asset.add_tag("hidden")
        if entry.is_symlink:
            asset.add_tag("junction")
        if entry.is_read_only:
            asset.add_tag("readonly")

        # Add metadata
        asset.custom_metadata.set("depth", entry.depth)
        asset.custom_metadata.set("file_count", entry.file_count)
        asset.custom_metadata.set("subdirectory_count", entry.subdirectory_count)
        asset.custom_metadata.set("is_read_only", entry.is_read_only)

        return asset
