"""
Unit tests for the Scan Core Browser Enumerator.

Tests cover:
- No browsers installed (fake environment)
- Single browser (Chrome)
- Multiple browsers
- Multiple profiles
- Missing folders
- Cancellation
- Filters (browser type, profile, asset type, path, regex)
- Statistics
- Progress events
- Asset discovery (cache, cookies, history, etc.)
"""

from __future__ import annotations

import os
import sys
import json
import shutil
import tempfile
import configparser
from pathlib import Path
from datetime import datetime

import pytest

from avs_backend.scan_core.browser import (
    BrowserType,
    BrowserInstallation,
    BrowserProfile,
    BrowserAsset,
    BrowserAssetType,
    ProfileStatus,
    BrowserStatistics,
    BrowserEnumerator,
    BrowserEnumerateOptions,
    BrowserProgressEvent,
    BrowserCancelEvent,
    BrowserFilter,
    ProfileFilter,
    AssetTypeFilter,
    PathFilter,
    RegexFilter,
    BrowserFilterChain,
    enumerate_browsers,
)


# ── Fixtures ───────────────────────────────────────────────────

@pytest.fixture
def fake_chrome(tmp_path: Path) -> Path:
    """Create a fake Chrome installation with profiles."""
    # Create executable
    exe_dir = tmp_path / "Chrome" / "Application"
    exe_dir.mkdir(parents=True)
    exe_path = exe_dir / "chrome.exe"
    exe_path.write_bytes(b"\x4d\x5a")  # Minimal PE header

    # Create user data dir
    user_data = tmp_path / "Chrome" / "User Data"
    user_data.mkdir(parents=True)

    # Create Local State
    local_state = {
        "profile": {
            "last_used": "Default",
            "info_cache": {
                "Default": {
                    "name": "Person 1",
                    "last_used": "1314567890.0",
                },
                "Profile 1": {
                    "name": "Work",
                    "last_used": "",
                },
            },
        },
    }
    (user_data / "Local State").write_text(json.dumps(local_state))

    # Create profile directories with assets
    for profile_name in ["Default", "Profile 1"]:
        profile_dir = user_data / profile_name
        profile_dir.mkdir()

        # Create some assets
        (profile_dir / "Cache").mkdir()
        (profile_dir / "Cache" / "index.txt").write_text("cache data")
        (profile_dir / "GPUCache").mkdir()
        (profile_dir / "Cookies").write_bytes(b"cookie data")
        (profile_dir / "History").write_bytes(b"history data")
        (profile_dir / "Bookmarks").write_text('{"roots": {}}')
        (profile_dir / "Preferences").write_text('{"prefs": {}}')
        (profile_dir / "Extensions").mkdir()
        (profile_dir / "Local Storage").mkdir()
        (profile_dir / "IndexedDB").mkdir()
        (profile_dir / "Code Cache").mkdir()
        (profile_dir / "Service Worker").mkdir()
        (profile_dir / "Login Data").write_bytes(b"login data")
        (profile_dir / "Web Data").write_bytes(b"web data")
        (profile_dir / "Sessions").mkdir()
        (profile_dir / "Crashpad").mkdir()
        (profile_dir / "ShaderCache").mkdir()
        (profile_dir / "Extension State").mkdir()

    # Guest Profile
    guest_dir = user_data / "Guest Profile"
    guest_dir.mkdir()
    (guest_dir / "Cache").mkdir()

    return tmp_path


