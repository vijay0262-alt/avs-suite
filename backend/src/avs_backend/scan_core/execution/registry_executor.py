"""
SC-8C4 Part 3 — Safe Windows Registry remediation executor.

Performs live removal of registry values and keys behind the SafetyGate.
Uses native `winreg` on Windows; dry-run works everywhere.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Any, Optional

from avs_backend.scan_core.rules.action_registry_validation import (
    RegistryValidationError,
    _contains_wow6432node,
    _strip_wow6432node,
    is_parent_key_deletion,
    is_protected_key,
    normalize_hive,
    normalize_key_path,
    normalize_registry_view,
    validate_registry_target,
)

from .models import ExecutionError, ExecutionStatus, TargetExecutorResult
from .registry_backup import RegistryBackup

if sys.platform == "win32":
    import winreg  # type: ignore[import]
else:
    winreg = None  # type: ignore


_REG_TYPE_NAMES: dict[int, str] = {}
if winreg is not None:
    _REG_TYPE_NAMES = {
        winreg.REG_SZ: "REG_SZ",
        winreg.REG_DWORD: "REG_DWORD",
        winreg.REG_QWORD: "REG_QWORD",
        winreg.REG_BINARY: "REG_BINARY",
        winreg.REG_MULTI_SZ: "REG_MULTI_SZ",
        winreg.REG_EXPAND_SZ: "REG_EXPAND_SZ",
        winreg.REG_NONE: "REG_NONE",
    }


class _RegistryExecutionError(Exception):
    """Internal exception used to report a registry operation failure."""

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
        raise _RegistryExecutionError("CANCELLED", "Operation cancelled")


def _hive_to_const(hive: str) -> Any:
    """Map canonical hive short name to a winreg constant."""
    if winreg is None:
        raise _RegistryExecutionError("NO_WINREG", "Windows registry not available")
    mapping = {
        "HKLM": winreg.HKEY_LOCAL_MACHINE,
        "HKCU": winreg.HKEY_CURRENT_USER,
        "HKCR": winreg.HKEY_CLASSES_ROOT,
        "HKU": winreg.HKEY_USERS,
        "HKCC": winreg.HKEY_CURRENT_CONFIG,
    }
    const = mapping.get(hive)
    if const is None:
        raise _RegistryExecutionError("INVALID_HIVE", f"Unrecognized hive: {hive}")
    return const


def _view_to_sam(view: str) -> int:
    """Map a normalized registry view string to a WOW64 access mask."""
    if winreg is None:
        return 0
    view_lower = view.lower()
    if view_lower in ("wow6432node", "wow32"):
        return winreg.KEY_WOW64_32KEY
    if view_lower in ("wow64", "64"):
        return winreg.KEY_WOW64_64KEY
    # "default" or any other value opens the platform default view.
    return 0


def _type_name(value_type: Optional[int]) -> Optional[str]:
    """Return a human-readable name for a winreg value type."""
    if value_type is None:
        return None
    return _REG_TYPE_NAMES.get(value_type, f"REG_{value_type}")


@dataclass(frozen=True)
class _LiveState:
    """Live registry state read immediately before an operation."""

    key_exists: bool
    value_exists: bool
    value_type: Optional[int]
    value_data: Any
    subkey_count: int
    value_count: int


def _read_registry_value(
    hive: str,
    key: str,
    value_name: Optional[str],
    view: str,
) -> _LiveState:
    """Re-read the current state of a registry target."""
    if winreg is None:
        return _LiveState(
            key_exists=False,
            value_exists=False,
            value_type=None,
            value_data=None,
            subkey_count=0,
            value_count=0,
        )

    sam = _view_to_sam(view)
    try:
        with winreg.OpenKey(
            _hive_to_const(hive), key, 0, winreg.KEY_READ | sam
        ) as handle:
            info = winreg.QueryInfoKey(handle)
            if value_name is None:
                return _LiveState(
                    key_exists=True,
                    value_exists=False,
                    value_type=None,
                    value_data=None,
                    subkey_count=info[0],
                    value_count=info[1],
                )
            try:
                data, vtype = winreg.QueryValueEx(handle, value_name)
                return _LiveState(
                    key_exists=True,
                    value_exists=True,
                    value_type=vtype,
                    value_data=data,
                    subkey_count=info[0],
                    value_count=info[1],
                )
            except FileNotFoundError:
                return _LiveState(
                    key_exists=True,
                    value_exists=False,
                    value_type=None,
                    value_data=None,
                    subkey_count=info[0],
                    value_count=info[1],
                )
    except FileNotFoundError:
        return _LiveState(
            key_exists=False,
            value_exists=False,
            value_type=None,
            value_data=None,
            subkey_count=0,
            value_count=0,
        )
    except OSError as exc:
        raise _RegistryExecutionError(
            "REGISTRY_ACCESS_ERROR",
            f"Could not read registry target: {exc}",
            {"hive": hive, "key": key, "value_name": value_name},
        )


class RegistryExecutor:
    """Real (live) or dry-run Windows Registry remediation executor."""

    supported_action_types = (
        "remove_registry_value",
        "remove_registry_key",
    )

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
        backup_manager: Any = None,
        registry_backup: Optional[RegistryBackup] = None,
        execution_id: str = "",
    ) -> TargetExecutorResult:
        """Execute a registry action."""
        if mode == "live" and not context.get("__safety_authorized"):
            return TargetExecutorResult(
                status=ExecutionStatus.REJECTED,
                reason="Direct target-executor live execution is not authorized",
                error=ExecutionError(
                    code="UNAUTHORIZED_DIRECT_EXECUTION",
                    message="Execution must go through the DefaultExecutor safety path",
                    details={"mode": mode},
                ),
            )
        try:
            return cls._execute(
                action,
                context,
                mode=mode,
                cancellation_token=cancellation_token,
                registry_backup=registry_backup,
                execution_id=execution_id,
            )
        except _RegistryExecutionError as exc:
            status = ExecutionStatus.FAILED
            if exc.code == "CANCELLED":
                status = ExecutionStatus.CANCELLED
            elif exc.code == "REJECTED":
                status = ExecutionStatus.REJECTED
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
                reason=f"Registry executor failure: {exc}",
                error=ExecutionError(
                    code="REGISTRY_EXCEPTION",
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
        registry_backup: Optional[RegistryBackup],
        execution_id: str,
    ) -> TargetExecutorResult:
        """Core registry execution logic."""
        _check_cancelled(cancellation_token)

        raw_hive = context.get("registry_hive", "")
        raw_key = context.get("registry_key", "")
        value_name = context.get("registry_value")
        view = context.get("registry_view", "default") or "default"
        operation = action.action_type.value

        # 1. Canonicalize and validate the target.
        try:
            canonical_hive = normalize_hive(raw_hive)
            canonical_key = normalize_key_path(raw_key)
            if any(part in (".", "..") for part in canonical_key.split("\\")):
                raise _RegistryExecutionError(
                    "REJECTED",
                    "Registry path contains traversal or relative component",
                    {"raw_key": raw_key},
                )

            # Parse the view from either the explicit view context or the key path.
            explicit_view = context.get("registry_view", "") or ""
            view = normalize_registry_view(explicit_view)
            if _contains_wow6432node(canonical_key):
                view = normalize_registry_view("wow6432node")
                canonical_key = _strip_wow6432node(canonical_key)

            validate_registry_target(
                canonical_hive, canonical_key, value_name, operation
            )
        except RegistryValidationError as exc:
            raise _RegistryExecutionError(
                "REJECTED",
                f"Registry target validation failed: {exc}",
                {"hive": raw_hive, "key": raw_key, "value_name": value_name},
            )

        _check_cancelled(cancellation_token)

        # 2. Re-read live state.
        live = _read_registry_value(canonical_hive, canonical_key, value_name, view)
        before_state = {
            "registry_hive": canonical_hive,
            "registry_key": canonical_key,
            "registry_value": value_name,
            "registry_view": view,
            "registry_key_exists": live.key_exists,
            "registry_value_exists": live.value_exists,
            "registry_value_type": _type_name(live.value_type),
            "registry_value_data": live.value_data,
            "asset_id": context.get("asset_id", action.asset_id),
        }

        # 4. Parent-key protection for live key deletion (before dry-run).
        if operation == "remove_registry_key":
            if is_parent_key_deletion(canonical_hive, canonical_key, None):
                raise _RegistryExecutionError(
                    "PROTECTED_PARENT_KEY",
                    "Key deletion would remove a protected parent key",
                )
            if is_protected_key(canonical_hive, canonical_key):
                raise _RegistryExecutionError(
                    "PROTECTED_KEY",
                    "Registry key is protected",
                )

        # 5. Dry-run returns complete plan without touching the registry.
        if mode != "live":
            after_key_exists = (
                live.key_exists if operation == "remove_registry_value" else False
            )
            return TargetExecutorResult(
                status=ExecutionStatus.DRY_RUN,
                reason="Dry-run: no registry modification performed",
                dry_run_info={
                    "operation": operation,
                    "hive": canonical_hive,
                    "view": view,
                    "key": canonical_key,
                    "value_name": value_name,
                    "key_exists": live.key_exists,
                    "value_exists": live.value_exists,
                    "value_type": _type_name(live.value_type),
                    "would_remove": live.key_exists,
                },
                before_state=before_state,
                after_state={
                    "registry_key_exists": after_key_exists,
                    "registry_value_exists": False,
                },
                operation=operation,
            )

        # 6. Verify live invariants for live execution.
        if not live.key_exists:
            raise _RegistryExecutionError(
                "TARGET_MISSING",
                "Registry key does not exist",
                {"hive": canonical_hive, "key": canonical_key},
            )

        if operation == "remove_registry_value" and not live.value_exists:
            raise _RegistryExecutionError(
                "TARGET_MISSING",
                "Registry value does not exist",
                {
                    "hive": canonical_hive,
                    "key": canonical_key,
                    "value_name": value_name,
                },
            )

        expected_type = context.get("registry_value_type")
        if expected_type is not None and _type_name(live.value_type) != str(
            expected_type
        ):
            raise _RegistryExecutionError(
                "VALUE_TYPE_MISMATCH",
                "Registry value type changed since snapshot",
                {
                    "expected": expected_type,
                    "actual": _type_name(live.value_type),
                },
            )

        expected_data = context.get("registry_value_data")
        if expected_data is not None and live.value_data != expected_data:
            raise _RegistryExecutionError(
                "VALUE_DATA_MISMATCH",
                "Registry value data changed since snapshot",
                {
                    "expected": repr(expected_data),
                    "actual": repr(live.value_data),
                },
            )

        expected_asset = context.get("asset_id")
        if expected_asset is not None and expected_asset != action.asset_id:
            raise _RegistryExecutionError(
                "IDENTITY_MISMATCH",
                "Asset identity does not match",
                {"expected_asset": expected_asset, "action_asset": action.asset_id},
            )

        if operation == "remove_registry_key" and (
            live.subkey_count > 0 or live.value_count > 0
        ):
            raise _RegistryExecutionError(
                "KEY_NOT_EMPTY",
                "Cannot delete a registry key that contains subkeys or values",
                {
                    "subkey_count": live.subkey_count,
                    "value_count": live.value_count,
                },
            )

        # 7. Live mode requires a registry backup manager.
        if winreg is None:
            raise _RegistryExecutionError(
                "NO_WINREG",
                "Windows registry APIs are not available on this platform",
            )
        if registry_backup is None:
            raise _RegistryExecutionError(
                "NO_REGISTRY_BACKUP",
                "A RegistryBackup is required for live registry execution",
            )

        _check_cancelled(cancellation_token)

        # 7. Create backup before modification.
        record = registry_backup.create_record(
            hive=canonical_hive,
            view=view,
            key=canonical_key,
            value_name=value_name,
            action=action,
            execution_id=execution_id,
            key_existed=live.key_exists,
            value_existed=live.value_exists,
            value_type=live.value_type,
            value_data=live.value_data,
        )
        if record is None:
            raise _RegistryExecutionError(
                "OVERSIZED_REGISTRY_BACKUP",
                "Registry value data exceeds the maximum safe backup size",
            )

        _check_cancelled(cancellation_token)

        # 9. Perform the live operation.
        try:
            if operation == "remove_registry_value":
                cls._delete_value(canonical_hive, canonical_key, value_name, view)
            elif operation == "remove_registry_key":
                cls._delete_key(canonical_hive, canonical_key, view)
            else:
                raise _RegistryExecutionError(
                    "UNSUPPORTED_OPERATION",
                    f"Unsupported registry operation: {operation}",
                )
        except _RegistryExecutionError:
            registry_backup.restore(record)
            raise

        # 10. Post-execution verification.
        _check_cancelled(cancellation_token)
        live_after = _read_registry_value(
            canonical_hive, canonical_key, value_name, view
        )
        if operation == "remove_registry_value" and live_after.value_exists:
            registry_backup.restore(record)
            raise _RegistryExecutionError(
                "POST_EXECUTION_VERIFICATION_FAILED",
                "Registry value still exists after deletion",
                {
                    "hive": canonical_hive,
                    "key": canonical_key,
                    "value_name": value_name,
                },
            )
        if operation == "remove_registry_key" and live_after.key_exists:
            registry_backup.restore(record)
            raise _RegistryExecutionError(
                "POST_EXECUTION_VERIFICATION_FAILED",
                "Registry key still exists after deletion",
                {
                    "hive": canonical_hive,
                    "key": canonical_key,
                },
            )

        after_state = {
            "registry_key_exists": live_after.key_exists,
            "registry_value_exists": live_after.value_exists,
        }

        return TargetExecutorResult(
            status=ExecutionStatus.COMPLETED,
            reason="Registry operation completed successfully",
            before_state=before_state,
            after_state=after_state,
            backup_identity=record.backup_id,
            backup_location=f"{canonical_hive}\\{canonical_key}",
            operation=operation,
        )

    @classmethod
    def _delete_value(
        cls,
        hive: str,
        key: str,
        value_name: Optional[str],
        view: str,
    ) -> None:
        """Delete a single registry value."""
        sam = _view_to_sam(view)
        try:
            with winreg.OpenKey(
                _hive_to_const(hive), key, 0, winreg.KEY_ALL_ACCESS | sam
            ) as handle:
                winreg.DeleteValue(handle, value_name or "")
        except PermissionError as exc:
            raise _RegistryExecutionError(
                "PERMISSION_DENIED",
                f"Could not delete registry value: {exc}",
                {"hive": hive, "key": key, "value_name": value_name},
            )
        except OSError as exc:
            raise _RegistryExecutionError(
                "DELETE_FAILED",
                f"Could not delete registry value: {exc}",
                {"hive": hive, "key": key, "value_name": value_name},
            )

    @classmethod
    def _delete_key(cls, hive: str, key: str, view: str) -> None:
        """Delete an empty registry key."""
        sam = _view_to_sam(view)
        parts = [p for p in key.split("\\") if p]
        if len(parts) < 1:
            raise _RegistryExecutionError("INVALID_KEY", "Cannot delete root key")
        if len(parts) == 1:
            raise _RegistryExecutionError(
                "PROTECTED_PARENT_KEY",
                "Refusing to delete a top-level hive key",
            )

        parent = "\\".join(parts[:-1])
        subkey = parts[-1]

        try:
            with winreg.OpenKey(
                _hive_to_const(hive), parent, 0, winreg.KEY_ALL_ACCESS | sam
            ) as handle:
                winreg.DeleteKey(handle, subkey)
        except PermissionError as exc:
            raise _RegistryExecutionError(
                "PERMISSION_DENIED",
                f"Could not delete registry key: {exc}",
                {"hive": hive, "key": key},
            )
        except OSError as exc:
            raise _RegistryExecutionError(
                "DELETE_FAILED",
                f"Could not delete registry key: {exc}",
                {"hive": hive, "key": key},
            )
