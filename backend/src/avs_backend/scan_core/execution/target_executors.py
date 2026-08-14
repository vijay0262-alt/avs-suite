"""
SC-8C4 Part 1 — Non-filesystem target executor stubs.

These executors contain only safe/stub boundaries for future real execution.
No destructive operations are performed in this phase.
"""

from __future__ import annotations

from typing import Any

from .models import ExecutionStatus, TargetExecutorResult


class BaseTargetExecutor:
    """Base class for target-specific stub executors."""

    supported_action_types: tuple[str, ...] = ()

    @classmethod
    def can_execute(cls, action_type: str) -> bool:
        """Return True if this executor can handle the action type."""
        return action_type in cls.supported_action_types

    @classmethod
    def execute(
        cls,
        action: Any,
        context: dict[str, Any],
        **kwargs: Any,
    ) -> TargetExecutorResult:
        """Return a dry-run result describing what would happen."""
        target_dict = cls._target_to_dict(action.target)
        dry_run_info = {
            "operation": action.action_type.value,
            "target": target_dict,
            "context_snapshot": cls._redact_sensitive_context(context),
        }

        return TargetExecutorResult(
            status=ExecutionStatus.DRY_RUN,
            reason="Dry-run: no destructive operation performed",
            dry_run_info=dry_run_info,
            operation=action.action_type.value,
            before_state=context,
            after_state={"exists": False, "note": "would be removed"},
        )

    @classmethod
    def _target_to_dict(cls, target: Any) -> dict[str, Any]:
        """Serialize a target to a dictionary."""
        if hasattr(target, "to_dict") and callable(target.to_dict):
            return target.to_dict()
        return {}

    @classmethod
    def _redact_sensitive_context(cls, context: dict[str, Any]) -> dict[str, Any]:
        """Return a safe-to-log subset of the execution context."""
        allowed = {
            "exists",
            "accessible",
            "locked",
            "canonical_path",
            "asset_id",
            "size",
            "modified_time",
            "content_hash",
            "symlink",
            "junction",
            "reparse_point",
            "is_symlink",
            "is_junction",
            "is_reparse_point",
            "registry_hive",
            "registry_key_exists",
            "registry_value_exists",
            "running",
            "cache_type",
            "cache_scope",
            "safety_level",
        }
        return {k: v for k, v in context.items() if k in allowed}


class BrowserExecutor(BaseTargetExecutor):
    """Stub executor for browser cache actions."""

    supported_action_types = ("clear_browser_cache",)


class StartupExecutor(BaseTargetExecutor):
    """Stub executor for startup entry actions."""

    supported_action_types = ("disable_startup_entry",)


_TARGET_EXECUTORS = (
    BrowserExecutor,
    StartupExecutor,
)


def get_target_executor(action_type: str):
    """Return the appropriate executor class for an action type."""
    if action_type in ("delete_file", "delete_directory", "clear_cache"):
        from .filesystem_executor import FilesystemExecutor

        return FilesystemExecutor
    if action_type in ("remove_registry_value", "remove_registry_key"):
        from .registry_executor import RegistryExecutor

        return RegistryExecutor
    for executor in _TARGET_EXECUTORS:
        if executor.can_execute(action_type):
            return executor
    return None
