"""
AVS Shield Scan Core — Windows Enumerator.

Discovers Windows assets (services, drivers, tasks, programs, security,
system info, network, restore points) without modifying, classifying,
or cleaning anything. Completely independent from all existing modules.
"""

from .models import (
    WindowsAssetType,
    ServiceAsset,
    DriverAsset,
    ScheduledTaskAsset,
    InstalledProgramAsset,
    SecurityAsset,
    RestorePointAsset,
    SystemAsset,
    NetworkAdapterAsset,
    WindowsStatistics,
)
from ..registry.models import PlatformNotSupported
from .filters import (
    WindowsFilter,
    AssetTypeFilter,
    StatusFilter,
    NameFilter,
    PathFilter,
    RegexFilter,
    EnabledFilter,
    WindowsFilterChain,
)
from .enumerator import (
    WindowsEnumerator,
    WindowsEnumerateOptions,
    WindowsProgressEvent,
    WindowsProgressCallback,
    WindowsCancelEvent,
    enumerate_windows,
)

__all__ = [
    "PlatformNotSupported",
    "WindowsAssetType",
    "ServiceAsset",
    "DriverAsset",
    "ScheduledTaskAsset",
    "InstalledProgramAsset",
    "SecurityAsset",
    "RestorePointAsset",
    "SystemAsset",
    "NetworkAdapterAsset",
    "WindowsStatistics",
    "WindowsFilter",
    "AssetTypeFilter",
    "StatusFilter",
    "NameFilter",
    "PathFilter",
    "RegexFilter",
    "EnabledFilter",
    "WindowsFilterChain",
    "WindowsEnumerator",
    "WindowsEnumerateOptions",
    "WindowsProgressEvent",
    "WindowsProgressCallback",
    "WindowsCancelEvent",
    "enumerate_windows",
]
