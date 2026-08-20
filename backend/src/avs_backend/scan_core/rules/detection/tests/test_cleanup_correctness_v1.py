"""
V1.0 Cleanup Correctness Regression Tests

Tests the V1.0 detection contract:
- Locked files are NOT classified as SAFE for automatic cleaning
- Protected paths are NOT classified as SAFE
- Browser cache files are NOT SAFE when the browser is running
- Deletable temp files ARE classified as SAFE
- SafetyPolicy correctly gates the safety assessment

These tests verify the core principle:
"ONLY REPORT AN ITEM AS AUTOMATICALLY CLEANABLE IF IT IS genuinely
disposable, inside an approved category, not locked, and actually deletable."
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
from avs_backend.scan_core.rules.detection.junk_rules import UserTempRule
from avs_backend.scan_core.rules.detection.junk_rules_ext import (
    BrowserCacheRule,
    _is_browser_running_for_path,
    _detect_running_browsers,
)
from avs_backend.scan_core.rules.detection.locations import KnownLocations
from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy
from avs_backend.scan_core.rules.enums import SafetyLevel
from avs_backend.scan_core.rules.result import RuleMatchStatus


class CleanupCorrectnessFixtures:
    """Test fixtures for cleanup correctness tests."""

    @staticmethod
    def create_asset(
        asset_id: str,
        canonical_path: str,
        asset_type: AssetType = AssetType.FILE,
        size: int = 1024,
        modified_at: Optional[datetime] = None,
    ) -> ScanAsset:
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
        locked: bool = False,
        accessible: bool = True,
        exists: bool = True,
    ) -> AssetSnapshot:
        return AssetSnapshot(
            asset_id=asset_id,
            scan_id="test-scan",
            observed_at=datetime.now(UTC),
            state=SnapshotState.LOCKED if locked else SnapshotState.DISCOVERED,
            exists=exists,
            accessible=accessible,
            locked=locked,
        )

    @staticmethod
    def old_datetime() -> datetime:
        return datetime.now(UTC) - timedelta(days=30)


# ---------------------------------------------------------------------------
# Test 1: Locked file is NOT an automatic-clean candidate
# ---------------------------------------------------------------------------


class TestLockedFileNotCleanCandidate:
    """A locked file must NOT be classified as SAFE for automatic cleaning."""

    def test_locked_temp_file_is_review_required(self):
        """A user temp file that is locked must be REVIEW_REQUIRED, not SAFE."""
        rule = UserTempRule()
        roots = KnownLocations.get_user_temp_roots()
        assert len(roots) > 0
        temp_root = str(roots[0]).replace("/", "\\")
        path = os.path.join(temp_root, "locked_temp.tmp")

        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-locked-1", path, modified_at=CleanupCorrectnessFixtures.old_datetime()
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot(
            "asset-locked-1", locked=True, accessible=False
        )

        result = rule.evaluate(asset, snapshot)
        assert result.matched
        assert result.safety.requires_review
        assert not result.safety.is_safe

    def test_locked_browser_cache_is_review_required(self):
        """A browser cache file that is locked must be REVIEW_REQUIRED."""
        rule = BrowserCacheRule()
        roots = KnownLocations.get_browser_cache_roots()
        assert len(roots) > 0
        cache_root = str(roots[0]).replace("/", "\\")
        path = os.path.join(cache_root, "cache_data", "data_1")

        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-locked-2", path, modified_at=CleanupCorrectnessFixtures.old_datetime()
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot(
            "asset-locked-2", locked=True, accessible=False
        )

        result = rule.evaluate(asset, snapshot)
        assert result.matched
        assert result.safety.requires_review
        assert not result.safety.is_safe


# ---------------------------------------------------------------------------
# Test 2: Protected path is NOT a candidate
# ---------------------------------------------------------------------------


class TestProtectedPathNotCandidate:
    """A file in a protected system location must be BLOCKED."""

    def test_protected_path_is_blocked(self):
        """SafetyPolicy must BLOCK files in protected locations."""
        # Use a known protected path
        protected_path = r"C:\Windows\System32\kernel32.dll"
        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-protected", protected_path
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot("asset-protected")

        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.is_blocked
        assert not safety.is_safe


# ---------------------------------------------------------------------------
# Test 3: Active browser cache is handled safely
# ---------------------------------------------------------------------------


class TestActiveBrowserCacheSafety:
    """Browser cache files must be REVIEW_REQUIRED when the browser is running."""

    def test_browser_running_cache_is_review_required(self):
        """When Chrome is running, Chrome cache files must be REVIEW_REQUIRED."""
        rule = BrowserCacheRule()
        roots = KnownLocations.get_browser_cache_roots()
        assert len(roots) > 0

        # Find a Chrome-specific cache root
        chrome_root = None
        for root in roots:
            root_str = str(root).lower()
            if "chrome" in root_str:
                chrome_root = str(root).replace("/", "\\")
                break

        if chrome_root is None:
            # Skip if Chrome is not installed on this test machine
            return

        path = os.path.join(chrome_root, "CacheStorage", "data_1")
        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-browser-running", path,
            modified_at=CleanupCorrectnessFixtures.old_datetime()
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot("asset-browser-running")

        # Mock that Chrome is running
        with patch(
            "avs_backend.scan_core.rules.detection.junk_rules_ext._detect_running_browsers",
            return_value={"chrome"},
        ):
            result = rule.evaluate(asset, snapshot)
            assert result.matched
            assert result.safety.requires_review
            assert not result.safety.is_safe

    def test_browser_not_running_cache_is_safe(self):
        """When Chrome is NOT running, Chrome cache files can be SAFE."""
        rule = BrowserCacheRule()
        roots = KnownLocations.get_browser_cache_roots()
        assert len(roots) > 0

        chrome_root = None
        for root in roots:
            root_str = str(root).lower()
            if "chrome" in root_str:
                chrome_root = str(root).replace("/", "\\")
                break

        if chrome_root is None:
            return

        path = os.path.join(chrome_root, "CacheStorage", "data_1")
        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-browser-not-running", path,
            modified_at=CleanupCorrectnessFixtures.old_datetime()
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot("asset-browser-not-running")

        # Mock that no browsers are running
        with patch(
            "avs_backend.scan_core.rules.detection.junk_rules_ext._detect_running_browsers",
            return_value=set(),
        ):
            result = rule.evaluate(asset, snapshot)
            assert result.matched
            assert result.safety.is_safe


# ---------------------------------------------------------------------------
# Test 4: Deletable temp file IS a cleanable candidate
# ---------------------------------------------------------------------------


class TestDeletableTempFileIsCandidate:
    """A non-locked, accessible temp file must be classified as SAFE."""

    def test_unlocked_temp_file_is_safe(self):
        """A user temp file that is not locked must be SAFE."""
        rule = UserTempRule()
        roots = KnownLocations.get_user_temp_roots()
        assert len(roots) > 0
        temp_root = str(roots[0]).replace("/", "\\")
        path = os.path.join(temp_root, "deletable_temp.tmp")

        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-safe-1", path, modified_at=CleanupCorrectnessFixtures.old_datetime()
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot(
            "asset-safe-1", locked=False, accessible=True
        )

        result = rule.evaluate(asset, snapshot)
        assert result.matched
        assert result.safety.is_safe
        assert not result.safety.requires_review
        assert not result.safety.is_blocked


# ---------------------------------------------------------------------------
# Test 5: SafetyPolicy correctly distinguishes states
# ---------------------------------------------------------------------------


class TestSafetyPolicyCorrectness:
    """SafetyPolicy must correctly classify all asset states."""

    def test_missing_asset_is_review_required(self):
        """A missing asset must be REVIEW_REQUIRED, not SAFE."""
        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-missing", r"C:\Users\test\AppData\Local\Temp\missing.tmp"
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot(
            "asset-missing", exists=False, accessible=False
        )

        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.requires_review
        assert not safety.is_safe

    def test_inaccessible_asset_is_review_required(self):
        """An inaccessible asset must be REVIEW_REQUIRED."""
        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-inaccessible", r"C:\Users\test\AppData\Local\Temp\inaccessible.tmp"
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot(
            "asset-inaccessible", accessible=False
        )

        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.requires_review
        assert not safety.is_safe

    def test_unlocked_accessible_asset_is_safe(self):
        """An unlocked, accessible, existing asset in a non-protected path is SAFE."""
        asset = CleanupCorrectnessFixtures.create_asset(
            "asset-ok", r"C:\Users\test\AppData\Local\Temp\ok.tmp"
        )
        snapshot = CleanupCorrectnessFixtures.create_snapshot("asset-ok")

        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.is_safe
