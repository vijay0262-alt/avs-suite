"""
Optional filters for the Scan Core Windows Enumerator.

Filters are composable — chain them via WindowsFilterChain.
Each filter receives an asset and returns True to keep it, False to skip.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable, Union

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
)

# Union of all asset types
AnyWindowsAsset = Union[
    ServiceAsset,
    DriverAsset,
    ScheduledTaskAsset,
    InstalledProgramAsset,
    SecurityAsset,
    RestorePointAsset,
    SystemAsset,
    NetworkAdapterAsset,
]


@runtime_checkable
class WindowsFilter(Protocol):
    """Protocol for all Windows enumerator filters."""
    def matches(self, asset: AnyWindowsAsset) -> bool: ...


@dataclass
class AssetTypeFilter:
    """Include only assets of the specified types."""

    asset_types: set[WindowsAssetType]

    def matches(self, asset: AnyWindowsAsset) -> bool:
        return asset.asset_type in self.asset_types


@dataclass
class StatusFilter:
    """Filter assets by status string (case-insensitive)."""

    statuses: set[str]

    def __post_init__(self) -> None:
        self.statuses = {s.lower() for s in self.statuses}

    def _get_status(self, asset: AnyWindowsAsset) -> str:
        if isinstance(asset, ServiceAsset):
            return asset.status.lower()
        if isinstance(asset, DriverAsset):
            return asset.state.lower()
        if isinstance(asset, SecurityAsset):
            return asset.status.lower()
        if isinstance(asset, NetworkAdapterAsset):
            return asset.state.lower()
        return ""

    def matches(self, asset: AnyWindowsAsset) -> bool:
        status = self._get_status(asset)
        if not status:
            return True  # Assets without status pass the filter
        return status in self.statuses


@dataclass
class NameFilter:
    """Include only assets whose name contains one of the specified substrings.

    Matching is case-insensitive.
    """

    name_substrings: set[str]

    def __post_init__(self) -> None:
        self.name_substrings = {s.lower() for s in self.name_substrings}

    def matches(self, asset: AnyWindowsAsset) -> bool:
        name = asset.asset_name.lower()
        return any(sub in name for sub in self.name_substrings)


@dataclass
class PathFilter:
    """Include only assets whose path contains one of the specified substrings.

    Matching is case-insensitive.
    """

    path_substrings: set[str]

    def __post_init__(self) -> None:
        self.path_substrings = {s.lower() for s in self.path_substrings}

    def matches(self, asset: AnyWindowsAsset) -> bool:
        path = asset.asset_path.lower()
        if not path:
            return True  # Assets without path pass the filter
        return any(sub in path for sub in self.path_substrings)


@dataclass
class RegexFilter:
    """Include only assets whose name or path matches the regex pattern."""

    pattern: str
    _compiled: Optional[re.Pattern] = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        self._compiled = re.compile(self.pattern, re.IGNORECASE)

    def matches(self, asset: AnyWindowsAsset) -> bool:
        assert self._compiled is not None
        name_match = self._compiled.search(asset.asset_name)
        path_match = self._compiled.search(asset.asset_path) if asset.asset_path else False
        return bool(name_match or path_match)


@dataclass
class EnabledFilter:
    """Filter scheduled tasks or security assets by enabled status."""

    enabled_only: bool = True

    def matches(self, asset: AnyWindowsAsset) -> bool:
        if isinstance(asset, ScheduledTaskAsset):
            if self.enabled_only:
                return asset.enabled
            return not asset.enabled
        if isinstance(asset, SecurityAsset):
            if self.enabled_only:
                return asset.is_enabled
            return not asset.is_enabled
        return True  # Non-toggleable assets pass


@dataclass
class WindowsFilterChain:
    """Compose multiple Windows filters. An asset must pass ALL filters."""

    filters: list[WindowsFilter]

    def __init__(self, *filters: WindowsFilter) -> None:
        self.filters = list(filters)

    def matches(self, asset: AnyWindowsAsset) -> bool:
        return all(f.matches(asset) for f in self.filters)
