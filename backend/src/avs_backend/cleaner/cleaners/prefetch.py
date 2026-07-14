"""Prefetch cleaner.

``C:\\Windows\\Prefetch`` holds ``.pf`` files Windows uses to speed up
application launch. These are regenerated automatically; deleting them
is safe though usually low-value (only ~KB per app).

We intentionally keep this cleaner in the scaffold because it is a
canonical CCleaner-parity entry — the future cleaning phase can gate
it behind an "aggressive" preset.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class PrefetchCleaner(BaseCleaner):
    id = "prefetch"
    name = "Windows Prefetch"
    description = "Application launch prefetch files under C:\\Windows\\Prefetch."
    category = CleanerCategory.SYSTEM
    extensions = ("pf",)

    def targets(self) -> Iterable[Path]:
        return [expand(r"%SystemRoot%\Prefetch")]
