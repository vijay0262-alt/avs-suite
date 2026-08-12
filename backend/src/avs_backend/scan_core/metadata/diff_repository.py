"""
Diff Repository — SC-7

Storage for SnapshotDiff metadata.

STORAGE ONLY. NO DECISIONS.
"""

from __future__ import annotations

import sqlite3
from typing import Optional
from datetime import datetime

from ..context import SnapshotDiff
from .database import MetadataDatabase


class DiffRepository:
    """
    Repository for SnapshotDiff metadata.
    
    Stores summary statistics only, not individual changes.
    
    Provides:
    - save(diff)
    - get(previous_scan_id, current_scan_id)
    """
    
    def __init__(self, database: MetadataDatabase):
        """
        Initialize diff repository.
        
        Args:
            database: Metadata database instance
        """
        self.db = database
    
    def save(self, diff: SnapshotDiff) -> bool:
        """
        Save snapshot diff metadata.
        
        Args:
            diff: SnapshotDiff to persist
        
        Returns:
            True if successful
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO snapshot_diffs (
                    previous_scan_id, current_scan_id, total_changes,
                    added_count, removed_count, changed_count, unchanged_count,
                    became_inaccessible_count, became_locked_count, became_available_count,
                    computed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(previous_scan_id, current_scan_id) DO UPDATE SET
                    total_changes=excluded.total_changes,
                    added_count=excluded.added_count,
                    removed_count=excluded.removed_count,
                    changed_count=excluded.changed_count,
                    unchanged_count=excluded.unchanged_count,
                    became_inaccessible_count=excluded.became_inaccessible_count,
                    became_locked_count=excluded.became_locked_count,
                    became_available_count=excluded.became_available_count,
                    computed_at=excluded.computed_at
            """, (
                diff.previous_scan_id,
                diff.current_scan_id,
                diff.total_changes,
                len(diff.added),
                len(diff.removed),
                len(diff.changed),
                len(diff.unchanged),
                len(diff.became_inaccessible),
                len(diff.became_locked),
                len(diff.became_available),
                datetime.utcnow().isoformat(),
            ))
            
            conn.commit()
            cursor.close()
            return True
            
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Failed to save diff: {e}")
    
    def get(self, previous_scan_id: str, current_scan_id: str) -> Optional[dict]:
        """
        Get diff metadata.
        
        Args:
            previous_scan_id: Previous scan ID
            current_scan_id: Current scan ID
        
        Returns:
            Dict with diff statistics if found, None otherwise
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM snapshot_diffs
                WHERE previous_scan_id = ? AND current_scan_id = ?
            """, (previous_scan_id, current_scan_id))
            
            row = cursor.fetchone()
            cursor.close()
            
            if not row:
                return None
            
            return {
                "previous_scan_id": row["previous_scan_id"],
                "current_scan_id": row["current_scan_id"],
                "total_changes": row["total_changes"],
                "added_count": row["added_count"],
                "removed_count": row["removed_count"],
                "changed_count": row["changed_count"],
                "unchanged_count": row["unchanged_count"],
                "became_inaccessible_count": row["became_inaccessible_count"],
                "became_locked_count": row["became_locked_count"],
                "became_available_count": row["became_available_count"],
                "computed_at": row["computed_at"],
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to get diff: {e}")
