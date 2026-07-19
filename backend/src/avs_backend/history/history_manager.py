"""Optimization History - Track all optimization operations using SQLite.

Stores:
- Date
- Time
- Module
- Optimization Type
- Files Deleted
- Space Saved
- Memory Freed
- Duration
- Result
- Warnings
- Errors

Provides:
- Search
- Sorting
- Filtering
- Export to CSV
- History statistics
"""

from __future__ import annotations

import csv
import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class ModuleType(str, Enum):
    """Module types for history tracking."""

    JUNK_CLEANER = "junk_cleaner"
    MEMORY_OPTIMIZER = "memory_optimizer"
    STARTUP_MANAGER = "startup_manager"
    PRIVACY_CLEANER = "privacy_cleaner"
    DASHBOARD = "dashboard"
    DISK_ANALYZER = "disk_analyzer"
    DUPLICATE_FINDER = "duplicate_finder"


class OptimizationType(str, Enum):
    """Optimization operation types."""

    SCAN = "scan"
    CLEAN = "clean"
    OPTIMIZE = "optimize"
    DISABLE = "disable"
    ENABLE = "enable"
    RESTORE = "restore"


class OperationResult(str, Enum):
    """Operation result status."""

    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(slots=True)
class HistoryEntry:
    """A single history entry."""

    id: int = 0
    date: str = ""
    time: str = ""
    module: ModuleType = ModuleType.JUNK_CLEANER
    optimization_type: OptimizationType = OptimizationType.SCAN
    files_deleted: int = 0
    space_saved: int = 0
    memory_freed: int = 0
    duration_ms: int = 0
    result: OperationResult = OperationResult.SUCCESS
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


# Database path
DB_PATH = Path.home() / ".avs" / "optimization_history.db"


def _init_db() -> sqlite3.Connection:
    """Initialize the history database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            module TEXT NOT NULL,
            optimization_type TEXT NOT NULL,
            files_deleted INTEGER DEFAULT 0,
            space_saved INTEGER DEFAULT 0,
            memory_freed INTEGER DEFAULT 0,
            duration_ms INTEGER DEFAULT 0,
            result TEXT NOT NULL,
            warnings TEXT,
            errors TEXT,
            details TEXT
        )
    """)

    # Create indexes for common queries
    conn.execute("CREATE INDEX IF NOT EXISTS idx_date ON history(date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_module ON history(module)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_result ON history(result)")

    conn.commit()
    return conn


