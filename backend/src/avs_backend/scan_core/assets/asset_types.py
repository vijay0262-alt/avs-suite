"""
Asset Types and Categories — SC-6A

Defines the taxonomy of all discoverable objects in AVS Shield.
"""

from __future__ import annotations

from enum import Enum


class AssetType(str, Enum):
    """Type of asset discovered by Scan Core."""

    # Filesystem
    FILE = "file"
    DIRECTORY = "directory"
    DRIVE = "drive"
    SYMLINK = "symlink"
    JUNCTION = "junction"

    # Registry
    REGISTRY_KEY = "registry_key"
    REGISTRY_VALUE = "registry_value"

    # Browser
    BROWSER_INSTALLATION = "browser_installation"
    BROWSER_PROFILE = "browser_profile"
    BROWSER_EXTENSION = "browser_extension"
    BROWSER_CACHE = "browser_cache"
    BROWSER_COOKIE = "browser_cookie"
    BROWSER_HISTORY = "browser_history"

    # Windows
    SERVICE = "service"
    DRIVER = "driver"
    INSTALLED_PROGRAM = "installed_program"
    STARTUP_ENTRY = "startup_entry"
    SCHEDULED_TASK = "scheduled_task"

    # Runtime
    PROCESS = "process"
    LOCKED_FILE = "locked_file"
    SESSION = "session"
    RESOURCE_SNAPSHOT = "resource_snapshot"

    # Reserved for future
    NETWORK_CONNECTION = "network_connection"
    NETWORK_SHARE = "network_share"
    CLOUD_FILE = "cloud_file"
    MALWARE_SIGNATURE = "malware_signature"
    PLUGIN = "plugin"
    UNKNOWN = "unknown"


class AssetCategory(str, Enum):
    """High-level category grouping asset types."""

    FILESYSTEM = "filesystem"
    REGISTRY = "registry"
    BROWSER = "browser"
    WINDOWS = "windows"
    RUNTIME = "runtime"
    NETWORK = "network"
    CLOUD = "cloud"
    SECURITY = "security"
    PLUGIN = "plugin"
    UNKNOWN = "unknown"


class AssetSource(str, Enum):
    """Source enumerator that discovered the asset."""

    FILESYSTEM_ENUMERATOR = "filesystem_enumerator"
    REGISTRY_ENUMERATOR = "registry_enumerator"
    BROWSER_ENUMERATOR = "browser_enumerator"
    WINDOWS_ENUMERATOR = "windows_enumerator"
    RUNTIME_ENUMERATOR = "runtime_enumerator"
    NETWORK_ENUMERATOR = "network_enumerator"
    CLOUD_ENUMERATOR = "cloud_enumerator"
    MALWARE_SCANNER = "malware_scanner"
    PLUGIN = "plugin"
    MANUAL = "manual"
    UNKNOWN = "unknown"


# Mapping from AssetType to AssetCategory
ASSET_TYPE_TO_CATEGORY: dict[AssetType, AssetCategory] = {
    # Filesystem
    AssetType.FILE: AssetCategory.FILESYSTEM,
    AssetType.DIRECTORY: AssetCategory.FILESYSTEM,
    AssetType.DRIVE: AssetCategory.FILESYSTEM,
    AssetType.SYMLINK: AssetCategory.FILESYSTEM,
    AssetType.JUNCTION: AssetCategory.FILESYSTEM,
    # Registry
    AssetType.REGISTRY_KEY: AssetCategory.REGISTRY,
    AssetType.REGISTRY_VALUE: AssetCategory.REGISTRY,
    # Browser
    AssetType.BROWSER_INSTALLATION: AssetCategory.BROWSER,
    AssetType.BROWSER_PROFILE: AssetCategory.BROWSER,
    AssetType.BROWSER_EXTENSION: AssetCategory.BROWSER,
    AssetType.BROWSER_CACHE: AssetCategory.BROWSER,
    AssetType.BROWSER_COOKIE: AssetCategory.BROWSER,
    AssetType.BROWSER_HISTORY: AssetCategory.BROWSER,
    # Windows
    AssetType.SERVICE: AssetCategory.WINDOWS,
    AssetType.DRIVER: AssetCategory.WINDOWS,
    AssetType.INSTALLED_PROGRAM: AssetCategory.WINDOWS,
    AssetType.STARTUP_ENTRY: AssetCategory.WINDOWS,
    AssetType.SCHEDULED_TASK: AssetCategory.WINDOWS,
    # Runtime
    AssetType.PROCESS: AssetCategory.RUNTIME,
    AssetType.LOCKED_FILE: AssetCategory.RUNTIME,
    AssetType.SESSION: AssetCategory.RUNTIME,
    AssetType.RESOURCE_SNAPSHOT: AssetCategory.RUNTIME,
    # Reserved
    AssetType.NETWORK_CONNECTION: AssetCategory.NETWORK,
    AssetType.NETWORK_SHARE: AssetCategory.NETWORK,
    AssetType.CLOUD_FILE: AssetCategory.CLOUD,
    AssetType.MALWARE_SIGNATURE: AssetCategory.SECURITY,
    AssetType.PLUGIN: AssetCategory.PLUGIN,
    AssetType.UNKNOWN: AssetCategory.UNKNOWN,
}


def get_category_for_type(asset_type: AssetType) -> AssetCategory:
    """Get the category for a given asset type."""
    return ASSET_TYPE_TO_CATEGORY.get(asset_type, AssetCategory.UNKNOWN)
