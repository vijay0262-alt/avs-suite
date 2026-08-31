"""
Snapshot Repository — SC-7

CRUD operations for AssetSnapshot persistence.

STORAGE ONLY. NO DECISIONS.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Optional, List
from datetime import datetime

from ..context import AssetSnapshot, SnapshotState
from .database import MetadataDatabase


class SnapshotRepository:
    """
    Repository for AssetSnapshot persistence.
    
    Provides:
    - save(snapshot)
    - save_many(snapshots)
    - get(asset_id, scan_id)
    - get_latest(asset_id)
    - get_history(asset_id, limit)
    - get_for_scan(scan_id, limit)
    - count_for_scan(scan_id)
    """
    
    def __init__(self, database: MetadataDatabase):
        """
        Initialize snapshot repository.
        
        Args:
            database: Metadata database instance
        """
        self.db = database
    
    def save(self, snapshot: AssetSnapshot) -> bool:
        """
        Save snapshot.
        
        Args:
            snapshot: AssetSnapshot to persist
        
        Returns:
            True if successful
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO asset_snapshots (
                    asset_id, scan_id, observed_at, state,
                    snapshot_exists, snapshot_accessible, snapshot_locked, size, modified_time,
                    content_fingerprint, metadata_fingerprint, attributes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(asset_id, scan_id) DO UPDATE SET
                    observed_at=excluded.observed_at,
                    state=excluded.state,
                    snapshot_exists=excluded.snapshot_exists,
                    snapshot_accessible=excluded.snapshot_accessible,
                    snapshot_locked=excluded.snapshot_locked,
                    size=excluded.size,
                    modified_time=excluded.modified_time,
                    content_fingerprint=excluded.content_fingerprint,
                    metadata_fingerprint=excluded.metadata_fingerprint,
                    attributes=excluded.attributes
            """, (
                snapshot.asset_id,
                snapshot.scan_id,
                snapshot.observed_at.isoformat(),
                snapshot.state.value,
                snapshot.exists,
                snapshot.accessible,
                snapshot.locked,
                snapshot.size,
                snapshot.modified_time.isoformat() if snapshot.modified_time else None,
                snapshot.content_fingerprint,
                snapshot.metadata_fingerprint,
                json.dumps(snapshot.attributes),
            ))
            
            conn.commit()
            cursor.close()
            return True
            
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Failed to save snapshot: {e}")
    
    def save_many(self, snapshots: List[AssetSnapshot]) -> int:
        """
        Batch save snapshots.
        
        Args:
            snapshots: List of snapshots to persist
        
        Returns:
            Number of snapshots successfully saved
        """
        if not snapshots:
            return 0

        conn = self.db.get_connection()
        cursor = conn.cursor()

        sql = """
            INSERT INTO asset_snapshots (
                asset_id, scan_id, observed_at, state,
                snapshot_exists, snapshot_accessible, snapshot_locked, size, modified_time,
                content_fingerprint, metadata_fingerprint, attributes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(asset_id, scan_id) DO UPDATE SET
                observed_at=excluded.observed_at,
                state=excluded.state,
                snapshot_exists=excluded.snapshot_exists,
                snapshot_accessible=excluded.snapshot_accessible,
                snapshot_locked=excluded.snapshot_locked,
                size=excluded.size,
                modified_time=excluded.modified_time,
                content_fingerprint=excluded.content_fingerprint,
                metadata_fingerprint=excluded.metadata_fingerprint,
                attributes=excluded.attributes
        """

        params = [
            (
                snapshot.asset_id,
                snapshot.scan_id,
                snapshot.observed_at.isoformat(),
                snapshot.state.value,
                snapshot.exists,
                snapshot.accessible,
                snapshot.locked,
                snapshot.size,
                snapshot.modified_time.isoformat() if snapshot.modified_time else None,
                snapshot.content_fingerprint,
                snapshot.metadata_fingerprint,
                json.dumps(snapshot.attributes),
            )
            for snapshot in snapshots
        ]

        try:
            cursor.executemany(sql, params)
            conn.commit()
            cursor.close()
            return len(snapshots)

        except Exception as e:
            conn.rollback()
            cursor.close()
            raise RuntimeError(f"Batch save failed: {e}")
    
    def get(self, asset_id: str, scan_id: str) -> Optional[AssetSnapshot]:
        """
        Get snapshot for specific asset and scan.
        
        Args:
            asset_id: Asset identifier
            scan_id: Scan identifier
        
        Returns:
            AssetSnapshot if found, None otherwise
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM asset_snapshots
                WHERE asset_id = ? AND scan_id = ?
            """, (asset_id, scan_id))
            
            row = cursor.fetchone()
            cursor.close()
            
            if not row:
                return None
            
            return self._row_to_snapshot(row)
            
        except Exception as e:
            raise RuntimeError(f"Failed to get snapshot: {e}")
    
    def get_latest(self, asset_id: str) -> Optional[AssetSnapshot]:
        """
        Get most recent snapshot for asset.
        
        Args:
            asset_id: Asset identifier
        
        Returns:
            Latest AssetSnapshot if found, None otherwise
        """
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
            
            if not row:
                return None
            
            return self._row_to_snapshot(row)
            
        except Exception as e:
            raise RuntimeError(f"Failed to get latest snapshot: {e}")
    
    def get_history(self, asset_id: str, limit: int = 100) -> List[AssetSnapshot]:
        """
        Get snapshot history for asset.
        
        Args:
            asset_id: Asset identifier
            limit: Maximum snapshots to return
        
        Returns:
            List of snapshots ordered by observed_at DESC
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM asset_snapshots
                WHERE asset_id = ?
                ORDER BY observed_at DESC
                LIMIT ?
            """, (asset_id, limit))
            
            snapshots = [self._row_to_snapshot(row) for row in cursor.fetchall()]
            cursor.close()
            return snapshots
            
        except Exception as e:
            raise RuntimeError(f"Failed to get snapshot history: {e}")
    
    def get_for_scan(self, scan_id: str, limit: int = 500000) -> List[AssetSnapshot]:
        """
        Get all snapshots for a scan.
        
        Args:
            scan_id: Scan identifier
            limit: Maximum snapshots to return
        
        Returns:
            List of snapshots for the scan
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM asset_snapshots
                WHERE scan_id = ?
                LIMIT ?
            """, (scan_id, limit))
            
            snapshots = [self._row_to_snapshot(row) for row in cursor.fetchall()]
            cursor.close()
            return snapshots
            
        except Exception as e:
            raise RuntimeError(f"Failed to get snapshots for scan: {e}")
    
    def count_for_scan(self, scan_id: str) -> int:
        """
        Count snapshots for a scan.
        
        Args:
            scan_id: Scan identifier
        
        Returns:
            Number of snapshots
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT COUNT(*) as count FROM asset_snapshots
                WHERE scan_id = ?
            """, (scan_id,))
            
            result = cursor.fetchone()["count"]
            cursor.close()
            return result
            
        except Exception as e:
            raise RuntimeError(f"Failed to count snapshots: {e}")
    
    def _row_to_snapshot(self, row: sqlite3.Row) -> AssetSnapshot:
        """Convert database row to AssetSnapshot."""
        return AssetSnapshot(
            asset_id=row["asset_id"],
            scan_id=row["scan_id"],
            observed_at=datetime.fromisoformat(row["observed_at"]),
            state=SnapshotState(row["state"]),
            exists=bool(row["snapshot_exists"]),
            accessible=bool(row["snapshot_accessible"]),
            locked=bool(row["snapshot_locked"]),
            size=row["size"],
            modified_time=datetime.fromisoformat(row["modified_time"]) if row["modified_time"] else None,
            content_fingerprint=row["content_fingerprint"],
            metadata_fingerprint=row["metadata_fingerprint"],
            attributes=json.loads(row["attributes"]) if row["attributes"] else {},
        )
