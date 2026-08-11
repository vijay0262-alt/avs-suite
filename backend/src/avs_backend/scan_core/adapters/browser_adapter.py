"""
Browser Adapter — SC-6B

Converts browser models (BrowserInstallation, BrowserProfile, BrowserAsset) to ScanAsset.
"""

from __future__ import annotations

from typing import Any
from datetime import datetime

from .base_adapter import BaseAssetAdapter
from ..browser.models import BrowserInstallation, BrowserProfile, BrowserAsset, BrowserAssetType
from ..assets import (
    ScanAsset,
    AssetType,
    AssetCategory,
    AssetSource,
    generate_browser_installation_asset_id,
    AssetIdentity,
    generate_asset_id,
    AssetRelationship,
    RelationshipType,
)


class BrowserAdapter(BaseAssetAdapter):
    """Adapter for browser models."""

    def supports(self, obj: Any) -> bool:
        """Check if object is a browser model."""
        return isinstance(obj, (BrowserInstallation, BrowserProfile, BrowserAsset))

    def convert(self, obj: Any) -> ScanAsset:
        """Convert browser model to ScanAsset."""
        if isinstance(obj, BrowserInstallation):
            return self._convert_browser_installation(obj)
        elif isinstance(obj, BrowserProfile):
            return self._convert_browser_profile(obj)
        elif isinstance(obj, BrowserAsset):
            return self._convert_browser_asset(obj)
        else:
            raise ValueError(f"Unsupported type: {type(obj)}")

    def _convert_browser_installation(self, browser: BrowserInstallation) -> ScanAsset:
        """Convert BrowserInstallation to ScanAsset."""
        # Generate deterministic asset ID
        asset_id = generate_browser_installation_asset_id(
            browser.browser_type.value,
            browser.install_dir
        )

        # Create base asset
        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.BROWSER_INSTALLATION,
            asset_category=AssetCategory.BROWSER,
            asset_source=AssetSource.BROWSER_ENUMERATOR,
            display_name=browser.browser_type.display_name,
            canonical_path=browser.install_dir.lower().replace("\\", "/"),
            exists=browser.is_installed,
            accessible=True,
            locked=False,
            hidden=False,
            system=False,
        )

        # Add tags
        asset.add_tag("browser")
        asset.add_tag("browser_installation")
        asset.add_tag(browser.browser_type.value)

        if browser.is_portable:
            asset.add_tag("portable")
        if browser.browser_type.is_chromium_based:
            asset.add_tag("chromium_based")

        # Add metadata
        asset.custom_metadata.set("browser_type", browser.browser_type.value)
        asset.custom_metadata.set("browser_display_name", browser.browser_type.display_name)
        asset.custom_metadata.set("executable_path", browser.executable_path)
        asset.custom_metadata.set("version", browser.version)
        asset.custom_metadata.set("install_dir", browser.install_dir)
        asset.custom_metadata.set("is_portable", browser.is_portable)
        asset.custom_metadata.set("is_chromium_based", browser.browser_type.is_chromium_based)
        if browser.user_data_dir:
            asset.custom_metadata.set("user_data_dir", browser.user_data_dir)

        return asset

    def _convert_browser_profile(self, profile: BrowserProfile) -> ScanAsset:
        """Convert BrowserProfile to ScanAsset."""
        # Generate deterministic asset ID
        identity = AssetIdentity(
            asset_type=AssetType.BROWSER_PROFILE,
            primary_key=profile.browser_type.value,
            secondary_key=profile.profile_path,
        )
        asset_id = generate_asset_id(identity)

        # Create base asset
        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.BROWSER_PROFILE,
            asset_category=AssetCategory.BROWSER,
            asset_source=AssetSource.BROWSER_ENUMERATOR,
            display_name=profile.display_name,
            canonical_path=profile.profile_path.lower().replace("\\", "/"),
            modified_at=profile.last_used_datetime,
            exists=True,
            accessible=profile.status.value != "locked",
            locked=profile.status.value == "locked",
            hidden=False,
            system=False,
        )

        # Add tags
        asset.add_tag("browser")
        asset.add_tag("browser_profile")
        asset.add_tag(profile.browser_type.value)

        if profile.is_default:
            asset.add_tag("default_profile")
        if profile.is_guest:
            asset.add_tag("guest_profile")
        if profile.status.value == "active":
            asset.add_tag("active")

        # Add metadata
        asset.custom_metadata.set("browser_type", profile.browser_type.value)
        asset.custom_metadata.set("browser_display_name", profile.browser_type.display_name)
        asset.custom_metadata.set("profile_name", profile.profile_name)
        asset.custom_metadata.set("profile_path", profile.profile_path)
        asset.custom_metadata.set("is_default", profile.is_default)
        asset.custom_metadata.set("is_guest", profile.is_guest)
        asset.custom_metadata.set("profile_size", profile.profile_size)
        asset.custom_metadata.set("status", profile.status.value)

        return asset

    def _convert_browser_asset(self, browser_asset: BrowserAsset) -> ScanAsset:
        """Convert BrowserAsset to ScanAsset."""
        # Generate deterministic asset ID
        identity = AssetIdentity(
            asset_type=self._map_browser_asset_type(browser_asset.asset_type),
            primary_key=browser_asset.browser_type.value,
            secondary_key=browser_asset.profile_name,
            tertiary_key=browser_asset.asset_path,
        )
        asset_id = generate_asset_id(identity)

        # Create base asset
        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=self._map_browser_asset_type(browser_asset.asset_type),
            asset_category=AssetCategory.BROWSER,
            asset_source=AssetSource.BROWSER_ENUMERATOR,
            display_name=browser_asset.asset_name,
            canonical_path=browser_asset.asset_path.lower().replace("\\", "/"),
            exists=browser_asset.exists,
            accessible=True,
            locked=False,
            hidden=False,
            system=False,
        )

        # Add tags
        asset.add_tag("browser")
        asset.add_tag(browser_asset.browser_type.value)
        asset.add_tag(browser_asset.asset_type.value)

        if browser_asset.asset_type in (BrowserAssetType.CACHE, BrowserAssetType.GPU_CACHE, BrowserAssetType.CODE_CACHE):
            asset.add_tag("cache")
        if browser_asset.asset_type == BrowserAssetType.COOKIES:
            asset.add_tag("cookies")
        if browser_asset.asset_type == BrowserAssetType.HISTORY:
            asset.add_tag("history")

        # Add metadata
        asset.custom_metadata.set("browser_type", browser_asset.browser_type.value)
        asset.custom_metadata.set("profile_name", browser_asset.profile_name)
        asset.custom_metadata.set("browser_asset_type", browser_asset.asset_type.value)
        asset.custom_metadata.set("is_directory", browser_asset.is_directory)
        asset.custom_metadata.set("size", browser_asset.size)

        # Add belongs_to relationship to profile
        profile_identity = AssetIdentity(
            asset_type=AssetType.BROWSER_PROFILE,
            primary_key=browser_asset.browser_type.value,
            secondary_key=browser_asset.asset_path.rsplit("\\", 1)[0] if "\\" in browser_asset.asset_path else browser_asset.asset_path,
        )
        profile_id = generate_asset_id(profile_identity)
        
        belongs_to_rel = AssetRelationship(
            source_asset_id=asset_id,
            target_asset_id=profile_id,
            relationship_type=RelationshipType.BELONGS_TO,
        )
        asset.add_relationship(belongs_to_rel)

        return asset

    def _map_browser_asset_type(self, browser_asset_type: BrowserAssetType) -> AssetType:
        """Map BrowserAssetType to AssetType."""
        mapping = {
            BrowserAssetType.CACHE: AssetType.BROWSER_CACHE,
            BrowserAssetType.GPU_CACHE: AssetType.BROWSER_CACHE,
            BrowserAssetType.CODE_CACHE: AssetType.BROWSER_CACHE,
            BrowserAssetType.SERVICE_WORKER: AssetType.BROWSER_CACHE,
            BrowserAssetType.CACHE_STORAGE: AssetType.BROWSER_CACHE,
            BrowserAssetType.COOKIES: AssetType.BROWSER_COOKIE,
            BrowserAssetType.HISTORY: AssetType.BROWSER_HISTORY,
            BrowserAssetType.EXTENSIONS: AssetType.BROWSER_EXTENSION,
        }
        return mapping.get(browser_asset_type, AssetType.FILE)
