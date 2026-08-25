"""
Optional filters for the Scan Core filesystem enumerator.

Filters are composable — chain them via FilterChain.
Each filter receives an entry and returns True to keep it, False to skip.
Directory exclusion and max-depth filters also affect traversal.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol, runtime_checkable

from .models import FileEntry, DirectoryEntry


@runtime_checkable
class EnumerateFilter(Protocol):
    """
    Protocol for all enumerator filters.

    For file/directory entries: return True to include, False to exclude.
    For directory traversal control: implement should_descend().
    """

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        """Return True if the entry passes this filter."""
        ...

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        """Return True if the enumerator should descend into this directory."""
        ...


@dataclass
class ExtensionFilter:
    """Include only files with one of the specified extensions."""

    extensions: set[str]

    def __post_init__(self) -> None:
        self.extensions = {ext.lower().lstrip(".") for ext in self.extensions}

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        if isinstance(entry, FileEntry):
            return entry.extension.lstrip(".") in self.extensions
        return True

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        return True


@dataclass
class DirectoryExclusionFilter:
    """Exclude directories whose path matches any exclusion pattern."""

    excluded_paths: set[str]
    excluded_names: set[str] = None  # type: ignore

    def __post_init__(self) -> None:
        self.excluded_paths = {os.path.normpath(p).lower() for p in self.excluded_paths}
        if self.excluded_names is None:
            self.excluded_names = set()
        self.excluded_names = {n.lower() for n in self.excluded_names}

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        if isinstance(entry, DirectoryEntry):
            norm_path = os.path.normpath(entry.path).lower()
            if norm_path in self.excluded_paths:
                return False
            if entry.name.lower() in self.excluded_names:
                return False
        return True

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        norm_path = os.path.normpath(dir_entry.path).lower()
        if norm_path in self.excluded_paths:
            return False
        if dir_entry.name.lower() in self.excluded_names:
            return False
        return True


@dataclass
class HiddenFileFilter:
    """Filter to include or exclude hidden files/directories.

    include_hidden=True means hidden entries are kept (default).
    include_hidden=False means hidden entries are excluded.
    """

    include_hidden: bool = True

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        if self.include_hidden:
            return True
        return not entry.is_hidden

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        if self.include_hidden:
            return True
        return not dir_entry.is_hidden


@dataclass
class MaxDepthFilter:
    """Limit enumeration to a maximum directory depth.

    Depth 0 = root only, 1 = root + immediate children, etc.
    """

    max_depth: int

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        return entry.depth <= self.max_depth

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        return dir_entry.depth < self.max_depth


@dataclass
class MaxSizeFilter:
    """Exclude files larger than max_size bytes."""

    max_size: int

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        if isinstance(entry, FileEntry):
            return entry.size <= self.max_size
        return True

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        return True


@dataclass
class DateRangeFilter:
    """Filter entries by modification date range.

    Either bound can be None to skip that side of the range.
    """

    after: Optional[datetime] = None
    before: Optional[datetime] = None

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        mod_ts = entry.modified_time
        if self.after is not None and mod_ts < self.after.timestamp():
            return False
        if self.before is not None and mod_ts > self.before.timestamp():
            return False
        return True

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        return True


@dataclass
class PytestTempExclusionFilter:
    """Exclude pytest temporary directories from production scans.

    Pytest creates temp directories inside %TEMP% (e.g.
    ``pytest-of-<user>/pytest-<N>/popen-gw<N>/...``).  These are test
    artifacts, not real cleanup targets.  This filter prevents them from
    being enumerated by the production scanner.
    """

    _EXCLUDE_MARKER = "pytest-of-"

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        if self._EXCLUDE_MARKER in entry.path.lower():
            return False
        return True

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        if self._EXCLUDE_MARKER in dir_entry.path.lower():
            return False
        return True


@dataclass
class FilterChain:
    """Compose multiple filters. An entry must pass ALL filters to be included."""

    filters: list[EnumerateFilter]

    def __init__(self, *filters: EnumerateFilter) -> None:
        self.filters = list(filters)

    def matches(self, entry: FileEntry | DirectoryEntry) -> bool:
        return all(f.matches(entry) for f in self.filters)

    def should_descend(self, dir_entry: DirectoryEntry) -> bool:
        return all(f.should_descend(dir_entry) for f in self.filters)
