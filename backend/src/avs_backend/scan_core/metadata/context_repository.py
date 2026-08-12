"""
Context Repository — SC-7

CRUD operations for ScanContext persistence.

STORAGE ONLY. NO DECISIONS.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Optional, List
from datetime import datetime

from ..context import ScanContext, ScanType
from .database import MetadataDatabase


class ContextRepository:
    """
    Repository for ScanContext persistence.
    
    Provides:
    - create(context)
    - get(scan_id)
    - complete(scan_id, context)
    - list_recent(limit)
    - count()
    """
    
    def __init__(self, database: MetadataDatabase):
        """
        Initialize context repository.
        
        Args:
            database: Metadata database instance
        """
        self.db = database
    
    def create(self, context: ScanContext) -> bool:
        """
        Create scan context.
        
        Args:
            context: ScanContext to persist
        
        Returns:
            True if successful
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO scan_contexts (
                    scan_id, scan_type, started_at, completed_at,
                    duration_ms, scanner_version, machine_id_hash,
                    user_id_hash, platform, platform_version,
                    requested_scope, enumerators_used,
                    assets_discovered, assets_failed, assets_skipped,
                    cancelled, completed, error_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                context.scan_id,
                context.scan_type.value,
                context.started_at.isoformat(),
                context.completed_at.isoformat() if context.completed_at else None,
                context.duration_ms,
                context.scanner_version,
                context.machine_id_hash,
                context.user_id_hash,
                context.platform,
                context.platform_version,
                json.dumps(context.requested_scope),
                json.dumps(context.enumerators_used),
                context.assets_discovered,
                context.assets_failed,
                context.assets_skipped,
                context.cancelled,
                context.completed,
                context.error_count,
            ))
            
            conn.commit()
            cursor.close()
            return True
            
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Failed to create context: {e}")
    
    def get(self, scan_id: str) -> Optional[ScanContext]:
        """
        Get scan context by ID.
        
        Args:
            scan_id: Scan identifier
        
        Returns:
            ScanContext if found, None otherwise
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM scan_contexts WHERE scan_id = ?
            """, (scan_id,))
            
            row = cursor.fetchone()
            cursor.close()
            
            if not row:
                return None
            
            return self._row_to_context(row)
            
        except Exception as e:
            raise RuntimeError(f"Failed to get context: {e}")
    
    def complete(self, scan_id: str, context: ScanContext) -> bool:
        """
        Mark scan as completed and update stats.
        
        Args:
            scan_id: Scan identifier
            context: Updated ScanContext
        
        Returns:
            True if successful
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE scan_contexts SET
                    completed_at = ?,
                    duration_ms = ?,
                    assets_discovered = ?,
                    assets_failed = ?,
                    assets_skipped = ?,
                    cancelled = ?,
                    completed = ?,
                    error_count = ?
                WHERE scan_id = ?
            """, (
                context.completed_at.isoformat() if context.completed_at else None,
                context.duration_ms,
                context.assets_discovered,
                context.assets_failed,
                context.assets_skipped,
                context.cancelled,
                context.completed,
                context.error_count,
                scan_id,
            ))
            
            updated = cursor.rowcount > 0
            conn.commit()
            cursor.close()
            return updated
            
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Failed to complete context: {e}")
    
    def list_recent(self, limit: int = 10) -> List[ScanContext]:
        """
        List recent scan contexts.
        
        Args:
            limit: Maximum contexts to return
        
        Returns:
            List of ScanContexts ordered by started_at DESC
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM scan_contexts
                ORDER BY started_at DESC
                LIMIT ?
            """, (limit,))
            
            contexts = [self._row_to_context(row) for row in cursor.fetchall()]
            cursor.close()
            return contexts
            
        except Exception as e:
            raise RuntimeError(f"Failed to list contexts: {e}")
    
    def count(self) -> int:
        """
        Count total scan contexts.
        
        Returns:
            Total context count
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) as count FROM scan_contexts")
            
            result = cursor.fetchone()["count"]
            cursor.close()
            return result
            
        except Exception as e:
            raise RuntimeError(f"Failed to count contexts: {e}")
    
    def _row_to_context(self, row: sqlite3.Row) -> ScanContext:
        """Convert database row to ScanContext."""
        return ScanContext(
            scan_id=row["scan_id"],
            scan_type=ScanType(row["scan_type"]),
            started_at=datetime.fromisoformat(row["started_at"]),
            completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
            duration_ms=row["duration_ms"],
            scanner_version=row["scanner_version"] or "3.0.0",
            machine_id_hash=row["machine_id_hash"] or "",
            user_id_hash=row["user_id_hash"] or "",
            platform=row["platform"] or "",
            platform_version=row["platform_version"] or "",
            requested_scope=json.loads(row["requested_scope"]) if row["requested_scope"] else [],
            enumerators_used=json.loads(row["enumerators_used"]) if row["enumerators_used"] else [],
            assets_discovered=row["assets_discovered"],
            assets_failed=row["assets_failed"],
            assets_skipped=row["assets_skipped"],
            cancelled=bool(row["cancelled"]),
            completed=bool(row["completed"]),
            error_count=row["error_count"],
        )
