"""
Runtime filters — composable filters for runtime asset enumeration.

All filters implement a simple protocol. The RuntimeFilterChain
composes them — an asset must pass ALL filters to be included.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable, Union

from .models import (
    ProcessAsset,
    ConnectionAsset,
    SessionAsset,
    LockedFileAsset,
    ResourceSnapshot,
    RuntimeAssetType,
)


AnyRuntimeAsset = Union[
    ProcessAsset,
    ConnectionAsset,
    SessionAsset,
    LockedFileAsset,
    ResourceSnapshot,
]


@runtime_checkable
class RuntimeFilter(Protocol):
    """Protocol for runtime asset filters."""

    def matches(self, asset: AnyRuntimeAsset) -> bool:
        ...


@dataclass
class ProcessNameFilter:
    """Include only processes whose name contains the specified substring (case-insensitive)."""

    name_substring: str

    def matches(self, asset: AnyRuntimeAsset) -> bool:
        if not isinstance(asset, ProcessAsset):
            return True
        return self.name_substring.lower() in asset.name.lower()


@dataclass
class PIDFilter:
    """Include only processes with the specified PID."""

    pid: int

    def matches(self, asset: AnyRuntimeAsset) -> bool:
        if not isinstance(asset, ProcessAsset):
            return True
        return asset.pid == self.pid


@dataclass
class UserFilter:
    """Include only processes or sessions belonging to the specified user (case-insensitive)."""

    username_substring: str

    def matches(self, asset: AnyRuntimeAsset) -> bool:
        if isinstance(asset, ProcessAsset):
            return self.username_substring.lower() in asset.username.lower()
        if isinstance(asset, SessionAsset):
            return self.username_substring.lower() in asset.username.lower()
        return True


@dataclass
class StatusFilter:
    """Include only assets with the specified status (case-insensitive)."""

    status: str

    def matches(self, asset: AnyRuntimeAsset) -> bool:
        if isinstance(asset, ProcessAsset):
            return asset.status.lower() == self.status.lower()
        if isinstance(asset, ConnectionAsset):
            return asset.state.lower() == self.status.lower()
        if isinstance(asset, SessionAsset):
            return asset.state.lower() == self.status.lower()
        return True


@dataclass
class PathFilter:
    """Include only assets whose path contains one of the specified substrings (case-insensitive)."""

    path_substrings: tuple[str, ...]

    def matches(self, asset: AnyRuntimeAsset) -> bool:
        path = asset.asset_path
        if not path:
            return True
        return any(sub.lower() in path.lower() for sub in self.path_substrings)


@dataclass
class RegexFilter:
    """Include only assets whose name or path matches the specified regex pattern."""

    pattern: str
    _compiled: Optional[re.Pattern] = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        self._compiled = re.compile(self.pattern, re.IGNORECASE)

    def matches(self, asset: AnyRuntimeAsset) -> bool:
        assert self._compiled is not None
        name_match = self._compiled.search(asset.asset_name)
        path_match = self._compiled.search(asset.asset_path) if asset.asset_path else False
        return bool(name_match or path_match)


@dataclass
class RuntimeFilterChain:
    """Compose multiple runtime filters. An asset must pass ALL filters."""

    filters: list[RuntimeFilter]

    def __init__(self, *filters: RuntimeFilter) -> None:
        self.filters = list(filters)

    def matches(self, asset: AnyRuntimeAsset) -> bool:
        return all(f.matches(asset) for f in self.filters)
