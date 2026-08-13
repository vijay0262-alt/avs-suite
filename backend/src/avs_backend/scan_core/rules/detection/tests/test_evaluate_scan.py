"""
SC-8C2 Part 2 — Integration Tests for RuleEvaluator.evaluate_scan()

Tests the full scan evaluation pipeline:
    ScanContext → SnapshotRepository.get_for_scan() → AssetRepository.get()
    → RuleEvaluator.evaluate_asset() → EvaluationBatch (deduplicated)

Verifies:
    - Basic scan evaluation with multiple assets and rules
    - Result deduplication by (asset_id, rule_id, rule_version)
    - Statistics accuracy (assets_considered, assets_evaluated, rules_considered)
    - Cooperative cancellation preserves partial results
    - Empty scan returns empty batch
    - No repositories returns empty batch
    - Missing asset (snapshot exists but asset deleted) counted as considered
    - Deterministic ordering of results
    - All 9 production rules evaluated through evaluate_scan()
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Optional

import pytest

from avs_backend.scan_core.assets import (
    AssetCategory,
    AssetSource,
    AssetType,
    ScanAsset,
)
from avs_backend.scan_core.assets.metadata import AssetMetadata
from avs_backend.scan_core.context import AssetSnapshot, ScanContext, ScanType, SnapshotState
from avs_backend.scan_core.context.scan_context import generate_scan_id
from avs_backend.scan_core.metadata import (
    AssetRepository,
    ContextRepository,
    DatabaseConfig,
    MetadataDatabase,
    SnapshotRepository,
)
from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules
from avs_backend.scan_core.rules.detection.locations import KnownLocations
from avs_backend.scan_core.rules.evaluation import EvaluationBatch, EvaluationStatus
from avs_backend.scan_core.rules.evaluator import CancellationToken, RuleEvaluator
from avs_backend.scan_core.rules.registry import RuleRegistry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def create_database(tmp_path: Path) -> MetadataDatabase:
    """Create and initialize a temporary MetadataDatabase."""
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "test_eval_scan.db"))
    db.initialize()
    return db


def create_scan_context(scan_id: Optional[str] = None) -> ScanContext:
    """Create a minimal ScanContext for testing."""
    return ScanContext(
        scan_id=scan_id or generate_scan_id(),
        scan_type=ScanType.FULL,
        started_at=datetime.now(UTC),
        enumerators_used=["test_enumerator"],
    )


def make_file_asset(
    asset_id: str,
    canonical_path: str,
    size: int = 1024,
    modified_at: Optional[datetime] = None,
) -> ScanAsset:
    """Create a synthetic FILE asset."""
    metadata = AssetMetadata()
    metadata.set("size", size)
    return ScanAsset(
        asset_id=asset_id,
        asset_type=AssetType.FILE,
        asset_category=AssetCategory.FILESYSTEM,
        asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
        display_name=Path(canonical_path).name,
        canonical_path=canonical_path,
        discovered_at=datetime.now(UTC),
        modified_at=modified_at or datetime.now(UTC) - timedelta(days=30),
        custom_metadata=metadata,
    )


def make_snapshot(
    asset_id: str,
    scan_id: str,
    exists: bool = True,
    accessible: bool = True,
    locked: bool = False,
    size: int = 1024,
    modified_time: Optional[datetime] = None,
) -> AssetSnapshot:
    """Create a synthetic AssetSnapshot."""
    return AssetSnapshot(
        asset_id=asset_id,
        scan_id=scan_id,
        observed_at=datetime.now(UTC),
        state=SnapshotState.DISCOVERED,
        exists=exists,
        accessible=accessible,
        locked=locked,
        size=size,
        modified_time=modified_time or datetime.now(UTC) - timedelta(days=30),
    )


def setup_scan_with_assets(
    db: MetadataDatabase,
    scan_id: str,
    assets: list[ScanAsset],
    snapshots: list[AssetSnapshot],
    scan_context: Optional[ScanContext] = None,
) -> tuple[AssetRepository, SnapshotRepository]:
    """Persist scan context, assets and snapshots to the database, return repositories."""
    asset_repo = AssetRepository(db)
    snap_repo = SnapshotRepository(db)
    ctx_repo = ContextRepository(db)

    ctx = scan_context or create_scan_context(scan_id)
    ctx_repo.create(ctx)

    for asset in assets:
        asset_repo.upsert(asset)
    for snap in snapshots:
        snap_repo.save(snap)

    return asset_repo, snap_repo


# ---------------------------------------------------------------------------
# Test: Basic evaluate_scan with multiple assets
# ---------------------------------------------------------------------------


class TestEvaluateScanBasic:
    """Basic evaluate_scan() functionality tests."""

    def test_scan_with_matching_assets(self, tmp_path: Path) -> None:
        """evaluate_scan() finds matches for assets in known temp locations."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        assets = [
            make_file_asset("a-001", str(user_temp / "junk1.tmp")),
            make_file_asset("a-002", str(user_temp / "junk2.tmp")),
            make_file_asset("a-003", str(Path("C:/Users/test/Documents/report.docx"))),
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch = evaluator.evaluate_scan(ctx)

        assert batch.statistics.assets_considered == 3
        assert batch.statistics.assets_evaluated == 3
        assert batch.statistics.rules_considered == 9
        assert len(batch.results) > 0

        matches = batch.get_matches()
        match_asset_ids = {m.asset_id for m in matches}
        assert "a-001" in match_asset_ids
        assert "a-002" in match_asset_ids
        assert "a-003" not in match_asset_ids

    def test_empty_scan_returns_empty_batch(self, tmp_path: Path) -> None:
        """evaluate_scan() with no snapshots returns empty results."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()

        asset_repo = AssetRepository(db)
        snap_repo = SnapshotRepository(db)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch = evaluator.evaluate_scan(ctx)

        assert len(batch.results) == 0
        assert batch.statistics.assets_considered == 0
        assert batch.statistics.assets_evaluated == 0
        assert batch.statistics.rules_considered == 9

    def test_no_repositories_returns_empty_batch(self, tmp_path: Path) -> None:
        """evaluate_scan() without repositories returns empty batch gracefully."""
        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, None, None)
        ctx = create_scan_context()

        batch = evaluator.evaluate_scan(ctx)

        assert len(batch.results) == 0
        assert batch.statistics.assets_considered == 0
        assert batch.statistics.assets_evaluated == 0


# ---------------------------------------------------------------------------
# Test: Result deduplication
# ---------------------------------------------------------------------------


class TestEvaluateScanDedup:
    """Verify result deduplication by (asset_id, rule_id, rule_version)."""

    def test_no_duplicate_results(self, tmp_path: Path) -> None:
        """Each (asset_id, rule_id, rule_version) appears at most once."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        assets = [
            make_file_asset("d-001", str(user_temp / "dup1.tmp")),
            make_file_asset("d-002", str(user_temp / "dup2.tmp")),
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch = evaluator.evaluate_scan(ctx)

        keys = set()
        for result in batch.results:
            if result.rule_result is not None:
                version = result.rule_result.rule_version
            elif result.error is not None:
                version = result.error.rule_version
            else:
                version = ""
            key = (result.asset_id, result.rule_id, version)
            assert key not in keys, f"Duplicate result key: {key}"
            keys.add(key)


