"""
Asset Adapter Layer — SC-6B

Translation layer that converts existing Scan Core models into Universal ScanAsset.

Adapters are pure mapping components. They NEVER:
- Clean, repair, score, classify
- Cache, optimize, verify
- Modify source data

They ONLY translate existing models to ScanAsset.
"""

from .base_adapter import BaseAssetAdapter, AdapterStatistics
from .filesystem_adapter import FilesystemAdapter
from .registry_adapter import RegistryAdapter
from .browser_adapter import BrowserAdapter
from .windows_adapter import WindowsAdapter
from .runtime_adapter import RuntimeAdapter
from .adapter_registry import AdapterRegistry, get_adapter_for, convert_to_asset

__all__ = [
    "BaseAssetAdapter",
    "AdapterStatistics",
    "FilesystemAdapter",
    "RegistryAdapter",
    "BrowserAdapter",
    "WindowsAdapter",
    "RuntimeAdapter",
    "AdapterRegistry",
    "get_adapter_for",
    "convert_to_asset",
]
