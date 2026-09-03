"""
SC-8C2 Extended Junk Detection Rules Tests

Comprehensive tests for the 5 new production rules:
- ApplicationTempRule
- BrowserCacheRule
- InstallerCacheRule
- WindowsUpdateCacheRule
- ApplicationCacheRule

Tests use synthetic fixtures - NO dependency on actual filesystem.
"""

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Optional
from unittest.mock import patch

from avs_backend.scan_core.assets import (
    AssetCategory,
    AssetSource,
    AssetType,
    ScanAsset,
)
from avs_backend.scan_core.context import AssetSnapshot, SnapshotState
from avs_backend.scan_core.rules.detection.junk_rules_ext import (
    ApplicationCacheRule,
    ApplicationTempRule,
    BrowserCacheRule,
    InstallerCacheRule,
    WindowsUpdateCacheRule,
)
from avs_backend.scan_core.rules.detection.locations import KnownLocations
from avs_backend.scan_core.rules.enums import SafetyLevel
from avs_backend.scan_core.rules.result import RuleMatchStatus


class ExtTestFixtures:
    """Test fixture factory for synthetic assets and snapshots."""

    @staticmethod
    def create_asset(
        asset_id: str,
        canonical_path: str,
        asset_type: AssetType = AssetType.FILE,
        size: int = 1024,
        modified_at: Optional[datetime] = None,
    ) -> ScanAsset:
        """Create synthetic ScanAsset."""
        from avs_backend.scan_core.assets.metadata import AssetMetadata

        metadata = AssetMetadata()
        metadata.set("size", size)

        return ScanAsset(
            asset_id=asset_id,
            asset_type=asset_type,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name=Path(canonical_path).name,
            canonical_path=canonical_path,
            discovered_at=datetime.now(UTC),
            modified_at=modified_at,
            custom_metadata=metadata,
        )

    @staticmethod
    def create_snapshot(
        asset_id: str,
        scan_id: str = "test-scan",
        state: SnapshotState = SnapshotState.DISCOVERED,
        exists: bool = True,
        accessible: bool = True,
        locked: bool = False,
    ) -> AssetSnapshot:
        """Create synthetic AssetSnapshot."""
        return AssetSnapshot(
            asset_id=asset_id,
            scan_id=scan_id,
            observed_at=datetime.now(UTC),
            state=state,
            exists=exists,
            accessible=accessible,
            locked=locked,
        )

    @staticmethod
    def get_application_temp_root() -> Path:
        """Get first application temp root for testing."""
        roots = KnownLocations.get_application_temp_roots()
        assert len(roots) > 0, "No application temp roots found"
        return roots[0]

    @staticmethod
    def get_browser_cache_root() -> Path:
        """Get first browser cache root for testing."""
        roots = KnownLocations.get_browser_cache_roots()
        assert len(roots) > 0, "No browser cache roots found"
        return roots[0]

    @staticmethod
    def get_installer_cache_root() -> Path:
        """Get installer cache root for testing."""
        return KnownLocations.get_installer_cache_root()

    @staticmethod
    def get_windows_update_cache_root() -> Path:
        """Get Windows Update cache root for testing."""
        return KnownLocations.get_windows_update_cache_root()

    @staticmethod
    def get_application_cache_root() -> Path:
        """Get first application cache root for testing."""
        roots = KnownLocations.get_application_cache_roots()
        assert len(roots) > 0, "No application cache roots found"
        return roots[0]

    @staticmethod
    def get_icon_cache_file() -> Path:
        """Get IconCache.db path for testing."""
        return KnownLocations.get_icon_cache_file()

    @staticmethod
    def old_datetime() -> datetime:
        """Get a datetime 30 days ago (well past the 7-day threshold)."""
        return datetime.now(UTC) - timedelta(days=30)


# ---------------------------------------------------------------------------
# ApplicationTempRule
# ---------------------------------------------------------------------------


