"""Windows Temp folder cleaner.

Scans ``C:\\Windows\\Temp`` — the machine-wide temporary directory
Windows itself and installers use for scratch files. Everything under
this root is safely deletable when the file is unlocked, which the
future cleaning phase will verify.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class WindowsTempCleaner(BaseCleaner):
    id = "windows-temp"
    name = "Windows Temp"
    description = "Temporary files created by Windows and installers in C:\\Windows\\Temp."
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        return [expand(r"%SystemRoot%\Temp")]
