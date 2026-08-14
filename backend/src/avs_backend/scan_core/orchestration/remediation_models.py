"""SC-8C6 remediation coordinator models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Optional

from avs_backend.scan_core.execution.models import ExecutionSummary


@dataclass(frozen=True)
class RemediationPreview:
    """Non-mutating preview of a planned remediation."""

    request_id: str
    plan_id: str
    approval_token: str
    total_actions: int
    action_types: dict[str, int]
    affected_targets: tuple[dict[str, Any], ...]
    estimated_size: int
    safety_state_counts: dict[str, int]
    fixability_counts: dict[str, int]
    backup_required: bool
    rollback_supported: bool
    warnings: tuple[str, ...]
    is_stale: bool
    generated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "plan_id": self.plan_id,
            "total_actions": self.total_actions,
            "action_types": dict(self.action_types),
            "affected_targets_count": len(self.affected_targets),
            "estimated_size": self.estimated_size,
            "safety_state_counts": dict(self.safety_state_counts),
            "fixability_counts": dict(self.fixability_counts),
            "backup_required": self.backup_required,
            "rollback_supported": self.rollback_supported,
            "warnings": list(self.warnings),
            "is_stale": self.is_stale,
            "generated_at": self.generated_at.isoformat(),
        }


@dataclass(frozen=True)
class RemediationValidation:
    """Result of a dry-run validation of a plan."""

    valid: bool
    status: str
    total: int
    completed: int
    failed: int
    rejected: int
    requires_review: int
    dry_run: int
    warnings: tuple[str, ...]
    summary: Optional[ExecutionSummary] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "status": self.status,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "rejected": self.rejected,
            "requires_review": self.requires_review,
            "dry_run": self.dry_run,
            "warnings": list(self.warnings),
        }


@dataclass(frozen=True)
class RemediationExecutionStatus:
    """Immutable status snapshot for a remediation execution."""

    execution_id: str
    plan_id: str
    status: str
    total: int
    completed: int
    failed: int
    rejected: int
    skipped: int
    requires_review: int
    cancelled: int
    dry_run: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "plan_id": self.plan_id,
            "status": self.status,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "rejected": self.rejected,
            "skipped": self.skipped,
            "requires_review": self.requires_review,
            "cancelled": self.cancelled,
            "dry_run": self.dry_run,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "reason": self.reason,
        }


@dataclass(frozen=True)
class RollbackResult:
    """Result of a single rollback attempt."""

    action_id: str
    backup_identity: str
    success: bool
    reason: str
    restored_path: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "action_id": self.action_id,
            "backup_identity": self.backup_identity,
            "success": self.success,
            "reason": self.reason,
            "restored_path": self.restored_path,
        }


@dataclass(frozen=True)
class RollbackSummary:
    """Summary of a rollback operation."""

    execution_id: str
    total: int
    successful: int
    failed: int
    results: tuple[RollbackResult, ...] = ()
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        return {
            "execution_id": self.execution_id,
            "total": self.total,
            "successful": self.successful,
            "failed": self.failed,
            "results": [r.to_dict() for r in self.results],
            "timestamp": self.timestamp.isoformat(),
        }
