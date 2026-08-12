"""
Database Migrations — SC-7

Schema migration management for metadata cache.

Future migrations will be added here as the schema evolves.
"""

from __future__ import annotations

import logging
from typing import List, Callable
from datetime import datetime, UTC
from .database import MetadataDatabase

logger = logging.getLogger(__name__)


class Migration:
    """Represents a single database migration."""
    
    def __init__(self, version: int, description: str, up: Callable, down: Callable):
        """
        Initialize migration.
        
        Args:
            version: Migration version number
            description: Human-readable description
            up: Function to apply migration
            down: Function to rollback migration
        """
        self.version = version
        self.description = description
        self.up = up
        self.down = down


class MigrationManager:
    """
    Manages database schema migrations.
    
    Future use: When schema changes are needed, add migrations here.
    """
    
    def __init__(self, database: MetadataDatabase):
        """
        Initialize migration manager.
        
        Args:
            database: Metadata database instance
        """
        self.db = database
        self.migrations: List[Migration] = []
    
    def register(self, migration: Migration) -> None:
        """Register a migration."""
        self.migrations.append(migration)
        self.migrations.sort(key=lambda m: m.version)
    
    def get_current_version(self) -> int:
        """Get current schema version."""
        try:
            conn = self.db.get_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT MAX(version) as version FROM schema_migrations")
            result = cursor.fetchone()
            cursor.close()
            
            return result["version"] if result["version"] is not None else 0
            
        except Exception as e:
            logger.error(f"Failed to get schema version: {e}")
            return 0
    
    def apply_pending(self) -> int:
        """
        Apply all pending migrations.
        
        Returns:
            Number of migrations applied
        """
        current_version = self.get_current_version()
        applied = 0
        
        for migration in self.migrations:
            if migration.version > current_version:
                try:
                    logger.info(f"Applying migration {migration.version}: {migration.description}")
                    migration.up(self.db)
                    
                    # Record migration
                    conn = self.db.get_connection()
                    cursor = conn.cursor()
                    cursor.execute("""
                        INSERT INTO schema_migrations (version, applied_at, description)
                        VALUES (?, ?, ?)
                    """, (migration.version, datetime.now(UTC).isoformat(), migration.description))
                    conn.commit()
                    cursor.close()
                    
                    applied += 1
                    
                except Exception as e:
                    logger.error(f"Migration {migration.version} failed: {e}")
                    raise
        
        return applied


# Example future migration (not applied yet):
# def migration_v2_add_asset_risk_score(db: MetadataDatabase):
#     """Add risk_score column to assets table."""
#     conn = db.get_connection()
#     cursor = conn.cursor()
#     cursor.execute("ALTER TABLE assets ADD COLUMN risk_score REAL DEFAULT 0.0")
#     conn.commit()
#     cursor.close()