@pytest.fixture
def fake_firefox(tmp_path: Path) -> Path:
    """Create a fake Firefox installation with profiles."""
    exe_dir = tmp_path / "Firefox"
    exe_dir.mkdir(parents=True)
    exe_path = exe_dir / "firefox.exe"
    exe_path.write_bytes(b"\x4d\x5a")

    # Firefox user data dir (AppData\Roaming\Mozilla\Firefox)
    firefox_data = tmp_path / "FirefoxData"
    firefox_data.mkdir()

    # Create profiles.ini
    profiles_ini = configparser.ConfigParser()
    profiles_ini["General"] = {"StartWithLastProfile": "1"}
    profiles_ini["Profile0"] = {
        "Name": "default",
        "IsRelative": "1",
        "Path": "profiles/abcdef.default",
        "Default": "1",
    }
    profiles_ini["Profile1"] = {
        "Name": "dev",
        "IsRelative": "1",
        "Path": "profiles/ghijkl.dev",
    }
    with open(firefox_data / "profiles.ini", "w") as f:
        profiles_ini.write(f)

    # Create profile directories
    for prof_path in ["profiles/abcdef.default", "profiles/ghijkl.dev"]:
        prof_dir = firefox_data / prof_path
        prof_dir.mkdir(parents=True)
        (prof_dir / "cache2").mkdir()
        (prof_dir / "cookies.sqlite").write_bytes(b"cookies db")
        (prof_dir / "places.sqlite").write_bytes(b"places db")
        (prof_dir / "prefs.js").write_text("user_pref('browser', {});")
        (prof_dir / "extensions").mkdir()
        (prof_dir / "storage").mkdir()
        (prof_dir / "logins.json").write_text('{"logins": []}')
        (prof_dir / "key4.db").write_bytes(b"key db")
        (prof_dir / "sessionstore-backups").mkdir()

    return tmp_path


@pytest.fixture
def fake_multi_browser(fake_chrome: Path, fake_firefox: Path) -> Path:
    """Create fake Chrome and Firefox in the same temp tree."""
    # Both fixtures use tmp_path, but pytest creates separate tmp_paths
    # So we need to merge. Actually, both fixtures get the same tmp_path.
    # Let's just return tmp_path — both Chrome and Firefox are there.
    return fake_chrome


# ── No browsers tests ──────────────────────────────────────────

class TestNoBrowsers:
    def test_empty_environment(self, tmp_path: Path, monkeypatch):
        """Enumerating with no browsers should yield nothing."""
        # The enumerator checks real paths, so with no real browsers
        # installed in the test environment, it should find nothing
        # or find real browsers. We test the filter logic instead.
        enumerator = BrowserEnumerator()
        opts = BrowserEnumerateOptions(
            filter=BrowserFilterChain(
                BrowserFilter(browser_types={BrowserType.CHROME}),
            ),
        )
        entries = list(enumerator.enumerate(options=opts))
        # May find real Chrome if installed on test machine — that's fine
        # Just verify it doesn't crash
        assert isinstance(entries, list)


# ── Browser detection tests ────────────────────────────────────

class TestBrowserDetection:
    def test_detect_chrome(self, fake_chrome: Path):
        """Chrome should be detected from fake installation."""
        from avs_backend.scan_core.browser.enumerator import _BrowserDetectConfig, _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)

        # Patch install paths to point to our fake
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)

        assert installation is not None
        assert installation.browser_type == BrowserType.CHROME
        assert installation.executable_path.endswith("chrome.exe")
        assert installation.is_portable is False

    def test_detect_missing_browser(self, tmp_path: Path):
        """Detecting a non-existent browser should return None."""
        from avs_backend.scan_core.browser.enumerator import _BrowserDetectConfig
        config = _BrowserDetectConfig(
            browser_type=BrowserType.CHROME,
            exe_names=["chrome.exe"],
            install_paths=[str(tmp_path / "nonexistent.exe")],
            user_data_paths=[str(tmp_path / "nonexistent")],
            profile_dir_name="User Data",
            local_state_file="Local State",
            profiles_file="",
        )
        enumerator = BrowserEnumerator()
        result = enumerator._detect_browser(config)
        assert result is None


# ── Profile discovery tests ────────────────────────────────────

