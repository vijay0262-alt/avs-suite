"""
SC-8C4 Part 1 — Execution engine immutable models.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional, Protocol, runtime_checkable

from avs_backend.scan_core.rules.action import ActionPlan


class ExecutionStatus(str, Enum):
    """
    Status of an execution result or batch.

    These statuses cover the full execution lifecycle including
    safety-gate decisions.
    """

    PLANNED = "planned"
    DRY_RUN = "dry_run"
    APPROVED = "approved"
    REJECTED = "rejected"
    SKIPPED = "skipped"
    FAILED = "failed"
    COMPLETED = "completed"
    REQUIRES_REVIEW = "requires_review"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class ExecutionError:
    """Structured error information for a failed execution."""

    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "code": self.code,
            "message": self.message,
            "details": dict(self.details),
        }


@dataclass(frozen=True)
class ExecutionResult:
    """Immutable result of executing a single remediation action."""

    execution_id: str
    action_id: str
    finding_id: str
    asset_id: str
    action_type: str
    target: dict[str, Any]
    status: ExecutionStatus
    reason: str
    timestamp: datetime
    error: Optional[ExecutionError] = None
    verification: dict[str, Any] = field(default_factory=dict)
    dry_run_info: Optional[dict[str, Any]] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "execution_id": self.execution_id,
            "action_id": self.action_id,
            "finding_id": self.finding_id,
            "asset_id": self.asset_id,
            "action_type": self.action_type,
            "target": dict(self.target),
            "status": self.status.value,
            "reason": self.reason,
            "timestamp": self.timestamp.isoformat(),
            "error": self.error.to_dict() if self.error is not None else None,
            "verification": dict(self.verification),
            "dry_run_info": (
                dict(self.dry_run_info) if self.dry_run_info is not None else None
            ),
        }


@dataclass(frozen=True)
class CancellationToken:
    """Cooperative cancellation token."""

    _cancelled: bool = False

    def cancel(self) -> None:
        """Mark the token as cancelled."""
        object.__setattr__(self, "_cancelled", True)

    def is_cancelled(self) -> bool:
        """Return whether cancellation has been requested."""
        return self._cancelled

    def raise_if_cancelled(self) -> None:
        """Raise if the token is cancelled."""
        if self._cancelled:
            raise ExecutionCancelledError("Execution was cancelled")


class ExecutionCancelledError(Exception):
    """Raised when an execution is cancelled."""

    pass


@dataclass(frozen=True)
class ExecutionRequest:
    """Immutable request to execute an ActionPlan."""

    plan: ActionPlan
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    mode: str = "dry_run"  # "dry_run" or "live"
    safety_gate: Optional[Any] = None
    execution_context: dict[str, dict[str, Any]] = field(default_factory=dict)
    context_provider: Optional[Callable[[Any], dict[str, Any]]] = None
    cancellation_token: Optional[CancellationToken] = None

    def __post_init__(self) -> None:
        """Normalize mutable defaults."""
        if not isinstance(object.__getattribute__(self, "execution_context"), dict):
            object.__setattr__(
                self,
                "execution_context",
                dict(object.__getattribute__(self, "execution_context")),
            )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "request_id": self.request_id,
            "plan_id": self.plan.to_dict().get("generated_at"),
            "mode": self.mode,
        }


@dataclass(frozen=True)
class ExecutionSummary:
    """Immutable summary of a batch execution."""

    execution_id: str
    request_id: str
    status: ExecutionStatus
    total: int
    completed: int
    failed: int
    rejected: int
    skipped: int
    requires_review: int
    cancelled: int
    dry_run: int
    results: tuple[ExecutionResult, ...]
    started_at: datetime
    completed_at: Optional[datetime]
    ledger: Any
    reason: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "execution_id": self.execution_id,
            "request_id": self.request_id,
            "status": self.status.value,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "rejected": self.rejected,
            "skipped": self.skipped,
            "requires_review": self.requires_review,
            "cancelled": self.cancelled,
            "dry_run": self.dry_run,
            "results": [r.to_dict() for r in self.results],
            "started_at": self.started_at.isoformat(),
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at is not None else None
            ),
            "ledger": self.ledger.to_dict() if self.ledger is not None else {},
            "reason": self.reason,
        }


@runtime_checkable
class Executor(Protocol):
    """Protocol for remediation execution engines."""

    def execute(self, request: ExecutionRequest) -> ExecutionSummary:
        """Execute the requested plan and return a structured summary."""
        ...
