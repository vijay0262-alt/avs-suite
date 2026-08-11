"""
Adapter Registry — SC-6B

Automatically selects the correct adapter for a source model.
"""

from __future__ import annotations

from typing import Any, Optional

from .base_adapter import BaseAssetAdapter
from .filesystem_adapter import FilesystemAdapter
from .registry_adapter import RegistryAdapter
from .browser_adapter import BrowserAdapter
from .windows_adapter import WindowsAdapter
from .runtime_adapter import RuntimeAdapter
from ..assets import ScanAsset


class AdapterRegistry:
    """
    Registry that automatically selects the correct adapter for a source model.

    Consumers don't need to know which adapter to use — the registry
    automatically finds the right one.
    """

    def __init__(self):
        self._adapters: list[BaseAssetAdapter] = [
            FilesystemAdapter(),
            RegistryAdapter(),
            BrowserAdapter(),
            WindowsAdapter(),
            RuntimeAdapter(),
        ]

    def get_adapter_for(self, obj: Any) -> Optional[BaseAssetAdapter]:
        """
        Find the appropriate adapter for the given object.

        Args:
            obj: Source object to convert

        Returns:
            Adapter that supports the object, or None if not found
        """
        for adapter in self._adapters:
            if adapter.supports(obj):
                return adapter
        return None

    def convert(self, obj: Any) -> ScanAsset:
        """
        Convert a source object to ScanAsset using the appropriate adapter.

        Args:
            obj: Source object to convert

        Returns:
            Converted ScanAsset instance

        Raises:
            ValueError: If no adapter supports the object type
        """
        adapter = self.get_adapter_for(obj)
        if adapter is None:
            raise ValueError(f"No adapter found for type: {type(obj)}")
        return adapter.convert(obj)

    def convert_many(self, objects: list[Any]) -> list[ScanAsset]:
        """
        Convert multiple objects to ScanAssets.

        Args:
            objects: List of source objects

        Returns:
            List of converted ScanAsset instances
        """
        results = []
        for obj in objects:
            try:
                asset = self.convert(obj)
                results.append(asset)
            except (ValueError, TypeError):
                # Skip unsupported objects
                continue
        return results

    def register_adapter(self, adapter: BaseAssetAdapter) -> None:
        """
        Register a custom adapter.

        Args:
            adapter: Custom adapter to register
        """
        self._adapters.append(adapter)

    def get_all_adapters(self) -> list[BaseAssetAdapter]:
        """Get all registered adapters."""
        return self._adapters.copy()


# Global registry instance
_global_registry = AdapterRegistry()


def get_adapter_for(obj: Any) -> Optional[BaseAssetAdapter]:
    """
    Find the appropriate adapter for the given object (global registry).

    Args:
        obj: Source object to convert

    Returns:
        Adapter that supports the object, or None if not found
    """
    return _global_registry.get_adapter_for(obj)


def convert_to_asset(obj: Any) -> ScanAsset:
    """
    Convert a source object to ScanAsset (global registry).

    Args:
        obj: Source object to convert

    Returns:
        Converted ScanAsset instance

    Raises:
        ValueError: If no adapter supports the object type
    """
    return _global_registry.convert(obj)
