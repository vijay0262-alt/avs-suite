"""
AVS AI Shield Scan Core — Browser Enumerator.

Discovers browser installations, profiles, and assets without cleaning,
reading, or classifying anything. Completely independent from Browser
Cleaner, Privacy Cleaner, Security Engine, and all other modules.
"""

from .models import (
    BrowserType,
    BrowserInstallation,
    BrowserProfile,
    BrowserAsset,
    BrowserAssetType,
    ProfileStatus,
    BrowserStatistics,
)
from .filters import (
    BrowserFilter,
    ProfileFilter,
    AssetTypeFilter,
    PathFilter,
    RegexFilter,
    BrowserFilterChain,
)
from .enumerator import (
    BrowserEnumerator,
    BrowserEnumerateOptions,
    BrowserProgressEvent,
    BrowserProgressCallback,
    BrowserCancelEvent,
    enumerate_browsers,
)

__all__ = [
    "BrowserType",
    "BrowserInstallation",
    "BrowserProfile",
    "BrowserAsset",
    "BrowserAssetType",
    "ProfileStatus",
    "BrowserStatistics",
    "BrowserFilter",
    "ProfileFilter",
    "AssetTypeFilter",
    "PathFilter",
    "RegexFilter",
    "BrowserFilterChain",
    "BrowserEnumerator",
    "BrowserEnumerateOptions",
    "BrowserProgressEvent",
    "BrowserProgressCallback",
    "BrowserCancelEvent",
    "enumerate_browsers",
]
