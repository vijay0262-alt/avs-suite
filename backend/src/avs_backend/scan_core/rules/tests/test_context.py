"""
SC-8B Rule Evaluation Context Tests
"""

import pytest
from datetime import datetime, UTC

from avs_backend.scan_core.rules.context import RuleEvaluationContext
from avs_backend.scan_core.assets import ScanAsset, AssetType, AssetCategory, AssetSource
from avs_backend.scan_core.context import AssetSnapshot, SnapshotState


class TestRuleEvaluationContext:
    """Test RuleEvaluationContext."""
    
    def create_asset(self) -> ScanAsset:
        """Helper to create test asset."""
        return ScanAsset(
            asset_id="test-asset",
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="Test Asset",
            canonical_path="/test/path",
            discovered_at=datetime.now(UTC),
        )
    
    def create_snapshot(self, asset: ScanAsset) -> AssetSnapshot:
        """Helper to create test snapshot."""
        return AssetSnapshot(
            asset_id=asset.asset_id,
            scan_id="test-scan",
            state=SnapshotState.DISCOVERED,
            exists=True,
            accessible=True,
            locked=False,
            observed_at=datetime.now(UTC),
        )
    
    def test_minimal_context(self):
        """Test creating minimal context with only asset."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        assert context.get_asset() == asset
        assert context.get_snapshot() is None
        assert context.get_scan_context() is None
    
    def test_context_with_snapshot(self):
        """Test creating context with snapshot."""
        asset = self.create_asset()
        snapshot = self.create_snapshot(asset)
        
        context = RuleEvaluationContext.create(
            asset=asset,
            snapshot=snapshot,
        )
        
        assert context.get_asset() == asset
        assert context.get_snapshot() == snapshot
    
    def test_context_immutability(self):
        """Test context is immutable."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            context.asset = self.create_asset()
    
    def test_get_previous_snapshot_no_repository(self):
        """Test get_previous_snapshot returns None without repository."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        assert context.get_previous_snapshot() is None
    
    def test_get_asset_history_no_repository(self):
        """Test get_asset_history returns empty list without repository."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        assert context.get_asset_history() == []
    
    def test_get_related_assets_no_repository(self):
        """Test get_related_assets returns empty list without repository."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        assert context.get_related_assets() == []
    
    def test_find_assets_by_tag_no_repository(self):
        """Test find_assets_by_tag returns empty list without repository."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        assert context.find_assets_by_tag("test") == []
    
    def test_find_assets_by_type_no_repository(self):
        """Test find_assets_by_type returns empty list without repository."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        assert context.find_assets_by_type("file") == []
    
    def test_get_latest_snapshot_no_repository(self):
        """Test get_latest_snapshot returns None without repository."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        assert context.get_latest_snapshot("test-asset") is None
    
    def test_context_create_factory(self):
        """Test context creation with factory method."""
        asset = self.create_asset()
        snapshot = self.create_snapshot(asset)
        
        context = RuleEvaluationContext.create(
            asset=asset,
            snapshot=snapshot,
            scan_context=None,
            asset_repository=None,
            snapshot_repository=None,
        )
        
        assert context.get_asset() == asset
        assert context.get_snapshot() == snapshot
        assert context.get_scan_context() is None
    
    def test_context_read_only_asset(self):
        """Test context provides read-only access to asset."""
        asset = self.create_asset()
        context = RuleEvaluationContext.create_minimal(asset)
        
        retrieved_asset = context.get_asset()
        
        # Asset is returned but context is frozen
        assert retrieved_asset == asset
        
        # Context itself cannot be modified
        with pytest.raises(Exception):
            context.asset = self.create_asset()
