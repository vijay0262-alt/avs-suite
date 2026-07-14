"""Browser cache cleaner.

Enumerates cache directories for the browsers commonly installed on
Windows. We only touch the *Cache* subfolders — never Bookmarks,
History, or Login Data. All roots are user-scoped
(``%LOCALAPPDATA%``); we never touch anything under
``C:\\Program Files``.

Supported browsers:

* Google Chrome
* Microsoft Edge (Chromium)
* Brave
* Opera / Opera GX
* Vivaldi
* Firefox (profile-based; wildcard scanning within
  ``%APPDATA%\\Mozilla\\Firefox\\Profiles\\*\\cache2``)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


_CHROMIUM_ROOTS: tuple[str, ...] = (
    r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache",
    r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Code Cache",
    r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache",
    r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Code Cache",
    r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Cache",
    r"%APPDATA%\Opera Software\Opera Stable\Cache",
    r"%APPDATA%\Opera Software\Opera GX Stable\Cache",
    r"%LOCALAPPDATA%\Vivaldi\User Data\Default\Cache",
)

_FIREFOX_PROFILE_ROOT = r"%APPDATA%\Mozilla\Firefox\Profiles"


class BrowserCacheCleaner(BaseCleaner):
    id = "browser-cache"
    name = "Browser Caches"
    description = "Cached web resources from Chrome, Edge, Brave, Opera, Vivaldi, and Firefox."
    category = CleanerCategory.BROWSERS

    def targets(self) -> Iterable[Path]:
        roots: list[Path] = []
        for template in _CHROMIUM_ROOTS:
            p = expand(template)
            if p.exists():
                roots.append(p)

        firefox_profiles = expand(_FIREFOX_PROFILE_ROOT)
        if firefox_profiles.exists():
            try:
                for entry in os.scandir(firefox_profiles):
                    if entry.is_dir(follow_symlinks=False):
                        cache2 = Path(entry.path) / "cache2"
                        if cache2.exists():
                            roots.append(cache2)
            except OSError:
                pass  # base walker will log its own errors when scanning existing roots
        return roots
