"""
SC-8C4 Part 1 — Execution ledger for idempotency.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from .models import ExecutionResult, ExecutionStatus


@dataclass(frozen=True)
class ExecutionRecord:
    """Immutable record of a single action execution."""

    action_id: str
    execution_id: str
    status: ExecutionStatus
    timestamp: datetime
    result: Optional[ExecutionResult] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "action_id": self.action_id,
            "execution_id": self.execution_id,
            "status": self.status.value,
            "timestamp": self.timestamp.isoformat(),
            "result": self.result.to_dict() if self.result is not None else None,
        }


@dataclass
class ExecutionLedger:
    """In-memory execution ledger used to prevent duplicate execution."""

    _records: dict[str, ExecutionRecord] = field(default_factory=dict)

    def record(self, result: ExecutionResult) -> None:
        """Record an execution result for an action_id."""
        self._records[result.action_id] = ExecutionRecord(
            action_id=result.action_id,
            execution_id=result.execution_id,
            status=result.status,
            timestamp=result.timestamp,
            result=result,
        )

    def has(self, action_id: str) -> bool:
        """Return True if the action has already been recorded."""
        return action_id in self._records

    def get(self, action_id: str) -> Optional[ExecutionRecord]:
        """Return the record for an action, or None."""
        return self._records.get(action_id)

    def count(self) -> int:
        """Return the number of recorded actions."""
        return len(self._records)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "recorded_actions": len(self._records),
            "records": {
                action_id: record.to_dict()
                for action_id, record in self._records.items()
            },
        }
