"""SC-8C5 orchestration models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Optional


@dataclass(frozen=True)
class ScanOrchestratorError:
    """Structured error from the scan orchestration layer."""

    phase: str
    component: str
    message: str
    category: str = "orchestration"
    recoverable: bool = False
    asset_id: Optional[str] = None
    rule_id: Optional[str] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "phase": self.phase,
            "component": self.component,
            "message": self.message,
            "category": self.category,
            "recoverable": self.recoverable,
            "asset_id": self.asset_id,
            "rule_id": self.rule_id,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass(frozen=True)
class ScanProgress:
    """Immutable progress snapshot for a running scan."""

    scan_id: str
    phase: str
    current_operation: str
    assets_discovered: int = 0
    assets_evaluated: int = 0
    findings: int = 0
    actions_available: int = 0
    elapsed_time_ms: int = 0
    is_cancelled: bool = False
    completion_percent: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "scan_id": self.scan_id,
            "phase": self.phase,
            "current_operation": self.current_operation,
            "assets_discovered": self.assets_discovered,
            "assets_evaluated": self.assets_evaluated,
            "findings": self.findings,
            "actions_available": self.actions_available,
            "elapsed_time_ms": self.elapsed_time_ms,
            "is_cancelled": self.is_cancelled,
            "completion_percent": self.completion_percent,
        }


@dataclass(frozen=True)
class ScanResult:
    """Immutable result of a completed scan."""

    scan_id: str
    scan_type: str
    started_at: datetime
    completed_at: datetime
    elapsed_time_ms: int
    statistics: dict[str, Any]
    findings: tuple[dict[str, Any], ...]
    aggregation_summary: dict[str, Any]
    priority_summary: dict[str, Any]
    actionability_summary: dict[str, Any]
    action_plan_id: Optional[str]
    errors: tuple[ScanOrchestratorError, ...] = ()
    warnings: tuple[str, ...] = ()
    cancelled: bool = False

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "scan_id": self.scan_id,
            "scan_type": self.scan_type,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat(),
            "elapsed_time_ms": self.elapsed_time_ms,
            "statistics": self.statistics,
            "findings_count": len(self.findings),
            "findings": list(self.findings),
            "aggregation_summary": self.aggregation_summary,
            "priority_summary": self.priority_summary,
            "actionability_summary": self.actionability_summary,
            "action_plan_id": self.action_plan_id,
            "errors": [e.to_dict() for e in self.errors],
            "warnings": list(self.warnings),
            "cancelled": self.cancelled,
        }
