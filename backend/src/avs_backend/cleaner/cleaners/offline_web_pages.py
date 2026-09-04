"""Offline Web Pages cleaner.

Windows caches offline web pages (for Internet Explorer / legacy Edge)
in ``%LOCALAPPDATA%\\Microsoft\\Windows\\Offline Web Pages``.
Clearing this cache is safe and recovers disk space.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class OfflineWebPagesCleaner(BaseCleaner):
    id = "offline-web-pages"
    name = "Offline Web Pages"
    description = (
        "Cached offline web pages from Internet Explorer / legacy Edge — "
        "safe to delete, no longer needed in modern browsers."
    )
    category = CleanerCategory.BROWSERS

    def targets(self) -> Iterable[Path]:
        candidates = [
            r"%LOCALAPPDATA%\Microsoft\Windows\Offline Web Pages",
            r"%LOCALAPPDATA%\Microsoft\Windows\WebCache",
        ]
        roots: list[Path] = []
        for template in candidates:
            p = expand(template)
            if p.exists():
                roots.append(p)
        return roots
