"""Recycle Bin cleaner.

Enumerates the current user's Recycle Bin storage located under
``C:\\$Recycle.Bin\\<SID>``. Windows keeps each user's deleted files
in a per-SID sub-folder with ``$I*`` (metadata) and ``$R*`` (content)
files. We do not attempt to decode ``$I*`` metadata here — the details
table displays the raw filenames, and the future cleaning phase will
use the Shell API to empty the bin properly.

Note: the drive-root convention (``$Recycle.Bin`` at the root of every
volume) means we must enumerate all fixed drives; :func:`iter_drives`
does that safely on Windows and returns ``["/"]`` elsewhere.
"""

from __future__ import annotations

import os
import string
from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner


def _iter_fixed_drives() -> Iterable[Path]:
    if os.name != "nt":  # pragma: no cover - Windows-only path
        return []
    drives: list[Path] = []
    for letter in string.ascii_uppercase:
        root = Path(f"{letter}:\\")
        if root.exists():
            drives.append(root)
    return drives


class RecycleBinCleaner(BaseCleaner):
    id = "recycle-bin"
    name = "Recycle Bin"
    description = "Files sitting in the Recycle Bin across all fixed drives."
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        roots: list[Path] = []
        for drive in _iter_fixed_drives():
            candidate = drive / "$Recycle.Bin"
            if candidate.exists():
                roots.append(candidate)
        return roots
