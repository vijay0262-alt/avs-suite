"""
SC-8C4 Part 1 — Safe Remediation Execution Engine Foundation.

Dry-run-first execution engine that consumes ActionPlan and SafetyGate.
"""

from .backup import BackupManager, BackupRecord, RollbackResult
from .context import (
    BrowserContext,
    ExecutionContext,
    FilesystemContext,
    RegistryContext,
)
from .executor import DefaultExecutor, ExecutionCancelledError
from .filesystem_executor import FilesystemExecutor
from .ledger import ExecutionLedger, ExecutionRecord
from .models import (
    CancellationToken,
    ExecutionError,
    ExecutionRequest,
    ExecutionResult,
    ExecutionStatus,
    ExecutionSummary,
    Executor,
    TargetExecutorResult,
)
from .registry_backup import (
    RegistryBackup,
    RegistryBackupRecord,
    RegistryRestoreResult,
)
from .registry_executor import RegistryExecutor

__all__ = [
    "BackupManager",
    "BackupRecord",
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
    "FilesystemExecutor",
    "RegistryBackup",
    "RegistryBackupRecord",
    "RegistryContext",
    "RegistryExecutor",
    "RegistryRestoreResult",
    "RollbackResult",
    "TargetExecutorResult",
]