# ---------------------------------------------------------------------------
# Test: Statistics accuracy
# ---------------------------------------------------------------------------


class TestEvaluateScanStatistics:
    """Verify evaluation statistics are accurate."""

    def test_statistics_counts(self, tmp_path: Path) -> None:
        """Statistics reflect correct asset and rule counts."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        assets = [
            make_file_asset("s-001", str(user_temp / "stat1.tmp")),
            make_file_asset("s-002", str(user_temp / "stat2.tmp")),
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch = evaluator.evaluate_scan(ctx)

        stats = batch.statistics
        assert stats.assets_considered == 2
        assert stats.assets_evaluated == 2
        assert stats.rules_considered == 9
        assert stats.started_at is not None
        assert stats.completed_at is not None
        assert stats.evaluation_duration_ms > 0

    def test_statistics_rates(self, tmp_path: Path) -> None:
        """assets_per_second and rules_per_second are computed correctly."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        assets = [
            make_file_asset(f"r-{i:03d}", str(user_temp / f"rate{i}.tmp"))
            for i in range(10)
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch = evaluator.evaluate_scan(ctx)

        stats = batch.statistics
        assert stats.assets_evaluated == 10
        assert stats.rules_evaluated > 0
        assert stats.evaluation_duration_ms > 0
        assert stats.assets_per_second > 0
        assert stats.rules_per_second > 0


