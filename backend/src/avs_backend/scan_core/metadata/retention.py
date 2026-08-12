"""
Retention Policies — SC-7

Configurable data retention for metadata cache.

STORAGE ONLY. NO DECISIONS.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
import logging

from .database import MetadataDatabase

logger = logging.getLogger(__name__)


@dataclass
class RetentionConfig:
    """Configuration for retention policies."""
    
    # Scan contexts
    keep_scan_contexts_days: int = 90  # Keep scan metadata for 90 days
    
    # Snapshots
    keep_snapshots_days: int = 30  # Keep historical snapshots for 30 days
    keep_latest_snapshot: bool = True  # Always keep latest snapshot per asset
    
    # Diffs
    keep_diffs_days: int = 30  # Keep diff metadata for 30 days
    
    # Assets
    keep_assets_days: Optional[int] = None  # Keep assets indefinitely by default
    
    # Safety
    min_scans_to_keep: int = 5  # Always keep at least 5 most recent scans


class RetentionPolicy:
    """
    Retention policy enforcement for metadata cache.
    
    Applies configurable retention rules to clean old data.
    
    IMPORTANT: This does NOT decide what is "junk" or "safe to delete".
    It only removes old metadata based on time-based policies.
    """
    
    def __init__(self, database: MetadataDatabase, config: RetentionConfig):
        """
        Initialize retention policy.
        
        Args:
            database: Metadata database instance
            config: Retention configuration
        """
        self.db = database
        self.config = config
    
    def apply(self, dry_run: bool = False) -> dict:
        """
        Apply retention policies.
        
        Args:
            dry_run: If True, report what would be deleted without deleting
        
        Returns:
            Dict with deletion statistics
        """
        stats = {
            "scans_deleted": 0,
            "snapshots_deleted": 0,
            "diffs_deleted": 0,
            "assets_deleted": 0,
        }
        
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            # Delete old scan contexts (keeping minimum)
            if self.config.keep_scan_contexts_days > 0:
                cutoff = datetime.utcnow() - timedelta(days=self.config.keep_scan_contexts_days)
                
                # Find scans to delete (excluding most recent N)
                cursor.execute("""
                    SELECT scan_id FROM scan_contexts
                    WHERE started_at < ?
                    AND scan_id NOT IN (
                        SELECT scan_id FROM scan_contexts
                        ORDER BY started_at DESC
                        LIMIT ?
                    )
                """, (cutoff.isoformat(), self.config.min_scans_to_keep))
                
                old_scans = [row["scan_id"] for row in cursor.fetchall()]
                
                if not dry_run and old_scans:
                    placeholders = ",".join("?" * len(old_scans))
                    cursor.execute(f"""
                        DELETE FROM scan_contexts
                        WHERE scan_id IN ({placeholders})
                    """, old_scans)
                    stats["scans_deleted"] = cursor.rowcount
                else:
                    stats["scans_deleted"] = len(old_scans)
            
            # Delete old snapshots (keeping latest per asset)
            if self.config.keep_snapshots_days > 0:
                cutoff = datetime.utcnow() - timedelta(days=self.config.keep_snapshots_days)
                
                if self.config.keep_latest_snapshot:
                    # Delete old snapshots but keep latest per asset
                    if not dry_run:
                        cursor.execute("""
                            DELETE FROM asset_snapshots
                            WHERE observed_at < ?
                            AND id NOT IN (
                                SELECT id FROM asset_snapshots s1
                                WHERE observed_at = (
                                    SELECT MAX(observed_at)
                                    FROM asset_snapshots s2
                                    WHERE s2.asset_id = s1.asset_id
                                )
                            )
                        """, (cutoff.isoformat(),))
                        stats["snapshots_deleted"] = cursor.rowcount
                    else:
                        cursor.execute("""
                            SELECT COUNT(*) as count FROM asset_snapshots
                            WHERE observed_at < ?
                            AND id NOT IN (
                                SELECT id FROM asset_snapshots s1
                                WHERE observed_at = (
                                    SELECT MAX(observed_at)
                                    FROM asset_snapshots s2
                                    WHERE s2.asset_id = s1.asset_id
                                )
                            )
                        """, (cutoff.isoformat(),))
                        stats["snapshots_deleted"] = cursor.fetchone()["count"]
                else:
                    # Delete all old snapshots
                    if not dry_run:
                        cursor.execute("""
                            DELETE FROM asset_snapshots
                            WHERE observed_at < ?
                        """, (cutoff.isoformat(),))
                        stats["snapshots_deleted"] = cursor.rowcount
                    else:
                        cursor.execute("""
                            SELECT COUNT(*) as count FROM asset_snapshots
                            WHERE observed_at < ?
                        """, (cutoff.isoformat(),))
                        stats["snapshots_deleted"] = cursor.fetchone()["count"]
            
            # Delete old diffs
            if self.config.keep_diffs_days > 0:
                cutoff = datetime.utcnow() - timedelta(days=self.config.keep_diffs_days)
                
                if not dry_run:
                    cursor.execute("""
                        DELETE FROM snapshot_diffs
                        WHERE computed_at < ?
                    """, (cutoff.isoformat(),))
                    stats["diffs_deleted"] = cursor.rowcount
                else:
                    cursor.execute("""
                        SELECT COUNT(*) as count FROM snapshot_diffs
                        WHERE computed_at < ?
                    """, (cutoff.isoformat(),))
                    stats["diffs_deleted"] = cursor.fetchone()["count"]
            
            # Delete orphaned assets (no snapshots)
            if self.config.keep_assets_days is not None:
                cutoff = datetime.utcnow() - timedelta(days=self.config.keep_assets_days)
                
                if not dry_run:
                    cursor.execute("""
                        DELETE FROM assets
                        WHERE discovered_at < ?
                        AND asset_id NOT IN (
                            SELECT DISTINCT asset_id FROM asset_snapshots
                        )
                    """, (cutoff.isoformat(),))
                    stats["assets_deleted"] = cursor.rowcount
                else:
                    cursor.execute("""
                        SELECT COUNT(*) as count FROM assets
                        WHERE discovered_at < ?
                        AND asset_id NOT IN (
                            SELECT DISTINCT asset_id FROM asset_snapshots
                        )
                    """, (cutoff.isoformat(),))
                    stats["assets_deleted"] = cursor.fetchone()["count"]
            
            if not dry_run:
                conn.commit()
            
            cursor.close()
            
            logger.info(f"Retention policy applied: {stats}")
            return stats
            
        except Exception as e:
            if not dry_run:
                conn.rollback()
            logger.error(f"Retention policy failed: {e}")
            raise RuntimeError(f"Failed to apply retention policy: {e}")
