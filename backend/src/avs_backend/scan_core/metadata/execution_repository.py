"""
Execution Repository — SC-8C4 Phase B

Persistent storage for ExecutionRequest, ExecutionResult, and audit state.
Uses the SC-7 MetadataDatabase.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Optional

from ..execution.models import ExecutionRequest, ExecutionResult, ExecutionSummary
from ..execution.state_machine import (
    ExecutionState,
    InvalidExecutionStateTransition,
    can_transition,
)
from .database import MetadataDatabase

_SCHEMA_VERSION = 2


class ExecutionRepository:
    """Repository for execution state, results, and audit history."""

    def __init__(self, database: MetadataDatabase) -> None:
        """Initialize the execution repository."""
        self.db = database

    def _now(self) -> str:
        return datetime.now(UTC).isoformat()

    def save_request(
        self,
        request: ExecutionRequest,
        status: str = ExecutionState.PLANNED,
    ) -> bool:
        """Persist an ExecutionRequest before execution.

        V1.0: Retries on "database is locked" to handle concurrent access
        from the scan orchestrator and remediation coordinator threads.
        """
        import time as _time

        plan_id = request.plan.plan_id
        if plan_id is None:
            raise ValueError("ExecutionRequest.plan must have a plan_id")

        max_retries = 3
        for attempt in range(max_retries):
            conn = self.db.get_connection()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    INSERT INTO execution_requests (
                        request_id, plan_id, mode, status, requested_at,
                        execution_context, context_data, schema_version, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(request_id) DO UPDATE SET
                        mode=excluded.mode,
                        status=excluded.status,
                        requested_at=excluded.requested_at,
                        execution_context=excluded.execution_context,
                        context_data=excluded.context_data,
                        schema_version=excluded.schema_version,
                        created_at=excluded.created_at
                    """,
                    (
                        request.request_id,
                        plan_id,
                        request.mode,
                        status,
                        self._now(),
                        json.dumps(request.execution_context),
                        json.dumps(request.to_dict()),
                        _SCHEMA_VERSION,
                        self._now(),
                    ),
                )
                conn.commit()
                return True
            except Exception as exc:
                conn.rollback()
                if "locked" in str(exc).lower() and attempt < max_retries - 1:
                    cursor.close()
                    _time.sleep(0.5 * (attempt + 1))
                    continue
                raise RuntimeError(f"Failed to save execution request: {exc}") from exc
            finally:
                cursor.close()
        return False

    def get_request_status(self, request_id: str) -> Optional[str]:
        """Return the persisted status of an execution request."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                "SELECT status FROM execution_requests WHERE request_id = ?",
                (request_id,),
            )
            row = cursor.fetchone()
            return row[0] if row else None
        finally:
            cursor.close()

    def update_request_status(
        self,
        request_id: str,
        new_status: str,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
    ) -> bool:
        """Update request status with state-machine validation."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                "SELECT status FROM execution_requests WHERE request_id = ?",
                (request_id,),
            )
            row = cursor.fetchone()
            if row is None:
                raise RuntimeError(f"Execution request {request_id} not found")

            current_state = row[0]
            if not can_transition(current_state, new_status):
                raise InvalidExecutionStateTransition(
                    f"Cannot transition execution request from {current_state} to {new_status}"
                )

            updates = ["status = ?"]
            params: list[Any] = [new_status]

            if started_at is not None:
                updates.append("started_at = ?")
                params.append(started_at.isoformat())
            if completed_at is not None:
                updates.append("completed_at = ?")
                params.append(completed_at.isoformat())

            params.append(request_id)
            sql = (
                f"UPDATE execution_requests SET {', '.join(updates)} "
                f"WHERE request_id = ?"
            )
            cursor.execute(sql, params)
            conn.commit()
            return cursor.rowcount > 0
        except InvalidExecutionStateTransition:
            conn.rollback()
            raise
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Failed to update request status: {exc}") from exc
        finally:
            cursor.close()

    def save_action_result(
        self,
        request_id: str,
        result: ExecutionResult,
    ) -> bool:
        """Persist a single action's ExecutionResult.

        V1.0: Retries on "database is locked" to handle concurrent writes
        during bulk action execution (88+ actions in rapid succession).
        """
        import time as _time

        error_data = None
        if result.error is not None:
            error_data = json.dumps(result.error.to_dict())

        max_retries = 3
        for attempt in range(max_retries):
            conn = self.db.get_connection()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    INSERT INTO execution_results (
                        request_id, action_id, status, started_at, completed_at,
                        result_data, backup_identity, backup_location, error_data,
                        schema_version, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(request_id, action_id) DO UPDATE SET
                        status=excluded.status,
                        started_at=excluded.started_at,
                        completed_at=excluded.completed_at,
                        result_data=excluded.result_data,
                        backup_identity=excluded.backup_identity,
                        backup_location=excluded.backup_location,
                        error_data=excluded.error_data,
                        schema_version=excluded.schema_version,
                        created_at=excluded.created_at
                    """,
                    (
                        request_id,
                        result.action_id,
                        result.status.value,
                        self._now(),
                        self._now(),
                        json.dumps(result.to_dict()),
                        result.backup_identity,
                        result.backup_location,
                        error_data,
                        _SCHEMA_VERSION,
                        self._now(),
                    ),
                )
                conn.commit()
                return True
            except Exception as exc:
                conn.rollback()
                if "locked" in str(exc).lower() and attempt < max_retries - 1:
                    cursor.close()
                    _time.sleep(0.1 * (attempt + 1))
                    continue
                raise RuntimeError(f"Failed to save action result: {exc}") from exc
            finally:
                cursor.close()
        return False

    def save_summary(
        self,
        request_id: str,
        summary: ExecutionSummary,
    ) -> bool:
        """Persist an ExecutionSummary.

        V1.0: Retries on "database is locked" to handle concurrent access.
        """
        import time as _time

        max_retries = 3
        for attempt in range(max_retries):
            conn = self.db.get_connection()
            cursor = conn.cursor()
            try:
                completed_at = summary.completed_at
                cursor.execute(
                    """
                    INSERT INTO execution_summaries (
                        request_id, status, started_at, completed_at,
                        summary_data, schema_version, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(request_id) DO UPDATE SET
                        status=excluded.status,
                        completed_at=excluded.completed_at,
                        summary_data=excluded.summary_data,
                        schema_version=excluded.schema_version,
                        created_at=excluded.created_at
                    """,
                    (
                        request_id,
                        summary.status.value,
                        summary.started_at.isoformat(),
                        completed_at.isoformat() if completed_at else None,
                        json.dumps(summary.to_dict()),
                        _SCHEMA_VERSION,
                        self._now(),
                    ),
                )
                conn.commit()
                return True
            except Exception as exc:
                conn.rollback()
                if "locked" in str(exc).lower() and attempt < max_retries - 1:
                    cursor.close()
                    _time.sleep(0.5 * (attempt + 1))
                    continue
                raise RuntimeError(f"Failed to save execution summary: {exc}") from exc
            finally:
                cursor.close()
        return False

    def get_completed_action_ids(self, plan_id: str) -> set[str]:
        """
        Return action_ids that have a COMPLETED result for the given plan.
        Used to seed the ExecutionLedger after restart.
        """
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                SELECT er.action_id
                FROM execution_results er
                JOIN execution_requests r ON er.request_id = r.request_id
                WHERE r.plan_id = ? AND er.status = ?
                """,
                (plan_id, ExecutionState.COMPLETED),
            )
            return {row[0] for row in cursor.fetchall()}
        finally:
            cursor.close()

    def get_incomplete_requests(
        self, plan_id: Optional[str] = None
    ) -> list[dict[str, Any]]:
        """Return persisted requests that did not reach a final state."""
        conn = self.db.get_connection()
        cursor = conn.cursor()
        final_states = sorted(ExecutionState.FINAL_STATES)
        placeholders = ", ".join("?" for _ in final_states)

        try:
            if plan_id is not None:
                cursor.execute(
                    f"""
                    SELECT request_id, plan_id, mode, status, requested_at
                    FROM execution_requests
                    WHERE plan_id = ? AND status NOT IN ({placeholders})
                    ORDER BY requested_at DESC
                    """,
                    (plan_id, *final_states),
                )
            else:
                cursor.execute(
                    f"""
                    SELECT request_id, plan_id, mode, status, requested_at
                    FROM execution_requests
                    WHERE status NOT IN ({placeholders})
                    ORDER BY requested_at DESC
                    """,
                    tuple(final_states),
                )
            return [dict(row) for row in cursor.fetchall()]
        finally:
            cursor.close()

    def get_request_audit(
        self, request_id: str, include_raw: bool = False
    ) -> dict[str, Any]:
        """Return full audit history for a request: request, summary, action results."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        _SENSITIVE_AUDIT_COLUMNS = frozenset(
            {"context_data", "execution_context", "action_data", "summary_data"}
        )

        def _redact_row(row: dict[str, Any]) -> dict[str, Any]:
            if include_raw:
                return row
            return {
                k: ("<redacted>" if k in _SENSITIVE_AUDIT_COLUMNS or k.endswith("_data") else v)
                for k, v in row.items()
            }

        try:
            cursor.execute(
                "SELECT * FROM execution_requests WHERE request_id = ?",
                (request_id,),
            )
            request_row = cursor.fetchone()

            cursor.execute(
                "SELECT * FROM execution_summaries WHERE request_id = ?",
                (request_id,),
            )
            summary_row = cursor.fetchone()

            cursor.execute(
                "SELECT * FROM execution_results WHERE request_id = ? ORDER BY created_at",
                (request_id,),
            )
            result_rows = cursor.fetchall()

            return {
                "request": _redact_row(dict(request_row)) if request_row else None,
                "summary": _redact_row(dict(summary_row)) if summary_row else None,
                "action_results": [_redact_row(dict(row)) for row in result_rows],
            }
        finally:
            cursor.close()

    def get_latest_request_for_plan(self, plan_id: str) -> Optional[dict[str, Any]]:
        """Return the most recent execution request for a plan."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                SELECT request_id, plan_id, mode, status, requested_at, started_at, completed_at
                FROM execution_requests
                WHERE plan_id = ?
                ORDER BY requested_at DESC
                LIMIT 1
                """,
                (plan_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            cursor.close()
