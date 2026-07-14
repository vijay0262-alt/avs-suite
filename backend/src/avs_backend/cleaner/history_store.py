"""SQLite-backed history log for cleaning operations.

Persisted so the UI's log page survives process restarts. One tiny
table with an index on ``started_at DESC`` for the common "recent
first" query.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from pathlib import Path

log = logging.getLogger("avs.cleaner.history")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS cleaning_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at        TEXT NOT NULL,
    finished_at       TEXT NOT NULL,
    cleaner_id        TEXT NOT NULL,
    cleaner_name      TEXT NOT NULL,
    category          TEXT NOT NULL,
    action            TEXT NOT NULL,
    result            TEXT NOT NULL,
    files_removed     INTEGER NOT NULL,
    bytes_recovered   INTEGER NOT NULL,
    files_skipped     INTEGER NOT NULL,
    files_failed      INTEGER NOT NULL,
    duration_ms       INTEGER NOT NULL,
    errors_json       TEXT
);
CREATE INDEX IF NOT EXISTS ix_cleaning_log_started_at
    ON cleaning_log (started_at DESC);
CREATE INDEX IF NOT EXISTS ix_cleaning_log_category
    ON cleaning_log (category);
CREATE INDEX IF NOT EXISTS ix_cleaning_log_result
    ON cleaning_log (result);
"""

_COLUMNS = (
    "id",
    "started_at",
    "finished_at",
    "cleaner_id",
    "cleaner_name",
    "category",
    "action",
    "result",
    "files_removed",
    "bytes_recovered",
    "files_skipped",
    "files_failed",
    "duration_ms",
    "errors_json",
)


class HistoryStore:
    """Small thread-safe wrapper around a SQLite file.

    A single :class:`sqlite3.Connection` guarded by a ``Lock`` — the
    write volume for cleaning history is far below what would justify
    a connection pool.
    """

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # ``check_same_thread=False`` because CleaningManager workers
        # write from the pool; we serialise through ``_lock`` ourselves.
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        
        # Retry WAL mode setting with timeout for parallel test execution
        for attempt in range(5):
            try:
                self._conn.execute("PRAGMA journal_mode=WAL")
                break
            except sqlite3.OperationalError as e:
                if "database is locked" in str(e) and attempt < 4:
                    time.sleep(0.1 * (attempt + 1))
                else:
                    raise
        
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(_SCHEMA)

    # ------------------------------------------------------------------
    def append(self, row: dict[str, object]) -> int:
        """Insert a single log entry. ``row`` must contain every column
        except ``id``."""
        columns = [c for c in _COLUMNS if c != "id"]
        missing = [c for c in columns if c not in row]
        if missing:
            raise ValueError(f"Missing history columns: {missing}")

        sql = (
            f"INSERT INTO cleaning_log ({','.join(columns)}) "
            f"VALUES ({','.join('?' for _ in columns)})"
        )
        params = tuple(row[c] for c in columns)
        with self._lock:
            cur = self._conn.execute(sql, params)
        return int(cur.lastrowid or 0)

    def query(
        self,
        *,
        search: str | None = None,
        category: str | None = None,
        result: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[dict[str, object]]:
        """Return a page of rows sorted newest-first."""
        wheres: list[str] = []
        params: list[object] = []

        if search:
            wheres.append("(cleaner_name LIKE ? OR errors_json LIKE ?)")
            like = f"%{search}%"
            params.extend([like, like])
        if category:
            wheres.append("category = ?")
            params.append(category)
        if result:
            wheres.append("result = ?")
            params.append(result)

        sql = "SELECT * FROM cleaning_log"
        if wheres:
            sql += " WHERE " + " AND ".join(wheres)
        sql += " ORDER BY started_at DESC LIMIT ? OFFSET ?"
        params.extend([max(1, min(500, int(limit))), max(0, int(offset))])

        with self._lock:
            rows = self._conn.execute(sql, params).fetchall()

        return [_row_to_dict(r) for r in rows]

    def count(
        self,
        *,
        search: str | None = None,
        category: str | None = None,
        result: str | None = None,
    ) -> int:
        wheres: list[str] = []
        params: list[object] = []
        if search:
            wheres.append("(cleaner_name LIKE ? OR errors_json LIKE ?)")
            like = f"%{search}%"
            params.extend([like, like])
        if category:
            wheres.append("category = ?")
            params.append(category)
        if result:
            wheres.append("result = ?")
            params.append(result)

        sql = "SELECT COUNT(*) FROM cleaning_log"
        if wheres:
            sql += " WHERE " + " AND ".join(wheres)
        with self._lock:
            (n,) = self._conn.execute(sql, params).fetchone()
        return int(n)

    def close(self) -> None:
        with self._lock:
            try:
                self._conn.close()
            except sqlite3.Error:
                pass


def _row_to_dict(row: sqlite3.Row) -> dict[str, object]:
    d = {k: row[k] for k in row.keys()}
    # ``errors_json`` is stored as a JSON string; decode it on the way out.
    ej = d.get("errors_json")
    if isinstance(ej, str) and ej:
        try:
            d["errors"] = json.loads(ej)
        except json.JSONDecodeError:
            d["errors"] = {"count": 0, "sample": []}
    else:
        d["errors"] = {"count": 0, "sample": []}
    d.pop("errors_json", None)
    return d


def default_history_path() -> Path:
    """Resolve the on-disk location for the SQLite file.

    Prefers ``AVS_DB_DIR`` (set by the Electron main process to
    ``<userData>/database``) and falls back to ``~/.avs/`` in dev.
    """
    override = os.environ.get("AVS_DB_DIR")
    if override:
        return Path(override) / "cleaning-history.sqlite"
    return Path.home() / ".avs" / "cleaning-history.sqlite"


__all__ = ["HistoryStore", "default_history_path"]
