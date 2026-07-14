"""Thumbnail cache cleaner.

Windows Explorer caches image thumbnails per-user in
``%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer`` as ``thumbcache_*.db``
and ``iconcache_*.db`` files. Deleting them is safe — Explorer rebuilds
on demand.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class ThumbnailCacheCleaner(BaseCleaner):
    id = "thumbnail-cache"
    name = "Thumbnail Cache"
    description = "Windows Explorer thumbnail and icon cache databases."
    category = CleanerCategory.SYSTEM
    extensions = ("db",)

    def targets(self) -> Iterable[Path]:
        return [expand(r"%LOCALAPPDATA%\Microsoft\Windows\Explorer")]

    def include(self, entry) -> bool:  # type: ignore[override]
        name = entry.name.lower()
        return name.startswith(("thumbcache_", "iconcache_"))
