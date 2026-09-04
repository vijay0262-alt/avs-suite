"""Windows BranchCache cleaner.

BranchCache is a WAN optimization feature that caches content from
HTTP/HTTPS and SMB servers. The cache lives in a hidden folder on
each drive. Clearing it is safe — content is re-fetched on demand.
"""

from __future__ import annotations

import os
import platform
from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner


class BranchCacheCleaner(BaseCleaner):
    id = "branch-cache"
    name = "BranchCache"
    description = (
        "Windows BranchCache WAN optimization cache — safe to clear, "
        "content is re-fetched from servers on demand."
    )
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        if platform.system() != "Windows":
            return []
        roots: list[Path] = []
        # BranchCache stores data in a hidden folder on the system drive
        for drive_letter in "CDEFGH":
            drive = f"{drive_letter}:\\"
            if not os.path.exists(drive):
                continue
            bc = Path(drive) / "ProgramData" / "Microsoft" / "Windows" / "BranchCache"
            if bc.exists():
                roots.append(bc)
        return roots
