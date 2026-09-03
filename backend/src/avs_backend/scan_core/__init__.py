"""
AVS AI Shield Scan Core — reusable filesystem enumeration infrastructure.

This package is intentionally isolated from all existing modules
(cleaner, security, privacy, orchestrator, health engine).

It ONLY discovers files, folders, and drives.
It never decides junk, security, privacy, or optimization.
"""

from .models import FileEntry, DirectoryEntry, DriveEntry, EntryType
from .filters import (
    EnumerateFilter,
    ExtensionFilter,
    DirectoryExclusionFilter,
    HiddenFileFilter,
    MaxDepthFilter,
    MaxSizeFilter,
    DateRangeFilter,
    FilterChain,
)
from .enumerator import (
    FilesystemEnumerator,
    EnumerateOptions,
    ProgressEvent,
    ProgressCallback,
    ScanLocation,
    CancelEvent,
    get_default_scan_locations,
    enumerate_filesystem,
)

__all__ = [
    "FileEntry",
    "DirectoryEntry",
    "DriveEntry",
    "EntryType",
    "EnumerateFilter",
    "ExtensionFilter",
    "DirectoryExclusionFilter",
    "HiddenFileFilter",
    "MaxDepthFilter",
    "MaxSizeFilter",
    "DateRangeFilter",
    "FilterChain",
    "FilesystemEnumerator",
    "EnumerateOptions",
    "ProgressEvent",
    "ProgressCallback",
    "ScanLocation",
    "CancelEvent",
    "get_default_scan_locations",
    "enumerate_filesystem",
]