class TestApplicationTempRule:
    """Test ApplicationTempRule detection."""

    def test_positive_match_office_temp(self):
        """Test match for file in Office temp directory."""
        rule = ApplicationTempRule()

        app_temp = ExtTestFixtures.get_application_temp_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="at-001",
            canonical_path=str(app_temp / "office_temp.tmp"),
            size=2048,
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="at-001")

        result = rule.evaluate(asset, snapshot)

        assert result.status == RuleMatchStatus.MATCHED
        assert result.matched is True
        assert result.confidence.score >= 80.0
        assert result.safety.level == SafetyLevel.SAFE
        assert result.estimated_size == 2048
        assert "application temp" in result.reason.lower()

    def test_positive_match_with_temp_extension(self):
        """Test that .tmp extension adds supporting evidence."""
        rule = ApplicationTempRule()

        app_temp = ExtTestFixtures.get_application_temp_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="at-002",
            canonical_path=str(app_temp / "data.tmp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="at-002")
        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        ext_evidence = [
            e
            for e in result.evidence.items
            if e.evidence_type.value == "extension_match"
        ]
        assert len(ext_evidence) > 0

    def test_positive_match_with_old_age(self):
        """Test that old file age adds supporting evidence."""
        rule = ApplicationTempRule()

        app_temp = ExtTestFixtures.get_application_temp_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="at-003",
            canonical_path=str(app_temp / "old_file.tmp"),
            modified_at=ExtTestFixtures.old_datetime(),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="at-003")
        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        age_evidence = [
            e for e in result.evidence.items if e.evidence_type.value == "age_match"
        ]
        assert len(age_evidence) > 0

    def test_negative_match_not_app_temp(self):
        """Test no match for file outside application temp."""
        rule = ApplicationTempRule()

        asset = ExtTestFixtures.create_asset(
            asset_id="at-004",
            canonical_path=r"C:\Users\TestUser\Documents\report.docx",
        )

        result = rule.evaluate(asset)

        assert result.status == RuleMatchStatus.NO_MATCH
        assert result.matched is False

    def test_negative_match_user_temp(self):
        """Test no match for file in user temp (not application temp)."""
        rule = ApplicationTempRule()

        user_temp = KnownLocations.get_user_temp_roots()[0]
        asset = ExtTestFixtures.create_asset(
            asset_id="at-005",
            canonical_path=str(user_temp / "file.tmp"),
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_locked_file_review_required(self):
        """Test locked application temp file gets REVIEW_REQUIRED."""
        rule = ApplicationTempRule()

        app_temp = ExtTestFixtures.get_application_temp_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="at-006",
            canonical_path=str(app_temp / "locked.tmp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="at-006",
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED
        assert "locked" in result.safety.reason.lower()

    def test_missing_file_no_match(self):
        """Test that missing files return NO_MATCH."""
        rule = ApplicationTempRule()

        app_temp = ExtTestFixtures.get_application_temp_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="at-007",
            canonical_path=str(app_temp / "missing.tmp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="at-007",
            exists=False,
            state=SnapshotState.MISSING,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is False
        assert "no longer exists" in result.reason.lower()

    def test_inaccessible_file_review_required(self):
        """Test inaccessible application temp file gets REVIEW_REQUIRED."""
        rule = ApplicationTempRule()

        app_temp = ExtTestFixtures.get_application_temp_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="at-008",
            canonical_path=str(app_temp / "inaccessible.tmp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="at-008",
            accessible=False,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED
        assert "not accessible" in result.safety.reason.lower()


# ---------------------------------------------------------------------------
# BrowserCacheRule
# ---------------------------------------------------------------------------


class TestBrowserCacheRule:
    """Test BrowserCacheRule detection."""

    def test_positive_match_chrome_cache(self):
        """Test match for file in Chrome cache directory."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="bc-001",
            canonical_path=str(cache_root / "f_000001"),
            size=4096,
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="bc-001")

        # Mock: no browsers running so cache is SAFE for automatic cleaning
        with patch(
            "avs_backend.scan_core.rules.detection.junk_rules_ext._detect_running_browsers",
            return_value=set(),
        ):
            result = rule.evaluate(asset, snapshot)

        assert result.status == RuleMatchStatus.MATCHED
        assert result.matched is True
        assert result.confidence.score >= 80.0
        assert result.safety.level == SafetyLevel.SAFE
        assert result.estimated_size == 4096
        assert "browser cache" in result.reason.lower()

    def test_positive_match_browser_cache_asset_type(self):
        """Test match when asset type is BROWSER_CACHE."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="bc-002",
            canonical_path=str(cache_root / "cache_entry"),
            asset_type=AssetType.BROWSER_CACHE,
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="bc-002")
        result = rule.evaluate(asset, snapshot)

        assert result.matched is True

    def test_positive_match_with_old_age(self):
        """Test that old cache entries add age evidence."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="bc-003",
            canonical_path=str(cache_root / "old_cache"),
            modified_at=ExtTestFixtures.old_datetime(),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="bc-003")
        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        age_evidence = [
            e for e in result.evidence.items if e.evidence_type.value == "age_match"
        ]
        assert len(age_evidence) > 0

    def test_negative_match_not_browser_cache(self):
        """Test no match for file outside browser cache."""
        rule = BrowserCacheRule()

        asset = ExtTestFixtures.create_asset(
            asset_id="bc-004",
            canonical_path=r"C:\Users\TestUser\Documents\page.html",
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_negative_match_browser_history(self):
        """Test no match for browser History file (not cache)."""
        rule = BrowserCacheRule()

        # Construct a path that looks like Chrome user data but is History, not Cache
        local_appdata = Path(
            os.environ.get("LOCALAPPDATA", r"C:\Users\TestUser\AppData\Local")
        )
        history_path = (
            local_appdata / "Google" / "Chrome" / "User Data" / "Default" / "History"
        )

        asset = ExtTestFixtures.create_asset(
            asset_id="bc-005",
            canonical_path=str(history_path),
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_locked_cache_review_required(self):
        """Test locked browser cache file gets REVIEW_REQUIRED."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="bc-006",
            canonical_path=str(cache_root / "locked_entry"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="bc-006",
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_cache_no_match(self):
        """Test that missing browser cache files return NO_MATCH."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="bc-007",
            canonical_path=str(cache_root / "missing_entry"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="bc-007",
            exists=False,
            state=SnapshotState.MISSING,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is False
        assert "no longer exists" in result.reason.lower()

    def test_regen_evidence_present(self):
        """Test that browser cache includes auto-regeneration evidence."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="bc-008",
            canonical_path=str(cache_root / "entry_001"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="bc-008")
        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        regen_evidence = [
            e for e in result.evidence.items if "regenerat" in e.description.lower()
        ]
        assert len(regen_evidence) > 0


# ---------------------------------------------------------------------------
# InstallerCacheRule
# ---------------------------------------------------------------------------


class TestInstallerCacheRule:
    """Test InstallerCacheRule detection."""

    def test_positive_match_patch_cache(self):
        """Test match for file in $PatchCache$."""
        rule = InstallerCacheRule()

        installer_root = ExtTestFixtures.get_installer_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="ic-001",
            canonical_path=str(installer_root / "patch.msp"),
            size=1024 * 1024,
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="ic-001")

        result = rule.evaluate(asset, snapshot)

        assert result.status == RuleMatchStatus.MATCHED
        assert result.matched is True
        assert result.confidence.score >= 80.0
        assert result.safety.level == SafetyLevel.SAFE
        assert result.estimated_size == 1024 * 1024
        assert "installer" in result.reason.lower()

    def test_negative_match_parent_installer_dir(self):
        """Test no match for file in parent Installer dir (not $PatchCache$)."""
        rule = InstallerCacheRule()

        # Construct parent Installer path (not $PatchCache$)
        installer_root = ExtTestFixtures.get_installer_cache_root()
        parent = installer_root.parent  # This is %SystemRoot%\Installer

        asset = ExtTestFixtures.create_asset(
            asset_id="ic-002",
            canonical_path=str(parent / "critical.msi"),
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_negative_match_not_installer(self):
        """Test no match for file outside installer cache."""
        rule = InstallerCacheRule()

        asset = ExtTestFixtures.create_asset(
            asset_id="ic-003",
            canonical_path=r"C:\Users\TestUser\Downloads\setup.exe",
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_locked_patch_review_required(self):
        """Test locked patch cache file gets REVIEW_REQUIRED."""
        rule = InstallerCacheRule()

        installer_root = ExtTestFixtures.get_installer_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="ic-004",
            canonical_path=str(installer_root / "locked.msp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="ic-004",
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_patch_no_match(self):
        """Test that missing patch cache files return NO_MATCH."""
        rule = InstallerCacheRule()

        installer_root = ExtTestFixtures.get_installer_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="ic-005",
            canonical_path=str(installer_root / "missing.msp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="ic-005",
            exists=False,
            state=SnapshotState.MISSING,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is False

    def test_auto_reparable_evidence(self):
        """Test that installer cache includes auto-reparable evidence."""
        rule = InstallerCacheRule()

        installer_root = ExtTestFixtures.get_installer_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="ic-006",
            canonical_path=str(installer_root / "patch.msp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="ic-006")
        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        reparable_evidence = [
            e
            for e in result.evidence.items
            if "reparable" in e.description.lower()
            or "re-download" in e.description.lower()
        ]
        assert len(reparable_evidence) > 0


# ---------------------------------------------------------------------------
# WindowsUpdateCacheRule
# ---------------------------------------------------------------------------


class TestWindowsUpdateCacheRule:
    """Test WindowsUpdateCacheRule detection."""

    def test_positive_match_update_cache(self):
        """Test match for file in SoftwareDistribution\\Download."""
        rule = WindowsUpdateCacheRule()

        update_root = ExtTestFixtures.get_windows_update_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="wu-001",
            canonical_path=str(update_root / "update.cab"),
            size=50 * 1024 * 1024,
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="wu-001")

        result = rule.evaluate(asset, snapshot)

        assert result.status == RuleMatchStatus.MATCHED
        assert result.matched is True
        assert result.confidence.score >= 80.0
        assert result.safety.level == SafetyLevel.SAFE
        assert result.estimated_size == 50 * 1024 * 1024
        assert "update" in result.reason.lower()

    def test_negative_match_not_update_cache(self):
        """Test no match for file outside Windows Update cache."""
        rule = WindowsUpdateCacheRule()

        asset = ExtTestFixtures.create_asset(
            asset_id="wu-002",
            canonical_path=r"C:\Windows\System32\wuaueng.dll",
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_negative_match_software_distribution_parent(self):
        """Test no match for file in SoftwareDistribution but not Download."""
        rule = WindowsUpdateCacheRule()

        update_root = ExtTestFixtures.get_windows_update_cache_root()
        parent = update_root.parent  # SoftwareDistribution itself

        asset = ExtTestFixtures.create_asset(
            asset_id="wu-003",
            canonical_path=str(parent / "config.xml"),
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_locked_update_review_required(self):
        """Test locked update cache file gets REVIEW_REQUIRED."""
        rule = WindowsUpdateCacheRule()

        update_root = ExtTestFixtures.get_windows_update_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="wu-004",
            canonical_path=str(update_root / "active_update.cab"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="wu-004",
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_update_no_match(self):
        """Test that missing update cache files return NO_MATCH."""
        rule = WindowsUpdateCacheRule()

        update_root = ExtTestFixtures.get_windows_update_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="wu-005",
            canonical_path=str(update_root / "missing.cab"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="wu-005",
            exists=False,
            state=SnapshotState.MISSING,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is False

    def test_old_update_age_evidence(self):
        """Test that old update cache files get age evidence."""
        rule = WindowsUpdateCacheRule()

        update_root = ExtTestFixtures.get_windows_update_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="wu-006",
            canonical_path=str(update_root / "old_update.cab"),
            modified_at=ExtTestFixtures.old_datetime(),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="wu-006")
        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        age_evidence = [
            e for e in result.evidence.items if e.evidence_type.value == "age_match"
        ]
        assert len(age_evidence) > 0


# ---------------------------------------------------------------------------
# ApplicationCacheRule
# ---------------------------------------------------------------------------


class TestApplicationCacheRule:
    """Test ApplicationCacheRule detection."""

    def test_positive_match_office_cache(self):
        """Test match for file in Office cache directory."""
        rule = ApplicationCacheRule()

        cache_root = ExtTestFixtures.get_application_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="ac-001",
            canonical_path=str(cache_root / "office_cache.dat"),
            size=8192,
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="ac-001")

        result = rule.evaluate(asset, snapshot)

        assert result.status == RuleMatchStatus.MATCHED
        assert result.matched is True
        assert result.confidence.score >= 80.0
        assert result.safety.level == SafetyLevel.SAFE
        assert result.estimated_size == 8192
        assert "application cache" in result.reason.lower()

    def test_positive_match_icon_cache_db(self):
        """Test match for IconCache.db file."""
        rule = ApplicationCacheRule()

        icon_cache = ExtTestFixtures.get_icon_cache_file()
        asset = ExtTestFixtures.create_asset(
            asset_id="ac-002",
            canonical_path=str(icon_cache),
            size=32768,
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="ac-002")

        result = rule.evaluate(asset, snapshot)

        assert result.status == RuleMatchStatus.MATCHED
        assert result.matched is True
        assert result.safety.level == SafetyLevel.SAFE
        assert "application cache" in result.reason.lower()

        # Should have iconcache pattern evidence
        pattern_evidence = [
            e for e in result.evidence.items if e.evidence_type.value == "known_pattern"
        ]
        assert len(pattern_evidence) > 0

    def test_negative_match_not_app_cache(self):
        """Test no match for file outside application cache."""
        rule = ApplicationCacheRule()

        asset = ExtTestFixtures.create_asset(
            asset_id="ac-003",
            canonical_path=r"C:\Users\TestUser\Documents\settings.json",
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_negative_match_random_appdata(self):
        """Test no match for file in AppData but not a known cache."""
        rule = ApplicationCacheRule()

        local_appdata = Path(
            os.environ.get("LOCALAPPDATA", r"C:\Users\TestUser\AppData\Local")
        )
        asset = ExtTestFixtures.create_asset(
            asset_id="ac-004",
            canonical_path=str(local_appdata / "RandomApp" / "data.bin"),
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_locked_cache_review_required(self):
        """Test locked application cache file gets REVIEW_REQUIRED."""
        rule = ApplicationCacheRule()

        cache_root = ExtTestFixtures.get_application_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="ac-005",
            canonical_path=str(cache_root / "locked.dat"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="ac-005",
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_cache_no_match(self):
        """Test that missing application cache files return NO_MATCH."""
        rule = ApplicationCacheRule()

        cache_root = ExtTestFixtures.get_application_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="ac-006",
            canonical_path=str(cache_root / "missing.dat"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="ac-006",
            exists=False,
            state=SnapshotState.MISSING,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is False

    def test_regen_evidence_present(self):
        """Test that application cache includes auto-regeneration evidence."""
        rule = ApplicationCacheRule()

        cache_root = ExtTestFixtures.get_application_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="ac-007",
            canonical_path=str(cache_root / "cache.dat"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="ac-007")
        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        regen_evidence = [
            e for e in result.evidence.items if "regenerat" in e.description.lower()
        ]
        assert len(regen_evidence) > 0


# ---------------------------------------------------------------------------
# False Positive Tests for New Rules
# ---------------------------------------------------------------------------


class TestExtendedFalsePositives:
    """Test that new rules DON'T match files that look like cache but aren't."""

    def test_documents_file_not_matched(self):
        """Test that files in Documents are not matched by any new rule."""
        rules = [
            ApplicationTempRule(),
            BrowserCacheRule(),
            InstallerCacheRule(),
            WindowsUpdateCacheRule(),
            ApplicationCacheRule(),
        ]

        asset = ExtTestFixtures.create_asset(
            asset_id="efp-001",
            canonical_path=r"C:\Users\TestUser\Documents\report.docx",
        )

        for rule in rules:
            result = rule.evaluate(asset)
            assert (
                result.matched is False
            ), f"{rule.rule_id} incorrectly matched Documents file"

    def test_system32_not_matched(self):
        """Test that System32 files are not matched by new rules."""
        rules = [
            ApplicationTempRule(),
            BrowserCacheRule(),
            InstallerCacheRule(),
            WindowsUpdateCacheRule(),
            ApplicationCacheRule(),
        ]

        asset = ExtTestFixtures.create_asset(
            asset_id="efp-002",
            canonical_path=r"C:\Windows\System32\kernel32.dll",
        )

        for rule in rules:
            result = rule.evaluate(asset)
            assert (
                result.matched is False
            ), f"{rule.rule_id} incorrectly matched System32 file"

    def test_program_files_not_matched(self):
        """Test that Program Files are not matched by new rules."""
        rules = [
            ApplicationTempRule(),
            BrowserCacheRule(),
            InstallerCacheRule(),
            WindowsUpdateCacheRule(),
            ApplicationCacheRule(),
        ]

        asset = ExtTestFixtures.create_asset(
            asset_id="efp-003",
            canonical_path=r"C:\Program Files\MyApp\app.exe",
        )

        for rule in rules:
            result = rule.evaluate(asset)
            assert (
                result.matched is False
            ), f"{rule.rule_id} incorrectly matched Program Files binary"

    def test_user_downloads_not_matched(self):
        """Test that Downloads files are not matched by new rules."""
        rules = [
            ApplicationTempRule(),
            BrowserCacheRule(),
            InstallerCacheRule(),
            WindowsUpdateCacheRule(),
            ApplicationCacheRule(),
        ]

        asset = ExtTestFixtures.create_asset(
            asset_id="efp-004",
            canonical_path=r"C:\Users\TestUser\Downloads\installer.exe",
        )

        for rule in rules:
            result = rule.evaluate(asset)
            assert (
                result.matched is False
            ), f"{rule.rule_id} incorrectly matched Downloads file"

    def test_browser_bookmarks_not_matched(self):
        """Test that browser Bookmarks file is not matched as cache."""
        rule = BrowserCacheRule()

        local_appdata = Path(
            os.environ.get("LOCALAPPDATA", r"C:\Users\TestUser\AppData\Local")
        )
        bookmarks_path = (
            local_appdata / "Google" / "Chrome" / "User Data" / "Default" / "Bookmarks"
        )

        asset = ExtTestFixtures.create_asset(
            asset_id="efp-005",
            canonical_path=str(bookmarks_path),
        )

        result = rule.evaluate(asset)
        assert result.matched is False

    def test_browser_login_data_not_matched(self):
        """Test that browser Login Data file is not matched as cache."""
        rule = BrowserCacheRule()

        local_appdata = Path(
            os.environ.get("LOCALAPPDATA", r"C:\Users\TestUser\AppData\Local")
        )
        login_path = (
            local_appdata / "Google" / "Chrome" / "User Data" / "Default" / "Login Data"
        )

        asset = ExtTestFixtures.create_asset(
            asset_id="efp-006",
            canonical_path=str(login_path),
        )

        result = rule.evaluate(asset)
        assert result.matched is False

    def test_msi_in_installer_parent_not_matched(self):
        """Test that MSI in parent Installer dir is not matched by InstallerCacheRule."""
        rule = InstallerCacheRule()

        installer_root = ExtTestFixtures.get_installer_cache_root()
        parent = installer_root.parent

        asset = ExtTestFixtures.create_asset(
            asset_id="efp-007",
            canonical_path=str(parent / "critical.msi"),
        )

        result = rule.evaluate(asset)
        assert result.matched is False

    def test_temp_extension_in_documents_not_matched(self):
        """Test that .tmp file in Documents is not matched by new rules."""
        rules = [
            ApplicationTempRule(),
            BrowserCacheRule(),
            InstallerCacheRule(),
            WindowsUpdateCacheRule(),
            ApplicationCacheRule(),
        ]

        asset = ExtTestFixtures.create_asset(
            asset_id="efp-008",
            canonical_path=r"C:\Users\TestUser\Documents\backup.tmp",
        )

        for rule in rules:
            result = rule.evaluate(asset)
            assert (
                result.matched is False
            ), f"{rule.rule_id} incorrectly matched .tmp in Documents"


# ---------------------------------------------------------------------------
# Determinism Tests for New Rules
# ---------------------------------------------------------------------------


class TestExtendedDeterminism:
    """Test deterministic behavior for new rules."""

    def test_application_temp_deterministic(self):
        """Test ApplicationTempRule produces same output for same input."""
        rule = ApplicationTempRule()

        app_temp = ExtTestFixtures.get_application_temp_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="det-at-001",
            canonical_path=str(app_temp / "test.tmp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="det-at-001")

        result1 = rule.evaluate(asset, snapshot)
        result2 = rule.evaluate(asset, snapshot)

        assert result1.status == result2.status
        assert result1.confidence.score == result2.confidence.score
        assert result1.safety.level == result2.safety.level
        assert result1.reason == result2.reason

    def test_browser_cache_deterministic(self):
        """Test BrowserCacheRule produces same output for same input."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="det-bc-001",
            canonical_path=str(cache_root / "entry"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="det-bc-001")

        result1 = rule.evaluate(asset, snapshot)
        result2 = rule.evaluate(asset, snapshot)

        assert result1.status == result2.status
        assert result1.confidence.score == result2.confidence.score
        assert result1.safety.level == result2.safety.level

    def test_installer_cache_deterministic(self):
        """Test InstallerCacheRule produces same output for same input."""
        rule = InstallerCacheRule()

        installer_root = ExtTestFixtures.get_installer_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="det-ic-001",
            canonical_path=str(installer_root / "patch.msp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="det-ic-001")

        result1 = rule.evaluate(asset, snapshot)
        result2 = rule.evaluate(asset, snapshot)

        assert result1.status == result2.status
        assert result1.confidence.score == result2.confidence.score
        assert result1.safety.level == result2.safety.level

    def test_windows_update_deterministic(self):
        """Test WindowsUpdateCacheRule produces same output for same input."""
        rule = WindowsUpdateCacheRule()

        update_root = ExtTestFixtures.get_windows_update_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="det-wu-001",
            canonical_path=str(update_root / "update.cab"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="det-wu-001")

        result1 = rule.evaluate(asset, snapshot)
        result2 = rule.evaluate(asset, snapshot)

        assert result1.status == result2.status
        assert result1.confidence.score == result2.confidence.score
        assert result1.safety.level == result2.safety.level

    def test_application_cache_deterministic(self):
        """Test ApplicationCacheRule produces same output for same input."""
        rule = ApplicationCacheRule()

        cache_root = ExtTestFixtures.get_application_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="det-ac-001",
            canonical_path=str(cache_root / "cache.dat"),
        )

        snapshot = ExtTestFixtures.create_snapshot(asset_id="det-ac-001")

        result1 = rule.evaluate(asset, snapshot)
        result2 = rule.evaluate(asset, snapshot)

        assert result1.status == result2.status
        assert result1.confidence.score == result2.confidence.score
        assert result1.safety.level == result2.safety.level


# ---------------------------------------------------------------------------
# Estimated Size Tests for New Rules
# ---------------------------------------------------------------------------


class TestExtendedEstimatedSize:
    """Test estimated size reporting for new rules."""

    def test_application_temp_size(self):
        """Test estimated size for ApplicationTempRule."""
        rule = ApplicationTempRule()

        app_temp = ExtTestFixtures.get_application_temp_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="sz-at-001",
            canonical_path=str(app_temp / "sized.tmp"),
            size=2 * 1024 * 1024,
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert result.estimated_size == 2 * 1024 * 1024

    def test_browser_cache_size(self):
        """Test estimated size for BrowserCacheRule."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="sz-bc-001",
            canonical_path=str(cache_root / "large_entry"),
            size=5 * 1024 * 1024,
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert result.estimated_size == 5 * 1024 * 1024

    def test_installer_cache_size(self):
        """Test estimated size for InstallerCacheRule."""
        rule = InstallerCacheRule()

        installer_root = ExtTestFixtures.get_installer_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="sz-ic-001",
            canonical_path=str(installer_root / "large_patch.msp"),
            size=10 * 1024 * 1024,
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert result.estimated_size == 10 * 1024 * 1024

    def test_windows_update_size(self):
        """Test estimated size for WindowsUpdateCacheRule."""
        rule = WindowsUpdateCacheRule()

        update_root = ExtTestFixtures.get_windows_update_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="sz-wu-001",
            canonical_path=str(update_root / "large_update.cab"),
            size=100 * 1024 * 1024,
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert result.estimated_size == 100 * 1024 * 1024

    def test_application_cache_size(self):
        """Test estimated size for ApplicationCacheRule."""
        rule = ApplicationCacheRule()

        cache_root = ExtTestFixtures.get_application_cache_root()
        asset = ExtTestFixtures.create_asset(
            asset_id="sz-ac-001",
            canonical_path=str(cache_root / "sized_cache.dat"),
            size=512 * 1024,
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert result.estimated_size == 512 * 1024

    def test_no_size_when_unavailable(self):
        """Test that size is None when not available."""
        rule = BrowserCacheRule()

        cache_root = ExtTestFixtures.get_browser_cache_root()
        asset = ScanAsset(
            asset_id="sz-none-001",
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="entry",
            canonical_path=str(cache_root / "no_size_entry"),
            discovered_at=datetime.now(UTC),
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert result.estimated_size is None


# ---------------------------------------------------------------------------
# SafetyPolicy Tests
# ---------------------------------------------------------------------------


class TestSafetyPolicy:
    """Test centralized SafetyPolicy directly."""

    def test_protected_location_blocked(self):
        """Test that protected location returns BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-001",
            canonical_path=r"C:\Windows\System32\kernel32.dll",
        )

        safety = SafetyPolicy.assess(asset=asset)

        assert safety.level == SafetyLevel.BLOCKED
        assert len(safety.blockers) > 0

    def test_safe_asset(self):
        """Test that normal asset returns SAFE."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        temp_root = KnownLocations.get_user_temp_roots()[0]
        asset = ExtTestFixtures.create_asset(
            asset_id="sp-002",
            canonical_path=str(temp_root / "normal.tmp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="sp-002",
            accessible=True,
            locked=False,
        )

        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)

        assert safety.level == SafetyLevel.SAFE

    def test_locked_review_required(self):
        """Test that locked asset returns REVIEW_REQUIRED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        temp_root = KnownLocations.get_user_temp_roots()[0]
        asset = ExtTestFixtures.create_asset(
            asset_id="sp-003",
            canonical_path=str(temp_root / "locked.tmp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="sp-003",
            locked=True,
        )

        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)

        assert safety.level == SafetyLevel.REVIEW_REQUIRED
        assert "locked" in safety.reason.lower()

    def test_inaccessible_review_required(self):
        """Test that inaccessible asset returns REVIEW_REQUIRED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        temp_root = KnownLocations.get_user_temp_roots()[0]
        asset = ExtTestFixtures.create_asset(
            asset_id="sp-004",
            canonical_path=str(temp_root / "inaccessible.tmp"),
        )

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="sp-004",
            accessible=False,
        )

        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)

        assert safety.level == SafetyLevel.REVIEW_REQUIRED
        assert "not accessible" in safety.reason.lower()

    def test_should_skip_missing_true(self):
        """Test should_skip_missing returns True for missing snapshot."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="sp-005",
            exists=False,
            state=SnapshotState.MISSING,
        )

        assert SafetyPolicy.should_skip_missing(snapshot) is True

    def test_should_skip_missing_false(self):
        """Test should_skip_missing returns False for existing snapshot."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        snapshot = ExtTestFixtures.create_snapshot(
            asset_id="sp-006",
            exists=True,
        )

        assert SafetyPolicy.should_skip_missing(snapshot) is False

    def test_should_skip_missing_none_snapshot(self):
        """Test should_skip_missing returns False for None snapshot."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        assert SafetyPolicy.should_skip_missing(None) is False

    # --- Regression tests for Windows protected-path detection ---

    def test_system32_dll_blocked(self):
        """C:\\Windows\\System32\\kernel32.dll must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-sys32",
            canonical_path=r"C:\Windows\System32\kernel32.dll",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_syswow64_dll_blocked(self):
        """C:\\Windows\\SysWOW64\\ntdll.dll must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-syswow",
            canonical_path=r"C:\Windows\SysWOW64\ntdll.dll",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_winsxs_dll_blocked(self):
        """C:\\Windows\\WinSxS\\... must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-winsxs",
            canonical_path=r"C:\Windows\WinSxS\manifest\test.manifest",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_program_files_exe_blocked(self):
        """C:\\Program Files\\... must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-pf",
            canonical_path=r"C:\Program Files\MyApp\app.exe",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_program_files_x86_exe_blocked(self):
        """C:\\Program Files (x86)\\... must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-pf86",
            canonical_path=r"C:\Program Files (x86)\MyApp\app.exe",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_case_insensitive_windows_path_blocked(self):
        """c:\\windows\\system32\\kernel32.dll (lowercase) must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-ci",
            canonical_path=r"c:\windows\system32\kernel32.dll",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_forward_slash_windows_path_blocked(self):
        """C:/Windows/System32/kernel32.dll (forward slashes) must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-fs",
            canonical_path=r"C:/Windows/System32/kernel32.dll",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_windows_backup_not_blocked(self):
        """C:\\WindowsBackup\\file.txt must NOT be BLOCKED (boundary check)."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-wb",
            canonical_path=r"C:\WindowsBackup\file.txt",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level != SafetyLevel.BLOCKED

    def test_similar_prefix_path_not_blocked(self):
        """C:\\Program FilesBackup\\... must NOT be BLOCKED (boundary check)."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-pfb",
            canonical_path=r"C:\Program FilesBackup\app.exe",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level != SafetyLevel.BLOCKED

    def test_patchcache_exception_preserved(self):
        """$PatchCache$ under Installer must NOT be BLOCKED (exception)."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-pc",
            canonical_path=r"C:\Windows\Installer\$PatchCache$\msi.dll",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level != SafetyLevel.BLOCKED

    def test_avs_shield_protected_location_blocked(self):
        """AVS AI Shield install dir must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-avs",
            canonical_path=r"C:\Program Files\AVS AI Shield\optimizer.exe",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_windows_root_itself_blocked(self):
        """C:\\Windows itself (no subdirectory) must be BLOCKED."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-win",
            canonical_path=r"C:\Windows",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_trailing_separator_handled(self):
        """Paths with trailing separators must be handled correctly."""
        from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy

        asset = ExtTestFixtures.create_asset(
            asset_id="sp-ts",
            canonical_path=r"C:\Windows\System32" + "\\",
        )
        safety = SafetyPolicy.assess(asset=asset)
        assert safety.level == SafetyLevel.BLOCKED

    def test_boundary_safe_normalization(self):
        """Verify _normalize_windows_path strips drive and separators."""
        parts = KnownLocations._normalize_windows_path(
            r"C:\Windows\System32\kernel32.dll"
        )
        assert parts == ["windows", "system32", "kernel32.dll"]

        parts_fs = KnownLocations._normalize_windows_path(r"C:/Windows/Temp/test.tmp")
        assert parts_fs == ["windows", "temp", "test.tmp"]

        parts_lower = KnownLocations._normalize_windows_path(r"c:\windows\system32")
        assert parts_lower == ["windows", "system32"]
