"""
SC-8C4 Part 5 — Safe Windows startup remediation executor.

Delegates registry startup entries to RegistryExecutor and startup-folder
items to FilesystemExecutor. Never removes protected, unknown, or running
startup items automatically.
"""

from __future__ import annotations

import os
import types
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from avs_backend.scan_core.rules.action import (
    ActionType,
    FilesystemActionTarget,
    RegistryActionTarget,
)

from .backup import BackupManager
from .filesystem_executor import FilesystemExecutor
from .models import ExecutionError, ExecutionStatus, TargetExecutorResult
from .registry_backup import RegistryBackup
from .registry_executor import (
    RegistryExecutor,
    _hive_to_const,
    _view_to_sam,
)
from .registry_executor import winreg as _winreg


@dataclass
class _StartupClassification:
    """Safety classification for a startup entry."""

    status: str
    reason: str
    details: dict[str, Any]


class _StartupExecutionError(Exception):
    """Internal exception used to report an unrecoverable startup failure."""

    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}


def _check_cancelled(token: Any) -> None:
    """Raise if a cancellation token is cancelled."""
    if token is not None and token.is_cancelled():
        raise _StartupExecutionError("CANCELLED", "Operation cancelled")


def _is_registry_entry(entry_id: str) -> bool:
    """Return True if the entry id is a registry path."""
    upper = entry_id.upper()
    prefixes = (
        "HKCU\\",
        "HKLM\\",
        "HKCR\\",
        "HKU\\",
        "HKCC\\",
        "HKEY_CURRENT_USER\\",
        "HKEY_LOCAL_MACHINE\\",
        "HKEY_CLASSES_ROOT\\",
        "HKEY_USERS\\",
        "HKEY_CURRENT_CONFIG\\",
    )
    return any(upper.startswith(prefix) for prefix in prefixes)


def _parse_registry_entry(entry_id: str) -> tuple[str, str, str, str]:
    """Return hive, key_path, value_name, view for a registry entry id."""
    view = "default"
    if "WOW6432Node" in entry_id.split("\\"):
        view = "wow6432node"
    parts = entry_id.split("\\")
    hive = parts[0] if parts else ""
    value_name = parts[-1] if len(parts) > 1 else ""
    key_path = "\\".join(parts[1:-1]) if len(parts) > 2 else ""
    return hive, key_path, value_name, view


def _classify_startup(context: dict[str, Any]) -> _StartupClassification:
    """Classify a startup entry as allowed, rejected, or requiring review."""
    publisher = (context.get("publisher") or "").lower()
    is_system = context.get("is_system", False)
    is_security = context.get("is_security", False)
    is_auto_fixable = context.get("is_auto_fixable", True)
    is_signed = context.get("is_signed", False)
    is_running = context.get("is_running", False)
    running_processes = context.get("running_processes", [])

    protected_tokens = (
        "microsoft",
        "windows",
        "windows defender",
        "antivirus",
        "endpoint",
        "firewall",
        "driver",
        "accessibility",
        "authentication",
        "enterprise",
        "system-critical",
        "security",
    )

    if is_system or is_security:
        return _StartupClassification(
            "REJECTED",
            "Protected or system-critical startup entry",
            {"reason": "system_or_security"},
        )

    if any(token in publisher for token in protected_tokens):
        return _StartupClassification(
            "REJECTED",
            "Protected publisher or component",
            {"publisher": publisher},
        )

    if not is_auto_fixable:
        return _StartupClassification(
            "REQUIRES_REVIEW",
            "Startup entry is not auto-fixable",
            {"auto_fixable": False},
        )

    if is_running or running_processes:
        return _StartupClassification(
            "REQUIRES_REVIEW",
            "Startup executable is currently running",
            {"running_processes": running_processes},
        )

    if not is_signed and (not publisher or publisher in ("unknown", "unverified")):
        return _StartupClassification(
            "REQUIRES_REVIEW",
            "Unknown or unsigned publisher",
            {"publisher": publisher, "signed": is_signed},
        )

    return _StartupClassification("ALLOWED", "Startup entry approved", {})


