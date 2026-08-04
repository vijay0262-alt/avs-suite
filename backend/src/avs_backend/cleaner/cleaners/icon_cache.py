"""Icon cache cleaner.

Windows stores icon cache data in ``%LOCALAPPDATA%\\IconCache.db`` —
a single database file that caches file-type and shortcut icons.

Purging this file fixes visual bugs where files display generic white
icons instead of their correct logos. Windows automatically rebuilds
the cache on next Explorer restart.
"""

from __future__ import annotations

import os
from pathlib import Path
from threading import Event
from typing import Callable, Iterable

from ..interfaces import CleanerCategory, CleanerResult, ProgressCallback, ScanItem
from ..scanner_base import BaseCleaner, expand


class IconCacheCleaner(BaseCleaner):
    id = "icon-cache"
    name = "Icon Cache"
    description = "Windows Explorer icon cache database — purging fixes incorrect file icons."
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        # Only scan the Explorer subfolder — it contains thumbcache and
        # iconcache databases. The top-level IconCache.db is handled in
        # the scan() override to avoid walking all of %LOCALAPPDATA%.
        explorer_cache = expand(r"%LOCALAPPDATA%\Microsoft\Windows\Explorer")
        if explorer_cache.exists():
            return [explorer_cache]
        return []

    def include(self, entry: os.DirEntry[str]) -> bool:
        name = entry.name.lower()
        return (
            name.startswith("thumbcache")
            or name.startswith("iconcache")
        )

    def scan(
        self,
        cancel: Event,
        on_progress: ProgressCallback,
        on_file: "Callable[[str], None] | None" = None,
    ) -> CleanerResult:
        result = super().scan(cancel, on_progress, on_file=on_file)

        # Manually check for the single IconCache.db file at %LOCALAPPDATA%
        if cancel.is_set():
            return result
        icon_cache = expand(r"%LOCALAPPDATA%\IconCache.db")
        if icon_cache.exists() and icon_cache.is_file():
            try:
                st = icon_cache.stat()
                result.items.append(
                    ScanItem(
                        path=str(icon_cache),
                        name=icon_cache.name,
                        extension="db",
                        size=int(st.st_size),
                        modified_at=float(st.st_mtime),
                    )
                )
                result.total_files += 1
                result.total_bytes += int(st.st_size)
            except OSError:
                pass

        return result
