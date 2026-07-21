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

import ctypes
import os
import string
import time
from pathlib import Path
from typing import Callable, Iterable

from ..interfaces import CleanerCategory, CleaningActionResult, CleaningResult
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

    def clean(
        self,
        candidate_paths: list[str],
        cancel: "object",
        on_progress: "Callable[[int], None] | None" = None,
        on_file: "Callable[[str], None] | None" = None,
    ) -> CleaningResult:
        """Empty the Recycle Bin using the Windows Shell API.

        Unlike other cleaners that delete individual files, the Recycle Bin
        is emptied atomically via ``SHEmptyRecycleBin``. This is the correct
        Windows API — it handles per-SID metadata files, orphaned entries,
        and all drives in one call.
        """
        from threading import Event

        started = time.monotonic()
        result = CleaningResult(cleaner_id=self.id, name=self.name, category=self.category)

        if os.name != "nt":
            result.result = CleaningActionResult.NOTHING_TO_DO
            result.elapsed_ms = int((time.monotonic() - started) * 1000)
            if on_progress:
                on_progress(100)
            return result

        if on_progress:
            on_progress(10)

        # Calculate total size before emptying (from the scan candidates)
        total_size = 0
        for p in candidate_paths:
            try:
                if os.path.exists(p):
                    total_size += os.path.getsize(p)
            except (OSError, PermissionError):
                continue

        if on_progress:
            on_progress(30)

        try:
            # SHEmptyRecycleBinW with SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND
            # Flags: 0x0001 = no confirmation, 0x0002 = no progress UI, 0x0004 = no sound
            flags = 0x0001 | 0x0002 | 0x0004
            ret = ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, flags)

            if ret == 0:
                result.files_removed = len(candidate_paths)
                result.bytes_recovered = total_size
                result.result = CleaningActionResult.SUCCESS
            elif ret == 0x80070002:  # File not found - bin already empty
                result.result = CleaningActionResult.NOTHING_TO_DO
            else:
                result.errors.append(f"SHEmptyRecycleBin returned code 0x{ret & 0xFFFFFFFF:08X}")
                result.result = CleaningActionResult.PARTIAL
        except Exception as e:
            result.errors.append(f"Failed to empty Recycle Bin: {e}")
            result.result = CleaningActionResult.FAILED

        if on_progress:
            on_progress(100)

        result.elapsed_ms = int((time.monotonic() - started) * 1000)
        return result
