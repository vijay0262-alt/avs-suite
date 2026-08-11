"""Windows Installer patch cache cleaner.

Scans the Windows Installer patch cache at
``%SystemRoot%\\Installer\\$PatchCache$``. This folder stores MSP patch
files that Windows Installer uses for self-healing. Over time, especially
on systems with many installed applications, this cache can grow to
several GB.

We only scan the ``$PatchCache$`` subfolder — never the parent
``%SystemRoot%\\Installer`` directory itself, which contains critical
MSI packages that must not be deleted.

The parent ``C:\\Windows\\Installer`` is in the forbidden roots list,
so even if a path somehow escapes the target, the safe_paths guard
will block it.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class InstallerCacheCleaner(BaseCleaner):
    id = "installer-cache"
    name = "Windows Installer Patch Cache"
    description = (
        "Windows Installer patch cache ($PatchCache$) — accumulates MSP "
        "files used for self-healing. Safe to clear; Installer re-downloads "
        "patches if needed."
    )
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        root = expand(r"%SystemRoot%\Installer\$PatchCache$")
        if root.exists():
            return [root]
        return []
