"""Recent items and jump lists cleaner.

Windows tracks recently-opened files and documents in
``%APPDATA%\\Microsoft\\Windows\\Recent``. This folder populates the
"Recent Files" section when you right-click taskbar icons (Jump Lists).

Clearing it protects user privacy and reduces File Explorer load delays.
Also includes AutomaticDestinations and CustomDestinations which are the
Jump List data stores.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class RecentItemsCleaner(BaseCleaner):
    id = "recent-items"
    name = "Recent Items & Jump Lists"
    description = "Recently opened files, documents, and taskbar Jump Lists — clearing protects privacy."
    category = CleanerCategory.USER

    def targets(self) -> Iterable[Path]:
        # AutomaticDestinations / CustomDestinations live *inside* Recent —
        # listing them as separate roots would double-count every file.
        roots: list[Path] = []
        recent = expand(r"%APPDATA%\Microsoft\Windows\Recent")
        if recent.exists():
            roots.append(recent)
        return roots
