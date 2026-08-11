"""
Optional filters for the Scan Core Registry Enumerator.

Filters are composable — chain them via RegistryFilterChain.
Each filter receives an entry and returns True to keep it, False to skip.
"""

from __future__ import annotations

import re
import os
from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable

from .models import RegistryHive, RegistryKeyAsset, RegistryValueAsset


@runtime_checkable
class RegistryFilter(Protocol):
    """Protocol for all registry enumerator filters."""

    def matches_key(self, key: RegistryKeyAsset) -> bool:
        """Return True if the key passes this filter."""
        ...

    def should_descend(self, key: RegistryKeyAsset) -> bool:
        """Return True if the enumerator should descend into this key."""
        ...

    def matches_value(self, value: RegistryValueAsset) -> bool:
        """Return True if the value passes this filter."""
        ...


@dataclass
class HiveFilter:
    """Include only keys/values from the specified hives."""

    hives: set[RegistryHive]

    def matches_key(self, key: RegistryKeyAsset) -> bool:
        return key.hive in self.hives

    def should_descend(self, key: RegistryKeyAsset) -> bool:
        return key.hive in self.hives

    def matches_value(self, value: RegistryValueAsset) -> bool:
        return value.hive in self.hives


@dataclass
class KeyFilter:
    """Include only keys whose name matches one of the specified patterns.

    Matching is case-insensitive. A key matches if its name contains
    any of the specified substrings.
    """

    key_names: set[str]

    def __post_init__(self) -> None:
        self.key_names = {n.lower() for n in self.key_names}

    def matches_key(self, key: RegistryKeyAsset) -> bool:
        return any(n in key.key_name.lower() for n in self.key_names)

    def should_descend(self, key: RegistryKeyAsset) -> bool:
        return True

    def matches_value(self, value: RegistryValueAsset) -> bool:
        return True


@dataclass
class ValueNameFilter:
    """Include only values whose name matches one of the specified patterns.

    Matching is case-insensitive. A value matches if its name equals
    any of the specified names (exact match).
    """

    value_names: set[str]

    def __post_init__(self) -> None:
        self.value_names = {n.lower() for n in self.value_names}

    def matches_key(self, key: RegistryKeyAsset) -> bool:
        return True

    def should_descend(self, key: RegistryKeyAsset) -> bool:
        return True

    def matches_value(self, value: RegistryValueAsset) -> bool:
        if value.is_default:
            return "(default)" in self.value_names
        return value.value_name.lower() in self.value_names


@dataclass
class DepthFilter:
    """Limit enumeration to a maximum key depth.

    Depth 0 = root key only, 1 = root + immediate subkeys, etc.
    """

    max_depth: int

    def matches_key(self, key: RegistryKeyAsset) -> bool:
        return key.depth <= self.max_depth

    def should_descend(self, key: RegistryKeyAsset) -> bool:
        return key.depth < self.max_depth

    def matches_value(self, value: RegistryValueAsset) -> bool:
        return True


@dataclass
class PathFilter:
    """Include only keys whose path starts with one of the specified prefixes.

    Matching is case-insensitive and normalizes backslashes.
    """

    path_prefixes: set[str]

    def __post_init__(self) -> None:
        self.path_prefixes = {
            os.path.normpath(p).lower().replace("/", "\\") for p in self.path_prefixes
        }

    def _matches_path(self, key_path: str) -> bool:
        norm = os.path.normpath(key_path).lower().replace("/", "\\")
        return any(norm.startswith(prefix) for prefix in self.path_prefixes)

    def matches_key(self, key: RegistryKeyAsset) -> bool:
        return self._matches_path(key.key_path)

    def should_descend(self, key: RegistryKeyAsset) -> bool:
        return True

    def matches_value(self, value: RegistryValueAsset) -> bool:
        return self._matches_path(value.key_path)


@dataclass
class RegexFilter:
    """Include only keys/values matching the specified regex pattern.

    The pattern is applied to the full key path (hive\\key\\subkey).
    Uses re.IGNORECASE for case-insensitive matching.
    """

    pattern: str
    _compiled: re.Pattern = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        self._compiled = re.compile(self.pattern, re.IGNORECASE)

    def matches_key(self, key: RegistryKeyAsset) -> bool:
        return bool(self._compiled.search(key.full_path))

    def should_descend(self, key: RegistryKeyAsset) -> bool:
        return True

    def matches_value(self, value: RegistryValueAsset) -> bool:
        return bool(self._compiled.search(value.full_path))


@dataclass
class RegistryFilterChain:
    """Compose multiple registry filters. An entry must pass ALL filters."""

    filters: list[RegistryFilter]

    def __init__(self, *filters: RegistryFilter) -> None:
        self.filters = list(filters)

    def matches_key(self, key: RegistryKeyAsset) -> bool:
        return all(f.matches_key(key) for f in self.filters)

    def should_descend(self, key: RegistryKeyAsset) -> bool:
        return all(f.should_descend(key) for f in self.filters)

    def matches_value(self, value: RegistryValueAsset) -> bool:
        return all(f.matches_value(value) for f in self.filters)
