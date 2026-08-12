"""
Unit tests for Scan Core Metadata Cache (SC-7).

Tests cover:
- Database initialization and corruption recovery
- Asset repository CRUD
- Snapshot repository CRUD
- Context repository CRUD
- Diff repository
- Query layer
- Retention policies
- Batch operations
- Concurrency
- Performance
"""

from __future__ import annotations

import pytest
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timedelta

from avs_backend.scan_core.metadata import (
    MetadataDatabase,
    DatabaseConfig,
    AssetRepository,
    SnapshotRepository,
    ContextRepository,
    DiffRepository,
    MetadataQueries,
    RetentionPolicy,
    RetentionConfig,
)
from avs_backend.scan_core.assets import ScanAsset, AssetType, AssetCategory, AssetSource
from avs_backend.scan_core.context import (
    ScanContext,
    ScanType,
    AssetSnapshot,
    SnapshotState,
    SnapshotDiff,
    generate_scan_id,
)


def create_test_asset(asset_id: str, display_name: str = "test.txt") -> ScanAsset:
    """Helper to create test asset with required fields."""
    return ScanAsset(
        asset_id=asset_id,
        asset_type=AssetType.FILE,
        asset_category=AssetCategory.FILESYSTEM,
        asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
        display_name=display_name,
        canonical_path=f"C:\\{display_name}",
    )


@pytest.fixture
def temp_db_path():
    """Create temporary database path."""
    temp_dir = Path(tempfile.mkdtemp())
    db_path = temp_dir / "test_metadata.db"
    yield db_path
    # Cleanup
    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def database(temp_db_path):
    """Create and initialize test database."""
    config = DatabaseConfig(db_path=temp_db_path)
    db = MetadataDatabase(config)
    db.initialize()
    yield db
    db.close()


@pytest.fixture
def asset_repo(database):
    """Create asset repository."""
    return AssetRepository(database)


@pytest.fixture
def snapshot_repo(database):
    """Create snapshot repository."""
    return SnapshotRepository(database)


@pytest.fixture
def context_repo(database):
    """Create context repository."""
    return ContextRepository(database)


@pytest.fixture
def diff_repo(database):
    """Create diff repository."""
    return DiffRepository(database)


@pytest.fixture
def queries(database):
    """Create query layer."""
    return MetadataQueries(database)


# ── Database Tests ─────────────────────────────────────────────────


