"""Windows Retail Demo cleanup.

Windows Retail Demo mode (used in stores) creates demo content and
cache in ``%LOCALAPPDATA%\\RetailDemo`` and ``%PROGRAMDATA%\\Microsoft\\Windows\\RetailDemo``.
On non-store PCs this data is leftover and safe to remove.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class RetailDemoCleaner(BaseCleaner):
    id = "retail-demo"
    name = "Retail Demo Content"
    description = (
        "Windows Retail Demo mode leftover content — safe to remove on "
        "non-store PCs. Recovers disk space from demo data."
    )
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        candidates = [
            r"%LOCALAPPDATA%\RetailDemo",
            r"%PROGRAMDATA%\Microsoft\Windows\RetailDemo",
        ]
        roots: list[Path] = []
        for template in candidates:
            p = expand(template)
            if p.exists():
                roots.append(p)
        return roots
