"""
Scan History Repository — SC-8C9 Phase 2

Thin, privacy-safe read-only dashboard history for persisted scan_core results.
Stores only the metadata the dashboard needs; no raw findings, paths,
credentials, or browser data.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from typing import Any, Optional

from .database import MetadataDatabase


class ScanHistoryRepository:
    """Repository for privacy-safe scan history metadata."""

    def __init__(self, database: MetadataDatabase) -> None:
        """Initialize the scan history repository."""
        self.db = database

    def save(self, record: dict[str, Any]) -> bool:
        """
        Persist a lightweight scan result summary.

        Args:
            record: Privacy-safe summary dict. Expected keys:
                scan_id, scan_type, started_at, completed_at, duration_ms,
                cancelled, completed, error_count, findings_count,
                action_plan_id, actionable_count, review_count, blocked_count,
                not_fixable_count, statistics_json

        Returns:
            True if successful
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()

        now = datetime.now(UTC).isoformat()

        try:
            cursor.execute(
                """
                INSERT INTO scan_history (
                    scan_id, scan_type, started_at, completed_at, duration_ms,
                    cancelled, completed, error_count, findings_count,
                    action_plan_id, actionable_count, review_count, blocked_count,
                    not_fixable_count, statistics_json, cleanup_result_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scan_id) DO UPDATE SET
                    scan_type=excluded.scan_type,
                    started_at=excluded.started_at,
                    completed_at=excluded.completed_at,
                    duration_ms=excluded.duration_ms,
                    cancelled=excluded.cancelled,
                    completed=excluded.completed,
                    error_count=excluded.error_count,
                    findings_count=excluded.findings_count,
                    action_plan_id=excluded.action_plan_id,
                    actionable_count=excluded.actionable_count,
                    review_count=excluded.review_count,
                    blocked_count=excluded.blocked_count,
                    not_fixable_count=excluded.not_fixable_count,
                    statistics_json=excluded.statistics_json,
                    cleanup_result_json=excluded.cleanup_result_json,
                    created_at=excluded.created_at
                """,
                (
                    record.get("scan_id", ""),
                    record.get("scan_type", ""),
                    record.get("started_at"),
                    record.get("completed_at"),
                    record.get("duration_ms", 0),
                    1 if record.get("cancelled") else 0,
                    1 if record.get("completed") else 0,
                    record.get("error_count", 0),
                    record.get("findings_count", 0),
                    record.get("action_plan_id"),
                    record.get("actionable_count", 0),
                    record.get("review_count", 0),
                    record.get("blocked_count", 0),
                    record.get("not_fixable_count", 0),
                    json.dumps(record.get("statistics") or {}),
                    json.dumps(record.get("cleanup_result") or {}) if record.get("cleanup_result") else None,
                    now,
                ),
            )
            conn.commit()
            return True
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Failed to save scan history: {exc}") from exc
        finally:
            cursor.close()

    def get_latest(self) -> Optional[dict[str, Any]]:
        """Return the most recent scan history record, or None."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                "SELECT * FROM scan_history ORDER BY started_at DESC LIMIT 1"
            )
            row = cursor.fetchone()
            return self._row_to_record(row) if row else None
        except Exception as exc:
            raise RuntimeError(f"Failed to get latest scan history: {exc}") from exc
        finally:
            cursor.close()

    def list_recent(self, limit: int = 10) -> list[dict[str, Any]]:
        """Return the most recent scan history records."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                "SELECT * FROM scan_history ORDER BY started_at DESC LIMIT ?",
                (limit,),
            )
            return [self._row_to_record(row) for row in cursor.fetchall()]
        except Exception as exc:
            raise RuntimeError(f"Failed to list scan history: {exc}") from exc
        finally:
            cursor.close()

    def _row_to_record(self, row: sqlite3.Row) -> dict[str, Any]:
        """Convert a database row to a dashboard-safe record."""
        statistics = {}
        raw_stats = row["statistics_json"]
        if raw_stats:
            try:
                statistics = json.loads(raw_stats)
            except json.JSONDecodeError:
                statistics = {}

        cleanup_result = None
        # Handle cleanup_result_json (may not exist in old schema)
        try:
            raw_cleanup = row["cleanup_result_json"]
            if raw_cleanup:
                try:
                    cleanup_result = json.loads(raw_cleanup)
                except json.JSONDecodeError:
                    cleanup_result = None
        except (KeyError, IndexError):
            # Column doesn't exist in old schema
            cleanup_result = None

        return {
            "scan_id": row["scan_id"],
            "scan_type": row["scan_type"],
            "started_at": row["started_at"],
            "completed_at": row["completed_at"],
            "duration_ms": row["duration_ms"],
            "cancelled": bool(row["cancelled"]),
            "completed": bool(row["completed"]),
            "error_count": row["error_count"],
            "findings_count": row["findings_count"],
            "action_plan_id": row["action_plan_id"],
            "actionable_count": row["actionable_count"],
            "review_count": row["review_count"],
            "blocked_count": row["blocked_count"],
            "not_fixable_count": row["not_fixable_count"],
            "statistics": statistics,
            "cleanup_result": cleanup_result,
            "created_at": row["created_at"],
        }

    def update_cleanup_result(self, plan_id: str, cleanup_result: dict[str, Any]) -> bool:
        """
        Update scan history with cleanup result from auto-optimization.

        Args:
            plan_id: The action plan ID to find the associated scan
            cleanup_result: Cleanup result dict with keys:
                detected, cleaned, remaining, failed, review_required,
                space_recovered, health_before, health_after

        Returns:
            True if successful
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            # Find the scan_id for this plan_id
            cursor.execute(
                "SELECT scan_id FROM scan_history WHERE action_plan_id = ? LIMIT 1",
                (plan_id,),
            )
            row = cursor.fetchone()
            if not row:
                return False

            scan_id = row[0]

            # Update the cleanup_result_json
            cursor.execute(
                """
                UPDATE scan_history 
                SET cleanup_result_json = ?
                WHERE scan_id = ?
                """,
                (json.dumps(cleanup_result), scan_id),
            )
            conn.commit()
            return True
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Failed to update cleanup result: {exc}") from exc
        finally:
            cursor.close()
