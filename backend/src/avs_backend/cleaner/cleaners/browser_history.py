"""Browser history and cookies cleaner.

Cleans Internet History, Download History, and Cookies for Chromium-based
browsers (Chrome, Edge, Brave, Opera, Vivaldi) and Firefox.

Unlike the cache cleaner, this targets SQLite databases and cookie stores
that contain user-identifiable data. Cookies are optional — deleting them
logs users out of websites.

Targets:
  * Chromium: History (URLs + downloads), Cookies, Top Sites
  * Firefox: places.sqlite (history + downloads), cookies.sqlite
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from threading import Event
from typing import Callable, Iterable

from ..interfaces import CleanerCategory, CleanerResult, ProgressCallback, ScanItem, ScanStatus
from ..scanner_base import BaseCleaner, expand


_CHROMIUM_HISTORY_ROOTS: tuple[str, ...] = (
    r"%LOCALAPPDATA%\Google\Chrome\User Data\Default",
    r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default",
    r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default",
    r"%APPDATA%\Opera Software\Opera Stable",
    r"%APPDATA%\Opera Software\Opera GX Stable",
    r"%LOCALAPPDATA%\Vivaldi\User Data\Default",
)

_CHROMIUM_HISTORY_FILES: tuple[str, ...] = (
    "History",
    "History-journal",
    "Top Sites",
    "Top Sites-journal",
    "DownloadMetadata",
    "Visited Links",
)

_CHROMIUM_NETWORK_FILES: tuple[str, ...] = (
    "Cookies",
    "Cookies-journal",
)

_FIREFOX_PROFILE_ROOT = r"%APPDATA%\Mozilla\Firefox\Profiles"

_FIREFOX_HISTORY_FILES: tuple[str, ...] = (
    "places.sqlite",
    "places.sqlite-wal",
    "places.sqlite-shm",
    "cookies.sqlite",
    "cookies.sqlite-wal",
    "cookies.sqlite-shm",
    "sitepermissions.sqlite",
)


class BrowserHistoryCleaner(BaseCleaner):
    id = "browser-history"
    name = "Browser History & Cookies"
    description = "Internet history, download history, and cookies from Chrome, Edge, Brave, Opera, Vivaldi, and Firefox."
    category = CleanerCategory.BROWSERS

    def targets(self) -> Iterable[Path]:
        # Return empty — all scanning is done in the scan() override
        # because we need to check individual files, not walk directories.
        return []

    def _collect_target_files(self) -> list[Path]:
        files: list[Path] = []

        # Chromium-based browsers
        for template in _CHROMIUM_HISTORY_ROOTS:
            base = expand(template)
            if not base.exists():
                continue
            for fname in _CHROMIUM_HISTORY_FILES:
                candidate = base / fname
                if candidate.exists() and candidate.is_file():
                    files.append(candidate)
            # Network subfolder for cookies
            network = base / "Network"
            if network.exists():
                for fname in _CHROMIUM_NETWORK_FILES:
                    candidate = network / fname
                    if candidate.exists() and candidate.is_file():
                        files.append(candidate)

        # Firefox profiles
        firefox_profiles = expand(_FIREFOX_PROFILE_ROOT)
        if firefox_profiles.exists():
            try:
                for entry in os.scandir(firefox_profiles):
                    if entry.is_dir(follow_symlinks=False):
                        profile_dir = Path(entry.path)
                        for fname in _FIREFOX_HISTORY_FILES:
                            candidate = profile_dir / fname
                            if candidate.exists() and candidate.is_file():
                                files.append(candidate)
            except OSError:
                pass

        return files

    def scan(
        self,
        cancel: Event,
        on_progress: ProgressCallback,
        on_file: "Callable[[str], None] | None" = None,
    ) -> CleanerResult:
        started = time.monotonic()
        result = CleanerResult(
            cleaner_id=self.id,
            name=self.name,
            description=self.description,
            category=self.category,
        )

        files = self._collect_target_files()
        total = len(files)
        for idx, filepath in enumerate(files):
            if cancel.is_set():
                result.status = ScanStatus.CANCELLED
                break
            try:
                st = filepath.stat()
                ext = filepath.suffix.lstrip(".").lower()
                result.items.append(
                    ScanItem(
                        path=str(filepath),
                        name=filepath.name,
                        extension=ext,
                        size=int(st.st_size),
                        modified_at=float(st.st_mtime),
                    )
                )
                result.total_files += 1
                result.total_bytes += int(st.st_size)
            except OSError:
                pass

            if on_file:
                try:
                    on_file(str(filepath))
                except Exception:
                    pass

            if total > 0:
                try:
                    on_progress(int((idx + 1) / total * 99))
                except Exception:
                    pass

        result.status = ScanStatus.CANCELLED if cancel.is_set() else ScanStatus.COMPLETED
        result.elapsed_ms = int((time.monotonic() - started) * 1000)
        try:
            on_progress(100)
        except Exception:
            pass
        return result
