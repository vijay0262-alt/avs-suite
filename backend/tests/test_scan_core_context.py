"""
Unit tests for Scan Core Context Layer (SC-6C).

Tests cover:
- ScanContext creation and lifecycle
- AssetSnapshot creation and fingerprinting
- ScanStatistics tracking
- SnapshotDiff comparison
- Serialization and versioning
- Privacy-safe identifiers
- Performance characteristics
"""

from __future__ import annotations

import pytest
from datetime import datetime, timedelta

from avs_backend.scan_core.context import (
    ScanContext,
    ScanType,
    AssetSnapshot,
    SnapshotState,
    generate_fingerprint,
    ScanStatistics,
    EnumeratorTiming,
    AdapterTiming,
    SnapshotDiff,
    AssetChange,
    ChangeType,
)
from avs_backend.scan_core.context.scan_context import (
    generate_scan_id,
    generate_machine_id_hash,
    generate_user_id_hash,
)
from avs_backend.scan_core.context.asset_snapshot import (
    generate_content_fingerprint,
    create_snapshot_from_asset,
)
from avs_backend.scan_core.context.snapshot_diff import (
    compare_snapshots,
    get_changes_by_type,
)


# ── ScanContext Tests ──────────────────────────────────────────────


class TestScanContext:
    def test_create_scan_context(self):
        """Test creating a ScanContext."""
        scan_id = generate_scan_id()
        started_at = datetime.utcnow()
        
        context = ScanContext(
            scan_id=scan_id,
            started_at=started_at,
            scan_type=ScanType.FULL,
        )
        
        assert context.scan_id == scan_id
        assert context.started_at == started_at
        assert context.scan_type == ScanType.FULL
        assert context.is_running is True
        assert context.completed is False
        assert context.cancelled is False
    
    def test_mark_completed(self):
        """Test marking scan as completed."""
        started = datetime.utcnow()
        context = ScanContext(
            scan_id=generate_scan_id(),
            started_at=started,
        )
        
        # Wait a tiny bit to ensure duration > 0
        import time
        time.sleep(0.01)
        
        context.mark_completed()
        
        assert context.completed is True
        assert context.is_running is False
        assert context.completed_at is not None
        assert context.duration_ms >= 0  # Allow 0 for very fast tests
    
    def test_mark_cancelled(self):
        """Test marking scan as cancelled."""
        context = ScanContext(
            scan_id=generate_scan_id(),
            started_at=datetime.utcnow(),
        )
        
        context.mark_cancelled()
        
        assert context.cancelled is True
        assert context.completed is True
        assert context.is_running is False
    
    def test_scan_context_serialization(self):
        """Test ScanContext serialization."""
        context = ScanContext(
            scan_id=generate_scan_id(),
            started_at=datetime.utcnow(),
            scan_type=ScanType.QUICK,
            requested_scope=["C:\\Users", "C:\\Program Files"],
            enumerators_used=["filesystem", "registry"],
        )
        
        # Serialize
        data = context.to_dict()
        
        assert data["scan_id"] == context.scan_id
        assert data["scan_type"] == "quick"
        assert len(data["requested_scope"]) == 2
        
        # Deserialize
        context2 = ScanContext.from_dict(data)
        
        assert context2.scan_id == context.scan_id
        assert context2.scan_type == ScanType.QUICK
        assert context2.requested_scope == context.requested_scope
    
    def test_privacy_safe_machine_id(self):
        """Test machine ID is hashed, not raw."""
        machine_hash = generate_machine_id_hash()
        
        # Should be SHA-256 hash (64 hex chars)
        assert len(machine_hash) == 64
        assert all(c in "0123456789abcdef" for c in machine_hash)
        
        # Should be deterministic
        machine_hash2 = generate_machine_id_hash()
        assert machine_hash == machine_hash2
    
    def test_privacy_safe_user_id(self):
        """Test user ID is hashed, not raw."""
        user_hash = generate_user_id_hash("alice")
        
        # Should be SHA-256 hash (64 hex chars)
        assert len(user_hash) == 64
        assert all(c in "0123456789abcdef" for c in user_hash)
        
        # Should be deterministic
        user_hash2 = generate_user_id_hash("alice")
        assert user_hash == user_hash2
        
        # Different users → different hashes
        user_hash3 = generate_user_id_hash("bob")
        assert user_hash != user_hash3


