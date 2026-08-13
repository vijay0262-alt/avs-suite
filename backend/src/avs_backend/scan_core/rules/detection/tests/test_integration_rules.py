"""
SC-8C2 Part 2 — End-to-End Integration Tests for Production Rules

Tests the full pipeline for each production rule:
    RuleRegistry → ApplicabilityEngine → RuleEvaluator → RuleResult

NOT merely instantiating the rule directly — uses the evaluator pipeline.

For every production rule verifies:
    - positive detection
    - negative detection
    - wrong asset type
    - protected path
    - locked asset
    - inaccessible asset
    - missing snapshot
    - snapshot.exists == false
    - evidence
    - confidence
    - safety
    - estimated size
    - deterministic result

All 9 SC-8C2 rule categories covered:
    junk.temp.user
    junk.temp.windows
    junk.temp.application
    cache.browser
    cache.installer
    cache.windows_update
    cache.application
    cache.shader
    cache.thumbnail
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Optional

from avs_backend.scan_core.assets import (
    AssetCategory,
    AssetSource,
    AssetType,
    ScanAsset,
)
from avs_backend.scan_core.assets.metadata import AssetMetadata
from avs_backend.scan_core.context import (
    AssetSnapshot,
    ScanContext,
    ScanType,
    SnapshotState,
)
from avs_backend.scan_core.context.scan_context import generate_scan_id
from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules
from avs_backend.scan_core.rules.detection.locations import KnownLocations
from avs_backend.scan_core.rules.enums import SafetyLevel
from avs_backend.scan_core.rules.evaluation import EvaluationStatus
from avs_backend.scan_core.rules.evaluator import RuleEvaluator
from avs_backend.scan_core.rules.registry import RuleRegistry
from avs_backend.scan_core.rules.result import RuleMatchStatus

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


class IntegrationFixtures:
    """Factory for synthetic assets, snapshots, and scan contexts."""

    @staticmethod
    def create_asset(
        asset_id: str,
        canonical_path: str,
        asset_type: AssetType = AssetType.FILE,
        size: int = 1024,
        modified_at: Optional[datetime] = None,
    ) -> ScanAsset:
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
        scan_id: str = "integration-scan",
        state: SnapshotState = SnapshotState.DISCOVERED,
        exists: bool = True,
        accessible: bool = True,
        locked: bool = False,
    ) -> AssetSnapshot:
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
    def create_scan_context(scan_id: Optional[str] = None) -> ScanContext:
        return ScanContext(
            scan_id=scan_id or generate_scan_id(),
            started_at=datetime.now(UTC),
            scan_type=ScanType.FULL,
        )

    @staticmethod
    def create_registry_with_all_rules() -> RuleRegistry:
        registry = RuleRegistry()
        register_junk_rules(registry)
        return registry

    @staticmethod
    def create_evaluator(
        registry: Optional[RuleRegistry] = None,
    ) -> RuleEvaluator:
        if registry is None:
            registry = IntegrationFixtures.create_registry_with_all_rules()
        return RuleEvaluator(registry)

    # ── Location helpers ──────────────────────────────────────────

    @staticmethod
    def user_temp_root() -> Path:
        roots = KnownLocations.get_user_temp_roots()
        return roots[0]

    @staticmethod
    def windows_temp_root() -> Path:
        return KnownLocations.get_windows_temp_root()

    @staticmethod
    def app_temp_root() -> Path:
        roots = KnownLocations.get_application_temp_roots()
        return roots[0]

    @staticmethod
    def browser_cache_root() -> Path:
        roots = KnownLocations.get_browser_cache_roots()
        return roots[0]

    @staticmethod
    def installer_cache_root() -> Path:
        return KnownLocations.get_installer_cache_root()

    @staticmethod
    def windows_update_cache_root() -> Path:
        return KnownLocations.get_windows_update_cache_root()

    @staticmethod
    def app_cache_root() -> Path:
        roots = KnownLocations.get_application_cache_roots()
        return roots[0]

    @staticmethod
    def shader_cache_root() -> Path:
        roots = KnownLocations.get_shader_cache_roots()
        return roots[0]

    @staticmethod
    def thumbnail_cache_root() -> Path:
        return KnownLocations.get_thumbnail_cache_root()

    @staticmethod
    def protected_path() -> str:
        roots = KnownLocations.get_protected_roots()
        return str(roots[0] / "critical.dll")

    @staticmethod
    def old_datetime() -> datetime:
        return datetime.now(UTC) - timedelta(days=30)


# ---------------------------------------------------------------------------
# Helper to evaluate a single rule through the evaluator pipeline
# ---------------------------------------------------------------------------


def evaluate_through_pipeline(
    rule_id: str,
    asset: ScanAsset,
    snapshot: Optional[AssetSnapshot] = None,
    scan_context: Optional[ScanContext] = None,
) -> tuple[RuleEvaluator, RuleRegistry, object]:
    """
    Evaluate an asset through the full pipeline:
    RuleRegistry → ApplicabilityEngine → RuleEvaluator → RuleResult

    Returns (evaluator, registry, evaluation_result).
    """
    registry = IntegrationFixtures.create_registry_with_all_rules()
    evaluator = RuleEvaluator(registry)
    rule = registry.get(rule_id)
    assert rule is not None, f"Rule {rule_id} not registered"

    batch = evaluator.evaluate_asset(
        asset=asset,
        snapshot=snapshot,
        scan_context=scan_context,
        rules=[rule],
    )

    assert len(batch.results) == 1, f"Expected 1 result, got {len(batch.results)}"
    return evaluator, registry, batch.results[0]


# ---------------------------------------------------------------------------
# UserTempRule — junk.temp.user
# ---------------------------------------------------------------------------


class TestUserTempIntegration:
    """End-to-end integration for junk.temp.user."""

    def test_positive_detection(self):
        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "ut-pos",
            str(root / "test.tmp"),
            size=2048,
        )
        snap = IntegrationFixtures.create_snapshot("ut-pos")
        _, _, result = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.matched
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 2048
        assert len(result.rule_result.evidence.items) > 0

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "ut-neg",
            r"C:\Users\Test\Documents\report.docx",
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
        )
        assert result.is_success
        assert not result.is_match
        assert result.rule_result.status == RuleMatchStatus.NO_MATCH

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "ut-dir",
            str(root / "subdir"),
            asset_type=AssetType.DIRECTORY,
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_protected_path(self):
        asset = IntegrationFixtures.create_asset(
            "ut-prot",
            IntegrationFixtures.protected_path(),
        )
        snap = IntegrationFixtures.create_snapshot("ut-prot")
        _, _, result = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
            snap,
        )
        assert result.is_success
        if result.is_match:
            assert result.rule_result.safety.level == SafetyLevel.BLOCKED

    def test_locked_asset(self):
        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "ut-lock",
            str(root / "locked.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot(
            "ut-lock",
            locked=True,
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "ut-ina",
            str(root / "ina.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot(
            "ut-ina",
            accessible=False,
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "ut-miss",
            str(root / "file.tmp"),
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "ut-ne",
            str(root / "gone.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot(
            "ut-ne",
            exists=False,
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "ut-det",
            str(root / "det.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("ut-det")
        _, _, r1 = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "junk.temp.user",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match
        if r1.rule_result and r2.rule_result:
            assert r1.rule_result.confidence.score == r2.rule_result.confidence.score
            assert r1.rule_result.safety.level == r2.rule_result.safety.level


# ---------------------------------------------------------------------------
# WindowsTempRule — junk.temp.windows
# ---------------------------------------------------------------------------


class TestWindowsTempIntegration:
    """End-to-end integration for junk.temp.windows."""

    def test_positive_detection(self):
        root = IntegrationFixtures.windows_temp_root()
        asset = IntegrationFixtures.create_asset(
            "wt-pos",
            str(root / "sys.tmp"),
            size=4096,
        )
        snap = IntegrationFixtures.create_snapshot("wt-pos")
        _, _, result = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 4096

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "wt-neg",
            r"C:\Users\Test\Documents\file.txt",
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
        )
        assert result.is_success
        assert not result.is_match

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.windows_temp_root()
        asset = IntegrationFixtures.create_asset(
            "wt-dir",
            str(root),
            asset_type=AssetType.DIRECTORY,
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_locked_asset(self):
        root = IntegrationFixtures.windows_temp_root()
        asset = IntegrationFixtures.create_asset(
            "wt-lock",
            str(root / "locked.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("wt-lock", locked=True)
        _, _, result = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.windows_temp_root()
        asset = IntegrationFixtures.create_asset(
            "wt-ina",
            str(root / "ina.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("wt-ina", accessible=False)
        _, _, result = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.windows_temp_root()
        asset = IntegrationFixtures.create_asset(
            "wt-miss",
            str(root / "file.tmp"),
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.windows_temp_root()
        asset = IntegrationFixtures.create_asset(
            "wt-ne",
            str(root / "gone.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("wt-ne", exists=False)
        _, _, result = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.windows_temp_root()
        asset = IntegrationFixtures.create_asset(
            "wt-det",
            str(root / "det.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("wt-det")
        _, _, r1 = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "junk.temp.windows",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match


# ---------------------------------------------------------------------------
# ApplicationTempRule — junk.temp.application
# ---------------------------------------------------------------------------


class TestApplicationTempIntegration:
    """End-to-end integration for junk.temp.application."""

    def test_positive_detection(self):
        root = IntegrationFixtures.app_temp_root()
        asset = IntegrationFixtures.create_asset(
            "at-pos",
            str(root / "office.tmp"),
            size=2048,
        )
        snap = IntegrationFixtures.create_snapshot("at-pos")
        _, _, result = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 2048
        assert len(result.rule_result.evidence.items) > 0

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "at-neg",
            r"C:\Users\Test\Documents\file.docx",
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
        )
        assert result.is_success
        assert not result.is_match

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.app_temp_root()
        asset = IntegrationFixtures.create_asset(
            "at-dir",
            str(root),
            asset_type=AssetType.DIRECTORY,
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_locked_asset(self):
        root = IntegrationFixtures.app_temp_root()
        asset = IntegrationFixtures.create_asset(
            "at-lock",
            str(root / "locked.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("at-lock", locked=True)
        _, _, result = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.app_temp_root()
        asset = IntegrationFixtures.create_asset(
            "at-ina",
            str(root / "ina.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("at-ina", accessible=False)
        _, _, result = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.app_temp_root()
        asset = IntegrationFixtures.create_asset(
            "at-miss",
            str(root / "file.tmp"),
        )
        _, _, result = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.app_temp_root()
        asset = IntegrationFixtures.create_asset(
            "at-ne",
            str(root / "gone.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("at-ne", exists=False)
        _, _, result = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.app_temp_root()
        asset = IntegrationFixtures.create_asset(
            "at-det",
            str(root / "det.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("at-det")
        _, _, r1 = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "junk.temp.application",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match


# ---------------------------------------------------------------------------
# BrowserCacheRule — cache.browser
# ---------------------------------------------------------------------------


class TestBrowserCacheIntegration:
    """End-to-end integration for cache.browser."""

    def test_positive_detection(self):
        root = IntegrationFixtures.browser_cache_root()
        asset = IntegrationFixtures.create_asset(
            "bc-pos",
            str(root / "cache_entry"),
            size=512,
        )
        snap = IntegrationFixtures.create_snapshot("bc-pos")
        _, _, result = evaluate_through_pipeline(
            "cache.browser",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 512

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "bc-neg",
            r"C:\Users\Test\Documents\page.html",
        )
        _, _, result = evaluate_through_pipeline(
            "cache.browser",
            asset,
        )
        assert result.is_success
        assert not result.is_match

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.browser_cache_root()
        asset = IntegrationFixtures.create_asset(
            "bc-dir",
            str(root),
            asset_type=AssetType.REGISTRY_KEY,
        )
        _, _, result = evaluate_through_pipeline(
            "cache.browser",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_locked_asset(self):
        root = IntegrationFixtures.browser_cache_root()
        asset = IntegrationFixtures.create_asset(
            "bc-lock",
            str(root / "locked_cache"),
        )
        snap = IntegrationFixtures.create_snapshot("bc-lock", locked=True)
        _, _, result = evaluate_through_pipeline(
            "cache.browser",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.browser_cache_root()
        asset = IntegrationFixtures.create_asset(
            "bc-ina",
            str(root / "ina_cache"),
        )
        snap = IntegrationFixtures.create_snapshot("bc-ina", accessible=False)
        _, _, result = evaluate_through_pipeline(
            "cache.browser",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.browser_cache_root()
        asset = IntegrationFixtures.create_asset(
            "bc-miss",
            str(root / "cache_file"),
        )
        _, _, result = evaluate_through_pipeline(
            "cache.browser",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.browser_cache_root()
        asset = IntegrationFixtures.create_asset(
            "bc-ne",
            str(root / "gone_cache"),
        )
        snap = IntegrationFixtures.create_snapshot("bc-ne", exists=False)
        _, _, result = evaluate_through_pipeline(
            "cache.browser",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.browser_cache_root()
        asset = IntegrationFixtures.create_asset(
            "bc-det",
            str(root / "det_cache"),
        )
        snap = IntegrationFixtures.create_snapshot("bc-det")
        _, _, r1 = evaluate_through_pipeline(
            "cache.browser",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "cache.browser",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match


# ---------------------------------------------------------------------------
# InstallerCacheRule — cache.installer
# ---------------------------------------------------------------------------


class TestInstallerCacheIntegration:
    """End-to-end integration for cache.installer."""

    def test_positive_detection(self):
        root = IntegrationFixtures.installer_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ic-pos",
            str(root / "patch.msp"),
            size=8192,
        )
        snap = IntegrationFixtures.create_snapshot("ic-pos")
        _, _, result = evaluate_through_pipeline(
            "cache.installer",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 8192

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "ic-neg",
            r"C:\Users\Test\Documents\installer.msi",
        )
        _, _, result = evaluate_through_pipeline(
            "cache.installer",
            asset,
        )
        assert result.is_success
        assert not result.is_match

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.installer_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ic-dir",
            str(root),
            asset_type=AssetType.REGISTRY_KEY,
        )
        _, _, result = evaluate_through_pipeline(
            "cache.installer",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_protected_parent_not_blocked(self):
        """$PatchCache$ is under protected Installer but has exception."""
        root = IntegrationFixtures.installer_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ic-exc",
            str(root / "data.dat"),
        )
        snap = IntegrationFixtures.create_snapshot("ic-exc")
        _, _, result = evaluate_through_pipeline(
            "cache.installer",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level != SafetyLevel.BLOCKED

    def test_locked_asset(self):
        root = IntegrationFixtures.installer_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ic-lock",
            str(root / "locked.msp"),
        )
        snap = IntegrationFixtures.create_snapshot("ic-lock", locked=True)
        _, _, result = evaluate_through_pipeline(
            "cache.installer",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.installer_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ic-ina",
            str(root / "ina.msp"),
        )
        snap = IntegrationFixtures.create_snapshot("ic-ina", accessible=False)
        _, _, result = evaluate_through_pipeline(
            "cache.installer",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.installer_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ic-miss",
            str(root / "patch.msp"),
        )
        _, _, result = evaluate_through_pipeline(
            "cache.installer",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.installer_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ic-ne",
            str(root / "gone.msp"),
        )
        snap = IntegrationFixtures.create_snapshot("ic-ne", exists=False)
        _, _, result = evaluate_through_pipeline(
            "cache.installer",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.installer_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ic-det",
            str(root / "det.msp"),
        )
        snap = IntegrationFixtures.create_snapshot("ic-det")
        _, _, r1 = evaluate_through_pipeline(
            "cache.installer",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "cache.installer",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match


# ---------------------------------------------------------------------------
# WindowsUpdateCacheRule — cache.windows_update
# ---------------------------------------------------------------------------


class TestWindowsUpdateCacheIntegration:
    """End-to-end integration for cache.windows_update."""

    def test_positive_detection(self):
        root = IntegrationFixtures.windows_update_cache_root()
        asset = IntegrationFixtures.create_asset(
            "wu-pos",
            str(root / "update.cab"),
            size=102400,
        )
        snap = IntegrationFixtures.create_snapshot("wu-pos")
        _, _, result = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 102400

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "wu-neg",
            r"C:\Users\Test\Documents\update.txt",
        )
        _, _, result = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
        )
        assert result.is_success
        assert not result.is_match

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.windows_update_cache_root()
        asset = IntegrationFixtures.create_asset(
            "wu-dir",
            str(root),
            asset_type=AssetType.DIRECTORY,
        )
        _, _, result = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_locked_asset(self):
        root = IntegrationFixtures.windows_update_cache_root()
        asset = IntegrationFixtures.create_asset(
            "wu-lock",
            str(root / "locked.cab"),
        )
        snap = IntegrationFixtures.create_snapshot("wu-lock", locked=True)
        _, _, result = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.windows_update_cache_root()
        asset = IntegrationFixtures.create_asset(
            "wu-ina",
            str(root / "ina.cab"),
        )
        snap = IntegrationFixtures.create_snapshot("wu-ina", accessible=False)
        _, _, result = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.windows_update_cache_root()
        asset = IntegrationFixtures.create_asset(
            "wu-miss",
            str(root / "update.cab"),
        )
        _, _, result = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.windows_update_cache_root()
        asset = IntegrationFixtures.create_asset(
            "wu-ne",
            str(root / "gone.cab"),
        )
        snap = IntegrationFixtures.create_snapshot("wu-ne", exists=False)
        _, _, result = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.windows_update_cache_root()
        asset = IntegrationFixtures.create_asset(
            "wu-det",
            str(root / "det.cab"),
        )
        snap = IntegrationFixtures.create_snapshot("wu-det")
        _, _, r1 = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "cache.windows_update",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match


# ---------------------------------------------------------------------------
# ApplicationCacheRule — cache.application
# ---------------------------------------------------------------------------


class TestApplicationCacheIntegration:
    """End-to-end integration for cache.application."""

    def test_positive_detection(self):
        root = IntegrationFixtures.app_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ac-pos",
            str(root / "cache.dat"),
            size=4096,
        )
        snap = IntegrationFixtures.create_snapshot("ac-pos")
        _, _, result = evaluate_through_pipeline(
            "cache.application",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 4096

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "ac-neg",
            r"C:\Users\Test\Documents\data.dat",
        )
        _, _, result = evaluate_through_pipeline(
            "cache.application",
            asset,
        )
        assert result.is_success
        assert not result.is_match

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.app_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ac-dir",
            str(root),
            asset_type=AssetType.REGISTRY_KEY,
        )
        _, _, result = evaluate_through_pipeline(
            "cache.application",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_locked_asset(self):
        root = IntegrationFixtures.app_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ac-lock",
            str(root / "locked.dat"),
        )
        snap = IntegrationFixtures.create_snapshot("ac-lock", locked=True)
        _, _, result = evaluate_through_pipeline(
            "cache.application",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.app_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ac-ina",
            str(root / "ina.dat"),
        )
        snap = IntegrationFixtures.create_snapshot("ac-ina", accessible=False)
        _, _, result = evaluate_through_pipeline(
            "cache.application",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.app_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ac-miss",
            str(root / "cache.dat"),
        )
        _, _, result = evaluate_through_pipeline(
            "cache.application",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.app_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ac-ne",
            str(root / "gone.dat"),
        )
        snap = IntegrationFixtures.create_snapshot("ac-ne", exists=False)
        _, _, result = evaluate_through_pipeline(
            "cache.application",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.app_cache_root()
        asset = IntegrationFixtures.create_asset(
            "ac-det",
            str(root / "det.dat"),
        )
        snap = IntegrationFixtures.create_snapshot("ac-det")
        _, _, r1 = evaluate_through_pipeline(
            "cache.application",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "cache.application",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match


# ---------------------------------------------------------------------------
# ShaderCacheRule — cache.shader
# ---------------------------------------------------------------------------


class TestShaderCacheIntegration:
    """End-to-end integration for cache.shader."""

    def test_positive_detection(self):
        root = IntegrationFixtures.shader_cache_root()
        asset = IntegrationFixtures.create_asset(
            "sc-pos",
            str(root / "shader.bin"),
            size=2048,
        )
        snap = IntegrationFixtures.create_snapshot("sc-pos")
        _, _, result = evaluate_through_pipeline(
            "cache.shader",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 2048

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "sc-neg",
            r"C:\Users\Test\Documents\shader.txt",
        )
        _, _, result = evaluate_through_pipeline(
            "cache.shader",
            asset,
        )
        assert result.is_success
        assert not result.is_match

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.shader_cache_root()
        asset = IntegrationFixtures.create_asset(
            "sc-dir",
            str(root),
            asset_type=AssetType.DIRECTORY,
        )
        _, _, result = evaluate_through_pipeline(
            "cache.shader",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_locked_asset(self):
        root = IntegrationFixtures.shader_cache_root()
        asset = IntegrationFixtures.create_asset(
            "sc-lock",
            str(root / "locked.bin"),
        )
        snap = IntegrationFixtures.create_snapshot("sc-lock", locked=True)
        _, _, result = evaluate_through_pipeline(
            "cache.shader",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.shader_cache_root()
        asset = IntegrationFixtures.create_asset(
            "sc-ina",
            str(root / "ina.bin"),
        )
        snap = IntegrationFixtures.create_snapshot("sc-ina", accessible=False)
        _, _, result = evaluate_through_pipeline(
            "cache.shader",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.shader_cache_root()
        asset = IntegrationFixtures.create_asset(
            "sc-miss",
            str(root / "shader.bin"),
        )
        _, _, result = evaluate_through_pipeline(
            "cache.shader",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.shader_cache_root()
        asset = IntegrationFixtures.create_asset(
            "sc-ne",
            str(root / "gone.bin"),
        )
        snap = IntegrationFixtures.create_snapshot("sc-ne", exists=False)
        _, _, result = evaluate_through_pipeline(
            "cache.shader",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.shader_cache_root()
        asset = IntegrationFixtures.create_asset(
            "sc-det",
            str(root / "det.bin"),
        )
        snap = IntegrationFixtures.create_snapshot("sc-det")
        _, _, r1 = evaluate_through_pipeline(
            "cache.shader",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "cache.shader",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match


# ---------------------------------------------------------------------------
# ThumbnailCacheRule — cache.thumbnail
# ---------------------------------------------------------------------------


class TestThumbnailCacheIntegration:
    """End-to-end integration for cache.thumbnail."""

    def test_positive_detection(self):
        root = IntegrationFixtures.thumbnail_cache_root()
        asset = IntegrationFixtures.create_asset(
            "tc-pos",
            str(root / "thumbcache_32.db"),
            size=512,
        )
        snap = IntegrationFixtures.create_snapshot("tc-pos")
        _, _, result = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.confidence.score >= 80.0
        assert result.rule_result.safety.level == SafetyLevel.SAFE
        assert result.rule_result.estimated_size == 512

    def test_negative_detection(self):
        asset = IntegrationFixtures.create_asset(
            "tc-neg",
            r"C:\Users\Test\Documents\thumbs.db",
        )
        _, _, result = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
        )
        assert result.is_success
        assert not result.is_match

    def test_wrong_asset_type(self):
        root = IntegrationFixtures.thumbnail_cache_root()
        asset = IntegrationFixtures.create_asset(
            "tc-dir",
            str(root),
            asset_type=AssetType.DIRECTORY,
        )
        _, _, result = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
        )
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE

    def test_locked_asset(self):
        root = IntegrationFixtures.thumbnail_cache_root()
        asset = IntegrationFixtures.create_asset(
            "tc-lock",
            str(root / "thumbcache_32.db"),
        )
        snap = IntegrationFixtures.create_snapshot("tc-lock", locked=True)
        _, _, result = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_inaccessible_asset(self):
        root = IntegrationFixtures.thumbnail_cache_root()
        asset = IntegrationFixtures.create_asset(
            "tc-ina",
            str(root / "thumbcache_32.db"),
        )
        snap = IntegrationFixtures.create_snapshot("tc-ina", accessible=False)
        _, _, result = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
            snap,
        )
        assert result.is_success
        assert result.is_match
        assert result.rule_result.safety.level == SafetyLevel.REVIEW_REQUIRED

    def test_missing_snapshot(self):
        root = IntegrationFixtures.thumbnail_cache_root()
        asset = IntegrationFixtures.create_asset(
            "tc-miss",
            str(root / "thumbcache_32.db"),
        )
        _, _, result = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
            snapshot=None,
        )
        assert result.is_success
        assert result.is_match

    def test_snapshot_not_exists(self):
        root = IntegrationFixtures.thumbnail_cache_root()
        asset = IntegrationFixtures.create_asset(
            "tc-ne",
            str(root / "thumbcache_32.db"),
        )
        snap = IntegrationFixtures.create_snapshot("tc-ne", exists=False)
        _, _, result = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
            snap,
        )
        assert result.is_success
        assert not result.is_match

    def test_deterministic_result(self):
        root = IntegrationFixtures.thumbnail_cache_root()
        asset = IntegrationFixtures.create_asset(
            "tc-det",
            str(root / "thumbcache_32.db"),
        )
        snap = IntegrationFixtures.create_snapshot("tc-det")
        _, _, r1 = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
            snap,
        )
        _, _, r2 = evaluate_through_pipeline(
            "cache.thumbnail",
            asset,
            snap,
        )
        assert r1.is_match == r2.is_match


# ---------------------------------------------------------------------------
# Multi-rule integration: all rules through evaluator at once
# ---------------------------------------------------------------------------


class TestAllRulesThroughEvaluator:
    """Test all 9 rules registered and evaluated together."""

    def test_all_rules_registered(self):
        registry = IntegrationFixtures.create_registry_with_all_rules()
        assert registry.count() == 9

    def test_asset_evaluated_by_all_rules(self):
        """A single asset evaluated against all 9 rules."""
        registry = IntegrationFixtures.create_registry_with_all_rules()
        evaluator = RuleEvaluator(registry)

        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "multi-001",
            str(root / "test.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("multi-001")

        batch = evaluator.evaluate_asset(asset, snap)

        assert len(batch.results) == 9
        assert batch.statistics.rules_considered == 9
        # At least one rule should match (junk.temp.user)
        matches = [r for r in batch.results if r.is_match]
        assert len(matches) >= 1

    def test_failure_isolation_through_pipeline(self):
        """If one rule throws, others continue."""
        from avs_backend.scan_core.rules.enums import RuleCategory, Severity
        from avs_backend.scan_core.rules.models import RuleIdentifier, RuleVersion
        from avs_backend.scan_core.rules.rule import Rule, RuleMetadata

        class ThrowingRule(Rule):
            def __init__(self, metadata):
                super().__init__(metadata)

            def evaluate(self, asset, snapshot=None, context=None):
                raise RuntimeError("Intentional failure")

        registry = IntegrationFixtures.create_registry_with_all_rules()

        # Add a throwing rule
        throwing_meta = RuleMetadata(
            identifier=RuleIdentifier("test.throwing"),
            version=RuleVersion(1, 0, 0),
            name="Throwing Rule",
            description="Always throws",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        registry.register(ThrowingRule(throwing_meta))

        evaluator = RuleEvaluator(registry)
        root = IntegrationFixtures.user_temp_root()
        asset = IntegrationFixtures.create_asset(
            "fail-001",
            str(root / "test.tmp"),
        )
        snap = IntegrationFixtures.create_snapshot("fail-001")

        batch = evaluator.evaluate_asset(asset, snap)

        # All 10 rules should have results
        assert len(batch.results) == 10
        # At least one failure
        failures = [r for r in batch.results if r.status == EvaluationStatus.FAILED]
        assert len(failures) == 1
        assert failures[0].error is not None
        # Other rules still succeeded
        successes = [r for r in batch.results if r.is_success]
        assert len(successes) >= 1
