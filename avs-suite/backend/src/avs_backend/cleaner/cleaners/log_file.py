"""Old log file cleaner.

Sweeps common log locations for ``.log``, ``.log1``, ``.log2`` and
``.etl`` files older than 14 days. The age gate protects debugging
sessions in progress — recent logs are always kept.

Roots:

* ``C:\\Windows\\Logs`` — Windows setup / servicing logs.
* ``%LOCALAPPDATA%\\Microsoft\\Windows\\WebCache`` — WinInet log files.
* ``%TEMP%`` scoped to ``.log`` (user-mode installer logs).
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class LogFileCleaner(BaseCleaner):
    id = "log-files"
    name = "Old Log Files"
    description = "Application and Windows log files older than 14 days."
    category = CleanerCategory.LOGS
    extensions = ("log", "log1", "log2", "etl")
    min_age_days = 14

    def targets(self) -> Iterable[Path]:
        return [
            expand(r"%SystemRoot%\Logs"),
            expand(r"%LOCALAPPDATA%\Microsoft\Windows\WebCache"),
            expand(r"%TEMP%"),
        ]