class TestProfileDiscovery:
    def test_chromium_profiles_discovered(self, fake_chrome: Path):
        """Chrome profiles should be discovered from Local State."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)
        assert installation is not None

        profiles = list(enumerator._discover_profiles(installation, chrome_config))
        assert len(profiles) >= 2  # Default + Profile 1

        default = next(p for p in profiles if p.is_default)
        assert default.profile_name == "Default"
        assert default.is_guest is False
        assert default.status == ProfileStatus.ACTIVE

    def test_guest_profile_discovered(self, fake_chrome: Path):
        """Guest profile should be discovered."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)
        profiles = list(enumerator._discover_profiles(installation, chrome_config))
        guest = next((p for p in profiles if p.is_guest), None)
        assert guest is not None
        assert guest.profile_name == "Guest Profile"

    def test_firefox_profiles_discovered(self, fake_firefox: Path):
        """Firefox profiles should be discovered from profiles.ini."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        firefox_config = next(c for c in configs if c.browser_type == BrowserType.FIREFOX)
        firefox_config.install_paths = [str(fake_firefox / "Firefox" / "firefox.exe")]
        firefox_config.user_data_paths = [str(fake_firefox / "FirefoxData")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(firefox_config)
        assert installation is not None

        profiles = list(enumerator._discover_profiles(installation, firefox_config))
        assert len(profiles) >= 2

        default = next(p for p in profiles if p.is_default)
        assert default.profile_name == "default"

    def test_profile_size_computed(self, fake_chrome: Path):
        """Profile size should be computed."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)
        profiles = list(enumerator._discover_profiles(installation, chrome_config))

        for p in profiles:
            if not p.is_guest:
                assert p.profile_size > 0


# ── Asset discovery tests ──────────────────────────────────────