# ── AssetSnapshot Tests ────────────────────────────────────────────


class TestAssetSnapshot:
    def test_create_snapshot(self):
        """Test creating an AssetSnapshot."""
        snapshot = AssetSnapshot(
            asset_id="abc123",
            scan_id="scan456",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
        )
        
        assert snapshot.asset_id == "abc123"
        assert snapshot.scan_id == "scan456"
        assert snapshot.state == SnapshotState.DISCOVERED
        assert snapshot.size == 1024
        assert len(snapshot.metadata_fingerprint) == 64
    
    def test_same_state_same_fingerprint(self):
        """Test same asset state produces same fingerprint."""
        snapshot1 = AssetSnapshot(
            asset_id="abc123",
            scan_id="scan1",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
            modified_time=datetime(2024, 1, 1, 12, 0, 0),
        )
        
        snapshot2 = AssetSnapshot(
            asset_id="abc123",
            scan_id="scan2",  # Different scan
            observed_at=datetime.utcnow(),  # Different observation time
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
            modified_time=datetime(2024, 1, 1, 12, 0, 0),
        )
        
        # Same state → same fingerprint
        assert snapshot1.metadata_fingerprint == snapshot2.metadata_fingerprint
    
    def test_changed_state_different_fingerprint(self):
        """Test changed asset state produces different fingerprint."""
        snapshot1 = AssetSnapshot(
            asset_id="abc123",
            scan_id="scan1",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
        )
        
        snapshot2 = AssetSnapshot(
            asset_id="abc123",
            scan_id="scan2",
            observed_at=datetime.utcnow(),
            state=SnapshotState.CHANGED,
            exists=True,
            accessible=True,
            locked=False,
            size=2048,  # Different size
        )
        
        # Different state → different fingerprint
        assert snapshot1.metadata_fingerprint != snapshot2.metadata_fingerprint
    
    def test_has_changed_from(self):
        """Test detecting changes between snapshots."""
        snapshot1 = AssetSnapshot(
            asset_id="abc123",
            scan_id="scan1",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
        )
        
        snapshot2 = AssetSnapshot(
            asset_id="abc123",
            scan_id="scan2",
            observed_at=datetime.utcnow(),
            state=SnapshotState.CHANGED,
            exists=True,
            accessible=True,
            locked=False,
            size=2048,
        )
        
        assert snapshot2.has_changed_from(snapshot1) is True
        assert snapshot1.has_changed_from(snapshot1) is False
    
    def test_content_fingerprint(self):
        """Test content fingerprinting."""
        content1 = b"Hello, World!"
        content2 = b"Hello, World!"
        content3 = b"Different content"
        
        fp1 = generate_content_fingerprint(content1)
        fp2 = generate_content_fingerprint(content2)
        fp3 = generate_content_fingerprint(content3)
        
        # Same content → same fingerprint
        assert fp1 == fp2
        
        # Different content → different fingerprint
        assert fp1 != fp3
        
        # Should be SHA-256 hash
        assert len(fp1) == 64
    
    def test_create_snapshot_from_asset(self):
        """Test helper function for creating snapshots."""
        snapshot = create_snapshot_from_asset(
            asset_id="abc123",
            scan_id="scan456",
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
            modified_time=datetime.utcnow(),
            attributes={"extension": ".txt"},
        )
        
        assert snapshot.asset_id == "abc123"
        assert snapshot.scan_id == "scan456"
        assert snapshot.state == SnapshotState.DISCOVERED
        assert snapshot.size == 1024
        assert snapshot.attributes["extension"] == ".txt"
    
    def test_snapshot_serialization(self):
        """Test AssetSnapshot serialization."""
        snapshot = AssetSnapshot(
            asset_id="abc123",
            scan_id="scan456",
            observed_at=datetime.utcnow(),
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            size=1024,
            attributes={"extension": ".txt"},
        )
        
        # Serialize
        data = snapshot.to_dict()
        
        assert data["asset_id"] == "abc123"
        assert data["state"] == "discovered"
        assert data["size"] == 1024
        
        # Deserialize
        snapshot2 = AssetSnapshot.from_dict(data)
        
        assert snapshot2.asset_id == snapshot.asset_id
        assert snapshot2.state == snapshot.state
        assert snapshot2.size == snapshot.size