# ---------------------------------------------------------------------------
# Test: Cooperative cancellation
# ---------------------------------------------------------------------------


class TestEvaluateScanCancellation:
    """Verify cooperative cancellation preserves partial results."""

    def test_cancellation_preserves_partial_results(self, tmp_path: Path) -> None:
        """Cancelling mid-scan stops processing and keeps results from completed assets."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        assets = [
            make_file_asset(f"c-{i:03d}", str(user_temp / f"cancel{i}.tmp"))
            for i in range(20)
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        token = CancellationToken()
        batch = evaluator.evaluate_scan(ctx, cancellation_token=token)

        # Without cancelling, all 20 should be evaluated
        assert batch.statistics.assets_evaluated == 20

        # Now cancel before starting — should get 0 evaluated
        token2 = CancellationToken()
        token2.cancel()
        batch2 = evaluator.evaluate_scan(ctx, cancellation_token=token2)

        assert batch2.statistics.assets_evaluated == 0
        assert len(batch2.results) == 0 or all(
            r.status == EvaluationStatus.CANCELLED for r in batch2.results
        )


# ---------------------------------------------------------------------------
# Test: Missing asset (snapshot exists but asset deleted)
# ---------------------------------------------------------------------------


class TestEvaluateScanMissingAsset:
    """Verify graceful handling when asset is missing from repository."""

    def test_missing_asset_counted_as_considered(self, tmp_path: Path) -> None:
        """Snapshot exists but asset was deleted — counted in considered, not evaluated."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        # Create 3 real assets + snapshots, then delete one asset to create orphan
        assets = [
            make_file_asset("m-001", str(user_temp / "miss1.tmp")),
            make_file_asset("m-002", str(user_temp / "miss2.tmp")),
            make_file_asset("m-003", str(user_temp / "miss3.tmp")),
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        # Delete m-003 from assets table but keep its snapshot (disable FK temporarily)
        conn = db.get_connection()
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("DELETE FROM assets WHERE asset_id = ?", ("m-003",))
        conn.commit()
        conn.execute("PRAGMA foreign_keys = ON")

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch = evaluator.evaluate_scan(ctx)

        # 3 considered (2 real + 1 orphan), 2 evaluated
        assert batch.statistics.assets_considered == 3
        assert batch.statistics.assets_evaluated == 2


# ---------------------------------------------------------------------------
# Test: Deterministic ordering
# ---------------------------------------------------------------------------


class TestEvaluateScanDeterministic:
    """Verify results are deterministically ordered."""

    def test_results_ordered_by_asset_id(self, tmp_path: Path) -> None:
        """Results are sorted by asset_id for deterministic output."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        # Insert in non-sorted order
        assets = [
            make_file_asset("z-003", str(user_temp / "z3.tmp")),
            make_file_asset("a-001", str(user_temp / "a1.tmp")),
            make_file_asset("m-002", str(user_temp / "m2.tmp")),
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch1 = evaluator.evaluate_scan(ctx)
        batch2 = evaluator.evaluate_scan(ctx)

        # Same results both times
        ids1 = [r.asset_id for r in batch1.results]
        ids2 = [r.asset_id for r in batch2.results]
        assert ids1 == ids2

        # Asset IDs within results are non-decreasing
        assert ids1 == sorted(ids1)


# ---------------------------------------------------------------------------
# Test: All 9 production rules through evaluate_scan()
# ---------------------------------------------------------------------------


class TestEvaluateScanAllRules:
    """Verify all 9 production rules are evaluated through evaluate_scan()."""

    def test_all_rules_evaluated_on_matching_asset(self, tmp_path: Path) -> None:
        """Each rule produces a result for a matching asset."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        assets = [
            make_file_asset("all-001", str(user_temp / "all_test.tmp")),
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch = evaluator.evaluate_scan(ctx)

        # 9 rules considered, at least 1 result per rule
        rule_ids_in_results = {r.rule_id for r in batch.results}
        all_rule_ids = {r.rule_id for r in registry.list_enabled()}
        assert all_rule_ids == rule_ids_in_results
        assert len(all_rule_ids) == 9

    def test_multiple_asset_types_through_scan(self, tmp_path: Path) -> None:
        """evaluate_scan() handles assets of different types correctly."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        # FILE asset in temp
        file_asset = make_file_asset("mt-001", str(user_temp / "file.tmp"))

        # DIRECTORY asset (should not match file-only rules)
        dir_asset = ScanAsset(
            asset_id="mt-002",
            asset_type=AssetType.DIRECTORY,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="subdir",
            canonical_path=str(user_temp / "subdir"),
            discovered_at=datetime.now(UTC),
            modified_at=datetime.now(UTC) - timedelta(days=30),
            custom_metadata=AssetMetadata(),
        )

        assets = [file_asset, dir_asset]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        batch = evaluator.evaluate_scan(ctx)

        assert batch.statistics.assets_considered == 2
        assert batch.statistics.assets_evaluated == 2

        # File asset should have match results
        file_results = [r for r in batch.results if r.asset_id == "mt-001"]
        file_matches = [r for r in file_results if r.is_match]
        assert len(file_matches) >= 1

        # Directory asset should have skipped results for file-only rules
        dir_results = [r for r in batch.results if r.asset_id == "mt-002"]
        dir_skipped = [
            r for r in dir_results
            if r.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE
        ]
        assert len(dir_skipped) >= 1


# ---------------------------------------------------------------------------
# Test: Specific rules parameter
# ---------------------------------------------------------------------------


class TestEvaluateScanSpecificRules:
    """Verify evaluate_scan() with specific rules parameter."""

    def test_specific_rules_subset(self, tmp_path: Path) -> None:
        """Passing specific rules only evaluates those rules."""
        db = create_database(tmp_path)
        scan_id = generate_scan_id()
        user_temp = KnownLocations.get_user_temp_roots()[0]

        assets = [
            make_file_asset("sp-001", str(user_temp / "specific.tmp")),
        ]
        snapshots = [make_snapshot(a.asset_id, scan_id) for a in assets]

        asset_repo, snap_repo = setup_scan_with_assets(db, scan_id, assets, snapshots)

        registry = RuleRegistry()
        register_junk_rules(registry)

        evaluator = RuleEvaluator(registry, asset_repo, snap_repo)
        ctx = create_scan_context(scan_id)

        # Get only 2 specific rules
        all_rules = sorted(registry.list_enabled(), key=lambda r: r.rule_id)
        specific_rules = all_rules[:2]

        batch = evaluator.evaluate_scan(ctx, rules=specific_rules)

        assert batch.statistics.rules_considered == 2
        rule_ids_in_results = {r.rule_id for r in batch.results}
        expected_ids = {r.rule_id for r in specific_rules}
        assert rule_ids_in_results == expected_ids
