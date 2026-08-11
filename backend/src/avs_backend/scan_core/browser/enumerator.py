"""
Browser Enumerator — streaming discovery of browser installations, profiles, and assets.

Detects installed browsers, finds user profiles, and enumerates asset
files/directories (cache, cookies, history, etc.) without reading or
parsing any file contents. Only checks existence and collects metadata.

This module ONLY discovers. It never cleans, deletes, or classifies.
"""

from __future__ import annotations

import os
import sys
import time
import json
import dataclasses
from dataclasses import dataclass, field
from pathlib import Path
from typing import Generator, Optional, Callable, Union, Any

from .models import (
    BrowserType,
    BrowserInstallation,
    BrowserProfile,
    BrowserAsset,
    BrowserAssetType,
    ProfileStatus,
    BrowserStatistics,
)
from .filters import BrowserFilterChain, BrowserFilterProtocol

_is_windows = sys.platform == "win32"

# ── Progress events ────────────────────────────────────────────

@dataclass
class BrowserProgressEvent:
    """Progress event emitted during browser enumeration."""

    current_browser: Optional[str] = None
    current_profile: Optional[str] = None
    current_asset: Optional[str] = None
    profiles_enumerated: int = 0
    assets_enumerated: int = 0
    elapsed_seconds: float = 0.0
    profiles_per_second: float = 0.0
    assets_per_second: float = 0.0
    cancelled: bool = False


BrowserProgressCallback = Callable[[BrowserProgressEvent], None]


# ── Cancellation ───────────────────────────────────────────────

class BrowserCancelEvent:
    """Simple cancellation event for cooperative cancellation."""

    def __init__(self) -> None:
        self._cancelled = False

    def cancel(self) -> None:
        self._cancelled = True

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled


# ── Options ────────────────────────────────────────────────────

@dataclass
class BrowserEnumerateOptions:
    """Options controlling browser enumeration behavior."""

    include_installations: bool = True
    include_profiles: bool = True
    include_assets: bool = True
    compute_profile_sizes: bool = True
    progress_interval: int = 200
    filter: Optional[BrowserFilterChain] = None
    cancel_event: Optional[BrowserCancelEvent] = None


# ── Browser detection config ───────────────────────────────────

@dataclass
class _BrowserDetectConfig:
    """Internal config for detecting a browser installation."""
    browser_type: BrowserType
    exe_names: list[str]
    install_paths: list[str]
    user_data_paths: list[str]
    profile_dir_name: str  # e.g. "User Data" for Chromium, "" for Firefox
    local_state_file: str  # e.g. "Local State" for Chromium, "" for Firefox
    profiles_file: str  # e.g. "" for Chromium, "profiles.ini" for Firefox


_cached_browser_configs: Optional[list["_BrowserDetectConfig"]] = None


def _reset_browser_configs_cache() -> None:
    """Reset the cached browser configs. Useful for testing."""
    global _cached_browser_configs
    _cached_browser_configs = None


