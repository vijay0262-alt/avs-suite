"""
ActionPlan Repository — SC-8C4 Phase B

Persistent storage for ActionPlan and individual RemediationAction records.
Uses the SC-7 MetadataDatabase.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Optional

from ..rules.action import ActionPlan, RemediationAction
from .database import MetadataDatabase

_SCHEMA_VERSION = 2


class ActionPlanRepository:
    """Repository for persisting and loading ActionPlan objects."""

    def __init__(self, database: MetadataDatabase) -> None:
        """Initialize the action plan repository."""
        self.db = database

    def save(
        self,
        plan: ActionPlan,
        status: str = "PLANNED",
    ) -> bool:
        """
        Persist an ActionPlan and its individual RemediationActions.

        V1.0: Retries on "database is locked" to handle concurrent access
        from the scan orchestrator and remediation coordinator threads.

        Args:
            plan: ActionPlan to persist
            status: Persisted plan status

        Returns:
            True if successful
        """
        import time as _time

        plan_id = plan.plan_id
        if plan_id is None:
            raise ValueError("ActionPlan must have a plan_id to be persisted")

        plan_data = json.dumps(plan.to_dict())
        now = datetime.now(UTC).isoformat()

        max_retries = 3
        for attempt in range(max_retries):
            conn = self.db.get_connection()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    INSERT INTO action_plans (
                        plan_id, generated_at, status, plan_data,
                        schema_version, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(plan_id) DO UPDATE SET
                        generated_at=excluded.generated_at,
                        status=excluded.status,
                        plan_data=excluded.plan_data,
                        schema_version=excluded.schema_version,
                        created_at=excluded.created_at
                    """,
                    (
                        plan_id,
                        plan.generated_at.isoformat(),
                        status,
                        plan_data,
                        _SCHEMA_VERSION,
                        now,
                    ),
                )

                for action in plan.actions:
                    action_data = json.dumps(action.to_dict())
                    cursor.execute(
                        """
                        INSERT INTO remediation_actions (
                            plan_id, action_id, action_type, asset_id,
                            state, action_data, schema_version, created_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(action_id) DO UPDATE SET
                            action_type=excluded.action_type,
                            asset_id=excluded.asset_id,
                            state=excluded.state,
                            action_data=excluded.action_data,
                            schema_version=excluded.schema_version,
                            created_at=excluded.created_at
                        """,
                        (
                            plan_id,
                            action.action_id,
                            action.action_type.value,
                            action.asset_id,
                            action.state.value,
                            action_data,
                            _SCHEMA_VERSION,
                            now,
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
                raise RuntimeError(f"Failed to save action plan: {exc}") from exc
            finally:
                cursor.close()
        return False

    def load(self, plan_id: str) -> Optional[ActionPlan]:
        """Load an ActionPlan by plan_id."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                "SELECT plan_data, schema_version FROM action_plans WHERE plan_id = ?",
                (plan_id,),
            )
            row = cursor.fetchone()
            if row is None:
                return None

            plan_data, stored_schema = row[0], row[1]
            if stored_schema is not None and int(stored_schema) > _SCHEMA_VERSION:
                raise RuntimeError(
                    f"ActionPlan schema version {stored_schema} is newer "
                    f"than supported {_SCHEMA_VERSION}"
                )

            data = json.loads(plan_data)
            return ActionPlan.from_dict(data)
        except Exception as exc:
            raise RuntimeError(f"Failed to load action plan {plan_id}: {exc}") from exc
        finally:
            cursor.close()

    def list_actions(self, plan_id: str) -> list[RemediationAction]:
        """Load individual RemediationAction records for a plan."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                (
                    "SELECT action_data FROM remediation_actions "
                    "WHERE plan_id = ? ORDER BY action_id"
                ),
                (plan_id,),
            )
            rows = cursor.fetchall()
            actions: list[RemediationAction] = []
            for row in rows:
                data = json.loads(row[0])
                actions.append(RemediationAction.from_dict(data))
            return actions
        except Exception as exc:
            raise RuntimeError(
                f"Failed to list remediation actions for {plan_id}: {exc}"
            ) from exc
        finally:
            cursor.close()

    def update_status(self, plan_id: str, status: str) -> bool:
        """Update the persisted status of an ActionPlan."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                "UPDATE action_plans SET status = ? WHERE plan_id = ?",
                (status, plan_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Failed to update plan status: {exc}") from exc
        finally:
            cursor.close()

    def list_plans(
        self, status: Optional[str] = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        """List persisted action plan metadata."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        try:
            if status is not None:
                cursor.execute(
                    "SELECT plan_id, status, generated_at, created_at "
                    "FROM action_plans WHERE status = ? "
                    "ORDER BY created_at DESC LIMIT ?",
                    (status, limit),
                )
            else:
                cursor.execute(
                    "SELECT plan_id, status, generated_at, created_at "
                    "FROM action_plans ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                )
            return [dict(row) for row in cursor.fetchall()]
        finally:
            cursor.close()
