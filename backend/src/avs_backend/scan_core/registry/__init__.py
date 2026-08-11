"""
AVS Shield Scan Core — Registry Enumerator.

Discovers registry assets (hives, keys, values) without classifying,
repairing, or deleting anything. Completely independent from the
existing Registry Cleaner module.
"""

from .models import (
    RegistryHive,
    RegistryKeyAsset,
    RegistryValueAsset,
    RegistryValueType,
    RegistryStatistics,
)
from .filters import (
    RegistryFilter,
    HiveFilter,
    KeyFilter,
    ValueNameFilter,
    DepthFilter,
    PathFilter,
    RegexFilter,
    RegistryFilterChain,
)
from .enumerator import (
    RegistryEnumerator,
    RegistryEnumerateOptions,
    RegistryProgressEvent,
    RegistryProgressCallback,
    RegistryCancelEvent,
    RegistryTarget,
    get_default_registry_targets,
    enumerate_registry,
)

__all__ = [
    "RegistryHive",
    "RegistryKeyAsset",
    "RegistryValueAsset",
    "RegistryValueType",
    "RegistryStatistics",
    "RegistryFilter",
    "HiveFilter",
    "KeyFilter",
    "ValueNameFilter",
    "DepthFilter",
    "PathFilter",
    "RegexFilter",
    "RegistryFilterChain",
    "RegistryEnumerator",
    "RegistryEnumerateOptions",
    "RegistryProgressEvent",
    "RegistryProgressCallback",
    "RegistryCancelEvent",
    "RegistryTarget",
    "get_default_registry_targets",
    "enumerate_registry",
]