def add_history_entry(entry: HistoryEntry) -> int:
    """Add a history entry to the database.

    Args:
        entry: HistoryEntry to add

    Returns:
        ID of the inserted entry
    """
    conn = _init_db()

    now = datetime.now()
    if not entry.date:
        entry.date = now.strftime("%Y-%m-%d")
    if not entry.time:
        entry.time = now.strftime("%H:%M:%S")

    cursor = conn.execute(
        """
        INSERT INTO history (
            date, time, module, optimization_type, files_deleted,
            space_saved, memory_freed, duration_ms, result,
            warnings, errors, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            entry.date,
            entry.time,
            entry.module.value,
            entry.optimization_type.value,
            entry.files_deleted,
            entry.space_saved,
            entry.memory_freed,
            entry.duration_ms,
            entry.result.value,
            "\n".join(entry.warnings),
            "\n".join(entry.errors),
            str(entry.details),
        ),
    )

    entry_id = cursor.lastrowid
    conn.commit()
    conn.close()

    logger.info(f"Added history entry: {entry.module.value} - {entry.optimization_type.value} (ID: {entry_id})")
    return entry_id


def get_history(
    limit: int = 100,
    offset: int = 0,
    module: ModuleType | None = None,
    result: OperationResult | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[HistoryEntry]:
    """Get history entries with optional filtering.

    Args:
        limit: Maximum number of entries to return
        offset: Number of entries to skip
        module: Filter by module type
        result: Filter by result status
        date_from: Filter by date from (YYYY-MM-DD)
        date_to: Filter by date to (YYYY-MM-DD)

    Returns:
        List of HistoryEntry objects
    """
    conn = _init_db()

    query = "SELECT * FROM history WHERE 1=1"
    params = []

    if module:
        query += " AND module = ?"
        params.append(module.value)

    if result:
        query += " AND result = ?"
        params.append(result.value)

    if date_from:
        query += " AND date >= ?"
        params.append(date_from)

    if date_to:
        query += " AND date <= ?"
        params.append(date_to)

    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor = conn.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    entries = []
    for row in rows:
        warnings = row[10].split("\n") if row[10] else []
        errors = row[11].split("\n") if row[11] else []

        try:
            details = eval(row[12]) if row[12] else {}
        except:
            details = {}

        entries.append(HistoryEntry(
            id=row[0],
            date=row[1],
            time=row[2],
            module=ModuleType(row[3]),
            optimization_type=OptimizationType(row[4]),
            files_deleted=row[5],
            space_saved=row[6],
            memory_freed=row[7],
            duration_ms=row[8],
            result=OperationResult(row[9]),
            warnings=warnings,
            errors=errors,
            details=details,
        ))

    return entries


def get_history_entry(entry_id: int) -> HistoryEntry | None:
    """Get a specific history entry by ID.

    Args:
        entry_id: ID of the entry

    Returns:
        HistoryEntry or None if not found
    """
    conn = _init_db()

    cursor = conn.execute("SELECT * FROM history WHERE id = ?", (entry_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    warnings = row[10].split("\n") if row[10] else []
    errors = row[11].split("\n") if row[11] else []

    try:
        details = eval(row[12]) if row[12] else {}
    except:
        details = {}

    return HistoryEntry(
        id=row[0],
        date=row[1],
        time=row[2],
        module=ModuleType(row[3]),
        optimization_type=OptimizationType(row[4]),
        files_deleted=row[5],
        space_saved=row[6],
        memory_freed=row[7],
        duration_ms=row[8],
        result=OperationResult(row[9]),
        warnings=warnings,
        errors=errors,
        details=details,
    )


def get_history_statistics() -> dict[str, Any]:
    """Get overall history statistics.

    Returns:
        Dictionary with statistics
    """
    conn = _init_db()

    # Total entries
    total_entries = conn.execute("SELECT COUNT(*) FROM history").fetchone()[0]

    # Total space saved
    total_space = conn.execute("SELECT SUM(space_saved) FROM history").fetchone()[0] or 0

    # Total memory freed
    total_memory = conn.execute("SELECT SUM(memory_freed) FROM history").fetchone()[0] or 0

    # Total files deleted
    total_files = conn.execute("SELECT SUM(files_deleted) FROM history").fetchone()[0] or 0

    # Success rate
    success_count = conn.execute("SELECT COUNT(*) FROM history WHERE result = 'success'").fetchone()[0]
    success_rate = (success_count / total_entries * 100) if total_entries > 0 else 0

    # Module breakdown
    module_breakdown = {}
    for module in ModuleType:
        count = conn.execute("SELECT COUNT(*) FROM history WHERE module = ?", (module.value,)).fetchone()[0]
        if count > 0:
            module_breakdown[module.value] = count

    # Recent activity (last 7 days)
    recent_activity = conn.execute("""
        SELECT date, COUNT(*) as count
        FROM history
        WHERE date >= date('now', '-7 days')
        GROUP BY date
        ORDER BY date DESC
    """).fetchall()

    conn.close()

    return {
        "totalEntries": total_entries,
        "totalSpaceSaved": total_space,
        "totalMemoryFreed": total_memory,
        "totalFilesDeleted": total_files,
        "successRate": round(success_rate, 1),
        "moduleBreakdown": module_breakdown,
        "recentActivity": [{"date": row[0], "count": row[1]} for row in recent_activity],
    }


def delete_history_entry(entry_id: int) -> bool:
    """Delete a specific history entry.

    Args:
        entry_id: ID of the entry to delete

    Returns:
        True if successful, False otherwise
    """
    conn = _init_db()

    try:
        conn.execute("DELETE FROM history WHERE id = ?", (entry_id,))
        conn.commit()
        conn.close()
        logger.info(f"Deleted history entry: {entry_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete history entry {entry_id}: {e}")
        conn.close()
        return False


def clear_all_history() -> bool:
    """Clear all history entries.

    Returns:
        True if successful, False otherwise
    """
    conn = _init_db()

    try:
        conn.execute("DELETE FROM history")
        conn.commit()
        conn.close()
        logger.info("Cleared all history")
        return True
    except Exception as e:
        logger.error(f"Failed to clear history: {e}")
        conn.close()
        return False


def export_history_to_csv(output_path: str) -> bool:
    """Export history to CSV file.

    Args:
        output_path: Path to output CSV file

    Returns:
        True if successful, False otherwise
    """
    try:
        entries = get_history(limit=10000)  # Get all entries

        with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = [
                'ID', 'Date', 'Time', 'Module', 'Optimization Type',
                'Files Deleted', 'Space Saved (bytes)', 'Memory Freed (bytes)',
                'Duration (ms)', 'Result', 'Warnings', 'Errors'
            ]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

            writer.writeheader()
            for entry in entries:
                writer.writerow({
                    'ID': entry.id,
                    'Date': entry.date,
                    'Time': entry.time,
                    'Module': entry.module.value,
                    'Optimization Type': entry.optimization_type.value,
                    'Files Deleted': entry.files_deleted,
                    'Space Saved (bytes)': entry.space_saved,
                    'Memory Freed (bytes)': entry.memory_freed,
                    'Duration (ms)': entry.duration_ms,
                    'Result': entry.result.value,
                    'Warnings': '; '.join(entry.warnings),
                    'Errors': '; '.join(entry.errors),
                })

        logger.info(f"Exported history to CSV: {output_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to export history to CSV: {e}")
        return False


def search_history(query: str) -> list[HistoryEntry]:
    """Search history entries by query.

    Args:
        query: Search query (searches in warnings, errors, and details)

    Returns:
        List of matching HistoryEntry objects
    """
    conn = _init_db()

    cursor = conn.execute(
        """
        SELECT * FROM history
        WHERE warnings LIKE ? OR errors LIKE ? OR details LIKE ?
        ORDER BY id DESC
        LIMIT 100
        """,
        (f"%{query}%", f"%{query}%", f"%{query}%")
    )

    rows = cursor.fetchall()
    conn.close()

    entries = []
    for row in rows:
        warnings = row[10].split("\n") if row[10] else []
        errors = row[11].split("\n") if row[11] else []

        try:
            details = eval(row[12]) if row[12] else {}
        except:
            details = {}

        entries.append(HistoryEntry(
            id=row[0],
            date=row[1],
            time=row[2],
            module=ModuleType(row[3]),
            optimization_type=OptimizationType(row[4]),
            files_deleted=row[5],
            space_saved=row[6],
            memory_freed=row[7],
            duration_ms=row[8],
            result=OperationResult(row[9]),
            warnings=warnings,
            errors=errors,
            details=details,
        ))

    return entries