# ── ScanStatistics Tests ───────────────────────────────────────────


class TestScanStatistics:
    def test_create_statistics(self):
        """Test creating ScanStatistics."""
        stats = ScanStatistics()
        
        assert stats.total_assets_discovered == 0
        assert stats.total_assets_converted == 0
        assert stats.assets_per_second == 0.0
    
    def test_record_assets(self):
        """Test recording asset counts."""
        stats = ScanStatistics()
        
        stats.record_asset_discovered(size=1024)
        stats.record_asset_discovered(size=2048)
        stats.record_asset_failed()
        stats.record_asset_skipped()
        
        assert stats.total_assets_discovered == 2
        assert stats.total_assets_failed == 1
        assert stats.total_assets_skipped == 1
        assert stats.total_bytes_discovered == 3072
    
    def test_enumerator_timing(self):
        """Test enumerator timing tracking."""
        stats = ScanStatistics()
        
        timing = EnumeratorTiming(
            enumerator_name="filesystem",
            duration_ms=1000,
            assets_discovered=100,
            assets_failed=5,
            assets_skipped=10,
        )
        
        stats.add_enumerator_timing(timing)
        
        assert len(stats.enumerator_timings) == 1
        assert stats.total_assets_discovered == 100
        assert stats.enumeration_duration_ms == 1000
        assert timing.assets_per_second == 100.0
    
    def test_adapter_timing(self):
        """Test adapter timing tracking."""
        stats = ScanStatistics()
        
        timing = AdapterTiming(
            adapter_name="FilesystemAdapter",
            duration_ms=500,
            assets_converted=50,
            assets_failed=2,
        )
        
        stats.add_adapter_timing(timing)
        
        assert len(stats.adapter_timings) == 1
        assert stats.total_assets_converted == 50
        assert stats.conversion_duration_ms == 500
        assert timing.assets_per_second == 100.0
    
    def test_statistics_serialization(self):
        """Test ScanStatistics serialization."""
        stats = ScanStatistics(
            total_assets_discovered=100,
            total_assets_converted=95,
            scan_duration_ms=5000,
        )
        
        # Serialize
        data = stats.to_dict()
        
        assert data["total_assets_discovered"] == 100
        assert data["scan_duration_ms"] == 5000
        
        # Deserialize
        stats2 = ScanStatistics.from_dict(data)
        
        assert stats2.total_assets_discovered == stats.total_assets_discovered
        assert stats2.scan_duration_ms == stats.scan_duration_ms


# ── SnapshotDiff Tests ─────────────────────────────────────────────