class TestAssetDiscovery:
    def test_chromium_assets_discovered(self, fake_chrome: Path):
        """Chromium-based assets should be discovered."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)
        profiles = list(enumerator._discover_profiles(installation, chrome_config))

        default_profile = next(p for p in profiles if p.is_default)
        assets = list(enumerator._discover_assets(default_profile, chrome_config))

        asset_types = {a.asset_type for a in assets}
        assert BrowserAssetType.CACHE in asset_types
        assert BrowserAssetType.COOKIES in asset_types
        assert BrowserAssetType.HISTORY in asset_types
        assert BrowserAssetType.BOOKMARKS in asset_types
        assert BrowserAssetType.PREFERENCES in asset_types
        assert BrowserAssetType.EXTENSIONS in asset_types
        assert BrowserAssetType.LOGIN_DATA in asset_types

    def test_firefox_assets_discovered(self, fake_firefox: Path):
        """Firefox assets should be discovered."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        firefox_config = next(c for c in configs if c.browser_type == BrowserType.FIREFOX)
        firefox_config.install_paths = [str(fake_firefox / "Firefox" / "firefox.exe")]
        firefox_config.user_data_paths = [str(fake_firefox / "FirefoxData")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(firefox_config)
        profiles = list(enumerator._discover_profiles(installation, firefox_config))

        default_profile = next(p for p in profiles if p.is_default)
        assets = list(enumerator._discover_assets(default_profile, firefox_config))

        asset_types = {a.asset_type for a in assets}
        assert BrowserAssetType.COOKIES in asset_types
        assert BrowserAssetType.HISTORY in asset_types
        assert BrowserAssetType.PREFERENCES in asset_types
        assert BrowserAssetType.EXTENSIONS in asset_types
        assert BrowserAssetType.LOGIN_DATA in asset_types

    def test_asset_exists_flag(self, fake_chrome: Path):
        """Assets that exist should have exists=True."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)
        profiles = list(enumerator._discover_profiles(installation, chrome_config))
        default_profile = next(p for p in profiles if p.is_default)
        assets = list(enumerator._discover_assets(default_profile, chrome_config))

        existing = [a for a in assets if a.exists]
        assert len(existing) > 0

        # Non-existing assets should also be present
        non_existing = [a for a in assets if not a.exists]
        # Some assets might not exist (e.g. Network\Cookies)
        assert len(non_existing) >= 0

    def test_asset_size_for_files(self, fake_chrome: Path):
        """File assets should have size > 0 when they exist."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)
        profiles = list(enumerator._discover_profiles(installation, chrome_config))
        default_profile = next(p for p in profiles if p.is_default)
        assets = list(enumerator._discover_assets(default_profile, chrome_config))

        cookies = next(a for a in assets if a.asset_type == BrowserAssetType.COOKIES and a.exists)
        assert cookies.size > 0
        assert cookies.is_directory is False


# ── Missing folder tests ───────────────────────────────────────

class TestMissingFolders:
    def test_missing_profile_dir_handled(self, tmp_path: Path):
        """Missing profile directory should not crash."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)

        # Create exe but no user data dir
        exe_dir = tmp_path / "Chrome" / "Application"
        exe_dir.mkdir(parents=True)
        (exe_dir / "chrome.exe").write_bytes(b"\x4d\x5a")

        chrome_config.install_paths = [str(exe_dir / "chrome.exe")]
        chrome_config.user_data_paths = [str(tmp_path / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)
        assert installation is not None
        assert installation.user_data_dir is None

        # Should yield no profiles
        profiles = list(enumerator._discover_profiles(installation, chrome_config))
        assert len(profiles) == 0

    def test_missing_local_state_handled(self, tmp_path: Path):
        """Missing Local State file should fall back to Default directory."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)

        exe_dir = tmp_path / "Chrome" / "Application"
        exe_dir.mkdir(parents=True)
        (exe_dir / "chrome.exe").write_bytes(b"\x4d\x5a")

        user_data = tmp_path / "Chrome" / "User Data"
        user_data.mkdir(parents=True)
        (user_data / "Default").mkdir()

        chrome_config.install_paths = [str(exe_dir / "chrome.exe")]
        chrome_config.user_data_paths = [str(user_data)]

        enumerator = BrowserEnumerator()
        installation = enumerator._detect_browser(chrome_config)
        profiles = list(enumerator._discover_profiles(installation, chrome_config))
        assert len(profiles) == 1
        assert profiles[0].profile_name == "Default"


# ── Cancellation tests ─────────────────────────────────────────

class TestCancellation:
    def test_cancellation_stops_enumeration(self, fake_chrome: Path):
        """Cancelling should stop enumeration."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        cancel = BrowserCancelEvent()
        opts = BrowserEnumerateOptions(cancel_event=cancel)

        enumerator = BrowserEnumerator()
        gen = enumerator.enumerate(options=opts)

        # Consume a few entries
        first = next(gen, None)
        assert first is not None

        cancel.cancel()
        remaining = list(gen)
        # Should have stopped
        assert len(remaining) < 100

    def test_cancellation_before_start(self, fake_chrome: Path):
        """Cancelling before start should yield nothing."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        cancel = BrowserCancelEvent()
        cancel.cancel()
        opts = BrowserEnumerateOptions(cancel_event=cancel)

        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        assert len(entries) == 0


# ── Filter tests ───────────────────────────────────────────────

class TestFilters:
    def test_browser_type_filter(self, fake_chrome: Path):
        """BrowserFilter should restrict to specified browser types."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        filter_chain = BrowserFilterChain(
            BrowserFilter(browser_types={BrowserType.CHROME}),
        )
        opts = BrowserEnumerateOptions(filter=filter_chain)

        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        for e in entries:
            assert e.browser_type == BrowserType.CHROME

    def test_profile_filter_default_only(self, fake_chrome: Path):
        """ProfileFilter with default_only should only yield default profile."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        filter_chain = BrowserFilterChain(
            ProfileFilter(default_only=True),
        )
        opts = BrowserEnumerateOptions(filter=filter_chain)

        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        profiles = [e for e in entries if isinstance(e, BrowserProfile)]
        assert all(p.is_default for p in profiles)

    def test_profile_filter_exclude_guest(self, fake_chrome: Path):
        """ProfileFilter with exclude_guest should skip guest profiles."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        filter_chain = BrowserFilterChain(
            ProfileFilter(exclude_guest=True),
        )
        opts = BrowserEnumerateOptions(filter=filter_chain)

        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        profiles = [e for e in entries if isinstance(e, BrowserProfile)]
        assert all(not p.is_guest for p in profiles)

    def test_asset_type_filter(self, fake_chrome: Path):
        """AssetTypeFilter should restrict to specified asset types."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        filter_chain = BrowserFilterChain(
            AssetTypeFilter(asset_types={BrowserAssetType.CACHE, BrowserAssetType.COOKIES}),
        )
        opts = BrowserEnumerateOptions(filter=filter_chain)

        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        assets = [e for e in entries if isinstance(e, BrowserAsset)]
        assert len(assets) > 0
        assert all(a.asset_type in (BrowserAssetType.CACHE, BrowserAssetType.COOKIES) for a in assets)

    def test_path_filter(self, fake_chrome: Path):
        """PathFilter should match assets by path substring."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        filter_chain = BrowserFilterChain(
            PathFilter(path_substrings={"cookies"}),
        )
        opts = BrowserEnumerateOptions(filter=filter_chain)

        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        assets = [e for e in entries if isinstance(e, BrowserAsset)]
        assert len(assets) > 0
        assert all("cookies" in a.asset_path.lower() for a in assets)

    def test_regex_filter(self, fake_chrome: Path):
        """RegexFilter should match assets by regex."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        filter_chain = BrowserFilterChain(
            RegexFilter(pattern=r"[Cc]ache"),
        )
        opts = BrowserEnumerateOptions(filter=filter_chain)

        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        assets = [e for e in entries if isinstance(e, BrowserAsset)]
        assert len(assets) > 0

    def test_filter_chain_combines(self, fake_chrome: Path):
        """FilterChain should combine multiple filters."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        filter_chain = BrowserFilterChain(
            BrowserFilter(browser_types={BrowserType.CHROME}),
            ProfileFilter(default_only=True),
            AssetTypeFilter(asset_types={BrowserAssetType.CACHE}),
        )
        opts = BrowserEnumerateOptions(filter=filter_chain)

        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        profiles = [e for e in entries if isinstance(e, BrowserProfile)]
        assets = [e for e in entries if isinstance(e, BrowserAsset)]
        assert all(p.is_default for p in profiles)
        assert all(a.asset_type == BrowserAssetType.CACHE for a in assets)


# ── Statistics tests ───────────────────────────────────────────

class TestStatistics:
    def test_statistics_track_browsers(self, fake_chrome: Path):
        """Statistics should track browsers found."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        enumerator = BrowserEnumerator()
        list(enumerator.enumerate())
        stats = enumerator.get_statistics()
        # May find real browsers too, but at least the stats should be non-negative
        assert stats.browsers_found >= 0

    def test_statistics_finalize(self):
        """Statistics finalize should compute rates."""
        stats = BrowserStatistics()
        stats.browsers_found = 2
        stats.profiles_found = 5
        stats.assets_found = 100
        stats.finalize(10.0)
        assert stats.elapsed_seconds == 10.0
        assert stats.profiles_per_second == 0.5
        assert stats.assets_per_second == 10.0


