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

import logging
import shutil
import sqlite3
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional

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

    SCHEMA_VERSION = 2

    def __init__(self, config: DatabaseConfig):
        """
        Initialize metadata database.

        Args:
            config: Database configuration
        """
        self.config = config
        self._local = threading.local()
        self._local.conn: Optional[sqlite3.Connection] = None
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

            # Check for corruption (only if DB exists and is large)
            # For large databases, use quick_check which is much faster
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

            # Clean up old snapshots to prevent database bloat.
            # Keep only the most recent snapshot per asset.
            self._cleanup_old_snapshots()

            self._is_initialized = True
            logger.info(f"Metadata database initialized: {self.config.db_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            return False

    def _open_connection(self) -> sqlite3.Connection:
        """Create and configure a new SQLite connection."""
        conn = sqlite3.connect(
            str(self.config.db_path),
            timeout=self.config.busy_timeout_ms / 1000.0,
            check_same_thread=False,  # Allow multi-threaded access
        )

        # Enable row factory for dict-like access
        conn.row_factory = sqlite3.Row

        # Configure database
        cursor = conn.cursor()

        if self.config.enable_wal:
            cursor.execute("PRAGMA journal_mode=WAL")

        if self.config.enable_foreign_keys:
            cursor.execute("PRAGMA foreign_keys=ON")

        cursor.execute(f"PRAGMA cache_size=-{self.config.cache_size_kb}")
        cursor.execute("PRAGMA synchronous=NORMAL")  # Balance safety and speed

        cursor.close()
        return conn

    def _connect(self) -> None:
        """Establish a connection for the current thread."""
        self._local.conn = self._open_connection()

    def _check_integrity(self) -> bool:
        """
        Check database integrity.

        Uses PRAGMA quick_check instead of integrity_check for performance.
        quick_check skips the b-tree balance and reference verification,
        making it much faster on large databases (1GB+) while still
        detecting structural corruption.

        Returns:
            True if database is valid
        """
        conn = None
        try:
            conn = sqlite3.connect(str(self.config.db_path))
            cursor = conn.cursor()
            cursor.execute("PRAGMA quick_check")
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
                except Exception:
                    pass

    def _recover_from_corruption(self) -> bool:
        """
        Recover from database corruption.

        Strategy:
        1. Preserve damaged database for diagnostics
        2. Attempt WAL checkpoint/recovery
        3. Attempt to dump recoverable data
        4. Only then create a fresh database

        Returns:
            True if a usable database can be created (corrupt data is preserved)
        """
        try:
            # Preserve damaged database before any destructive work.
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_path = self.config.db_path.with_suffix(
                f".corrupted.{timestamp}.db"
            )
            shutil.copy2(self.config.db_path, backup_path)
            logger.warning(f"Database corruption detected; preserved at: {backup_path}")

            # Attempt in-place WAL recovery before deleting anything.
            if self._wal_checkpoint_recovery():
                logger.info("WAL checkpoint recovered the database")
                return True

            # Attempt to dump whatever SQLite can still read.
            dump_path = self.config.db_path.with_suffix(
                f".corrupted.{timestamp}.sql"
            )
            self._dump_recoverable_data(dump_path)

            # Remove the corrupted working database now that copies exist.
            self.config.db_path.unlink()
            logger.info("Removed corrupted working database; replacement will be created")

            return True

        except Exception as e:
            logger.error(f"Corruption recovery failed: {e}")
            return False

    def _wal_checkpoint_recovery(self) -> bool:
        """Attempt to recover the database via WAL checkpoint and integrity check."""
        conn = None
        try:
            conn = sqlite3.connect(str(self.config.db_path))
            cursor = conn.cursor()
            cursor.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            cursor.fetchone()
            cursor.execute("PRAGMA integrity_check")
            result = cursor.fetchone()
            cursor.close()
            conn.close()
            conn = None
            return result is not None and result[0] == "ok"
        except Exception as e:
            logger.warning(f"WAL checkpoint recovery attempt failed: {e}")
            return False
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    def _dump_recoverable_data(self, dump_path: Path) -> bool:
        """Attempt to dump any data SQLite can still read from the corrupted DB."""
        conn = None
        try:
            conn = sqlite3.connect(str(self.config.db_path))
            with open(dump_path, "w") as f:
                for line in conn.iterdump():
                    f.write(line + "\n")
            logger.info(f"Dumped recoverable data to: {dump_path}")
            return True
        except Exception as e:
            logger.warning(f"Could not dump recoverable data: {e}")
            return False
        finally:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    def _initialize_schema(self) -> None:
        """Initialize database schema."""
        conn = getattr(self._local, "conn", None)
        if conn is None:
            raise RuntimeError("Database connection not available")
        cursor = conn.cursor()

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

        # Scan history (SC-8C9 Phase 2)
        # Privacy-safe dashboard summary. No raw findings, paths, credentials,
        # or browser data are stored here.
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scan_history (
                scan_id TEXT PRIMARY KEY,
                scan_type TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                duration_ms INTEGER DEFAULT 0,
                cancelled INTEGER DEFAULT 0,
                completed INTEGER DEFAULT 0,
                error_count INTEGER DEFAULT 0,
                findings_count INTEGER DEFAULT 0,
                action_plan_id TEXT,
                actionable_count INTEGER DEFAULT 0,
                review_count INTEGER DEFAULT 0,
                blocked_count INTEGER DEFAULT 0,
                not_fixable_count INTEGER DEFAULT 0,
                statistics_json TEXT,
                created_at TEXT NOT NULL
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

        # Action plans (Phase B)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS action_plans (
                plan_id TEXT PRIMARY KEY,
                generated_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PLANNED',
                plan_data TEXT NOT NULL,
                schema_version INTEGER DEFAULT 2,
                created_at TEXT NOT NULL
            )
        """)

        # Individual remediation actions (Phase B)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS remediation_actions (
                plan_id TEXT NOT NULL,
                action_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                asset_id TEXT NOT NULL,
                state TEXT NOT NULL,
                action_data TEXT NOT NULL,
                schema_version INTEGER DEFAULT 2,
                created_at TEXT NOT NULL,
                PRIMARY KEY (action_id),
                FOREIGN KEY (plan_id) REFERENCES action_plans(plan_id) ON DELETE CASCADE
            )
        """)

        # Execution requests (Phase B)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS execution_requests (
                request_id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PLANNED',
                requested_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                context_data TEXT,
                execution_context TEXT,
                schema_version INTEGER DEFAULT 2,
                created_at TEXT NOT NULL,
                FOREIGN KEY (plan_id) REFERENCES action_plans(plan_id) ON DELETE CASCADE
            )
        """)

        # Execution summaries (Phase B)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS execution_summaries (
                summary_id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                summary_data TEXT NOT NULL,
                schema_version INTEGER DEFAULT 2,
                created_at TEXT NOT NULL,
                FOREIGN KEY (request_id)
                    REFERENCES execution_requests(request_id) ON DELETE CASCADE,
                UNIQUE(request_id)
            )
        """)

        # Per-action execution results (Phase B)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS execution_results (
                result_id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                action_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                result_data TEXT NOT NULL,
                backup_identity TEXT,
                backup_location TEXT,
                error_data TEXT,
                schema_version INTEGER DEFAULT 2,
                created_at TEXT NOT NULL,
                FOREIGN KEY (request_id)
                    REFERENCES execution_requests(request_id) ON DELETE CASCADE,
                FOREIGN KEY (action_id)
                    REFERENCES remediation_actions(action_id) ON DELETE CASCADE,
                UNIQUE(request_id, action_id)
            )
        """)

        # Create indexes
        self._create_indexes(cursor)

        conn.commit()
        cursor.close()

    def _create_indexes(self, cursor: sqlite3.Cursor) -> None:
        """Create database indexes for common queries."""
        # Asset indexes
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_assets_category ON "
            "assets(asset_category)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(canonical_path)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_assets_discovered ON "
            "assets(discovered_at)"
        )

        # Tag index
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tags_tag ON asset_tags(tag)")
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_tags_asset ON asset_tags(asset_id)"
        )

        # Snapshot indexes
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_asset ON "
            "asset_snapshots(asset_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_scan ON "
            "asset_snapshots(scan_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_observed ON "
            "asset_snapshots(observed_at)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_state ON "
            "asset_snapshots(state)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_snapshots_fingerprint ON "
            "asset_snapshots(metadata_fingerprint)"
        )

        # Context indexes
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_contexts_started ON "
            "scan_contexts(started_at)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_contexts_completed ON "
            "scan_contexts(completed)"
        )

        # Scan history indexes
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_scan_history_started ON "
            "scan_history(started_at)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_scan_history_action_plan ON "
            "scan_history(action_plan_id)"
        )

        # Phase B execution-persistence indexes
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_action_plans_status ON "
            "action_plans(status)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_action_plans_generated ON "
            "action_plans(generated_at)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_remediation_actions_plan ON "
            "remediation_actions(plan_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_execution_requests_plan ON "
            "execution_requests(plan_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_execution_requests_status ON "
            "execution_requests(status)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_execution_results_request ON "
            "execution_results(request_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_execution_results_action ON "
            "execution_results(action_id)"
        )

    def _run_migrations(self) -> None:
        """Run pending database migrations."""
        conn = getattr(self._local, "conn", None)
        if conn is None:
            raise RuntimeError("Database connection not available")
        cursor = conn.cursor()

        # Get current version
        cursor.execute("SELECT MAX(version) FROM schema_migrations")
        result = cursor.fetchone()
        current_version = result[0] if result[0] is not None else 0

        # Apply migrations
        if current_version < self.SCHEMA_VERSION:
            # Record initial migration
            cursor.execute(
                """
                INSERT OR IGNORE INTO schema_migrations (version, applied_at, description)
                VALUES (?, ?, ?)
            """,
                (
                    self.SCHEMA_VERSION,
                    datetime.now(UTC).isoformat(),
                    "Phase B execution persistence schema",
                ),
            )

            conn.commit()
            logger.info(f"Applied migrations up to version {self.SCHEMA_VERSION}")

        cursor.close()

    def _cleanup_old_snapshots(self) -> None:
        """Remove old snapshots to prevent database bloat.

        Keeps only the most recent snapshot per asset, deleting older ones.
        This prevents the asset_snapshots table from growing unboundedly
        across scans (686K+ rows → ~269K rows).
        """
        conn = getattr(self._local, "conn", None)
        if conn is None:
            return
        try:
            cursor = conn.cursor()
            # Set a short busy timeout for the cleanup to avoid blocking
            # if another connection holds a lock.
            cursor.execute("PRAGMA busy_timeout = 5000")
            # Delete all but the most recent snapshot per asset_id.
            # The subquery finds the max rowid for each asset_id,
            # and we delete rows that don't match (keeping the latest).
            cursor.execute("""
                DELETE FROM asset_snapshots
                WHERE rowid NOT IN (
                    SELECT MAX(s.rowid)
                    FROM asset_snapshots s
                    GROUP BY s.asset_id
                )
            """)
            deleted = cursor.rowcount
            conn.commit()
            cursor.close()
            if deleted > 0:
                logger.info(f"Cleaned up {deleted} old snapshots")
        except Exception as e:
            logger.warning(f"Snapshot cleanup failed (non-fatal): {e}")

    def get_connection(self) -> sqlite3.Connection:
        """
        Get a database connection for the current thread.

        Returns:
            SQLite connection

        Raises:
            RuntimeError: If database not initialized
        """
        if not self._is_initialized:
            raise RuntimeError("Database not initialized. Call initialize() first.")
        conn = getattr(self._local, "conn", None)
        if conn is None:
            self._connect()
            conn = self._local.conn
        if conn is None:
            raise RuntimeError("Database connection not available")
        return conn

    def close(self) -> None:
        """Close the current thread's database connection."""
        conn = getattr(self._local, "conn", None)
        if conn:
            try:
                conn.close()
            except Exception:
                pass
            self._local.conn = None
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
