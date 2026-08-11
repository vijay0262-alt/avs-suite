"""
Optional filters for the Scan Core Browser Enumerator.

Filters are composable — chain them via BrowserFilterChain.
Each filter receives an entry and returns True to keep it, False to skip.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable

from .models import (
    BrowserType,
    BrowserInstallation,
    BrowserProfile,
    BrowserAsset,
    BrowserAssetType,
    ProfileStatus,
)


@runtime_checkable
class BrowserFilterProtocol(Protocol):
    """Protocol for all browser enumerator filters."""

    def matches_browser(self, browser: BrowserInstallation) -> bool: ...
    def matches_profile(self, profile: BrowserProfile) -> bool: ...
    def matches_asset(self, asset: BrowserAsset) -> bool: ...


@dataclass
class BrowserFilter:
    """Include only entries from the specified browser types."""

    browser_types: set[BrowserType]

    def matches_browser(self, browser: BrowserInstallation) -> bool:
        return browser.browser_type in self.browser_types

    def matches_profile(self, profile: BrowserProfile) -> bool:
        return profile.browser_type in self.browser_types

    def matches_asset(self, asset: BrowserAsset) -> bool:
        return asset.browser_type in self.browser_types


@dataclass
class ProfileFilter:
    """Filter profiles by name, default status, or status."""

    profile_names: Optional[set[str]] = None
    default_only: bool = False
    exclude_guest: bool = False
    statuses: Optional[set[ProfileStatus]] = None

    def __post_init__(self) -> None:
        if self.profile_names is not None:
            self.profile_names = {n.lower() for n in self.profile_names}

    def matches_browser(self, browser: BrowserInstallation) -> bool:
        return True

    def matches_profile(self, profile: BrowserProfile) -> bool:
        if self.default_only and not profile.is_default:
            return False
        if self.exclude_guest and profile.is_guest:
            return False
        if self.profile_names is not None:
            if profile.profile_name.lower() not in self.profile_names:
                return False
        if self.statuses is not None:
            if profile.status not in self.statuses:
                return False
        return True

    def matches_asset(self, asset: BrowserAsset) -> bool:
        return True


@dataclass
class AssetTypeFilter:
    """Include only assets of the specified types."""

    asset_types: set[BrowserAssetType]

    def matches_browser(self, browser: BrowserInstallation) -> bool:
        return True

    def matches_profile(self, profile: BrowserProfile) -> bool:
        return True

    def matches_asset(self, asset: BrowserAsset) -> bool:
        return asset.asset_type in self.asset_types


@dataclass
class PathFilter:
    """Include only assets whose path contains one of the specified substrings.

    Matching is case-insensitive.
    """

    path_substrings: set[str]

    def __post_init__(self) -> None:
        self.path_substrings = {s.lower() for s in self.path_substrings}

    def _matches_path(self, path: str) -> bool:
        lower = path.lower()
        return any(sub in lower for sub in self.path_substrings)

    def matches_browser(self, browser: BrowserInstallation) -> bool:
        return True

    def matches_profile(self, profile: BrowserProfile) -> bool:
        return True

    def matches_asset(self, asset: BrowserAsset) -> bool:
        return self._matches_path(asset.asset_path)


@dataclass
class RegexFilter:
    """Include only assets whose path matches the specified regex pattern."""

    pattern: str
    _compiled: Optional[re.Pattern] = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        self._compiled = re.compile(self.pattern, re.IGNORECASE)

    def matches_browser(self, browser: BrowserInstallation) -> bool:
        return True  # Regex applies to profiles and assets, not browser detection

    def matches_profile(self, profile: BrowserProfile) -> bool:
        return True  # Regex applies to assets only, not profile filtering

    def matches_asset(self, asset: BrowserAsset) -> bool:
        assert self._compiled is not None
        return bool(self._compiled.search(asset.asset_path))


@dataclass
class BrowserFilterChain:
    """Compose multiple browser filters. An entry must pass ALL filters."""

    filters: list[BrowserFilterProtocol]

    def __init__(self, *filters: BrowserFilterProtocol) -> None:
        self.filters = list(filters)

    def matches_browser(self, browser: BrowserInstallation) -> bool:
        return all(f.matches_browser(browser) for f in self.filters)

    def matches_profile(self, profile: BrowserProfile) -> bool:
        return all(f.matches_profile(profile) for f in self.filters)

    def matches_asset(self, asset: BrowserAsset) -> bool:
        return all(f.matches_asset(asset) for f in self.filters)
