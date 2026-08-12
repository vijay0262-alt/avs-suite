"""
Asset Repository — SC-7

CRUD operations for ScanAsset persistence.

STORAGE ONLY. NO DECISIONS.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Optional, List
from datetime import datetime

from ..assets import ScanAsset, AssetType, AssetCategory
from .database import MetadataDatabase


class AssetRepository:
    """
    Repository for ScanAsset persistence.
    
    Provides:
    - get(asset_id)
    - upsert(asset)
    - delete(asset_id)
    - exists(asset_id)
    - find_by_type(type)
    - find_by_category(category)
    - find_by_tag(tag)
    - find_by_path(path)
    - count()
    """
    
    def __init__(self, database: MetadataDatabase):
        """
        Initialize asset repository.
        
        Args:
            database: Metadata database instance
        """
        self.db = database
    
    def upsert(self, asset: ScanAsset) -> bool:
        """
        Insert or update asset.
        
        Args:
            asset: ScanAsset to persist
        
        Returns:
            True if successful
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            # Upsert main asset record
            cursor.execute("""
                INSERT INTO assets (
                    asset_id, asset_type, asset_category, asset_source,
                    display_name, canonical_path, created_at, modified_at,
                    discovered_at, asset_exists, asset_accessible, asset_locked, asset_hidden, asset_system
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(asset_id) DO UPDATE SET
                    display_name=excluded.display_name,
                    canonical_path=excluded.canonical_path,
                    modified_at=excluded.modified_at,
                    asset_exists=excluded.asset_exists,
                    asset_accessible=excluded.asset_accessible,
                    asset_locked=excluded.asset_locked,
                    asset_hidden=excluded.asset_hidden,
                    asset_system=excluded.asset_system
            """, (
                asset.asset_id,
                asset.asset_type.value,
                asset.asset_category.value,
                asset.asset_source.value,
                asset.display_name,
                asset.canonical_path,
                asset.created_at.isoformat() if asset.created_at else None,
                asset.modified_at.isoformat() if asset.modified_at else None,
                datetime.utcnow().isoformat(),
                asset.exists,
                asset.accessible,
                asset.locked,
                asset.hidden,
                asset.system,
            ))
            
            # Delete existing metadata/tags/relationships
            cursor.execute("DELETE FROM asset_metadata WHERE asset_id = ?", (asset.asset_id,))
            cursor.execute("DELETE FROM asset_tags WHERE asset_id = ?", (asset.asset_id,))
            cursor.execute("DELETE FROM asset_relationships WHERE source_asset_id = ?", (asset.asset_id,))
            
            # Insert metadata
            for key, value in asset.custom_metadata.data.items():
                cursor.execute("""
                    INSERT INTO asset_metadata (asset_id, key, value, value_type)
                    VALUES (?, ?, ?, ?)
                """, (
                    asset.asset_id,
                    key,
                    json.dumps(value),
                    type(value).__name__,
                ))
            
            # Insert tags
            for tag in asset.tags:
                cursor.execute("""
                    INSERT INTO asset_tags (asset_id, tag)
                    VALUES (?, ?)
                """, (asset.asset_id, tag))
            
            # Insert relationships
            for rel in asset.relationships:
                cursor.execute("""
                    INSERT INTO asset_relationships (source_asset_id, target_asset_id, relationship_type)
                    VALUES (?, ?, ?)
                """, (
                    rel.source_asset_id,
                    rel.target_asset_id,
                    rel.relationship_type.value,
                ))
            
            conn.commit()
            cursor.close()
            return True
            
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Failed to upsert asset {asset.asset_id}: {e}")
    
    def upsert_many(self, assets: List[ScanAsset]) -> int:
        """
        Batch insert/update assets.
        
        Args:
            assets: List of ScanAssets to persist
        
        Returns:
            Number of assets successfully persisted
        """
        count = 0
        conn = self.db.get_connection()
        
        try:
            for asset in assets:
                try:
                    self.upsert(asset)
                    count += 1
                except Exception as e:
                    # Log but continue with other assets
                    pass
            
            return count
            
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Batch upsert failed: {e}")
    
    def get(self, asset_id: str) -> Optional[ScanAsset]:
        """
        Get asset by ID.
        
        Args:
            asset_id: Asset identifier
        
        Returns:
            ScanAsset if found, None otherwise
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            # Get main asset record
            cursor.execute("""
                SELECT * FROM assets WHERE asset_id = ?
            """, (asset_id,))
            
            row = cursor.fetchone()
            if not row:
                cursor.close()
                return None
            
            # Reconstruct ScanAsset
            from ..assets import AssetSource
            asset = ScanAsset(
                asset_id=row["asset_id"],
                asset_type=AssetType(row["asset_type"]),
                asset_category=AssetCategory(row["asset_category"]),
                asset_source=AssetSource(row["asset_source"]),
                display_name=row["display_name"],
                canonical_path=row["canonical_path"] or "",
                created_at=datetime.fromisoformat(row["created_at"]) if row["created_at"] else None,
                modified_at=datetime.fromisoformat(row["modified_at"]) if row["modified_at"] else None,
                exists=bool(row["asset_exists"]),
                accessible=bool(row["asset_accessible"]),
                locked=bool(row["asset_locked"]),
                hidden=bool(row["asset_hidden"]),
                system=bool(row["asset_system"]),
            )
            
            # Load metadata
            cursor.execute("""
                SELECT key, value FROM asset_metadata WHERE asset_id = ?
            """, (asset_id,))
            
            for meta_row in cursor.fetchall():
                asset.custom_metadata.set(meta_row["key"], json.loads(meta_row["value"]))
            
            # Load tags
            cursor.execute("""
                SELECT tag FROM asset_tags WHERE asset_id = ?
            """, (asset_id,))
            
            for tag_row in cursor.fetchall():
                asset.add_tag(tag_row["tag"])
            
            # Load relationships (simplified - would need full relationship reconstruction)
            # For now, just note that relationships exist
            
            cursor.close()
            return asset
            
        except Exception as e:
            raise RuntimeError(f"Failed to get asset {asset_id}: {e}")
    
    def exists(self, asset_id: str) -> bool:
        """
        Check if asset exists.
        
        Args:
            asset_id: Asset identifier
        
        Returns:
            True if asset exists
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT 1 FROM assets WHERE asset_id = ? LIMIT 1
            """, (asset_id,))
            
            result = cursor.fetchone() is not None
            cursor.close()
            return result
            
        except Exception as e:
            raise RuntimeError(f"Failed to check asset existence: {e}")
    
    def delete(self, asset_id: str) -> bool:
        """
        Delete asset.
        
        Args:
            asset_id: Asset identifier
        
        Returns:
            True if deleted
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("DELETE FROM assets WHERE asset_id = ?", (asset_id,))
            
            deleted = cursor.rowcount > 0
            conn.commit()
            cursor.close()
            return deleted
            
        except Exception as e:
            conn.rollback()
            raise RuntimeError(f"Failed to delete asset {asset_id}: {e}")
    
    def find_by_type(self, asset_type: AssetType, limit: int = 1000) -> List[str]:
        """
        Find asset IDs by type.
        
        Args:
            asset_type: Asset type to filter
            limit: Maximum results
        
        Returns:
            List of asset IDs
        """
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
            raise RuntimeError(f"Failed to find assets by type: {e}")
    
    def find_by_category(self, category: AssetCategory, limit: int = 1000) -> List[str]:
        """
        Find asset IDs by category.
        
        Args:
            category: Asset category to filter
            limit: Maximum results
        
        Returns:
            List of asset IDs
        """
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
            raise RuntimeError(f"Failed to find assets by category: {e}")
    
    def find_by_tag(self, tag: str, limit: int = 1000) -> List[str]:
        """
        Find asset IDs by tag.
        
        Args:
            tag: Tag to filter
            limit: Maximum results
        
        Returns:
            List of asset IDs
        """
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
            raise RuntimeError(f"Failed to find assets by tag: {e}")
    
    def find_by_path(self, path: str, limit: int = 1000) -> List[str]:
        """
        Find asset IDs by path (exact or prefix match).
        
        Args:
            path: Path to search
            limit: Maximum results
        
        Returns:
            List of asset IDs
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT asset_id FROM assets
                WHERE canonical_path LIKE ?
                LIMIT ?
            """, (f"{path}%", limit))
            
            results = [row["asset_id"] for row in cursor.fetchall()]
            cursor.close()
            return results
            
        except Exception as e:
            raise RuntimeError(f"Failed to find assets by path: {e}")
    
    def count(self) -> int:
        """
        Count total assets.
        
        Returns:
            Total asset count
        """
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) as count FROM assets")
            
            result = cursor.fetchone()["count"]
            cursor.close()
            return result
            
        except Exception as e:
            raise RuntimeError(f"Failed to count assets: {e}")
