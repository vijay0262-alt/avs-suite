"""
Asset Identity Generation — SC-6A

Deterministic, platform-independent identity generation.
Same object → same Asset ID, always.

Never uses random UUIDs.
Uses SHA-256 hashing of canonical identifiers.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Optional

from .asset_types import AssetType


@dataclass(frozen=True)
class AssetIdentity:
    """
    Immutable identity components for an asset.

    Used to generate deterministic asset_id.
    """

    asset_type: AssetType
    primary_key: str
    secondary_key: Optional[str] = None
    tertiary_key: Optional[str] = None

    def to_canonical_string(self) -> str:
        """
        Convert identity to canonical string for hashing.

        Format: type:primary[:secondary[:tertiary]]
        All components are normalized (lowercase, forward slashes).
        """
        parts = [
            self.asset_type.value,
            _normalize_path(self.primary_key),
        ]
        if self.secondary_key:
            parts.append(_normalize_path(self.secondary_key))
        if self.tertiary_key:
            parts.append(_normalize_path(self.tertiary_key))
        return ":".join(parts)


def generate_asset_id(identity: AssetIdentity) -> str:
    """
    Generate deterministic asset ID from identity components.

    Uses SHA-256 hash of canonical string representation.
    Returns hex digest (64 characters).

    Examples:
        File: sha256("file:c:/users/alice/documents/report.pdf")
        Registry Key: sha256("registry_key:hkey_local_machine:software\\microsoft\\windows")
        Process: sha256("process:chrome.exe:12345")
    """
    canonical = identity.to_canonical_string()
    hash_bytes = hashlib.sha256(canonical.encode("utf-8")).digest()
    return hash_bytes.hex()


def _normalize_path(path: str) -> str:
    """
    Normalize path for cross-platform identity generation.

    Rules:
    - Convert to lowercase
    - Replace backslashes with forward slashes
    - Remove trailing slashes
    - Collapse multiple slashes
    """
    if not path:
        return ""

    # Lowercase
    normalized = path.lower()

    # Backslash → forward slash
    normalized = normalized.replace("\\", "/")

    # Collapse multiple slashes
    while "//" in normalized:
        normalized = normalized.replace("//", "/")

    # Remove trailing slash (except for root)
    if len(normalized) > 1 and normalized.endswith("/"):
        normalized = normalized.rstrip("/")

    return normalized


# ── Convenience functions for common asset types ──────────────────


def generate_file_asset_id(file_path: str) -> str:
    """Generate asset ID for a file."""
    identity = AssetIdentity(
        asset_type=AssetType.FILE,
        primary_key=file_path,
    )
    return generate_asset_id(identity)


def generate_directory_asset_id(directory_path: str) -> str:
    """Generate asset ID for a directory."""
    identity = AssetIdentity(
        asset_type=AssetType.DIRECTORY,
        primary_key=directory_path,
    )
    return generate_asset_id(identity)


def generate_registry_key_asset_id(hive: str, key_path: str) -> str:
    """Generate asset ID for a registry key."""
    identity = AssetIdentity(
        asset_type=AssetType.REGISTRY_KEY,
        primary_key=hive,
        secondary_key=key_path,
    )
    return generate_asset_id(identity)


def generate_registry_value_asset_id(hive: str, key_path: str, value_name: str) -> str:
    """Generate asset ID for a registry value."""
    identity = AssetIdentity(
        asset_type=AssetType.REGISTRY_VALUE,
        primary_key=hive,
        secondary_key=key_path,
        tertiary_key=value_name,
    )
    return generate_asset_id(identity)


def generate_process_asset_id(executable_path: str, pid: int) -> str:
    """Generate asset ID for a process."""
    identity = AssetIdentity(
        asset_type=AssetType.PROCESS,
        primary_key=executable_path,
        secondary_key=str(pid),
    )
    return generate_asset_id(identity)


def generate_browser_installation_asset_id(browser_name: str, install_dir: str) -> str:
    """Generate asset ID for a browser installation."""
    identity = AssetIdentity(
        asset_type=AssetType.BROWSER_INSTALLATION,
        primary_key=browser_name,
        secondary_key=install_dir,
    )
    return generate_asset_id(identity)


def generate_service_asset_id(service_name: str) -> str:
    """Generate asset ID for a Windows service."""
    identity = AssetIdentity(
        asset_type=AssetType.SERVICE,
        primary_key=service_name,
    )
    return generate_asset_id(identity)


def generate_driver_asset_id(driver_name: str) -> str:
    """Generate asset ID for a Windows driver."""
    identity = AssetIdentity(
        asset_type=AssetType.DRIVER,
        primary_key=driver_name,
    )
    return generate_asset_id(identity)