def _safety_decision_to_status(decision: str) -> ExecutionStatus:
    """Map a safety decision to an execution status."""
    if decision == "REJECTED":
        return ExecutionStatus.REJECTED
    if decision == "REQUIRES_REVIEW":
        return ExecutionStatus.REQUIRES_REVIEW
    return ExecutionStatus.DRY_RUN


class StartupExecutor:
    """Real (live) or dry-run startup remediation executor."""

    supported_action_types = ("disable_startup_entry", "remove_startup_entry")

    @classmethod
    def can_execute(cls, action_type: str) -> bool:
        """Return True if this executor can handle the action type."""
        return action_type in cls.supported_action_types

    @classmethod
    def execute(
        cls,
        action: Any,
        context: dict[str, Any],
        *,
        mode: str = "dry_run",
        cancellation_token: Any = None,
        backup_manager: Optional[BackupManager] = None,
        registry_backup: Optional[RegistryBackup] = None,
        execution_id: str = "",
    ) -> TargetExecutorResult:
        """Execute a startup remediation action."""
        try:
            return cls._execute(
                action,
                context,
                mode=mode,
                cancellation_token=cancellation_token,
                backup_manager=backup_manager,
                registry_backup=registry_backup,
                execution_id=execution_id,
            )
        except _StartupExecutionError as exc:
            status = ExecutionStatus.FAILED
            if exc.code == "CANCELLED":
                status = ExecutionStatus.CANCELLED
            elif exc.code == "REJECTED":
                status = ExecutionStatus.REJECTED
            elif exc.code == "REQUIRES_REVIEW":
                status = ExecutionStatus.REQUIRES_REVIEW
            return TargetExecutorResult(
                status=status,
                reason=exc.message,
                error=ExecutionError(
                    code=exc.code,
                    message=exc.message,
                    details=exc.details,
                ),
                before_state=context,
                after_state={},
                operation=action.action_type.value,
            )
        except Exception as exc:
            return TargetExecutorResult(
                status=ExecutionStatus.FAILED,
                reason=f"Startup executor failure: {exc}",
                error=ExecutionError(
                    code="STARTUP_EXCEPTION",
                    message=str(exc),
                    details={"exception_type": type(exc).__name__},
                ),
                before_state=context,
                after_state={},
                operation=action.action_type.value,
            )

    @classmethod
    def _execute(
        cls,
        action: Any,
        context: dict[str, Any],
        *,
        mode: str,
        cancellation_token: Any,
        backup_manager: Optional[BackupManager],
        registry_backup: Optional[RegistryBackup],
        execution_id: str,
    ) -> TargetExecutorResult:
        """Core startup execution logic."""
        _check_cancelled(cancellation_token)

        entry_id = context.get("entry_id", action.target.entry_id)
        source = context.get("source", "")
        if not source:
            source = "registry" if _is_registry_entry(entry_id) else "filesystem"

        operation = action.action_type.value

        # 1. Safety policy classification.
        classification = _classify_startup(context)
        if classification.status != "ALLOWED":
            status = _safety_decision_to_status(classification.status)
            return TargetExecutorResult(
                status=status,
                reason=classification.reason,
                error=ExecutionError(
                    code=classification.status,
                    message=classification.reason,
                    details=classification.details,
                ),
                dry_run_info={
                    "operation": operation,
                    "source": source,
                    "entry_id": entry_id,
                    "safety_decision": classification.status,
                    "would_change": False,
                    "publisher": context.get("publisher"),
                    "is_running": context.get("is_running"),
                },
                before_state=context,
                after_state={"removed_count": 0},
                operation=operation,
            )

        _check_cancelled(cancellation_token)

        # 2. Delegate to the appropriate real executor.
        if source == "registry":
            result = cls._execute_registry(
                action,
                context,
                entry_id=entry_id,
                mode=mode,
                cancellation_token=cancellation_token,
                registry_backup=registry_backup,
                execution_id=execution_id,
            )
        else:
            result = cls._execute_filesystem(
                action,
                context,
                entry_id=entry_id,
                mode=mode,
                cancellation_token=cancellation_token,
                backup_manager=backup_manager,
                execution_id=execution_id,
            )

        return cls._verify_and_wrap(
            result,
            action,
            context,
            source=source,
            entry_id=entry_id,
            mode=mode,
            registry_backup=registry_backup,
            backup_manager=backup_manager,
        )

    @classmethod
    def _execute_registry(
        cls,
        action: Any,
        context: dict[str, Any],
        *,
        entry_id: str,
        mode: str,
        cancellation_token: Any,
        registry_backup: Optional[RegistryBackup],
        execution_id: str,
    ) -> TargetExecutorResult:
        """Execute a registry startup entry removal using RegistryExecutor."""
        hive, key_path, value_name, view = _parse_registry_entry(entry_id)
        if not value_name:
            raise _StartupExecutionError(
                "REJECTED",
                "Startup registry target must be a value, not a parent key",
                {"entry_id": entry_id},
            )

        ctx_hive = context.get("registry_hive") or ""
        if ctx_hive and ctx_hive != hive:
            raise _StartupExecutionError(
                "REJECTED",
                "Registry hive mismatch",
                {"expected": ctx_hive, "actual": hive},
            )

        ctx_key = context.get("registry_key") or ""
        if ctx_key and ctx_key != key_path:
            raise _StartupExecutionError(
                "REJECTED",
                "Registry key mismatch",
                {"expected": ctx_key, "actual": key_path},
            )

        ctx_view = context.get("registry_view") or ""
        if ctx_view and ctx_view != view:
            raise _StartupExecutionError(
                "REJECTED",
                "Registry view mismatch",
                {"expected": ctx_view, "actual": view},
            )

        reg_value = context.get("registry_value") or value_name

        reg_target = RegistryActionTarget(
            asset_id=action.asset_id,
            hive=hive,
            key_path=key_path,
            value_name=reg_value,
            view=view,
            backup_required=True,
            rollback_supported=True,
        )
        reg_action = types.SimpleNamespace(
            action_id=action.action_id,
            action_type=ActionType.REMOVE_REGISTRY_VALUE,
            asset_id=action.asset_id,
            target=reg_target,
        )

        reg_context = {
            "registry_hive": ctx_hive or hive,
            "registry_key": ctx_key or key_path,
            "registry_value": reg_value,
            "registry_view": view,
            "registry_key_exists": context.get("exists", True),
            "registry_value_exists": True,
            "registry_value_type": context.get("registry_value_type", "REG_SZ"),
            "registry_value_data": context.get("registry_value_data", ""),
            "asset_id": action.asset_id,
            "safety_level": context.get("safety_level", "safe"),
        }

        if mode == "live" and registry_backup is None:
            return TargetExecutorResult(
                status=ExecutionStatus.FAILED,
                reason="Registry backup is required for live startup changes",
                error=ExecutionError(
                    code="NO_REGISTRY_BACKUP",
                    message="No RegistryBackup supplied",
                ),
                before_state=context,
                after_state={},
                operation=action.action_type.value,
            )

        result = RegistryExecutor.execute(
            reg_action,
            reg_context,
            mode=mode,
            cancellation_token=cancellation_token,
            backup_manager=None,
            registry_backup=registry_backup,
            execution_id=execution_id,
        )
        return cls._wrap_result(result, action)

    @classmethod
    def _execute_filesystem(
        cls,
        action: Any,
        context: dict[str, Any],
        *,
        entry_id: str,
        mode: str,
        cancellation_token: Any,
        backup_manager: Optional[BackupManager],
        execution_id: str,
    ) -> TargetExecutorResult:
        """Execute a startup-folder item removal using FilesystemExecutor."""
        if mode == "live" and backup_manager is None:
            return TargetExecutorResult(
                status=ExecutionStatus.FAILED,
                reason="Backup is required for live startup file changes",
                error=ExecutionError(
                    code="NO_BACKUP_MANAGER",
                    message="No BackupManager supplied",
                ),
                before_state=context,
                after_state={},
                operation=action.action_type.value,
            )

        allowed_location = context.get("allowed_location", str(Path(entry_id).parent))
        scope = getattr(action.target, "scope", "startup")
        fs_target = FilesystemActionTarget(
            asset_id=action.asset_id,
            canonical_path=entry_id,
            allowed_location=allowed_location,
            scope=scope,
            backup_required=True,
            rollback_supported=True,
        )
        fs_action = types.SimpleNamespace(
            action_id=action.action_id,
            action_type=ActionType.DELETE_FILE,
            asset_id=action.asset_id,
            target=fs_target,
        )

        result = FilesystemExecutor.execute(
            fs_action,
            context,
            mode=mode,
            cancellation_token=cancellation_token,
            backup_manager=backup_manager,
            execution_id=execution_id,
        )
        return cls._wrap_result(result, action)

    @classmethod
    def _wrap_result(
        cls, result: TargetExecutorResult, action: Any
    ) -> TargetExecutorResult:
        """Wrap a delegated result so the audit trail shows the startup op."""
        return TargetExecutorResult(
            status=result.status,
            reason=result.reason,
            error=result.error,
            dry_run_info=result.dry_run_info,
            before_state=result.before_state,
            after_state=result.after_state,
            backup_identity=result.backup_identity,
            backup_location=result.backup_location,
            operation=action.action_type.value,
        )

    @classmethod
    def _verify_and_wrap(
        cls,
        result: TargetExecutorResult,
        action: Any,
        context: dict[str, Any],
        *,
        source: str,
        entry_id: str,
        mode: str,
        registry_backup: Optional[RegistryBackup],
        backup_manager: Optional[BackupManager],
    ) -> TargetExecutorResult:
        """Post-execution verification for live startup remediation."""
        if result.status != ExecutionStatus.COMPLETED or mode != "live":
            return cls._wrap_result(result, action)

        if source == "registry":
            if not cls._verify_registry_value_removed(entry_id):
                if registry_backup is not None and result.backup_identity:
                    reg_record = registry_backup.get(result.backup_identity)
                    if reg_record is not None:
                        registry_backup.restore(reg_record)
                return TargetExecutorResult(
                    status=ExecutionStatus.FAILED,
                    reason=(
                        "Post-execution verification failed: "
                        "startup registry value still exists"
                    ),
                    error=ExecutionError(
                        code="POST_EXECUTION_VERIFICATION_FAILED",
                        message="Startup registry value still exists after removal",
                        details={"entry_id": entry_id},
                    ),
                    before_state=result.before_state,
                    after_state=result.after_state,
                    operation=action.action_type.value,
                )
        else:
            if os.path.lexists(entry_id):
                if backup_manager is not None and result.backup_identity:
                    fs_record = backup_manager.get(result.backup_identity)
                    if fs_record is not None:
                        backup_manager.restore(fs_record)
                return TargetExecutorResult(
                    status=ExecutionStatus.FAILED,
                    reason="Post-execution verification failed: startup file still exists",
                    error=ExecutionError(
                        code="POST_EXECUTION_VERIFICATION_FAILED",
                        message="Startup file still exists after removal",
                        details={"entry_id": entry_id},
                    ),
                    before_state=result.before_state,
                    after_state=result.after_state,
                    operation=action.action_type.value,
                )

        return cls._wrap_result(result, action)

    @classmethod
    def _verify_registry_value_removed(cls, entry_id: str) -> bool:
        """Re-read a registry startup entry and confirm it is gone."""
        if _winreg is None:
            # Non-Windows platforms cannot verify; rely on the delegated executor.
            return True
        try:
            hive, key_path, value_name, view = _parse_registry_entry(entry_id)
            sam = _view_to_sam(view)
            with _winreg.OpenKey(
                _hive_to_const(hive), key_path, 0, _winreg.KEY_READ | sam
            ) as key:
                if not value_name:
                    # remove_registry_key: the key itself is still openable.
                    return False
                _winreg.QueryValueEx(key, value_name)
                return False
        except (FileNotFoundError, OSError):
            return True
