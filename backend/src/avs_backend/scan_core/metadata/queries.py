"""
Metadata Queries — SC-7

Read-only query helpers for metadata cache.

STORAGE ONLY. NO DECISIONS.
"""

from __future__ import annotations

from typing import List, Optional
from datetime import datetime, timedelta

from ..assets import AssetType, AssetCategory
from ..context import SnapshotState
from .database import MetadataDatabase


class MetadataQueries:
    """
    Read-only query layer for metadata cache.
    
    Provides structured queries without exposing raw SQL.
    """
    
    def __init__(self, database: MetadataDatabase):
        """
        Initialize query layer.
        
        Args:
            database: Metadata database instance
        """
        self.db = database
    
    def find_assets_by_category(self, category: AssetCategory, limit: int = 1000) -> List[str]:
        """Find asset IDs by category."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT asset_id FROM assets
                WHERE asset_category = ?
                LIMIT ?
            """, (category.value, limit))
            
            results = [row["asset_id"] for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
    
    def find_assets_by_type(self, asset_type: AssetType, limit: int = 1000) -> List[str]:
        """Find asset IDs by type."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT asset_id FROM assets
                WHERE asset_type = ?
                LIMIT ?
            """, (asset_type.value, limit))
            
            results = [row["asset_id"] for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
    
    def find_assets_by_tag(self, tag: str, limit: int = 1000) -> List[str]:
        """Find asset IDs by tag."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT asset_id FROM asset_tags
                WHERE tag = ?
                LIMIT ?
            """, (tag, limit))
            
            results = [row["asset_id"] for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
    
    def find_locked_assets(self, scan_id: Optional[str] = None, limit: int = 1000) -> List[str]:
        """Find locked assets in latest or specific scan."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            if scan_id:
                cursor.execute("""
                    SELECT asset_id FROM asset_snapshots
                    WHERE scan_id = ? AND snapshot_locked = 1
                    LIMIT ?
                """, (scan_id, limit))
            else:
                # Find in most recent scan
                cursor.execute("""
                    SELECT DISTINCT s.asset_id
                    FROM asset_snapshots s
                    INNER JOIN (
                        SELECT asset_id, MAX(observed_at) as latest
                        FROM asset_snapshots
                        GROUP BY asset_id
                    ) latest ON s.asset_id = latest.asset_id AND s.observed_at = latest.latest
                    WHERE s.snapshot_locked = 1
                    LIMIT ?
                """, (limit,))
            
            results = [row["asset_id"] for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
    
    def find_changed_assets(self, previous_scan_id: str, current_scan_id: str, limit: int = 1000) -> List[str]:
        """Find assets that changed between two scans."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT DISTINCT p.asset_id
                FROM asset_snapshots p
                INNER JOIN asset_snapshots c ON p.asset_id = c.asset_id
                WHERE p.scan_id = ? AND c.scan_id = ?
                AND p.metadata_fingerprint != c.metadata_fingerprint
                LIMIT ?
            """, (previous_scan_id, current_scan_id, limit))
            
            results = [row["asset_id"] for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
    
    def find_missing_assets(self, previous_scan_id: str, current_scan_id: str, limit: int = 1000) -> List[str]:
        """Find assets that disappeared between scans."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT p.asset_id
                FROM asset_snapshots p
                LEFT JOIN asset_snapshots c ON p.asset_id = c.asset_id AND c.scan_id = ?
                WHERE p.scan_id = ? AND c.asset_id IS NULL
                LIMIT ?
            """, (current_scan_id, previous_scan_id, limit))
            
            results = [row["asset_id"] for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
    
    def find_recent_scans(self, limit: int = 10) -> List[dict]:
        """Find recent scan contexts."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT scan_id, scan_type, started_at, completed_at,
                       assets_discovered, assets_failed, completed
                FROM scan_contexts
                ORDER BY started_at DESC
                LIMIT ?
            """, (limit,))
            
            results = [dict(row) for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
    
    def get_asset_history(self, asset_id: str, limit: int = 100) -> List[dict]:
        """Get snapshot history for an asset."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT scan_id, observed_at, state, exists, accessible,
                       locked, size, modified_time, metadata_fingerprint
                FROM asset_snapshots
                WHERE asset_id = ?
                ORDER BY observed_at DESC
                LIMIT ?
            """, (asset_id, limit))
            
            results = [dict(row) for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
    
    def get_latest_snapshot(self, asset_id: str) -> Optional[dict]:
        """Get most recent snapshot for an asset."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM asset_snapshots
                WHERE asset_id = ?
                ORDER BY observed_at DESC
                LIMIT 1
            """, (asset_id,))
            
            row = cursor.fetchone()
            cursor.close()
            
            return dict(row) if row else None
            
        except Exception as e:
            raise RuntimeError(f"Query failed: {e}")