def _get_browser_configs() -> list["_BrowserDetectConfig"]:
    """Return detection configs for all supported browsers.

    Configs are cached after first call so that tests can patch them
    and enumerate() will see the same patched objects.
    """
    global _cached_browser_configs
    if _cached_browser_configs is not None:
        return _cached_browser_configs

    home = str(Path.home())
    local_appdata = os.environ.get("LOCALAPPDATA", os.path.join(home, "AppData", "Local"))
    appdata = os.environ.get("APPDATA", os.path.join(home, "AppData", "Roaming"))
    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")

    configs: list[_BrowserDetectConfig] = []

    # Google Chrome
    configs.append(_BrowserDetectConfig(
        browser_type=BrowserType.CHROME,
        exe_names=["chrome.exe"],
        install_paths=[
            os.path.join(program_files, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(program_files_x86, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(local_appdata, "Google", "Chrome", "Application", "chrome.exe"),
        ],
        user_data_paths=[os.path.join(local_appdata, "Google", "Chrome", "User Data")],
        profile_dir_name="User Data",
        local_state_file="Local State",
        profiles_file="",
    ))

    # Microsoft Edge
    configs.append(_BrowserDetectConfig(
        browser_type=BrowserType.EDGE,
        exe_names=["msedge.exe"],
        install_paths=[
            os.path.join(program_files, "Microsoft", "Edge", "Application", "msedge.exe"),
            os.path.join(program_files_x86, "Microsoft", "Edge", "Application", "msedge.exe"),
        ],
        user_data_paths=[os.path.join(local_appdata, "Microsoft", "Edge", "User Data")],
        profile_dir_name="User Data",
        local_state_file="Local State",
        profiles_file="",
    ))

    # Mozilla Firefox
    configs.append(_BrowserDetectConfig(
        browser_type=BrowserType.FIREFOX,
        exe_names=["firefox.exe"],
        install_paths=[
            os.path.join(program_files, "Mozilla Firefox", "firefox.exe"),
            os.path.join(program_files_x86, "Mozilla Firefox", "firefox.exe"),
        ],
        user_data_paths=[
            os.path.join(appdata, "Mozilla", "Firefox"),
        ],
        profile_dir_name="",
        local_state_file="",
        profiles_file="profiles.ini",
    ))

    # Brave
    configs.append(_BrowserDetectConfig(
        browser_type=BrowserType.BRAVE,
        exe_names=["brave.exe"],
        install_paths=[
            os.path.join(program_files, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            os.path.join(program_files_x86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            os.path.join(local_appdata, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        ],
        user_data_paths=[os.path.join(local_appdata, "BraveSoftware", "Brave-Browser", "User Data")],
        profile_dir_name="User Data",
        local_state_file="Local State",
        profiles_file="",
    ))

    # Opera
    configs.append(_BrowserDetectConfig(
        browser_type=BrowserType.OPERA,
        exe_names=["opera.exe"],
        install_paths=[
            os.path.join(local_appdata, "Programs", "Opera", "opera.exe"),
            os.path.join(program_files, "Opera", "opera.exe"),
            os.path.join(program_files_x86, "Opera", "opera.exe"),
        ],
        user_data_paths=[os.path.join(appdata, "Opera Software", "Opera Stable")],
        profile_dir_name="",
        local_state_file="",
        profiles_file="",
    ))

    # Opera GX
    configs.append(_BrowserDetectConfig(
        browser_type=BrowserType.OPERA_GX,
        exe_names=["OperaGX.exe", "opera.exe"],
        install_paths=[
            os.path.join(local_appdata, "Programs", "Opera GX", "OperaGX.exe"),
            os.path.join(program_files, "Opera GX", "OperaGX.exe"),
            os.path.join(program_files_x86, "Opera GX", "OperaGX.exe"),
        ],
        user_data_paths=[os.path.join(appdata, "Opera Software", "Opera GX Stable")],
        profile_dir_name="",
        local_state_file="",
        profiles_file="",
    ))

    # Vivaldi
    configs.append(_BrowserDetectConfig(
        browser_type=BrowserType.VIVALDI,
        exe_names=["vivaldi.exe"],
        install_paths=[
            os.path.join(local_appdata, "Vivaldi", "Application", "vivaldi.exe"),
            os.path.join(program_files, "Vivaldi", "Application", "vivaldi.exe"),
            os.path.join(program_files_x86, "Vivaldi", "Application", "vivaldi.exe"),
        ],
        user_data_paths=[os.path.join(local_appdata, "Vivaldi", "User Data")],
        profile_dir_name="User Data",
        local_state_file="Local State",
        profiles_file="",
    ))

    # Chromium
    configs.append(_BrowserDetectConfig(
        browser_type=BrowserType.CHROMIUM,
        exe_names=["chromium.exe", "chrome.exe"],
        install_paths=[
            os.path.join(local_appdata, "Chromium", "Application", "chromium.exe"),
            os.path.join(program_files, "Chromium", "Application", "chromium.exe"),
            os.path.join(program_files_x86, "Chromium", "Application", "chromium.exe"),
        ],
        user_data_paths=[os.path.join(local_appdata, "Chromium", "User Data")],
        profile_dir_name="User Data",
        local_state_file="Local State",
        profiles_file="",
    ))

    _cached_browser_configs = configs
    return configs


# ── Asset definitions ──────────────────────────────────────────

# Chromium-based asset mapping: (asset_type, relative_path, is_directory)
_CHROMIUM_ASSETS: list[tuple[BrowserAssetType, str, bool]] = [
    (BrowserAssetType.CACHE, "Cache", True),
    (BrowserAssetType.CACHE, "Cache/", True),  # Newer Chrome uses Cache/ subdir
    (BrowserAssetType.GPU_CACHE, "GPUCache", True),
    (BrowserAssetType.CODE_CACHE, "Code Cache", True),
    (BrowserAssetType.SERVICE_WORKER, "Service Worker", True),
    (BrowserAssetType.CACHE_STORAGE, "CacheStorage", True),
    (BrowserAssetType.COOKIES, "Cookies", False),
    (BrowserAssetType.COOKIES, "Network\\Cookies", False),
    (BrowserAssetType.HISTORY, "History", False),
    (BrowserAssetType.DOWNLOADS, "DownloadMetadata", False),
    (BrowserAssetType.FAVICONS, "Favicons", False),
    (BrowserAssetType.BOOKMARKS, "Bookmarks", False),
    (BrowserAssetType.SESSIONS, "Sessions", True),
    (BrowserAssetType.PREFERENCES, "Preferences", False),
    (BrowserAssetType.PREFERENCES, "Secure Preferences", False),
    (BrowserAssetType.EXTENSIONS, "Extensions", True),
    (BrowserAssetType.LOCAL_STORAGE, "Local Storage", True),
    (BrowserAssetType.INDEXED_DB, "IndexedDB", True),
    (BrowserAssetType.WEB_DATA, "Web Data", False),
    (BrowserAssetType.LOGIN_DATA, "Login Data", False),
    (BrowserAssetType.LOGIN_DATA, "Login Data For Account", False),
    (BrowserAssetType.CRASH_REPORTS, "Crashpad", True),
    (BrowserAssetType.SHADER_CACHE, "ShaderCache", True),
    (BrowserAssetType.EXTENSION_SETTINGS, "Extension State", True),
    (BrowserAssetType.EXTENSION_SETTINGS, "Local Extension Settings", True),
    (BrowserAssetType.EXTENSION_SETTINGS, "Sync Extension Settings", True),
    (BrowserAssetType.EXTENSION_SETTINGS, "Managed Extension Settings", True),
]

# Firefox asset mapping: (asset_type, relative_pattern, is_directory)
# Firefox profiles have a random folder name, assets are inside that folder
_FIREFOX_ASSETS: list[tuple[BrowserAssetType, str, bool]] = [
    (BrowserAssetType.CACHE, "cache2", True),
    (BrowserAssetType.GPU_CACHE, "shader-cache", True),  # Firefox doesn't have GPU cache per se
    (BrowserAssetType.CODE_CACHE, "startupCache", True),
    (BrowserAssetType.SERVICE_WORKER, "storage", True),  # service workers are under storage/default
    (BrowserAssetType.CACHE_STORAGE, "cache2", True),
    (BrowserAssetType.COOKIES, "cookies.sqlite", False),
    (BrowserAssetType.HISTORY, "places.sqlite", False),
    (BrowserAssetType.DOWNLOADS, "downloads.sqlite", False),
    (BrowserAssetType.FAVICONS, "favicons.sqlite", False),
    (BrowserAssetType.BOOKMARKS, "places.sqlite", False),  # bookmarks are in places.sqlite
    (BrowserAssetType.SESSIONS, "sessionstore-backups", True),
    (BrowserAssetType.PREFERENCES, "prefs.js", False),
    (BrowserAssetType.EXTENSIONS, "extensions", True),
    (BrowserAssetType.LOCAL_STORAGE, "webappsstore.sqlite", False),
    (BrowserAssetType.INDEXED_DB, "storage", True),
    (BrowserAssetType.WEB_DATA, "webappsstore.sqlite", False),
    (BrowserAssetType.LOGIN_DATA, "logins.json", False),
    (BrowserAssetType.LOGIN_DATA, "key4.db", False),
    (BrowserAssetType.CRASH_REPORTS, "minidumps", True),
    (BrowserAssetType.SHADER_CACHE, "shader-cache", True),
    (BrowserAssetType.EXTENSION_SETTINGS, "browser-extension-data", True),
]


# ── Enumerator ─────────────────────────────────────────────────

class BrowserEnumerator:
    """
    Streaming browser enumerator.

    Usage:
        enumerator = BrowserEnumerator()
        for entry in enumerator.enumerate():
            process(entry)

    Or with progress:
        for entry in enumerator.enumerate(on_progress=my_callback):
            process(entry)
    """

    def __init__(self) -> None:
        self.statistics = BrowserStatistics()

    def enumerate(
        self,
        *,
        options: Optional[BrowserEnumerateOptions] = None,
        on_progress: Optional[BrowserProgressCallback] = None,
    ) -> Generator[Union[BrowserInstallation, BrowserProfile, BrowserAsset], None, None]:
        """Enumerate all browsers, profiles, and assets, yielding entries incrementally."""
        opts = options or BrowserEnumerateOptions()
        filter_chain = opts.filter
        cancel = opts.cancel_event

        start_time = time.monotonic()
        entries_since_progress = 0

        def emit_progress(
            current_browser: Optional[str] = None,
            current_profile: Optional[str] = None,
            current_asset: Optional[str] = None,
        ) -> None:
            nonlocal entries_since_progress
            if on_progress is None:
                return
            entries_since_progress += 1
            if entries_since_progress >= opts.progress_interval:
                entries_since_progress = 0
                elapsed = time.monotonic() - start_time
                on_progress(BrowserProgressEvent(
                    current_browser=current_browser,
                    current_profile=current_profile,
                    current_asset=current_asset,
                    profiles_enumerated=self.statistics.profiles_found,
                    assets_enumerated=self.statistics.assets_found,
                    elapsed_seconds=elapsed,
                    profiles_per_second=self.statistics.profiles_found / elapsed if elapsed > 0 else 0,
                    assets_per_second=self.statistics.assets_found / elapsed if elapsed > 0 else 0,
                ))

        # Discover browser installations
        configs = _get_browser_configs()

        for config in configs:
            if cancel and cancel.is_cancelled:
                break

            installation = self._detect_browser(config)
            if installation is None:
                continue

            # Yield installation
            if opts.include_installations:
                if filter_chain is None or filter_chain.matches_browser(installation):
                    self.statistics.record_browser()
                    emit_progress(current_browser=installation.browser_type.display_name)
                    yield installation

            if not opts.include_profiles:
                continue

            # Discover profiles
            for profile in self._discover_profiles(installation, config):
                if cancel and cancel.is_cancelled:
                    break

                if filter_chain is not None and not filter_chain.matches_profile(profile):
                    continue

                self.statistics.record_profile()
                emit_progress(
                    current_browser=installation.browser_type.display_name,
                    current_profile=profile.profile_name,
                )
                yield profile

                if not opts.include_assets:
                    continue

                # Discover assets in profile
                for asset in self._discover_assets(profile, config):
                    if cancel and cancel.is_cancelled:
                        break

                    if filter_chain is not None and not filter_chain.matches_asset(asset):
                        continue

                    self.statistics.record_asset()
                    emit_progress(
                        current_browser=installation.browser_type.display_name,
                        current_profile=profile.profile_name,
                        current_asset=asset.asset_name,
                    )
                    yield asset

        # Final progress event
        if on_progress is not None:
            elapsed = time.monotonic() - start_time
            self.statistics.finalize(elapsed)
            on_progress(BrowserProgressEvent(
                profiles_enumerated=self.statistics.profiles_found,
                assets_enumerated=self.statistics.assets_found,
                elapsed_seconds=elapsed,
                profiles_per_second=self.statistics.profiles_per_second,
                assets_per_second=self.statistics.assets_per_second,
                cancelled=cancel.is_cancelled if cancel else False,
            ))

    def get_statistics(self) -> BrowserStatistics:
        """Return the current enumeration statistics."""
        return self.statistics

    # ── Browser detection ──────────────────────────────────────

    def _detect_browser(self, config: _BrowserDetectConfig) -> Optional[BrowserInstallation]:
        """Detect a browser installation. Returns None if not found."""
        exe_path = None
        is_portable = False

        # Check standard install paths
        for path in config.install_paths:
            if os.path.isfile(path):
                exe_path = path
                break

        # Check PATH (for portable or unusual installs)
        if exe_path is None:
            for exe_name in config.exe_names:
                # Try common portable locations
                portable_paths = [
                    os.path.join(os.getcwd(), exe_name),
                    os.path.join(str(Path.home()), exe_name),
                ]
                for p in portable_paths:
                    if os.path.isfile(p):
                        exe_path = p
                        is_portable = True
                        break
                if exe_path:
                    break

        if exe_path is None:
            return None

        # Determine install directory
        install_dir = os.path.dirname(exe_path)

        # Determine user data directory
        user_data_dir = None
        for ud_path in config.user_data_paths:
            if os.path.isdir(ud_path):
                user_data_dir = ud_path
                break

        # Try to get version from file or directory
        version = self._get_browser_version(exe_path, install_dir, config.browser_type)

        return BrowserInstallation(
            browser_type=config.browser_type,
            executable_path=exe_path,
            version=version,
            install_dir=install_dir,
            is_portable=is_portable,
            user_data_dir=user_data_dir,
        )

    def _get_browser_version(
        self, exe_path: str, install_dir: str, browser_type: BrowserType
    ) -> Optional[str]:
        """Attempt to get browser version. Returns None if not available."""
        try:
            if _is_windows:
                import ctypes
                # Use GetFileVersionInfoW
                size = ctypes.windll.version.GetFileVersionInfoSizeW(exe_path, None)
                if size == 0:
                    return None
                buffer = ctypes.create_string_buffer(size)
                if not ctypes.windll.version.GetFileVersionInfoW(exe_path, 0, size, buffer):
                    return None
                # Extract fixed version info
                res = ctypes.c_uint32(0)
                ver_ptr = ctypes.c_void_p(0)
                if ctypes.windll.version.VerQueryValueW(
                    buffer, r"\\".encode("utf-16-le"),
                    ctypes.pointer(ver_ptr), ctypes.pointer(res),
                ):
                    # The fixed version info is a VS_FIXEDFILEINFO struct
                    # Version is at offset 8 (dwFileVersionMS) and 12 (dwFileVersionLS)
                    # Each is a DWORD with high and low 16-bit parts
                    ver_data = ctypes.string_at(ver_ptr, res.value)
                    if len(ver_data) >= 16:
                        import struct
                        # Unpack: dwSignature, dwStrucVersion, dwFileVersionMS, dwFileVersionLS, ...
                        _, _, file_ver_ms, file_ver_ls = struct.unpack_from("<IIII", ver_data)
                        major = (file_ver_ms >> 16) & 0xFFFF
                        minor = file_ver_ms & 0xFFFF
                        build = (file_ver_ls >> 16) & 0xFFFF
                        patch = file_ver_ls & 0xFFFF
                        return f"{major}.{minor}.{build}.{patch}"
        except Exception:
            pass

        # Fallback: check for version directory in install dir (Chromium-based)
        try:
            for item in os.listdir(install_dir):
                item_path = os.path.join(install_dir, item)
                if os.path.isdir(item_path) and item[0].isdigit():
                    # Looks like a version directory (e.g. "131.0.6778.86")
                    if "." in item:
                        return item
        except OSError:
            pass

        return None

    # ── Profile discovery ──────────────────────────────────────

    def _discover_profiles(
        self, installation: BrowserInstallation, config: _BrowserDetectConfig
    ) -> Generator[BrowserProfile, None, None]:
        """Discover profiles for a browser installation."""

        if installation.user_data_dir is None:
            return

        if config.browser_type.is_chromium_based:
            yield from self._discover_chromium_profiles(installation, config)
        else:
            yield from self._discover_firefox_profiles(installation, config)

    def _discover_chromium_profiles(
        self, installation: BrowserInstallation, config: _BrowserDetectConfig
    ) -> Generator[BrowserProfile, None, None]:
        """Discover profiles for Chromium-based browsers."""

        user_data_dir = installation.user_data_dir
        if user_data_dir is None or not os.path.isdir(user_data_dir):
            return

        # Parse Local State to find profile info
        local_state_path = os.path.join(user_data_dir, config.local_state_file)
        profile_infos: dict[str, dict] = {}
        default_profile = "Default"

        if os.path.isfile(local_state_path):
            try:
                with open(local_state_path, "r", encoding="utf-8") as f:
                    local_state = json.load(f)
                info_cache = local_state.get("profile", {}).get("info_cache", {})
                for profile_name, info in info_cache.items():
                    profile_infos[profile_name] = info
                # Get last used profile
                last_used = local_state.get("profile", {}).get("last_used", "")
                if last_used:
                    default_profile = last_used
            except (json.JSONDecodeError, OSError, KeyError):
                pass

        # If no profiles found in Local State, check for Default directory
        if not profile_infos:
            default_dir = os.path.join(user_data_dir, "Default")
            if os.path.isdir(default_dir):
                yield self._build_chromium_profile(
                    installation, "Default", user_data_dir,
                    is_default=True, is_guest=False,
                    display_name="Default",
                    last_used=None,
                )
            return

        # Yield profiles from Local State
        for profile_name, info in profile_infos.items():
            profile_path = os.path.join(user_data_dir, profile_name)
            if not os.path.isdir(profile_path):
                continue

            is_default = (profile_name == default_profile)
            is_guest = profile_name.lower() in ("guest profile", "guest")
            display_name = info.get("name", profile_name)
            last_used_str = info.get("last_used", "")
            last_used = None
            if last_used_str:
                try:
                    # Chrome stores last_used as "1314567890.123456" (Chrome time)
                    # Chrome time is seconds since 1601-01-01 (Windows epoch)
                    chrome_time = float(last_used_str)
                    # Convert to Unix timestamp
                    last_used = chrome_time - 11644473600.0
                except (ValueError, TypeError):
                    pass

            yield self._build_chromium_profile(
                installation, profile_name, user_data_dir,
                is_default=is_default, is_guest=is_guest,
                display_name=display_name,
                last_used=last_used,
            )

        # Also check for Guest Profile if not in info_cache
        guest_dir = os.path.join(user_data_dir, "Guest Profile")
        if os.path.isdir(guest_dir) and "Guest Profile" not in profile_infos:
            yield self._build_chromium_profile(
                installation, "Guest Profile", user_data_dir,
                is_default=False, is_guest=True,
                display_name="Guest",
                last_used=None,
            )

    def _build_chromium_profile(
        self,
        installation: BrowserInstallation,
        profile_name: str,
        user_data_dir: str,
        is_default: bool,
        is_guest: bool,
        display_name: str,
        last_used: Optional[float],
    ) -> BrowserProfile:
        """Build a BrowserProfile for a Chromium-based browser."""
        profile_path = os.path.join(user_data_dir, profile_name)
        profile_size = self._compute_dir_size(profile_path) if not is_guest else 0

        # Determine status
        status = ProfileStatus.ACTIVE if not is_guest else ProfileStatus.INACTIVE
        if not os.path.isdir(profile_path):
            status = ProfileStatus.UNKNOWN

        return BrowserProfile(
            browser_type=installation.browser_type,
            profile_name=profile_name,
            profile_path=profile_path,
            display_name=display_name,
            is_default=is_default,
            is_guest=is_guest,
            profile_size=profile_size,
            last_used_time=last_used,
            status=status,
        )

    def _discover_firefox_profiles(
        self, installation: BrowserInstallation, config: _BrowserDetectConfig
    ) -> Generator[BrowserProfile, None, None]:
        """Discover profiles for Firefox-based browsers."""

        user_data_dir = installation.user_data_dir
        if user_data_dir is None or not os.path.isdir(user_data_dir):
            return

        # Parse profiles.ini
        profiles_ini_path = os.path.join(user_data_dir, config.profiles_file)
        if not os.path.isfile(profiles_ini_path):
            # Fallback: scan for profile directories
            try:
                for item in os.listdir(user_data_dir):
                    item_path = os.path.join(user_data_dir, item)
                    if os.path.isdir(item_path) and "." in item:
                        yield self._build_firefox_profile(
                            installation, item, item_path,
                            is_default=False, display_name=item,
                        )
            except OSError:
                pass
            return

        # Parse INI file
        import configparser
        try:
            parser = configparser.ConfigParser()
            parser.read(profiles_ini_path, encoding="utf-8")

            for section in parser.sections():
                if not section.lower().startswith("profile"):
                    continue

                name = parser.get(section, "Name", fallback=section)
                path = parser.get(section, "Path", fallback="")
                is_relative = parser.getboolean(section, "IsRelative", fallback=False)
                is_default = parser.getboolean(section, "Default", fallback=False)

                if not path:
                    continue

                if is_relative:
                    profile_path = os.path.join(user_data_dir, path)
                else:
                    profile_path = path

                if not os.path.isdir(profile_path):
                    continue

                yield self._build_firefox_profile(
                    installation, name, profile_path,
                    is_default=is_default, display_name=name,
                )
        except (configparser.Error, OSError):
            pass

    def _build_firefox_profile(
        self,
        installation: BrowserInstallation,
        name: str,
        profile_path: str,
        is_default: bool,
        display_name: str,
    ) -> BrowserProfile:
        """Build a BrowserProfile for a Firefox-based browser."""
        profile_size = self._compute_dir_size(profile_path)

        # Try to get last modified time of the profile directory
        last_used = None
        try:
            stat = os.stat(profile_path)
            last_used = stat.st_mtime
        except OSError:
            pass

        status = ProfileStatus.ACTIVE if is_default else ProfileStatus.INACTIVE
        if not os.path.isdir(profile_path):
            status = ProfileStatus.UNKNOWN

        return BrowserProfile(
            browser_type=installation.browser_type,
            profile_name=name,
            profile_path=profile_path,
            display_name=display_name,
            is_default=is_default,
            is_guest=False,
            profile_size=profile_size,
            last_used_time=last_used,
            status=status,
        )

    # ── Asset discovery ────────────────────────────────────────

    def _discover_assets(
        self, profile: BrowserProfile, config: _BrowserDetectConfig
    ) -> Generator[BrowserAsset, None, None]:
        """Discover assets within a browser profile."""

        if not os.path.isdir(profile.profile_path):
            return

        if config.browser_type.is_chromium_based:
            assets = _CHROMIUM_ASSETS
        else:
            assets = _FIREFOX_ASSETS

        for asset_type, rel_path, is_dir in assets:
            asset_path = os.path.join(profile.profile_path, rel_path)
            exists = os.path.exists(asset_path)
            actual_is_dir = os.path.isdir(asset_path) if exists else is_dir

            size = 0
            if exists:
                if actual_is_dir:
                    size = self._compute_dir_size(asset_path)
                else:
                    try:
                        size = os.path.getsize(asset_path)
                    except OSError:
                        size = 0

            yield BrowserAsset(
                browser_type=profile.browser_type,
                profile_name=profile.profile_name,
                asset_type=asset_type,
                asset_path=asset_path,
                asset_name=rel_path,
                is_directory=actual_is_dir,
                size=size,
                exists=exists,
            )

    # ── Utilities ──────────────────────────────────────────────

    def _compute_dir_size(self, path: str) -> int:
        """Compute total size of a directory. Returns 0 on error."""
        total = 0
        try:
            for dirpath, dirnames, filenames in os.walk(path):
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    try:
                        total += os.path.getsize(filepath)
                    except (OSError, PermissionError):
                        pass
        except (OSError, PermissionError):
            pass
        return total


# ── Convenience function ───────────────────────────────────────

def enumerate_browsers(
    *,
    options: Optional[BrowserEnumerateOptions] = None,
    on_progress: Optional[BrowserProgressCallback] = None,
) -> Generator[Union[BrowserInstallation, BrowserProfile, BrowserAsset], None, None]:
    """Convenience function to enumerate all browser assets."""
    enumerator = BrowserEnumerator()
    yield from enumerator.enumerate(options=options, on_progress=on_progress)
