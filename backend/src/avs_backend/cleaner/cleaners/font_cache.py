"""Windows Font Cache cleaner.

Windows caches font data in ``%WINDIR%\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache``
and the legacy ``%WINDIR%\\System32\\FNTCACHE.DAT`` file.
Clearing this cache is safe — Windows rebuilds it automatically.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class FontCacheCleaner(BaseCleaner):
    id = "font-cache"
    name = "Font Cache"
    description = (
        "Windows font cache database — rebuilt automatically by the "
        "Font Cache service. Safe to delete."
    )
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        candidates = [
            r"%WINDIR%\ServiceProfiles\LocalService\AppData\Local\FontCache",
            r"%WINDIR%\System32\FNTCACHE.DAT",
        ]
        roots: list[Path] = []
        for template in candidates:
            p = expand(template)
            if p.exists():
                roots.append(p)
        return roots