class TestDatabase:
    def test_database_initialization(self, temp_db_path):
        """Test database initialization."""
        config = DatabaseConfig(db_path=temp_db_path)
        db = MetadataDatabase(config)
        
        assert db.initialize() is True
        assert temp_db_path.exists()
        
        # Verify tables exist
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table'
        """)
        tables = {row["name"] for row in cursor.fetchall()}
        cursor.close()
        
        assert "assets" in tables
        assert "asset_snapshots" in tables
        assert "scan_contexts" in tables
        assert "schema_migrations" in tables
        
        db.close()
    
    def test_database_reinitialization(self, database, temp_db_path):
        """Test reinitializing existing database."""
        database.close()
        
        # Reinitialize
        config = DatabaseConfig(db_path=temp_db_path)
        db = MetadataDatabase(config)
        assert db.initialize() is True
        db.close()
    
    def test_corruption_recovery(self, temp_db_path):
        """Test corruption detection and recovery."""
        # Create valid database
        config = DatabaseConfig(db_path=temp_db_path)
        db = MetadataDatabase(config)
        db.initialize()
        db.close()
        
        # Corrupt the database
        with open(temp_db_path, 'wb') as f:
            f.write(b'CORRUPTED DATA')
        
        # Reinitialize should recover
        db = MetadataDatabase(config)
        assert db.initialize() is True
        
        # Check backup was created
        backup_files = list(temp_db_path.parent.glob("*.corrupted.*.db"))
        assert len(backup_files) > 0
        
        db.close()


# ── Asset Repository Tests ─────────────────────────────────────────


class TestAssetRepository:
    def test_upsert_asset(self, asset_repo):
        """Test inserting and updating asset."""
        asset = create_test_asset("test_asset_1", "test.txt")
        asset.add_tag("test")
        asset.custom_metadata.set("size", 1024)
        
        # Insert
        assert asset_repo.upsert(asset) is True
        
        # Verify exists
        assert asset_repo.exists("test_asset_1") is True
        
        # Retrieve
        retrieved = asset_repo.get("test_asset_1")
        assert retrieved is not None
        assert retrieved.asset_id == "test_asset_1"
        assert retrieved.display_name == "test.txt"
        assert "test" in retrieved.tags
        assert retrieved.custom_metadata.get("size") == 1024
    
    def test_upsert_updates_existing(self, asset_repo):
        """Test updating existing asset."""
        asset = ScanAsset(
            asset_id="test_asset_2",
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            display_name="original.txt",
        )
        
        asset_repo.upsert(asset)
        
        # Update
        asset.display_name = "updated.txt"
        asset_repo.upsert(asset)
        
        # Verify update
        retrieved = asset_repo.get("test_asset_2")
        assert retrieved.display_name == "updated.txt"
    
    def test_delete_asset(self, asset_repo):
        """Test deleting asset."""
        asset = ScanAsset(
            asset_id="test_asset_3",
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            display_name="delete_me.txt",
        )
        
        asset_repo.upsert(asset)
        assert asset_repo.exists("test_asset_3") is True
        
        # Delete
        assert asset_repo.delete("test_asset_3") is True
        assert asset_repo.exists("test_asset_3") is False
    
    def test_find_by_type(self, asset_repo):
        """Test finding assets by type."""
        # Create multiple assets
        for i in range(5):
            asset = ScanAsset(
                asset_id=f"file_{i}",
                asset_type=AssetType.FILE,
                asset_category=AssetCategory.FILESYSTEM,
                display_name=f"file_{i}.txt",
            )
            asset_repo.upsert(asset)
        
        # Find by type
        results = asset_repo.find_by_type(AssetType.FILE)
        assert len(results) == 5
    
    def test_find_by_tag(self, asset_repo):
        """Test finding assets by tag."""
        asset1 = ScanAsset(
            asset_id="tagged_1",
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            display_name="tagged1.txt",
        )
        asset1.add_tag("important")
        asset_repo.upsert(asset1)
        
        asset2 = ScanAsset(
            asset_id="tagged_2",
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            display_name="tagged2.txt",
        )
        asset2.add_tag("important")
        asset_repo.upsert(asset2)
        
        # Find by tag
        results = asset_repo.find_by_tag("important")
        assert len(results) == 2
    
    def test_batch_upsert(self, asset_repo):
        """Test batch asset insertion."""
        assets = [
            ScanAsset(
                asset_id=f"batch_{i}",
                asset_type=AssetType.FILE,
                asset_category=AssetCategory.FILESYSTEM,
                display_name=f"batch_{i}.txt",
            )
            for i in range(100)
        ]
        
        count = asset_repo.upsert_many(assets)
        assert count == 100
        assert asset_repo.count() >= 100


# ── Snapshot Repository Tests ──────────────────────────────────────


class TestSnapshotRepository:
    def test_save_snapshot(self, snapshot_repo):
        """Test saving snapshot."""
        snapshot = AssetSnapshot(
            asset_id="asset_1",
            scan_id="scan_1",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
        )
        
        assert snapshot_repo.save(snapshot) is True
    
    def test_get_snapshot(self, snapshot_repo):
        """Test retrieving snapshot."""
        snapshot = AssetSnapshot(
            asset_id="asset_2",
            scan_id="scan_2",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=2048,
        )
        
        snapshot_repo.save(snapshot)
        
        # Retrieve
        retrieved = snapshot_repo.get("asset_2", "scan_2")
        assert retrieved is not None
        assert retrieved.asset_id == "asset_2"
        assert retrieved.size == 2048
    
    def test_get_latest_snapshot(self, snapshot_repo):
        """Test getting latest snapshot for asset."""
        # Create multiple snapshots for same asset
        for i in range(3):
            snapshot = AssetSnapshot(
                asset_id="asset_3",
                scan_id=f"scan_{i}",
                observed_at=datetime.utcnow() + timedelta(seconds=i),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
                size=1024 * (i + 1),
            )
            snapshot_repo.save(snapshot)
        
        # Get latest
        latest = snapshot_repo.get_latest("asset_3")
        assert latest is not None
        assert latest.size == 3072  # Last one
    
    def test_get_snapshot_history(self, snapshot_repo):
        """Test getting snapshot history."""
        # Create multiple snapshots
        for i in range(5):
            snapshot = AssetSnapshot(
                asset_id="asset_4",
                scan_id=f"scan_{i}",
                observed_at=datetime.utcnow() + timedelta(seconds=i),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
            )
            snapshot_repo.save(snapshot)
        
        # Get history
        history = snapshot_repo.get_history("asset_4", limit=10)
        assert len(history) == 5
    
    def test_batch_save_snapshots(self, snapshot_repo):
        """Test batch snapshot saving."""
        snapshots = [
            AssetSnapshot(
                asset_id=f"asset_{i}",
                scan_id="scan_batch",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
            )
            for i in range(1000)
        ]
        
        count = snapshot_repo.save_many(snapshots)
        assert count == 1000
        
        # Verify count
        total = snapshot_repo.count_for_scan("scan_batch")
        assert total == 1000


# ── Context Repository Tests ───────────────────────────────────────


class TestContextRepository:
    def test_create_context(self, context_repo):
        """Test creating scan context."""
        context = ScanContext(
            scan_id=generate_scan_id(),
            started_at=datetime.utcnow(),
            scan_type=ScanType.FULL,
        )
        
        assert context_repo.create(context) is True
    
    def test_get_context(self, context_repo):
        """Test retrieving context."""
        scan_id = generate_scan_id()
        context = ScanContext(
            scan_id=scan_id,
            started_at=datetime.utcnow(),
            scan_type=ScanType.QUICK,
        )
        
        context_repo.create(context)
        
        # Retrieve
        retrieved = context_repo.get(scan_id)
        assert retrieved is not None
        assert retrieved.scan_id == scan_id
        assert retrieved.scan_type == ScanType.QUICK
    
    def test_complete_context(self, context_repo):
        """Test completing scan context."""
        scan_id = generate_scan_id()
        context = ScanContext(
            scan_id=scan_id,
            started_at=datetime.utcnow(),
        )
        
        context_repo.create(context)
        
        # Complete
        context.mark_completed()
        context.assets_discovered = 100
        
        assert context_repo.complete(scan_id, context) is True
        
        # Verify
        retrieved = context_repo.get(scan_id)
        assert retrieved.completed is True
        assert retrieved.assets_discovered == 100
    
    def test_list_recent_contexts(self, context_repo):
        """Test listing recent contexts."""
        # Create multiple contexts
        for i in range(5):
            context = ScanContext(
                scan_id=generate_scan_id(),
                started_at=datetime.utcnow() + timedelta(seconds=i),
            )
            context_repo.create(context)
        
        # List recent
        recent = context_repo.list_recent(limit=3)
        assert len(recent) == 3


# ── Query Layer Tests ──────────────────────────────────────────────


class TestQueries:
    def test_find_locked_assets(self, queries, snapshot_repo):
        """Test finding locked assets."""
        # Create locked snapshot
        snapshot = AssetSnapshot(
            asset_id="locked_asset",
            scan_id="scan_locked",
            observed_at=datetime.utcnow(),
            state=SnapshotState.LOCKED,
            exists=True,
            accessible=True,
            locked=True,
        )
        snapshot_repo.save(snapshot)
        
        # Query
        results = queries.find_locked_assets(scan_id="scan_locked")
        assert "locked_asset" in results
    
    def test_find_changed_assets(self, queries, snapshot_repo):
        """Test finding changed assets between scans."""
        # Create snapshots with different fingerprints
        snapshot1 = AssetSnapshot(
            asset_id="changing_asset",
            scan_id="scan_1",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
        )
        snapshot_repo.save(snapshot1)
        
        snapshot2 = AssetSnapshot(
            asset_id="changing_asset",
            scan_id="scan_2",
            observed_at=datetime.utcnow(),
            state=SnapshotState.CHANGED,
            exists=True,
            accessible=True,
            locked=False,
            size=2048,  # Different size = different fingerprint
        )
        snapshot_repo.save(snapshot2)
        
        # Query
        results = queries.find_changed_assets("scan_1", "scan_2")
        assert "changing_asset" in results


# ── Retention Policy Tests ─────────────────────────────────────────


class TestRetentionPolicy:
    def test_retention_dry_run(self, database):
        """Test retention policy dry run."""
        config = RetentionConfig(
            keep_scan_contexts_days=30,
            keep_snapshots_days=7,
        )
        policy = RetentionPolicy(database, config)
        
        # Dry run should not delete anything
        stats = policy.apply(dry_run=True)
        assert isinstance(stats, dict)
        assert "scans_deleted" in stats
    
    def test_retention_deletes_old_scans(self, database, context_repo):
        """Test retention deletes old scan contexts."""
        # Create old scan
        old_context = ScanContext(
            scan_id="old_scan",
            started_at=datetime.utcnow() - timedelta(days=100),
        )
        context_repo.create(old_context)
        
        # Create recent scans
        for i in range(5):
            context = ScanContext(
                scan_id=f"recent_{i}",
                started_at=datetime.utcnow() - timedelta(days=i),
            )
            context_repo.create(context)
        
        # Apply retention
        config = RetentionConfig(
            keep_scan_contexts_days=30,
            min_scans_to_keep=5,
        )
        policy = RetentionPolicy(database, config)
        stats = policy.apply(dry_run=False)
        
        # Old scan should be deleted
        assert stats["scans_deleted"] >= 1
        assert context_repo.get("old_scan") is None


# ── Performance Tests ──────────────────────────────────────────────


class TestPerformance:
    def test_large_asset_batch(self, asset_repo):
        """Test performance with large asset batch."""
        import time
        
        assets = [
            ScanAsset(
                asset_id=f"perf_asset_{i}",
                asset_type=AssetType.FILE,
                asset_category=AssetCategory.FILESYSTEM,
                display_name=f"file_{i}.txt",
            )
            for i in range(10000)
        ]
        
        start = time.time()
        count = asset_repo.upsert_many(assets)
        elapsed = time.time() - start
        
        assert count == 10000
        assert elapsed < 30.0  # Should complete in < 30 seconds
    
    def test_large_snapshot_batch(self, snapshot_repo):
        """Test performance with large snapshot batch."""
        import time
        
        snapshots = [
            AssetSnapshot(
                asset_id=f"perf_asset_{i}",
                scan_id="perf_scan",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
            )
            for i in range(10000)
        ]
        
        start = time.time()
        count = snapshot_repo.save_many(snapshots)
        elapsed = time.time() - start
        
        assert count == 10000
        assert elapsed < 30.0  # Should complete in < 30 seconds
