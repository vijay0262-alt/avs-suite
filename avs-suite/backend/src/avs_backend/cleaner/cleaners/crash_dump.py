"""Crash dump cleaner.

Windows writes minidumps to ``C:\\Windows\\Minidump`` and full memory
dumps to ``%LOCALAPPDATA%\\CrashDumps`` (Windows Error Reporting) or
``C:\\Windows\\MEMORY.DMP``. All are safely deletable once analysed.

We include ``.dmp`` and ``.mdmp`` files by extension so anti-virus /
IDE crash dumps stored in the same folders are also caught.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class CrashDumpCleaner(BaseCleaner):
    id = "crash-dumps"
    name = "Crash Dumps"
    description = "Windows Error Reporting and kernel memory dumps."
    category = CleanerCategory.SYSTEM
    extensions = ("dmp", "mdmp", "hdmp")

    def targets(self) -> Iterable[Path]:
        return [
            expand(r"%SystemRoot%\Minidump"),
            expand(r"%LOCALAPPDATA%\CrashDumps"),
            expand(r"%LOCALAPPDATA%\Microsoft\Windows\WER"),
        ]
