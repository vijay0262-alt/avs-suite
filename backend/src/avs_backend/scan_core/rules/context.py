"""
SC-8B Rule Evaluation Context

Read-only context for rule evaluation.

Provides rules with access to:
- ScanAsset
- AssetSnapshot
- ScanContext
- Previous snapshots
- Related assets
- Metadata Cache queries

ENFORCES READ-ONLY ACCESS.
NO SYSTEM MODIFICATION.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..assets import ScanAsset, AssetType
    from ..context import AssetSnapshot, ScanContext
    from ..metadata import AssetRepository, SnapshotRepository


@dataclass(frozen=True)
class RuleEvaluationContext:
    """
    Read-only context for rule evaluation.
    
    Provides rules with structured access to scan data without
    exposing system modification capabilities.
    
    All data access is READ-ONLY.
    """
    
    # Primary asset being evaluated
    asset: ScanAsset
    
    # Current snapshot (if available)
    snapshot: Optional[AssetSnapshot]
    
    # Scan context (if available)
    scan_context: Optional[ScanContext]
    
    # Repositories for additional queries (read-only)
    asset_repository: Optional[AssetRepository] = None
    snapshot_repository: Optional[SnapshotRepository] = None
    
    def get_asset(self) -> ScanAsset:
        """
        Get the asset being evaluated.
        
        Returns:
            ScanAsset (read-only)
        """
        return self.asset
    
    def get_snapshot(self) -> Optional[AssetSnapshot]:
        """
        Get current snapshot.
        
        Returns:
            AssetSnapshot if available, None otherwise
        """
        return self.snapshot
    
    def get_scan_context(self) -> Optional[ScanContext]:
        """
        Get scan context.
        
        Returns:
            ScanContext if available, None otherwise
        """
        return self.scan_context
    
    def get_previous_snapshot(self) -> Optional[AssetSnapshot]:
        """
        Get previous snapshot for this asset.
        
        Returns:
            Previous AssetSnapshot if available, None otherwise
        """
        if not self.snapshot_repository:
            return None
        
        # Query for previous snapshot
        # Implementation depends on SnapshotRepository API
        # For now, return None (will be implemented when needed)
        return None
    
    def get_asset_history(self, limit: int = 10) -> list[AssetSnapshot]:
        """
        Get historical snapshots for this asset.
        
        Args:
            limit: Maximum number of snapshots to return
        
        Returns:
            List of historical snapshots (newest first)
        """
        if not self.snapshot_repository:
            return []
        
        # Query for historical snapshots
        # Implementation depends on SnapshotRepository API
        # For now, return empty list (will be implemented when needed)
        return []
    
    def get_related_assets(self) -> list[ScanAsset]:
        """
        Get assets related to the current asset.
        
        Returns:
            List of related assets based on relationships
        """
        if not self.asset_repository:
            return []
        
        # Query for related assets based on relationships
        # Implementation depends on AssetRepository API
        # For now, return empty list (will be implemented when needed)
        return []
    
    def find_assets_by_tag(self, tag: str) -> list[str]:
        """
        Find asset IDs with a specific tag.
        
        Args:
            tag: Tag to search for
        
        Returns:
            List of asset IDs with tag
        """
        if not self.asset_repository:
            return []
        
        # Use existing repository method
        return self.asset_repository.find_by_tag(tag)
    
    def find_assets_by_type(self, asset_type: AssetType) -> list[str]:
        """
        Find asset IDs of a specific type.
        
        Args:
            asset_type: Asset type to search for
        
        Returns:
            List of asset IDs of type
        """
        if not self.asset_repository:
            return []
        
        # Use existing repository method
        return self.asset_repository.find_by_type(asset_type)
    
    def get_latest_snapshot(self, asset_id: str) -> Optional[AssetSnapshot]:
        """
        Get latest snapshot for a specific asset.
        
        Args:
            asset_id: Asset ID
        
        Returns:
            Latest snapshot if available, None otherwise
        """
        if not self.snapshot_repository:
            return None
        
        # Query for latest snapshot
        # Implementation depends on SnapshotRepository API
        # For now, return None (will be implemented when needed)
        return None
    
    @classmethod
    def create(
        cls,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        scan_context: Optional[ScanContext] = None,
        asset_repository: Optional[AssetRepository] = None,
        snapshot_repository: Optional[SnapshotRepository] = None,
    ) -> RuleEvaluationContext:
        """
        Create evaluation context.
        
        Args:
            asset: Asset to evaluate
            snapshot: Current snapshot (optional)
            scan_context: Scan context (optional)
            asset_repository: Asset repository for queries (optional)
            snapshot_repository: Snapshot repository for queries (optional)
        
        Returns:
            RuleEvaluationContext
        """
        return cls(
            asset=asset,
            snapshot=snapshot,
            scan_context=scan_context,
            asset_repository=asset_repository,
            snapshot_repository=snapshot_repository,
        )
    
    @classmethod
    def create_minimal(cls, asset: ScanAsset) -> RuleEvaluationContext:
        """
        Create minimal context with only asset.
        
        Args:
            asset: Asset to evaluate
        
        Returns:
            RuleEvaluationContext with no additional data
        """
        return cls(
            asset=asset,
            snapshot=None,
            scan_context=None,
            asset_repository=None,
            snapshot_repository=None,
        )
