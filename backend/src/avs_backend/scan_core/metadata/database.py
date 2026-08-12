"""
Metadata Database — SC-7

SQLite-based persistent storage for Scan Core metadata.

Handles:
- Database initialization
- Schema versioning
- Migrations
- Corruption detection and recovery
- Connection management
- Transaction safety
"""

from __future__ import annotations

import sqlite3
import shutil
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class DatabaseConfig:
    """Configuration for metadata database."""
    
    db_path: Path
    busy_timeout_ms: int = 30000  # 30 seconds
    enable_wal: bool = True  # Write-Ahead Logging for better concurrency
    enable_foreign_keys: bool = True
    cache_size_kb: int = 10000  # 10 MB cache
    
    def __post_init__(self):
        """Ensure db_path is a Path object."""
        if isinstance(self.db_path, str):
            self.db_path = Path(self.db_path)


class MetadataDatabase:
    """
    SQLite database for Scan Core metadata.
    
    STORAGE ONLY. NO DECISIONS.
    
    Stores:
    - Assets (permanent identity)
    - Snapshots (observed state)
    - Contexts (scan metadata)
    - Diffs (changes between scans)
    """
    
    SCHEMA_VERSION = 1
    
    def __init__(self, config: DatabaseConfig):
        """
        Initialize metadata database.
        
        Args:
            config: Database configuration
        """
        self.config = config
        self._conn: Optional[sqlite3.Connection] = None
        self._is_initialized = False
    
    def initialize(self) -> bool:
        """
        Initialize database.
        
        Safe when:
        - Database does not exist
        - Database is empty
        - Database needs upgrade
        - Database is corrupted
        
        Returns:
            True if initialization successful
        """
        try:
            # Ensure directory exists
            self.config.db_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Check for corruption
            if self.config.db_path.exists():
                if not self._check_integrity():
                    logger.warning("Database corruption detected")
                    if not self._recover_from_corruption():
                        return False
            
            # Connect
            self._connect()
            
            # Initialize schema
            self._initialize_schema()
            
            # Run migrations if needed
            self._run_migrations()
            
            self._is_initialized = True
            logger.info(f"Metadata database initialized: {self.config.db_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            return False
    
    def _connect(self) -> None:
        """Establish database connection."""
        self._conn = sqlite3.connect(
            str(self.config.db_path),
            timeout=self.config.busy_timeout_ms / 1000.0,
            check_same_thread=False,  # Allow multi-threaded access
        )
        
        # Enable row factory for dict-like access
        self._conn.row_factory = sqlite3.Row
        
        # Configure database
        cursor = self._conn.cursor()
        
        if self.config.enable_wal:
            cursor.execute("PRAGMA journal_mode=WAL")
        
        if self.config.enable_foreign_keys:
            cursor.execute("PRAGMA foreign_keys=ON")
        
        cursor.execute(f"PRAGMA cache_size=-{self.config.cache_size_kb}")
        cursor.execute("PRAGMA synchronous=NORMAL")  # Balance safety and speed
        
        cursor.close()
    
    def _check_integrity(self) -> bool:
        """
        Check database integrity.
        
        Returns:
            True if database is valid
        """
        conn = None
        try:
            conn = sqlite3.connect(str(self.config.db_path))
            cursor = conn.cursor()
            cursor.execute("PRAGMA integrity_check")
            result = cursor.fetchone()
            cursor.close()
            conn.close()
            conn = None
            
            return result[0] == "ok"
            
        except Exception as e:
            logger.error(f"Integrity check failed: {e}")
            return False
        finally:
            # Ensure connection is closed even on error
            if conn is not None:
                try:
                    conn.close()
                except:
                    pass
    
    def _recover_from_corruption(self) -> bool:
        """
        Recover from database corruption.
        
        Strategy:
        1. Preserve damaged database for diagnostics
        2. Create new valid database
        3. Do not crash the application
        4. Report recovery status
        
        Returns:
            True if recovery successful
        """
        try:
            # Preserve damaged database
            backup_path = self.config.db_path.with_suffix(
                f".corrupted.{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
            )
            shutil.copy2(self.config.db_path, backup_path)
            logger.info(f"Preserved corrupted database: {backup_path}")
            
            # Remove corrupted database
            self.config.db_path.unlink()
            logger.info("Removed corrupted database")
            
            # New database will be created on next connect
            return True
            
        except Exception as e:
            logger.error(f"Corruption recovery failed: {e}")
            return False
    
    def _initialize_schema(self) -> None:
        """Initialize database schema."""
        cursor = self._conn.cursor()
        
        # Schema migrations table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL,
                description TEXT
            )
        """)
        
        # Assets table (permanent identity)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS assets (
                asset_id TEXT PRIMARY KEY,
                asset_type TEXT NOT NULL,
                asset_category TEXT NOT NULL,
                asset_source TEXT NOT NULL,
                display_name TEXT NOT NULL,
                canonical_path TEXT,
                created_at TEXT,
                modified_at TEXT,
                discovered_at TEXT NOT NULL,
                metadata_version INTEGER DEFAULT 1,
                asset_exists INTEGER DEFAULT 1,
                asset_accessible INTEGER DEFAULT 1,
                asset_locked INTEGER DEFAULT 0,
                asset_hidden INTEGER DEFAULT 0,
                asset_system INTEGER DEFAULT 0
            )
        """)
        
        # Asset metadata (key-value storage)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS asset_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT,
                value_type TEXT,
                FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE,
                UNIQUE(asset_id, key)
            )
        """)
        
        # Asset tags
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS asset_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE,
                UNIQUE(asset_id, tag)
            )
        """)
        
        # Asset relationships
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS asset_relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_asset_id TEXT NOT NULL,
                target_asset_id TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                FOREIGN KEY (source_asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE,
                UNIQUE(source_asset_id, target_asset_id, relationship_type)
            )
        """)
        
        # Scan contexts
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scan_contexts (
                scan_id TEXT PRIMARY KEY,
                scan_type TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                duration_ms INTEGER DEFAULT 0,
                scanner_version TEXT,
                machine_id_hash TEXT,
                user_id_hash TEXT,
                platform TEXT,
                platform_version TEXT,
                requested_scope TEXT,
                enumerators_used TEXT,
                assets_discovered INTEGER DEFAULT 0,
                assets_failed INTEGER DEFAULT 0,
                assets_skipped INTEGER DEFAULT 0,
                cancelled INTEGER DEFAULT 0,
                completed INTEGER DEFAULT 0,
                error_count INTEGER DEFAULT 0,
                schema_version INTEGER DEFAULT 1
            )
        """)
        
        # Asset snapshots (observed state)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS asset_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                asset_id TEXT NOT NULL,
                scan_id TEXT NOT NULL,
                observed_at TEXT NOT NULL,
                state TEXT NOT NULL,
                snapshot_exists INTEGER DEFAULT 1,
                snapshot_accessible INTEGER DEFAULT 1,
                snapshot_locked INTEGER DEFAULT 0,
                size INTEGER,
                modified_time TEXT,
                content_fingerprint TEXT,
                metadata_fingerprint TEXT NOT NULL,
                attributes TEXT,
                schema_version INTEGER DEFAULT 1,
                FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE,
                FOREIGN KEY (scan_id) REFERENCES scan_contexts(scan_id) ON DELETE CASCADE,
                UNIQUE(asset_id, scan_id)
            )
        """)
        
        # Snapshot diffs (changes between scans)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS snapshot_diffs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                previous_scan_id TEXT NOT NULL,
                current_scan_id TEXT NOT NULL,
                total_changes INTEGER DEFAULT 0,
                added_count INTEGER DEFAULT 0,
                removed_count INTEGER DEFAULT 0,
                changed_count INTEGER DEFAULT 0,
                unchanged_count INTEGER DEFAULT 0,
                became_inaccessible_count INTEGER DEFAULT 0,
                became_locked_count INTEGER DEFAULT 0,
                became_available_count INTEGER DEFAULT 0,
                computed_at TEXT NOT NULL,
                FOREIGN KEY (previous_scan_id) REFERENCES scan_contexts(scan_id) ON DELETE CASCADE,
                FOREIGN KEY (current_scan_id) REFERENCES scan_contexts(scan_id) ON DELETE CASCADE,
                UNIQUE(previous_scan_id, current_scan_id)
            )
        """)
        
        # Create indexes
        self._create_indexes(cursor)
        
        self._conn.commit()
        cursor.close()
    
    def _create_indexes(self, cursor: sqlite3.Cursor) -> None:
        """Create database indexes for common queries."""
        # Asset indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(asset_category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(canonical_path)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_discovered ON assets(discovered_at)")
        
        # Tag index
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tags_tag ON asset_tags(tag)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tags_asset ON asset_tags(asset_id)")
        
        # Snapshot indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_asset ON asset_snapshots(asset_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_scan ON asset_snapshots(scan_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_observed ON asset_snapshots(observed_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_state ON asset_snapshots(state)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_fingerprint ON asset_snapshots(metadata_fingerprint)")
        
        # Context indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_contexts_started ON scan_contexts(started_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_contexts_completed ON scan_contexts(completed)")
    
    def _run_migrations(self) -> None:
        """Run pending database migrations."""
        cursor = self._conn.cursor()
        
        # Get current version
        cursor.execute("SELECT MAX(version) FROM schema_migrations")
        result = cursor.fetchone()
        current_version = result[0] if result[0] is not None else 0
        
        # Apply migrations
        if current_version < self.SCHEMA_VERSION:
            # Record initial migration
            cursor.execute("""
                INSERT OR IGNORE INTO schema_migrations (version, applied_at, description)
                VALUES (?, ?, ?)
            """, (self.SCHEMA_VERSION, datetime.utcnow().isoformat(), "Initial schema"))
            
            self._conn.commit()
            logger.info(f"Applied migrations up to version {self.SCHEMA_VERSION}")
        
        cursor.close()
    
    def get_connection(self) -> sqlite3.Connection:
        """
        Get database connection.
        
        Returns:
            SQLite connection
        
        Raises:
            RuntimeError: If database not initialized
        """
        if not self._is_initialized or self._conn is None:
            raise RuntimeError("Database not initialized. Call initialize() first.")
        return self._conn
    
    def close(self) -> None:
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None
            self._is_initialized = False
            logger.info("Database connection closed")
    
    def __enter__(self):
        """Context manager entry."""
        if not self._is_initialized:
            self.initialize()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
