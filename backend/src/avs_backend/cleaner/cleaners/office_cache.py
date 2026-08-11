"""Microsoft Office cache and temp cleaner.

Scans Office-specific cache and temporary file directories that accumulate
over time. These are safe to delete — Office rebuilds caches as needed.

Roots:
  * Office Unsaved Files: %LOCALAPPDATA%\\Microsoft\\Office\\UnsavedFiles
  * Office File Cache (16.0): %LOCALAPPDATA%\\Microsoft\\Office\\16.0\\OfficeFileCache
  * Office File Cache (15.0): %LOCALAPPDATA%\\Microsoft\\Office\\15.0\\OfficeFileCache
  * Office Temp: %LOCALAPPDATA%\\Microsoft\\Office\\16.0\\Temp
  * Office Document Cache: %LOCALAPPDATA%\\Microsoft\\Office\\16.0\\DocumentCache
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class OfficeCacheCleaner(BaseCleaner):
    id = "office-cache"
    name = "Microsoft Office Cache"
    description = (
        "Microsoft Office temporary files, document caches, and unsaved "
        "file recovery data. Safe to delete — Office rebuilds as needed."
    )
    category = CleanerCategory.APPLICATIONS

    def targets(self) -> Iterable[Path]:
        roots: list[Path] = []
        candidates = [
            r"%LOCALAPPDATA%\Microsoft\Office\UnsavedFiles",
            r"%LOCALAPPDATA%\Microsoft\Office\16.0\OfficeFileCache",
            r"%LOCALAPPDATA%\Microsoft\Office\15.0\OfficeFileCache",
            r"%LOCALAPPDATA%\Microsoft\Office\16.0\Temp",
            r"%LOCALAPPDATA%\Microsoft\Office\16.0\DocumentCache",
        ]
        for template in candidates:
            p = expand(template)
            if p.exists():
                roots.append(p)
        return roots