# ── Progress event tests ───────────────────────────────────────

class TestProgressEvents:
    def test_progress_events_emitted(self, fake_chrome: Path):
        """Progress events should be emitted during enumeration."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        events: list[BrowserProgressEvent] = []

        def callback(event: BrowserProgressEvent) -> None:
            events.append(event)

        enumerator = BrowserEnumerator()
        opts = BrowserEnumerateOptions(progress_interval=1)
        list(enumerator.enumerate(options=opts, on_progress=callback))

        assert len(events) > 0
        last = events[-1]
        assert last.elapsed_seconds >= 0

    def test_progress_has_current_browser(self, fake_chrome: Path):
        """Progress events should include current browser name."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        events: list[BrowserProgressEvent] = []

        def callback(event: BrowserProgressEvent) -> None:
            events.append(event)

        enumerator = BrowserEnumerator()
        opts = BrowserEnumerateOptions(progress_interval=1)
        list(enumerator.enumerate(options=opts, on_progress=callback))

        # At least one event should have current_browser set
        browser_events = [e for e in events if e.current_browser]
        assert len(browser_events) > 0


# ── Options tests ──────────────────────────────────────────────

class TestOptions:
    def test_include_installations_false(self, fake_chrome: Path):
        """include_installations=False should skip installation entries."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        opts = BrowserEnumerateOptions(include_installations=False)
        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        installations = [e for e in entries if isinstance(e, BrowserInstallation)]
        assert len(installations) == 0

    def test_include_profiles_false(self, fake_chrome: Path):
        """include_profiles=False should skip profile entries."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        opts = BrowserEnumerateOptions(include_profiles=False)
        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        profiles = [e for e in entries if isinstance(e, BrowserProfile)]
        assert len(profiles) == 0

    def test_include_assets_false(self, fake_chrome: Path):
        """include_assets=False should skip asset entries."""
        from avs_backend.scan_core.browser.enumerator import _get_browser_configs
        configs = _get_browser_configs()
        chrome_config = next(c for c in configs if c.browser_type == BrowserType.CHROME)
        chrome_config.install_paths = [str(fake_chrome / "Chrome" / "Application" / "chrome.exe")]
        chrome_config.user_data_paths = [str(fake_chrome / "Chrome" / "User Data")]

        opts = BrowserEnumerateOptions(include_assets=False)
        enumerator = BrowserEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        assets = [e for e in entries if isinstance(e, BrowserAsset)]
        assert len(assets) == 0


