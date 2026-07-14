"""Per-user Temp folder cleaner.

Scans ``%LOCALAPPDATA%\\Temp`` and ``%TEMP%`` (which may resolve to the
same path). This is where applications place scratch files scoped to
the currently-signed-in user.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class UserTempCleaner(BaseCleaner):
    id = "user-temp"
    name = "User Temp Files"
    description = (
        "Temporary files created by user-mode applications in %LOCALAPPDATA%\\Temp."
    )
    category = CleanerCategory.USER

    def targets(self) -> Iterable[Path]:
        seen: set[str] = set()
        roots: list[Path] = []
        for candidate in (r"%LOCALAPPDATA%\Temp", r"%TEMP%", r"%TMP%"):
            p = expand(candidate)
            key = str(p).lower()
            if key in seen:
                continue
            seen.add(key)
            roots.append(p)
        return roots
