"""
Basic tests for Metadata Cache (SC-7).

Validates core functionality without extensive coverage.
"""

import pytest
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

from avs_backend.scan_core.metadata import (
    MetadataDatabase,
    DatabaseConfig,
    AssetRepository,
    SnapshotRepository,
    ContextRepository,
)
from avs_backend.scan_core.assets import ScanAsset, AssetType, AssetCategory, AssetSource
from avs_backend.scan_core.context import (
    ScanContext,
    ScanType,
    AssetSnapshot,
    SnapshotState,
    generate_scan_id,
)


def create_test_asset(asset_id: str) -> ScanAsset:
    """Helper to create test asset."""
    return ScanAsset(
        asset_id=asset_id,
        asset_type=AssetType.FILE,
        asset_category=AssetCategory.FILESYSTEM,
        asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
        display_name=f"{asset_id}.txt",
        canonical_path=f"C:\\{asset_id}.txt",
    )


@pytest.fixture
def temp_db():
    """Create temporary database."""
    temp_dir = Path(tempfile.mkdtemp())
    db_path = temp_dir / "test.db"
    
    config = DatabaseConfig(db_path=db_path)
    db = MetadataDatabase(config)
    db.initialize()
    
    yield db
    
    db.close()
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_database_initialization(temp_db):
    """Test database initializes successfully."""
    assert temp_db._is_initialized is True


def test_asset_upsert_and_get(temp_db):
    """Test asset storage and retrieval."""
    repo = AssetRepository(temp_db)
    
    asset = create_test_asset("test1")
    asset.add_tag("important")
    
    # Store
    assert repo.upsert(asset) is True
    
    # Retrieve
    retrieved = repo.get("test1")
    assert retrieved is not None
    assert retrieved.asset_id == "test1"
    assert "important" in retrieved.tags


def test_snapshot_save_and_get(temp_db):
    """Test snapshot storage and retrieval."""
    # Create asset and scan first (foreign key constraints)
    asset_repo = AssetRepository(temp_db)
    context_repo = ContextRepository(temp_db)
    
    asset = create_test_asset("asset1")
    asset_repo.upsert(asset)
    
    context = ScanContext(
        scan_id="scan1",
        started_at=datetime.utcnow(),
        scan_type=ScanType.FULL,
    )
    context_repo.create(context)
    
    # Now create snapshot
    snapshot_repo = SnapshotRepository(temp_db)
    snapshot = AssetSnapshot(
        asset_id="asset1",
        scan_id="scan1",
        observed_at=datetime.utcnow(),
        state=SnapshotState.DISCOVERED,
        exists=True,
        accessible=True,
        locked=False,
        size=1024,
    )
    
    # Store
    assert snapshot_repo.save(snapshot) is True
    
    # Retrieve
    retrieved = snapshot_repo.get("asset1", "scan1")
    assert retrieved is not None
    assert retrieved.size == 1024


def test_context_create_and_get(temp_db):
    """Test context storage and retrieval."""
    repo = ContextRepository(temp_db)
    
    scan_id = generate_scan_id()
    context = ScanContext(
        scan_id=scan_id,
        started_at=datetime.utcnow(),
        scan_type=ScanType.FULL,
    )
    
    # Store
    assert repo.create(context) is True
    
    # Retrieve
    retrieved = repo.get(scan_id)
    assert retrieved is not None
    assert retrieved.scan_type == ScanType.FULL


def test_batch_asset_insert(temp_db):
    """Test batch asset insertion."""
    repo = AssetRepository(temp_db)
    
    assets = [create_test_asset(f"batch_{i}") for i in range(100)]
    
    count = repo.upsert_many(assets)
    assert count == 100
    assert repo.count() >= 100


def test_batch_snapshot_insert(temp_db):
    """Test batch snapshot insertion."""
    # Create assets and scan first
    asset_repo = AssetRepository(temp_db)
    context_repo = ContextRepository(temp_db)
    
    # Create assets
    assets = [create_test_asset(f"asset_{i}") for i in range(100)]
    asset_repo.upsert_many(assets)
    
    # Create scan context
    context = ScanContext(
        scan_id="batch_scan",
        started_at=datetime.utcnow(),
        scan_type=ScanType.FULL,
    )
    context_repo.create(context)
    
    # Now create snapshots
    snapshot_repo = SnapshotRepository(temp_db)
    snapshots = [
        AssetSnapshot(
            asset_id=f"asset_{i}",
            scan_id="batch_scan",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
        )
        for i in range(100)
    ]
    
    count = snapshot_repo.save_many(snapshots)
    assert count == 100
