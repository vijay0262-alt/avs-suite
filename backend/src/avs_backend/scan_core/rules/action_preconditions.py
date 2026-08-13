"""
SC-8C3 Part 4 — Typed Precondition Models

Replaces purely descriptive string preconditions with typed,
machine-verifiable precondition models.

Each condition has deterministic evaluation semantics.
The Future Execution Engine must evaluate these before action.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Optional, Protocol, runtime_checkable

# ── Precondition Protocol ──────────────────────────────────────────────────────


@runtime_checkable
class Precondition(Protocol):
    """
    Protocol for typed preconditions.

    Each precondition must be evaluable by the Future Execution Engine.
    """

    def evaluate(self, context: dict[str, Any]) -> bool:
        """
        Evaluate precondition against execution context.

        Args:
            context: Execution context with current target state.

        Returns:
            True if precondition is satisfied.
        """
        ...

    def to_contract(self) -> str:
        """
        Serialize precondition to contract string.

        Returns:
            Machine-verifiable contract string.
        """
        ...


# ── Filesystem Preconditions ───────────────────────────────────────────────────


@dataclass(frozen=True)
class TargetExists:
    """Target must exist at execution time."""

    expected: bool = True

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("exists", False) == self.expected

    def to_contract(self) -> str:
        return f"target_exists:{self.expected}"


@dataclass(frozen=True)
class TargetAccessible:
    """Target must be accessible at execution time."""

    expected: bool = True

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("accessible", False) == self.expected

    def to_contract(self) -> str:
        return f"target_accessible:{self.expected}"


@dataclass(frozen=True)
class TargetNotLocked:
    """Target must not be locked at execution time."""

    expected: bool = True

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("locked", False) != self.expected

    def to_contract(self) -> str:
        return f"target_not_locked:{self.expected}"


@dataclass(frozen=True)
class TargetIdentityMatches:
    """Asset identity must match expected."""

    expected_asset_id: str = ""

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("asset_id", "") == self.expected_asset_id

    def to_contract(self) -> str:
        return f"identity_matches:{self.expected_asset_id}"


@dataclass(frozen=True)
class PathWithinAllowedScope:
    """Canonical path must be within allowed location."""

    allowed_location: str = ""
    canonical_path: str = ""

    def evaluate(self, context: dict[str, Any]) -> bool:
        actual_path = context.get("canonical_path", "")
        if not self.allowed_location or not actual_path:
            return False
        normalized_actual = _normalize_path(actual_path)
        normalized_allowed = _normalize_path(self.allowed_location)
        return (
            normalized_actual.startswith(normalized_allowed + "/")
            or normalized_actual == normalized_allowed
        )

    def to_contract(self) -> str:
        return f"inside_allowed_location:{self.allowed_location}"


@dataclass(frozen=True)
class SnapshotFresh:
    """Snapshot must not be stale."""

    max_age_seconds: int = 3600  # Default 1 hour

    def evaluate(self, context: dict[str, Any]) -> bool:
        snapshot_time = context.get("snapshot_timestamp")
        if snapshot_time is None:
            return False
        if isinstance(snapshot_time, datetime):
            age = (datetime.now(UTC) - snapshot_time).total_seconds()
            return age <= self.max_age_seconds
        return False

    def to_contract(self) -> str:
        return f"snapshot_fresh:{self.max_age_seconds}s"


@dataclass(frozen=True)
class SizeMatches:
    """File size must match expected."""

    expected_size: Optional[int] = None

    def evaluate(self, context: dict[str, Any]) -> bool:
        if self.expected_size is None:
            return True  # No size to verify
        actual_size = context.get("size")
        if actual_size is None:
            return False
        return actual_size == self.expected_size

    def to_contract(self) -> str:
        return f"size_matches:{self.expected_size}"


@dataclass(frozen=True)
class ModifiedTimeMatches:
    """File modified time must match expected."""

    expected_mtime: Optional[datetime] = None

    def evaluate(self, context: dict[str, Any]) -> bool:
        if self.expected_mtime is None:
            return True  # No mtime to verify
        actual_mtime = context.get("modified_time")
        if actual_mtime is None:
            return False
        if isinstance(actual_mtime, datetime):
            return actual_mtime == self.expected_mtime
        return False

    def to_contract(self) -> str:
        if self.expected_mtime is None:
            return "modified_time_matches:any"
        return f"modified_time_matches:{self.expected_mtime.isoformat()}"


@dataclass(frozen=True)
class HashMatches:
    """Content hash must match expected (when available)."""

    expected_hash: Optional[str] = None
    hash_algorithm: str = "sha256"

    def evaluate(self, context: dict[str, Any]) -> bool:
        if self.expected_hash is None:
            return True  # No hash to verify
        actual_hash = context.get("content_hash")
        if actual_hash is None:
            return False
        return actual_hash == self.expected_hash

    def to_contract(self) -> str:
        if self.expected_hash is None:
            return f"hash_matches:any:{self.hash_algorithm}"
        return f"hash_matches:{self.expected_hash}:{self.hash_algorithm}"


# ── Registry Preconditions ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class RegistryKeyExists:
    """Registry key must exist at execution time."""

    expected: bool = True

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("registry_key_exists", False) == self.expected

    def to_contract(self) -> str:
        return f"registry_key_exists:{self.expected}"


@dataclass(frozen=True)
class RegistryValueExists:
    """Registry value must exist at execution time."""

    expected: bool = True

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("registry_value_exists", False) == self.expected

    def to_contract(self) -> str:
        return f"registry_value_exists:{self.expected}"


@dataclass(frozen=True)
class RegistryHiveMatches:
    """Registry hive must match expected."""

    expected_hive: str = ""

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("registry_hive", "") == self.expected_hive

    def to_contract(self) -> str:
        return f"registry_hive_matches:{self.expected_hive}"


# ── Browser Preconditions ──────────────────────────────────────────────────────


@dataclass(frozen=True)
class BrowserNotRunning:
    """Browser must not be running at execution time."""

    browser: str = ""

    def evaluate(self, context: dict[str, Any]) -> bool:
        running_browsers = context.get("running_browsers", [])
        return self.browser.lower() not in [b.lower() for b in running_browsers]

    def to_contract(self) -> str:
        return f"browser_not_running:{self.browser}"


@dataclass(frozen=True)
class CacheScopeValid:
    """Target must be cache data, not user data."""

    cache_type: str = "cache"

    def evaluate(self, context: dict[str, Any]) -> bool:
        actual_type = context.get("cache_type", "")
        return actual_type == self.cache_type

    def to_contract(self) -> str:
        return f"cache_scope_valid:{self.cache_type}"


@dataclass(frozen=True)
class ProfileExists:
    """Browser profile must exist at execution time."""

    profile: str = ""

    def evaluate(self, context: dict[str, Any]) -> bool:
        existing_profiles = context.get("browser_profiles", [])
        return self.profile in existing_profiles

    def to_contract(self) -> str:
        return f"profile_exists:{self.profile}"


# ── Safety Preconditions ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class SafetyLevelValid:
    """Safety assessment must be valid for execution."""

    allowed_levels: tuple[str, ...] = ("safe", "low_risk")

    def evaluate(self, context: dict[str, Any]) -> bool:
        safety_level = context.get("safety_level", "")
        return safety_level in self.allowed_levels

    def to_contract(self) -> str:
        return f"safety_valid:{','.join(self.allowed_levels)}"


@dataclass(frozen=True)
class NotSymlink:
    """Target must not be a symlink."""

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("is_symlink", False) is False

    def to_contract(self) -> str:
        return "not_symlink:true"


@dataclass(frozen=True)
class NotJunction:
    """Target must not be a junction."""

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("is_junction", False) is False

    def to_contract(self) -> str:
        return "not_junction:true"


@dataclass(frozen=True)
class NotReparsePoint:
    """Target must not be a reparse point."""

    def evaluate(self, context: dict[str, Any]) -> bool:
        return context.get("is_reparse_point", False) is False

    def to_contract(self) -> str:
        return "not_reparse_point:true"


# ── Precondition Container ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class PreconditionSet:
    """
    Immutable set of typed preconditions.

    The Future Execution Engine must evaluate all preconditions
    before executing the action.
    """

    conditions: tuple[Precondition, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if isinstance(object.__getattribute__(self, "conditions"), list):
            object.__setattr__(self, "conditions", tuple(self.conditions))

    def __iter__(self):
        """Iterate over contract strings for backward compatibility."""
        return iter(c.to_contract() for c in self.conditions)

    def __len__(self) -> int:
        """Return number of conditions."""
        return len(self.conditions)

    def __getitem__(self, index: int) -> str:
        """Get contract string by index."""
        return self.conditions[index].to_contract()

    def evaluate(self, context: dict[str, Any]) -> tuple[bool, list[str]]:
        """
        Evaluate all preconditions against execution context.

        Args:
            context: Execution context with current target state.

        Returns:
            Tuple of (all_passed, failed_conditions).
        """
        failed: list[str] = []
        for condition in self.conditions:
            if not condition.evaluate(context):
                failed.append(condition.to_contract())
        return len(failed) == 0, failed

    def to_contract_strings(self) -> tuple[str, ...]:
        """Serialize all preconditions to contract strings."""
        return tuple(c.to_contract() for c in self.conditions)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "conditions": [c.to_contract() for c in self.conditions],
        }


# ── Precondition Builders ──────────────────────────────────────────────────────


def build_filesystem_preconditions(
    snapshot: Any,
    allowed_location: str = "",
) -> PreconditionSet:
    """
    Build standard filesystem preconditions.

    Args:
        snapshot: Asset snapshot with current state.
        allowed_location: Allowed location for path scope check.

    Returns:
        PreconditionSet with filesystem preconditions.
    """
    conditions: list[Precondition] = [
        TargetExists(expected=snapshot.exists),
        TargetAccessible(expected=snapshot.is_accessible),
        TargetNotLocked(expected=not snapshot.is_locked),
        TargetIdentityMatches(expected_asset_id=snapshot.asset_id),
        NotSymlink(),
        NotJunction(),
        NotReparsePoint(),
    ]

    if allowed_location:
        conditions.append(
            PathWithinAllowedScope(
                allowed_location=allowed_location,
                canonical_path=snapshot.canonical_path,
            )
        )

    return PreconditionSet(conditions=tuple(conditions))


def build_registry_preconditions(
    hive: str,
    key_path: str,
    value_name: Optional[str] = None,
) -> PreconditionSet:
    """
    Build standard registry preconditions.

    Args:
        hive: Canonical hive name.
        key_path: Normalized key path.
        value_name: Optional value name.

    Returns:
        PreconditionSet with registry preconditions.
    """
    conditions: list[Precondition] = [
        RegistryHiveMatches(expected_hive=hive),
        RegistryKeyExists(expected=True),
    ]

    if value_name is not None:
        conditions.append(RegistryValueExists(expected=True))

    return PreconditionSet(conditions=tuple(conditions))


def build_browser_preconditions(
    browser: str = "",
    profile: str = "",
    cache_type: str = "cache",
) -> PreconditionSet:
    """
    Build standard browser preconditions.

    Args:
        browser: Browser name.
        profile: Browser profile.
        cache_type: Expected cache type.

    Returns:
        PreconditionSet with browser preconditions.
    """
    conditions: list[Precondition] = [
        BrowserNotRunning(browser=browser),
        CacheScopeValid(cache_type=cache_type),
    ]

    if profile:
        conditions.append(ProfileExists(profile=profile))

    return PreconditionSet(conditions=tuple(conditions))


# ── Helpers ────────────────────────────────────────────────────────────────────


def _normalize_path(path: str) -> str:
    """Normalize path for comparison."""
    s = str(path).replace("\\", "/")
    while "//" in s:
        s = s.replace("//", "/")
    s = s.rstrip("/")
    if os.name == "nt":
        return s.lower()
    return s