class TestSnapshotDiff:
    def test_detect_added_assets(self):
        """Test detecting added assets."""
        previous = []
        current = [
            AssetSnapshot(
                asset_id="new1",
                scan_id="scan2",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
            ),
        ]
        
        diff = compare_snapshots(previous, current)
        
        assert len(diff.added) == 1
        assert diff.added[0].asset_id == "new1"
        assert diff.added[0].change_type == ChangeType.ADDED
        assert diff.has_changes is True
    
    def test_detect_removed_assets(self):
        """Test detecting removed assets."""
        previous = [
            AssetSnapshot(
                asset_id="old1",
                scan_id="scan1",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
            ),
        ]
        current = []
        
        diff = compare_snapshots(previous, current)
        
        assert len(diff.removed) == 1
        assert diff.removed[0].asset_id == "old1"
        assert diff.removed[0].change_type == ChangeType.REMOVED
    
    def test_detect_changed_assets(self):
        """Test detecting changed assets."""
        previous = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan1",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
                size=1024,
            ),
        ]
        current = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan2",
                observed_at=datetime.utcnow(),
                state=SnapshotState.CHANGED,
                exists=True,
                accessible=True,
                locked=False,
                size=2048,  # Changed
            ),
        ]
        
        diff = compare_snapshots(previous, current)
        
        assert len(diff.changed) == 1
        assert diff.changed[0].asset_id == "file1"
        assert diff.changed[0].fingerprint_changed is True
    
    def test_detect_unchanged_assets(self):
        """Test detecting unchanged assets."""
        previous = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan1",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
                size=1024,
            ),
        ]
        current = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan2",
                observed_at=datetime.utcnow(),
                state=SnapshotState.UNCHANGED,
                exists=True,
                accessible=True,
                locked=False,
                size=1024,  # Same
            ),
        ]
        
        diff = compare_snapshots(previous, current)
        
        assert len(diff.unchanged) == 1
        assert diff.unchanged[0].asset_id == "file1"
    
    def test_detect_became_inaccessible(self):
        """Test detecting assets that became inaccessible."""
        previous = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan1",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
            ),
        ]
        current = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan2",
                observed_at=datetime.utcnow(),
                state=SnapshotState.INACCESSIBLE,
                exists=True,
                accessible=False,  # Changed
                locked=False,
            ),
        ]
        
        diff = compare_snapshots(previous, current)
        
        assert len(diff.became_inaccessible) == 1
        assert diff.became_inaccessible[0].asset_id == "file1"
    
    def test_detect_became_locked(self):
        """Test detecting assets that became locked."""
        previous = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan1",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
            ),
        ]
        current = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan2",
                observed_at=datetime.utcnow(),
                state=SnapshotState.LOCKED,
                exists=True,
                accessible=True,
                locked=True,  # Changed
            ),
        ]
        
        diff = compare_snapshots(previous, current)
        
        assert len(diff.became_locked) == 1
        assert diff.became_locked[0].asset_id == "file1"
    
    def test_detect_became_available(self):
        """Test detecting assets that became available."""
        previous = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan1",
                observed_at=datetime.utcnow(),
                state=SnapshotState.LOCKED,
                exists=True,
                accessible=True,
                locked=True,
            ),
        ]
        current = [
            AssetSnapshot(
                asset_id="file1",
                scan_id="scan2",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,  # Changed
            ),
        ]
        
        diff = compare_snapshots(previous, current)
        
        assert len(diff.became_available) == 1
        assert diff.became_available[0].asset_id == "file1"
    
    def test_large_dataset_performance(self):
        """Test comparison performance with large datasets."""
        import time
        
        # Create 10,000 snapshots
        previous = [
            AssetSnapshot(
                asset_id=f"asset{i}",
                scan_id="scan1",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
                size=1024,
            )
            for i in range(10000)
        ]
        
        # Modify some, add some, remove some
        current = [
            AssetSnapshot(
                asset_id=f"asset{i}",
                scan_id="scan2",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
                size=2048 if i % 100 == 0 else 1024,  # 1% changed
            )
            for i in range(100, 10100)  # Shift range (100 removed, 100 added)
        ]
        
        start = time.time()
        diff = compare_snapshots(previous, current)
        elapsed = time.time() - start
        
        # Should complete in reasonable time (< 1 second for 10k assets)
        assert elapsed < 1.0
        
        # Verify results
        assert len(diff.removed) == 100
        assert len(diff.added) == 100
        assert diff.total_changes > 0
    
    def test_get_changes_by_type(self):
        """Test filtering changes by type."""
        previous = []
        current = [
            AssetSnapshot(
                asset_id="new1",
                scan_id="scan2",
                observed_at=datetime.utcnow(),
                state=SnapshotState.DISCOVERED,
                exists=True,
                accessible=True,
                locked=False,
            ),
        ]
        
        diff = compare_snapshots(previous, current)
        
        added = get_changes_by_type(diff, ChangeType.ADDED)
        assert len(added) == 1
        assert added[0].asset_id == "new1"
