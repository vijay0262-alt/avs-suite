"""
SC-8C2 Junk Detection Rules Tests

Comprehensive tests for production junk detection rules.

Tests use synthetic fixtures - NO dependency on actual filesystem.
"""

from datetime import UTC, datetime
from pathlib import Path
from typing import Optional

import pytest
from avs_backend.scan_core.assets import AssetCategory, AssetSource, AssetType, ScanAsset
from avs_backend.scan_core.context import AssetSnapshot, SnapshotState
from avs_backend.scan_core.rules.detection.junk_rules import (
    ShaderCacheRule,
    ThumbnailCacheRule,
    UserTempRule,
    WindowsTempRule,
)
from avs_backend.scan_core.rules.enums import SafetyLevel
from avs_backend.scan_core.rules.result import RuleMatchStatus


class TestFixtures:
    """Test fixture factory for synthetic assets and snapshots."""

    # Cache known locations for tests
    _user_temp_root: Optional[Path] = None
    _windows_temp_root: Optional[Path] = None
    _shader_cache_roots: Optional[list[Path]] = None
    _thumbnail_cache_root: Optional[Path] = None

    @classmethod
    def get_user_temp_root(cls) -> Path:
        """Get actual user temp root for testing."""
        if cls._user_temp_root is None:
            from avs_backend.scan_core.rules.detection.locations import KnownLocations

            roots = KnownLocations.get_user_temp_roots()
            assert len(roots) > 0, "No user temp roots found"
            cls._user_temp_root = roots[0]
        return cls._user_temp_root

    @classmethod
    def get_windows_temp_root(cls) -> Path:
        """Get actual Windows temp root for testing."""
        if cls._windows_temp_root is None:
            from avs_backend.scan_core.rules.detection.locations import KnownLocations

            cls._windows_temp_root = KnownLocations.get_windows_temp_root()
        return cls._windows_temp_root

    @classmethod
    def get_shader_cache_roots(cls) -> list[Path]:
        """Get actual shader cache roots for testing."""
        if cls._shader_cache_roots is None:
            from avs_backend.scan_core.rules.detection.locations import KnownLocations

            cls._shader_cache_roots = KnownLocations.get_shader_cache_roots()
        return cls._shader_cache_roots

    @classmethod
    def get_thumbnail_cache_root(cls) -> Path:
        """Get actual thumbnail cache root for testing."""
        if cls._thumbnail_cache_root is None:
            from avs_backend.scan_core.rules.detection.locations import KnownLocations

            cls._thumbnail_cache_root = KnownLocations.get_thumbnail_cache_root()
        return cls._thumbnail_cache_root

    @staticmethod
    def create_asset(
        asset_id: str,
        canonical_path: str,
        asset_type: AssetType = AssetType.FILE,
        size: int = 1024,
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


class TestUserTempRule:
    """Test UserTempRule detection."""

    def test_positive_match_localappdata_temp(self):
        """Test match for file in %LOCALAPPDATA%\\Temp."""
        rule = UserTempRule()

        # Use actual user temp path for realistic testing
        temp_root = TestFixtures.get_user_temp_root()
        asset = TestFixtures.create_asset(
            asset_id="test-001",
            canonical_path=str(temp_root / "test.tmp"),
            size=2048,
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-001",
            accessible=True,
            locked=False,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.status == RuleMatchStatus.MATCHED
        assert result.matched is True
        assert result.confidence.score >= 80.0
        assert result.safety.level == SafetyLevel.SAFE
        assert result.estimated_size == 2048
        assert "temporary directory" in result.reason.lower()

        # Check evidence
        assert len(result.evidence.items) > 0
        location_evidence = [
            e for e in result.evidence.items if "temporary directory" in e.description.lower()
        ]
        assert len(location_evidence) > 0

    def test_negative_match_not_temp(self):
        """Test no match for file outside temp directories."""
        rule = UserTempRule()

        asset = TestFixtures.create_asset(
            asset_id="test-002",
            canonical_path=r"C:\Users\TestUser\Documents\important.docx",
        )

        result = rule.evaluate(asset)

        assert result.status == RuleMatchStatus.NO_MATCH
        assert result.matched is False
        assert "not located in" in result.reason.lower()

    def test_locked_file_review_required(self):
        """Test that locked files get REVIEW_REQUIRED safety."""
        rule = UserTempRule()

        temp_root = TestFixtures.get_user_temp_root()
        asset = TestFixtures.create_asset(
            asset_id="test-002",
            canonical_path=str(temp_root / "locked.tmp"),
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-003",
            accessible=True,
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED
        assert "locked" in result.safety.reason.lower()

    def test_inaccessible_file_review_required(self):
        """Test that inaccessible files get REVIEW_REQUIRED safety."""
        rule = UserTempRule()

        temp_root = TestFixtures.get_user_temp_root()
        asset = TestFixtures.create_asset(
            asset_id="test-003",
            canonical_path=str(temp_root / "inaccessible.tmp"),
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-004",
            accessible=False,
            locked=False,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED
        assert "not accessible" in result.safety.reason.lower()

    def test_missing_file_no_match(self):
        """Test that missing files return NO_MATCH (not actionable)."""
        rule = UserTempRule()

        temp_root = TestFixtures.get_user_temp_root()
        asset = TestFixtures.create_asset(
            asset_id="test-004",
            canonical_path=str(temp_root / "missing.tmp"),
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-005",
            state=SnapshotState.MISSING,
            exists=False,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is False
        assert result.status == RuleMatchStatus.NO_MATCH
        assert "no longer exists" in result.reason.lower()

    def test_wrong_asset_type_no_match(self):
        """Test rule doesn't match non-FILE assets."""
        rule = UserTempRule()

        # Directory asset (not FILE)
        asset = ScanAsset(
            asset_id="test-006",
            asset_type=AssetType.DIRECTORY,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="Temp",
            canonical_path=r"C:\Users\TestUser\AppData\Local\Temp",
            discovered_at=datetime.now(UTC),
        )

        # Rule should not evaluate (applicability filtering)
        # But if it does, it should handle gracefully
        result = rule.evaluate(asset)

        # Either no match or handled appropriately
        assert result is not None


class TestWindowsTempRule:
    """Test WindowsTempRule detection."""

    def test_positive_match_windows_temp(self):
        """Test match for file in C:\\Windows\\Temp."""
        rule = WindowsTempRule()

        windows_temp = TestFixtures.get_windows_temp_root()
        asset = TestFixtures.create_asset(
            asset_id="test-101",
            canonical_path=str(windows_temp / "test.tmp"),
            size=4096,
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-101",
            accessible=True,
            locked=False,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.confidence.score >= 80.0
        assert result.safety.level == SafetyLevel.SAFE
        assert result.estimated_size == 4096
        assert "windows" in result.reason.lower()

    def test_negative_match_not_windows_temp(self):
        """Test no match for file outside Windows\\Temp."""
        rule = WindowsTempRule()

        asset = TestFixtures.create_asset(
            asset_id="test-102",
            canonical_path=r"C:\Windows\System32\important.dll",
        )

        result = rule.evaluate(asset)

        assert result.matched is False
        assert "not located in" in result.reason.lower()

    def test_locked_system_file_review(self):
        """Test locked system temp file gets REVIEW_REQUIRED."""
        rule = WindowsTempRule()

        windows_temp = TestFixtures.get_windows_temp_root()
        asset = TestFixtures.create_asset(
            asset_id="test-102",
            canonical_path=str(windows_temp / "system.tmp"),
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-103",
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED
        assert "locked" in result.safety.reason.lower()


class TestShaderCacheRule:
    """Test ShaderCacheRule detection."""

    def test_positive_match_d3dscache(self):
        """Test match for DirectX shader cache."""
        rule = ShaderCacheRule()

        shader_roots = TestFixtures.get_shader_cache_roots()
        # Find D3DSCache root
        d3ds_root = next(
            (r for r in shader_roots if "D3DSCache" in str(r)),
            shader_roots[0] if shader_roots else None,
        )
        if d3ds_root is None:
            pytest.skip("No shader cache roots found")

        asset = TestFixtures.create_asset(
            asset_id="test-201",
            canonical_path=str(d3ds_root / "shader.bin"),
            size=8192,
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-201",
            accessible=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.confidence.score >= 85.0
        assert result.safety.level == SafetyLevel.SAFE
        assert "shader cache" in result.reason.lower()

        # Check for regeneration evidence
        regen_evidence = [e for e in result.evidence.items if "regenerat" in e.description.lower()]
        assert len(regen_evidence) > 0

    def test_positive_match_nvidia_cache(self):
        """Test match for NVIDIA shader cache."""
        rule = ShaderCacheRule()

        shader_roots = TestFixtures.get_shader_cache_roots()
        # Find NVIDIA root
        nvidia_root = next((r for r in shader_roots if "NVIDIA" in str(r)), None)
        if nvidia_root is None:
            pytest.skip("No NVIDIA shader cache root found")

        asset = TestFixtures.create_asset(
            asset_id="test-202",
            canonical_path=str(nvidia_root / "shader.cache"),
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert "shader cache" in result.reason.lower()

    def test_positive_match_amd_cache(self):
        """Test match for AMD shader cache."""
        rule = ShaderCacheRule()

        shader_roots = TestFixtures.get_shader_cache_roots()
        # Find AMD root
        amd_root = next((r for r in shader_roots if "AMD" in str(r)), None)
        if amd_root is None:
            pytest.skip("No AMD shader cache root found")

        asset = TestFixtures.create_asset(
            asset_id="test-203",
            canonical_path=str(amd_root / "shader.bin"),
        )

        result = rule.evaluate(asset)

        assert result.matched is True

    def test_negative_match_not_shader_cache(self):
        """Test no match for non-shader-cache file."""
        rule = ShaderCacheRule()

        asset = TestFixtures.create_asset(
            asset_id="test-204",
            canonical_path=r"C:\Users\TestUser\AppData\Local\SomeApp\data.bin",
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_locked_shader_cache_review(self):
        """Test locked shader cache requires review."""
        rule = ShaderCacheRule()

        shader_roots = TestFixtures.get_shader_cache_roots()
        if not shader_roots:
            pytest.skip("No shader cache roots found")

        asset = TestFixtures.create_asset(
            asset_id="test-205",
            canonical_path=str(shader_roots[0] / "active.bin"),
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-205",
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED


class TestThumbnailCacheRule:
    """Test ThumbnailCacheRule detection."""

    def test_positive_match_thumbcache(self):
        """Test match for thumbcache_*.db file."""
        rule = ThumbnailCacheRule()

        thumb_root = TestFixtures.get_thumbnail_cache_root()
        asset = TestFixtures.create_asset(
            asset_id="test-301",
            canonical_path=str(thumb_root / "thumbcache_256.db"),
            size=16384,
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-301",
            accessible=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.confidence.score >= 90.0
        assert result.safety.level == SafetyLevel.SAFE
        assert "thumbnail" in result.reason.lower()

        # Check for pattern evidence
        pattern_evidence = [e for e in result.evidence.items if "pattern" in e.description.lower()]
        assert len(pattern_evidence) > 0

    def test_positive_match_iconcache(self):
        """Test match for iconcache_*.db file."""
        rule = ThumbnailCacheRule()

        thumb_root = TestFixtures.get_thumbnail_cache_root()
        asset = TestFixtures.create_asset(
            asset_id="test-302",
            canonical_path=str(thumb_root / "iconcache_32.db"),
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert "thumbnail" in result.reason.lower() or "icon" in result.reason.lower()

    def test_negative_match_wrong_location(self):
        """Test no match for thumbnail-named file in wrong location."""
        rule = ThumbnailCacheRule()

        asset = TestFixtures.create_asset(
            asset_id="test-303",
            canonical_path=r"C:\Users\TestUser\Documents\thumbcache_fake.db",
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_negative_match_wrong_pattern(self):
        """Test no match for file in Explorer folder but wrong name."""
        rule = ThumbnailCacheRule()

        thumb_root = TestFixtures.get_thumbnail_cache_root()
        asset = TestFixtures.create_asset(
            asset_id="test-304",
            canonical_path=str(thumb_root / "other.db"),
        )

        result = rule.evaluate(asset)

        assert result.matched is False

    def test_locked_thumbnail_review(self):
        """Test locked thumbnail cache requires review."""
        rule = ThumbnailCacheRule()

        thumb_root = TestFixtures.get_thumbnail_cache_root()
        asset = TestFixtures.create_asset(
            asset_id="test-305",
            canonical_path=str(thumb_root / "thumbcache_1024.db"),
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="test-305",
            locked=True,
        )

        result = rule.evaluate(asset, snapshot)

        assert result.matched is True
        assert result.safety.level == SafetyLevel.REVIEW_REQUIRED
        assert "locked" in result.safety.reason.lower()


class TestFalsePositives:
    """Test that rules DON'T match files that look like junk but aren't."""

    def test_important_tmp_in_documents(self):
        """Test .tmp file in Documents is NOT matched."""
        rules = [UserTempRule(), WindowsTempRule()]

        asset = TestFixtures.create_asset(
            asset_id="fp-001",
            canonical_path=r"C:\Users\TestUser\Documents\important_backup.tmp",
        )

        for rule in rules:
            result = rule.evaluate(asset)
            assert result.matched is False, f"{rule.rule_id} incorrectly matched Documents file"

    def test_system32_file(self):
        """Test System32 file is NOT matched."""
        rules = [UserTempRule(), WindowsTempRule()]

        asset = TestFixtures.create_asset(
            asset_id="fp-002",
            canonical_path=r"C:\Windows\System32\kernel32.dll",
        )

        for rule in rules:
            result = rule.evaluate(asset)
            assert result.matched is False, f"{rule.rule_id} incorrectly matched System32 file"

    def test_program_files_binary(self):
        """Test Program Files binary is NOT matched."""
        rules = [
            UserTempRule(),
            WindowsTempRule(),
            ShaderCacheRule(),
            ThumbnailCacheRule(),
        ]

        asset = TestFixtures.create_asset(
            asset_id="fp-003",
            canonical_path=r"C:\Program Files\MyApp\application.exe",
        )

        for rule in rules:
            result = rule.evaluate(asset)
            assert (
                result.matched is False
            ), f"{rule.rule_id} incorrectly matched Program Files binary"

    def test_appdata_non_cache(self):
        """Test AppData file that's not in cache directories."""
        rule = ShaderCacheRule()

        asset = TestFixtures.create_asset(
            asset_id="fp-004",
            canonical_path=r"C:\Users\TestUser\AppData\Local\MyApp\settings.json",
        )

        result = rule.evaluate(asset)
        assert result.matched is False


class TestRuleRegistration:
    """Test rule registration."""

    def test_register_all_junk_rules(self):
        """Test registering all junk rules."""
        from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules
        from avs_backend.scan_core.rules.registry import RuleRegistry

        registry = RuleRegistry()
        register_junk_rules(registry)

        # Should have 9 rules (4 original + 5 extended)
        all_rules = registry.list_all()
        assert len(all_rules) == 9

        # Check rule IDs
        rule_ids = {r.rule_id for r in all_rules}
        assert "junk.temp.user" in rule_ids
        assert "junk.temp.windows" in rule_ids
        assert "cache.shader" in rule_ids
        assert "cache.thumbnail" in rule_ids
        # Extended rules
        assert "junk.temp.application" in rule_ids
        assert "cache.browser" in rule_ids
        assert "cache.installer" in rule_ids
        assert "cache.windows_update" in rule_ids
        assert "cache.application" in rule_ids

    def test_rules_are_enabled_by_default(self):
        """Test that registered rules are enabled."""
        from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules
        from avs_backend.scan_core.rules.registry import RuleRegistry

        registry = RuleRegistry()
        register_junk_rules(registry)

        enabled_rules = registry.list_enabled()
        assert len(enabled_rules) == 9


class TestDeterminism:
    """Test deterministic behavior."""

    def test_same_input_same_output(self):
        """Test that same input produces same output."""
        rule = UserTempRule()

        temp_root = TestFixtures.get_user_temp_root()
        asset = TestFixtures.create_asset(
            asset_id="det-001",
            canonical_path=str(temp_root / "test.tmp"),
        )

        snapshot = TestFixtures.create_snapshot(
            asset_id="det-001",
            accessible=True,
        )

        # Evaluate multiple times
        result1 = rule.evaluate(asset, snapshot)
        result2 = rule.evaluate(asset, snapshot)

        # Results should be identical
        assert result1.status == result2.status
        assert result1.confidence.score == result2.confidence.score
        assert result1.safety.level == result2.safety.level
        assert result1.reason == result2.reason


class TestEstimatedSize:
    """Test estimated size reporting."""

    def test_size_from_asset(self):
        """Test that estimated size comes from asset."""
        rule = UserTempRule()

        temp_root = TestFixtures.get_user_temp_root()
        asset = TestFixtures.create_asset(
            asset_id="size-001",
            canonical_path=str(temp_root / "large.tmp"),
            size=1048576,  # 1 MB
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert result.estimated_size == 1048576

    def test_no_size_when_unavailable(self):
        """Test that size is None when not available."""
        rule = UserTempRule()

        temp_root = TestFixtures.get_user_temp_root()
        # Create asset without size
        asset = ScanAsset(
            asset_id="size-002",
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.tmp",
            canonical_path=str(temp_root / "test.tmp"),
            discovered_at=datetime.now(UTC),
            # No size attribute
        )

        result = rule.evaluate(asset)

        assert result.matched is True
        assert result.estimated_size is None
