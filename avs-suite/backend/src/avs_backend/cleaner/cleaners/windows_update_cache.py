"""Windows Update download cache cleaner.

``C:\\Windows\\SoftwareDistribution\\Download`` accumulates downloaded
update packages that are never automatically cleaned once installed.
On busy machines this folder can grow to many gigabytes.

The Windows service ``wuauserv`` locks some of these files while an
update is in progress; the cleaning phase will stop the service (with
user consent + rollback) before deletion. For scanning purposes we
simply walk the folder — locked files are still readable by ``stat``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class WindowsUpdateCacheCleaner(BaseCleaner):
    id = "windows-update-cache"
    name = "Windows Update Cache"
    description = (
        "Downloaded Windows Update packages retained after install "
        "(C:\\Windows\\SoftwareDistribution\\Download)."
    )
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        return [expand(r"%SystemRoot%\SoftwareDistribution\Download")]
