"""
Data models for the Scan Core Browser Enumerator.

These dataclasses are deliberately decoupled from Browser Cleaner,
Privacy Cleaner, Security Engine, and all other modules. They describe
only what exists on the filesystem — not what should be done about it.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

from ..utils.path_utils import asset_name as _asset_name, asset_directory as _asset_directory, asset_extension as _asset_extension


class BrowserType(Enum):
    """Supported browser types."""
    CHROME = "chrome"
    EDGE = "edge"
    FIREFOX = "firefox"
    BRAVE = "brave"
    OPERA = "opera"
    OPERA_GX = "opera_gx"
    VIVALDI = "vivaldi"
    CHROMIUM = "chromium"

    @property
    def display_name(self) -> str:
        return {
            BrowserType.CHROME: "Google Chrome",
            BrowserType.EDGE: "Microsoft Edge",
            BrowserType.FIREFOX: "Mozilla Firefox",
            BrowserType.BRAVE: "Brave",
            BrowserType.OPERA: "Opera",
            BrowserType.OPERA_GX: "Opera GX",
            BrowserType.VIVALDI: "Vivaldi",
            BrowserType.CHROMIUM: "Chromium",
        }[self]

    @property
    def is_chromium_based(self) -> bool:
        return self in (
            BrowserType.CHROME,
            BrowserType.EDGE,
            BrowserType.BRAVE,
            BrowserType.OPERA,
            BrowserType.OPERA_GX,
            BrowserType.VIVALDI,
            BrowserType.CHROMIUM,
        )


class ProfileStatus(Enum):
    """Status of a discovered browser profile."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    LOCKED = "locked"
    UNKNOWN = "unknown"


class BrowserAssetType(Enum):
    """Types of browser assets that can be discovered."""
    CACHE = "cache"
    GPU_CACHE = "gpu_cache"
    CODE_CACHE = "code_cache"
    SERVICE_WORKER = "service_worker"
    CACHE_STORAGE = "cache_storage"
    COOKIES = "cookies"
    HISTORY = "history"
    DOWNLOADS = "downloads"
    FAVICONS = "favicons"
    BOOKMARKS = "bookmarks"
    SESSIONS = "sessions"
    PREFERENCES = "preferences"
    EXTENSIONS = "extensions"
    LOCAL_STORAGE = "local_storage"
    INDEXED_DB = "indexed_db"
    WEB_DATA = "web_data"
    LOGIN_DATA = "login_data"
    CRASH_REPORTS = "crash_reports"
    SHADER_CACHE = "shader_cache"
    EXTENSION_SETTINGS = "extension_settings"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class BrowserInstallation:
    """A browser installation discovered on the system."""

    browser_type: BrowserType
    executable_path: str
    version: Optional[str]
    install_dir: str
    is_portable: bool
    user_data_dir: Optional[str]

    @property
    def is_installed(self) -> bool:
        return os.path.isfile(self.executable_path)

    @property
    def asset_name(self) -> str:
        return _asset_name(self.executable_path)

    @property
    def asset_directory(self) -> str:
        return _asset_directory(self.executable_path)


@dataclass(frozen=True, slots=True)
class BrowserProfile:
    """A browser profile discovered on the system."""

    browser_type: BrowserType
    profile_name: str
    profile_path: str
    display_name: str
    is_default: bool
    is_guest: bool
    profile_size: int
    last_used_time: Optional[float]
    status: ProfileStatus

    @property
    def last_used_datetime(self) -> Optional[datetime]:
        if self.last_used_time is None:
            return None
        return datetime.fromtimestamp(self.last_used_time)


@dataclass(frozen=True, slots=True)
class BrowserAsset:
    """A single browser asset (file or directory) discovered in a profile."""

    browser_type: BrowserType
    profile_name: str
    asset_type: BrowserAssetType
    asset_path: str
    asset_name: str
    is_directory: bool
    size: int
    exists: bool

    @property
    def full_path(self) -> str:
        return self.asset_path


@dataclass
class BrowserStatistics:
    """Diagnostics collected during browser enumeration."""

    browsers_found: int = 0
    profiles_found: int = 0
    assets_found: int = 0
    skipped: int = 0
    permission_errors: int = 0
    elapsed_seconds: float = 0.0
    profiles_per_second: float = 0.0
    assets_per_second: float = 0.0

    def record_browser(self) -> None:
        self.browsers_found += 1

    def record_profile(self) -> None:
        self.profiles_found += 1

    def record_asset(self) -> None:
        self.assets_found += 1

    def record_skip(self) -> None:
        self.skipped += 1

    def record_permission_error(self) -> None:
        self.permission_errors += 1

    def finalize(self, elapsed: float) -> None:
        self.elapsed_seconds = elapsed
        if elapsed > 0:
            self.profiles_per_second = self.profiles_found / elapsed
            self.assets_per_second = self.assets_found / elapsed
