"""Crash dump cleaner.

Windows writes minidumps to ``C:\\Windows\\Minidump`` and full memory
dumps to ``%LOCALAPPDATA%\\CrashDumps`` (Windows Error Reporting) or
``C:\\Windows\\MEMORY.DMP``. All are safely deletable once analysed.

We include ``.dmp`` and ``.mdmp`` files by extension so anti-virus /
IDE crash dumps stored in the same folders are also caught.

``MEMORY.DMP`` is a single file at the root of ``C:\\Windows`` — we
check for it explicitly rather than scanning the entire Windows directory.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from threading import Event
from typing import Callable, Iterable

from ..interfaces import CleanerCategory, CleanerResult, ProgressCallback, ScanItem, ScanStatus
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

    def scan(
        self,
        cancel: Event,
        on_progress: ProgressCallback,
        on_file: "Callable[[str], None] | None" = None,
    ) -> CleanerResult:
        result = super().scan(cancel, on_progress, on_file=on_file)

        # Also check for the single MEMORY.DMP file at %SystemRoot%\MEMORY.DMP
        # without walking the entire Windows directory tree.
        if cancel.is_set():
            return result
        memory_dmp = expand(r"%SystemRoot%\MEMORY.DMP")
        if memory_dmp.exists() and memory_dmp.is_file():
            try:
                st = memory_dmp.stat()
                result.items.append(
                    ScanItem(
                        path=str(memory_dmp),
                        name=memory_dmp.name,
                        extension="dmp",
                        size=int(st.st_size),
                        modified_at=float(st.st_mtime),
                    )
                )
                result.total_files += 1
                result.total_bytes += int(st.st_size)
            except OSError:
                pass

        return result