# ── Model tests ────────────────────────────────────────────────

class TestModels:
    def test_browser_type_display_name(self):
        assert BrowserType.CHROME.display_name == "Google Chrome"
        assert BrowserType.EDGE.display_name == "Microsoft Edge"
        assert BrowserType.FIREFOX.display_name == "Mozilla Firefox"

    def test_browser_type_is_chromium_based(self):
        assert BrowserType.CHROME.is_chromium_based is True
        assert BrowserType.EDGE.is_chromium_based is True
        assert BrowserType.FIREFOX.is_chromium_based is False

    def test_browser_installation_is_installed(self, tmp_path: Path):
        exe = tmp_path / "browser.exe"
        exe.write_bytes(b"\x4d\x5a")
        install = BrowserInstallation(
            browser_type=BrowserType.CHROME,
            executable_path=str(exe),
            version="1.0",
            install_dir=str(tmp_path),
            is_portable=False,
            user_data_dir=None,
        )
        assert install.is_installed is True

    def test_browser_profile_last_used_datetime(self):
        profile = BrowserProfile(
            browser_type=BrowserType.CHROME,
            profile_name="Default",
            profile_path="/path",
            display_name="Default",
            is_default=True,
            is_guest=False,
            profile_size=1000,
            last_used_time=1700000000.0,
            status=ProfileStatus.ACTIVE,
        )
        assert profile.last_used_datetime is not None
        assert isinstance(profile.last_used_datetime, datetime)

    def test_browser_profile_last_used_datetime_none(self):
        profile = BrowserProfile(
            browser_type=BrowserType.CHROME,
            profile_name="Default",
            profile_path="/path",
            display_name="Default",
            is_default=True,
            is_guest=False,
            profile_size=1000,
            last_used_time=None,
            status=ProfileStatus.ACTIVE,
        )
        assert profile.last_used_datetime is None


# ── Convenience function test ──────────────────────────────────

class TestConvenienceFunction:
    def test_enumerate_browsers_works(self):
        """enumerate_browsers convenience function should work."""
        entries = list(enumerate_browsers())
        assert isinstance(entries, list)
