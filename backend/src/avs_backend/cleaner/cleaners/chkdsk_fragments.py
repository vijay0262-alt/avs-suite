"""Chkdsk file fragments cleaner.

When Windows runs ``chkdsk /f`` and finds lost file fragments, it
converts them to hidden files named ``FILE0000.CHK``, ``FILE0001.CHK``,
etc., inside a ``FOUND.000`` folder on the drive root. Subsequent chkdsk
runs create ``FOUND.001``, ``FOUND.002``, and so on.

These fragments are almost never useful to end users — they are raw
cluster contents that can only be reassembled with specialised tools.
Safely deletable to reclaim disk space.
"""

from __future__ import annotations

import string
from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class ChkdskFragmentsCleaner(BaseCleaner):
    id = "chkdsk-fragments"
    name = "Chkdsk File Fragments"
    description = "Recovered file fragments (FOUND.000, FOUND.001, ...) from disk repair operations."
    category = CleanerCategory.SYSTEM
    extensions = ("chk",)

    def targets(self) -> Iterable[Path]:
        roots: list[Path] = []
        for drive_letter in string.ascii_uppercase:
            for i in range(10):
                candidate = f"{drive_letter}:\\FOUND.{i:03d}"
                p = expand(candidate)
                if p.exists():
                    roots.append(p)
        return roots
