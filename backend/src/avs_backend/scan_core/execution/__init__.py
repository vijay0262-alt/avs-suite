"""
SC-8C4 Part 1 — Safe Remediation Execution Engine Foundation.

Dry-run-first execution engine that consumes ActionPlan and SafetyGate.
"""

from .context import (
    BrowserContext,
    ExecutionContext,
    FilesystemContext,
    RegistryContext,
)
from .executor import DefaultExecutor, ExecutionCancelledError
from .ledger import ExecutionLedger, ExecutionRecord
from .models import (
    CancellationToken,
    ExecutionError,
    ExecutionRequest,
    ExecutionResult,
    ExecutionStatus,
    ExecutionSummary,
    Executor,
)

__all__ = [
    "BrowserContext",
    "CancellationToken",
    "DefaultExecutor",
    "ExecutionCancelledError",
    "ExecutionContext",
    "ExecutionError",
    "ExecutionLedger",
    "ExecutionRecord",
    "ExecutionRequest",
    "ExecutionResult",
    "ExecutionStatus",
    "ExecutionSummary",
    "Executor",
    "FilesystemContext",
    "RegistryContext",
]
