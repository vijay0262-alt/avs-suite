"""
SC-8C4 Part 1 — Execution-time context models.

These dataclasses describe the live target state required by the
SafetyGate and typed preconditions at execution time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional


@dataclass(frozen=True)
class FilesystemContext:
    """Live filesystem target state."""

    exists: bool = False
    accessible: bool = False
    locked: bool = False
    canonical_path: str = ""
    asset_id: str = ""
    size: Optional[int] = None
    modified_time: Optional[datetime] = None
    content_hash: Optional[str] = None
    symlink: bool = False
    junction: bool = False
    reparse_point: bool = False
    safety_level: str = "safe"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "exists": self.exists,
            "accessible": self.accessible,
            "locked": self.locked,
            "canonical_path": self.canonical_path,
            "asset_id": self.asset_id,
            "size": self.size,
            "modified_time": self.modified_time,
            "content_hash": self.content_hash,
            "is_symlink": self.symlink,
            "is_junction": self.junction,
            "is_reparse_point": self.reparse_point,
            "safety_level": self.safety_level,
        }


@dataclass(frozen=True)
class RegistryContext:
    """Live registry target state."""

    hive: str = ""
    key: str = ""
    value: Optional[str] = None
    key_exists: bool = False
    value_exists: bool = False
    value_type: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "hive": self.hive,
            "key": self.key,
            "value": self.value,
            "key_exists": self.key_exists,
            "value_exists": self.value_exists,
            "value_type": self.value_type,
        }


@dataclass(frozen=True)
class BrowserContext:
    """Live browser target state."""

    browser: str = ""
    profile: str = ""
    running: bool = False
    cache_type: str = ""
    cache_scope: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "browser": self.browser,
            "profile": self.profile,
            "running": self.running,
            "cache_type": self.cache_type,
            "cache_scope": self.cache_scope,
        }


ExecutionContext = FilesystemContext | RegistryContext | BrowserContext | dict[str, Any]
"""Union type for execution contexts."""


def normalize_context(context: ExecutionContext) -> dict[str, Any]:
    """
    Convert an execution context model into a plain dictionary.

    Supports dicts (already raw) and the typed context dataclasses.
    """
    if isinstance(context, dict):
        return dict(context)
    if hasattr(context, "to_dict") and callable(context.to_dict):
        return context.to_dict()
    return {}


def default_filesystem_context(action_target: Any) -> FilesystemContext:
    """Return a best-effort default filesystem context for an action target."""
    canonical_path = ""
    asset_id = ""
    if hasattr(action_target, "canonical_path"):
        canonical_path = getattr(action_target, "canonical_path", "")
    if hasattr(action_target, "asset_id"):
        asset_id = getattr(action_target, "asset_id", "")

    return FilesystemContext(
        exists=True,
        accessible=True,
        locked=False,
        canonical_path=canonical_path,
        asset_id=asset_id,
        safety_level="safe",
    )


def default_registry_context(action_target: Any) -> RegistryContext:
    """Return a best-effort default registry context for an action target."""
    hive = ""
    key = ""
    value = None
    if hasattr(action_target, "hive"):
        hive = getattr(action_target, "hive", "")
    if hasattr(action_target, "key_path"):
        key = getattr(action_target, "key_path", "")
    if hasattr(action_target, "value_name"):
        value = getattr(action_target, "value_name", None)

    return RegistryContext(
        hive=hive,
        key=key,
        value=value,
        key_exists=True,
        value_exists=value is not None,
        value_type=None,
    )


def default_browser_context(action_target: Any) -> BrowserContext:
    """Return a best-effort default browser context for an action target."""
    browser = ""
    profile = ""
    cache_type = ""
    cache_scope = ""
    if hasattr(action_target, "browser"):
        browser = getattr(action_target, "browser", "")
    if hasattr(action_target, "profile"):
        profile = getattr(action_target, "profile", "")
    if hasattr(action_target, "cache_type"):
        cache_type = getattr(action_target, "cache_type", "")

    return BrowserContext(
        browser=browser,
        profile=profile,
        running=False,
        cache_type=cache_type,
        cache_scope=cache_scope,
    )


def default_context_for_action(action: Any) -> dict[str, Any]:
    """Return a default execution context for an action based on its target."""
    target = getattr(action, "target", None)
    if target is None:
        return {}

    action_type = getattr(action, "action_type", None)
    action_type_value = action_type.value if action_type is not None else ""

    if action_type_value in (
        "delete_file",
        "delete_directory",
        "clear_cache",
    ):
        return default_filesystem_context(target).to_dict()

    if action_type_value in (
        "remove_registry_value",
        "remove_registry_key",
    ):
        return default_registry_context(target).to_dict()

    if action_type_value == "clear_browser_cache":
        return default_browser_context(target).to_dict()

    return default_filesystem_context(target).to_dict()
