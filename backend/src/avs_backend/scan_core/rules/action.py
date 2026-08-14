"""
SC-8C3 Part 4 — Remediation Action Contract + Action Planning + Safety Hardening

Immutable domain contract for remediation actions with execution-readiness hardening.

Architecture:
  RuleResult
    ↓
  Aggregation (Part 1)
    ↓
  Priority/Fixability (Part 2)
    ↓
  [Action Planning Layer] (Part 3)
    ↓
  [Safety Gate Contract] (Part 4)
    ↓
  Future Executor

This layer:
- NEVER modifies system state
- NEVER executes cleanup or actions
- NEVER calls cleaners, optimizer, or Electron APIs
- ONLY reads PrioritizedResult and produces immutable action plans
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable, Optional, Protocol, runtime_checkable

from ..assets import AssetType
from .action_path_validation import is_path_safe_for_planning
from .action_preconditions import (
    BrowserNotRunning,
    CacheScopeValid,
    HashMatches,
    ModifiedTimeMatches,
    NotJunction,
    NotReparsePoint,
    NotSymlink,
    PathWithinAllowedScope,
    PreconditionSet,
    ProfileExists,
    RegistryHiveMatches,
    RegistryKeyExists,
    RegistryValueExists,
    SafetyLevelValid,
    SizeMatches,
    SnapshotFresh,
    TargetAccessible,
    TargetExists,
    TargetIdentityMatches,
    TargetNotLocked,
)
from .action_registry_validation import (
    RegistryValidationError,
    validate_registry_target,
)
from .aggregation import DetectionFinding
from .enums import RuleCategory
from .priority import FindingPriority, Fixability, PrioritizedResult, RuleCapability
from .safety_gate import SafetyGate, create_safety_gate

if TYPE_CHECKING:
    pass


# ── Type Aliases ──────────────────────────────────────────────────────────────


class _AssetSnapshot(Protocol):
    """Protocol describing the minimum asset state required for action planning."""

    exists: bool
    is_locked: bool
    is_accessible: bool
    canonical_path: str
    asset_id: str
    snapshot_timestamp: Optional[datetime] = None
    snapshot_version: Optional[str] = None
    content_hash: Optional[str] = None
    size: Optional[int] = None
    modified_time: Optional[datetime] = None


AssetSnapshotResolver = Callable[[str], Optional[_AssetSnapshot]]
"""
Resolve current asset snapshot from asset_id.

Returns None if asset cannot be resolved.
"""


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 datetime string or return None."""
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@runtime_checkable
class _AssetSnapshotProtocol(_AssetSnapshot, Protocol):
    pass


# ── Enumerations ──────────────────────────────────────────────────────────────


class ActionType(str, Enum):
    """
    Supported remediation action types.

    Only includes actions appropriate for existing AVS modules.
    Does NOT invent unsupported remediation behavior.
    """

    NONE = "none"
    DELETE_FILE = "delete_file"
    DELETE_DIRECTORY = "delete_directory"
    CLEAR_CACHE = "clear_cache"
    REMOVE_REGISTRY_VALUE = "remove_registry_value"
    REMOVE_REGISTRY_KEY = "remove_registry_key"
    DISABLE_STARTUP_ENTRY = "disable_startup_entry"
    CLEAR_BROWSER_CACHE = "clear_browser_cache"


class ActionState(str, Enum):
    """
    State of a planned action.
    """

    PLANNED = "planned"
    REVIEW_REQUIRED = "review_required"
    BLOCKED = "blocked"
    NOT_FIXABLE = "not_fixable"
    CONFLICT = "conflict"
    MISSING_TARGET = "missing_target"
    LOCKED_TARGET = "locked_target"


class ActionTargetType(str, Enum):
    """
    Type of action target.
    """

    FILESYSTEM = "filesystem"
    REGISTRY = "registry"
    BROWSER = "browser"
    STARTUP = "startup"


# ── Action Targets ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class FilesystemActionTarget:
    """
    Target for filesystem remediation actions.

    Must contain enough information to identify the target safely.
    Never relies on display_name alone.
    """

    asset_id: str
    canonical_path: str
    allowed_location: str
    scope: str
    target_type: ActionTargetType = ActionTargetType.FILESYSTEM
    backup_required: bool = False
    rollback_supported: bool = False
    backup_location: Optional[str] = None
    backup_identity: Optional[str] = None

    def target_identity(self) -> str:
        """Deterministic identity for deduplication."""
        action_type = getattr(self, "action_type", "unknown")
        return f"{self.asset_id}|{self.canonical_path}|{action_type}"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "target_type": self.target_type.value,
            "asset_id": self.asset_id,
            "canonical_path": self.canonical_path,
            "allowed_location": self.allowed_location,
            "scope": self.scope,
            "backup_required": self.backup_required,
            "rollback_supported": self.rollback_supported,
            "backup_location": self.backup_location,
            "backup_identity": self.backup_identity,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FilesystemActionTarget":
        """Deserialize from a dictionary."""
        return cls(
            asset_id=data.get("asset_id", ""),
            canonical_path=data.get("canonical_path", ""),
            allowed_location=data.get("allowed_location", ""),
            scope=data.get("scope", ""),
            target_type=ActionTargetType(data.get("target_type", "filesystem")),
            backup_required=data.get("backup_required", False),
            rollback_supported=data.get("rollback_supported", False),
            backup_location=data.get("backup_location"),
            backup_identity=data.get("backup_identity"),
        )


@dataclass(frozen=True)
class RegistryActionTarget:
    """
    Target for registry remediation actions.
    """

    asset_id: str
    hive: str
    key_path: str
    value_name: Optional[str] = None
    target_type: ActionTargetType = ActionTargetType.REGISTRY
    backup_required: bool = True
    rollback_supported: bool = True
    backup_location: Optional[str] = None
    backup_identity: Optional[str] = None
    view: str = "default"  # "default", "wow6432node", "wow6446node"

    def target_identity(self) -> str:
        """Deterministic identity for deduplication."""
        return f"{self.asset_id}|{self.hive}|{self.key_path}|{self.value_name or ''}|{self.view}"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "target_type": self.target_type.value,
            "asset_id": self.asset_id,
            "hive": self.hive,
            "key_path": self.key_path,
            "value_name": self.value_name,
            "backup_required": self.backup_required,
            "rollback_supported": self.rollback_supported,
            "backup_location": self.backup_location,
            "backup_identity": self.backup_identity,
            "view": self.view,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RegistryActionTarget":
        """Deserialize from a dictionary."""
        return cls(
            asset_id=data.get("asset_id", ""),
            hive=data.get("hive", ""),
            key_path=data.get("key_path", ""),
            value_name=data.get("value_name"),
            target_type=ActionTargetType(data.get("target_type", "registry")),
            backup_required=data.get("backup_required", True),
            rollback_supported=data.get("rollback_supported", True),
            backup_location=data.get("backup_location"),
            backup_identity=data.get("backup_identity"),
            view=data.get("view", "default"),
        )


@dataclass(frozen=True)
class BrowserActionTarget:
    """
    Target for browser remediation actions.
    """

    asset_id: str
    browser: str
    profile: str
    cache_type: str
    path: str
    target_type: ActionTargetType = ActionTargetType.BROWSER
    backup_required: bool = False
    rollback_supported: bool = False
    backup_location: Optional[str] = None
    backup_identity: Optional[str] = None
    user_data_safe: bool = True
    cache_only: bool = True

    def target_identity(self) -> str:
        """Deterministic identity for deduplication."""
        return f"{self.asset_id}|{self.browser}|{self.profile}|{self.cache_type}|{self.path}"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "target_type": self.target_type.value,
            "asset_id": self.asset_id,
            "browser": self.browser,
            "profile": self.profile,
            "cache_type": self.cache_type,
            "path": self.path,
            "backup_required": self.backup_required,
            "rollback_supported": self.rollback_supported,
            "backup_location": self.backup_location,
            "backup_identity": self.backup_identity,
            "user_data_safe": self.user_data_safe,
            "cache_only": self.cache_only,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BrowserActionTarget":
        """Deserialize from a dictionary."""
        return cls(
            asset_id=data.get("asset_id", ""),
            browser=data.get("browser", ""),
            profile=data.get("profile", ""),
            cache_type=data.get("cache_type", ""),
            path=data.get("path", ""),
            target_type=ActionTargetType(data.get("target_type", "browser")),
            backup_required=data.get("backup_required", False),
            rollback_supported=data.get("rollback_supported", False),
            backup_location=data.get("backup_location"),
            backup_identity=data.get("backup_identity"),
            user_data_safe=data.get("user_data_safe", True),
            cache_only=data.get("cache_only", True),
        )


@dataclass(frozen=True)
class StartupActionTarget:
    """
    Target for startup entry remediation actions.
    """

    asset_id: str
    entry_id: str
    scope: str
    target_type: ActionTargetType = ActionTargetType.STARTUP
    backup_required: bool = True
    rollback_supported: bool = True
    backup_location: Optional[str] = None
    backup_identity: Optional[str] = None

    def target_identity(self) -> str:
        """Deterministic identity for deduplication."""
        return f"{self.asset_id}|{self.entry_id}|{self.scope}"

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "target_type": self.target_type.value,
            "asset_id": self.asset_id,
            "entry_id": self.entry_id,
            "scope": self.scope,
            "backup_required": self.backup_required,
            "rollback_supported": self.rollback_supported,
            "backup_location": self.backup_location,
            "backup_identity": self.backup_identity,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "StartupActionTarget":
        """Deserialize from a dictionary."""
        return cls(
            asset_id=data.get("asset_id", ""),
            entry_id=data.get("entry_id", ""),
            scope=data.get("scope", ""),
            target_type=ActionTargetType(data.get("target_type", "startup")),
            backup_required=data.get("backup_required", True),
            rollback_supported=data.get("rollback_supported", True),
            backup_location=data.get("backup_location"),
            backup_identity=data.get("backup_identity"),
        )


class _NoTarget:
    """Placeholder target for non-actionable states."""

    target_type = ActionTargetType.FILESYSTEM
    asset_id = ""
    canonical_path = ""
    allowed_location = ""
    scope = ""
    backup_required = False
    rollback_supported = False
    backup_location = None  # type: ignore[assignment]
    backup_identity = None  # type: ignore[assignment]

    def target_identity(self) -> str:
        return ""

    def to_dict(self) -> dict[str, Any]:
        return {}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "_NoTarget":
        return cls()


ActionTarget = (
    FilesystemActionTarget
    | RegistryActionTarget
    | BrowserActionTarget
    | StartupActionTarget
    | _NoTarget
)


def _action_target_from_dict(data: dict[str, Any]) -> ActionTarget:
    """Dispatch to the correct ActionTarget from_dict implementation."""
    target_type = data.get("target_type", "")
    if target_type == ActionTargetType.REGISTRY.value:
        return RegistryActionTarget.from_dict(data)
    if target_type == ActionTargetType.BROWSER.value:
        return BrowserActionTarget.from_dict(data)
    if target_type == ActionTargetType.STARTUP.value:
        return StartupActionTarget.from_dict(data)
    if target_type == ActionTargetType.FILESYSTEM.value:
        return FilesystemActionTarget.from_dict(data)
    return _NoTarget.from_dict(data)


# ── Action Model ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class RemediationAction:
    """
    Immutable description of a single remediation action.

    Describes WHAT would be done, never performs it.
    """

    action_id: str
    action_type: ActionType
    state: ActionState
    target: ActionTarget
    finding_id: str
    rule_id: str
    rule_version: str
    asset_id: str
    priority_score: float
    fixability: Fixability
    is_blocked: bool
    requires_review: bool
    is_actionable: bool
    is_auto_fixable: bool
    is_fixable: bool
    rule_capability: RuleCapability
    preconditions: PreconditionSet
    safety_assessment: str
    reason: str
    estimated_size: Optional[int]
    backup_required: bool
    rollback_supported: bool
    backup_location: Optional[str]
    backup_identity: Optional[str]
    computed_at: datetime
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "action_id": self.action_id,
            "action_type": self.action_type.value,
            "state": self.state.value,
            "target": self.target.to_dict(),
            "finding_id": self.finding_id,
            "rule_id": self.rule_id,
            "rule_version": self.rule_version,
            "asset_id": self.asset_id,
            "priority_score": self.priority_score,
            "fixability": self.fixability.value,
            "is_blocked": self.is_blocked,
            "requires_review": self.requires_review,
            "is_actionable": self.is_actionable,
            "is_auto_fixable": self.is_auto_fixable,
            "is_fixable": self.is_fixable,
            "rule_capability": self.rule_capability.value,
            "preconditions": list(self.preconditions),
            "safety_assessment": self.safety_assessment,
            "reason": self.reason,
            "estimated_size": self.estimated_size,
            "backup_required": self.backup_required,
            "rollback_supported": self.rollback_supported,
            "backup_location": self.backup_location,
            "backup_identity": self.backup_identity,
            "computed_at": self.computed_at.isoformat(),
            "metadata": dict(self.metadata),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RemediationAction":
        """Deserialize a RemediationAction from a dictionary."""
        target = _action_target_from_dict(data.get("target", {}))
        preconditions = PreconditionSet.from_dict(
            {"conditions": data.get("preconditions", [])}
        )
        return cls(
            action_id=data.get("action_id", ""),
            action_type=ActionType(data.get("action_type", "none")),
            state=ActionState(data.get("state", "not_fixable")),
            target=target,
            finding_id=data.get("finding_id", ""),
            rule_id=data.get("rule_id", ""),
            rule_version=data.get("rule_version", ""),
            asset_id=data.get("asset_id", ""),
            priority_score=float(data.get("priority_score", 0.0)),
            fixability=Fixability(data.get("fixability", "unknown")),
            is_blocked=bool(data.get("is_blocked", False)),
            requires_review=bool(data.get("requires_review", False)),
            is_actionable=bool(data.get("is_actionable", False)),
            is_auto_fixable=bool(data.get("is_auto_fixable", False)),
            is_fixable=bool(data.get("is_fixable", False)),
            rule_capability=RuleCapability(data.get("rule_capability", "unavailable")),
            preconditions=preconditions,
            safety_assessment=data.get("safety_assessment", ""),
            reason=data.get("reason", ""),
            estimated_size=data.get("estimated_size"),
            backup_required=bool(data.get("backup_required", False)),
            rollback_supported=bool(data.get("rollback_supported", False)),
            backup_location=data.get("backup_location"),
            backup_identity=data.get("backup_identity"),
            computed_at=_parse_iso_datetime(data["computed_at"]) or datetime.now(UTC),
            metadata=dict(data.get("metadata", {})),
        )


# ── Action Plan ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ActionPlan:
    """
    Complete plan of remediation actions derived from prioritized findings.

    Contains all planned actions and summary statistics.
    """

    actions: tuple[RemediationAction, ...]
    summary: "ActionSummary"
    generated_at: datetime
    snapshot_timestamp: Optional[datetime] = None
    snapshot_version: Optional[str] = None
    snapshot_ttl_seconds: int = 3600
    plan_id: Optional[str] = field(default_factory=lambda: str(uuid.uuid4()))

    def __post_init__(self) -> None:
        """Ensure collections are tuples."""
        if isinstance(object.__getattribute__(self, "actions"), list):
            object.__setattr__(self, "actions", tuple(self.actions))

    def is_stale(self) -> bool:
        """
        Check if the action plan has expired.

        Returns:
            True if plan is older than snapshot_ttl_seconds.
        """
        reference = self.snapshot_timestamp or self.generated_at
        if reference is None:
            return False
        age = (datetime.now(UTC) - reference).total_seconds()
        return age > self.snapshot_ttl_seconds

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "actions": [a.to_dict() for a in self.actions],
            "summary": self.summary.to_dict(),
            "generated_at": self.generated_at.isoformat(),
            "snapshot_timestamp": (
                self.snapshot_timestamp.isoformat()
                if self.snapshot_timestamp is not None
                else None
            ),
            "snapshot_version": self.snapshot_version,
            "snapshot_ttl_seconds": self.snapshot_ttl_seconds,
            "is_stale": self.is_stale(),
            "plan_id": self.plan_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ActionPlan":
        """Deserialize an ActionPlan from a dictionary."""
        actions = tuple(RemediationAction.from_dict(a) for a in data.get("actions", []))
        summary = ActionSummary.from_dict(data.get("summary", {}))
        generated_at = _parse_iso_datetime(data["generated_at"])
        assert generated_at is not None, "ActionPlan generated_at is required"
        snapshot_timestamp = _parse_iso_datetime(data.get("snapshot_timestamp"))
        return cls(
            actions=actions,
            summary=summary,
            generated_at=generated_at,
            snapshot_timestamp=snapshot_timestamp,
            snapshot_version=data.get("snapshot_version"),
            snapshot_ttl_seconds=data.get("snapshot_ttl_seconds", 3600),
            plan_id=data.get("plan_id"),
        )


# ── Action Summary ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ActionSummary:
    """
    Summary statistics derived from actual actions.

    All values are computed from the underlying actions.
    No statistics are fabricated.
    """

    total_findings: int
    actions_planned: int
    auto_fixable_actions: int
    review_required_actions: int
    blocked_actions: int
    not_fixable_actions: int
    unknown_fixability_actions: int
    actions_by_type: dict[str, int]
    estimated_affected_size: Optional[int]
    highest_priority_action_id: Optional[str]
    highest_severity_action_id: Optional[str]
    largest_affected_action_id: Optional[str]
    generated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "total_findings": self.total_findings,
            "actions_planned": self.actions_planned,
            "auto_fixable_actions": self.auto_fixable_actions,
            "review_required_actions": self.review_required_actions,
            "blocked_actions": self.blocked_actions,
            "not_fixable_actions": self.not_fixable_actions,
            "unknown_fixability_actions": self.unknown_fixability_actions,
            "actions_by_type": dict(self.actions_by_type),
            "estimated_affected_size": self.estimated_affected_size,
            "highest_priority_action_id": self.highest_priority_action_id,
            "highest_severity_action_id": self.highest_severity_action_id,
            "largest_affected_action_id": self.largest_affected_action_id,
            "generated_at": self.generated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ActionSummary":
        """Deserialize an ActionSummary from a dictionary."""
        generated_at = _parse_iso_datetime(data["generated_at"])
        assert generated_at is not None, "ActionSummary generated_at is required"
        return cls(
            total_findings=data.get("total_findings", 0),
            actions_planned=data.get("actions_planned", 0),
            auto_fixable_actions=data.get("auto_fixable_actions", 0),
            review_required_actions=data.get("review_required_actions", 0),
            blocked_actions=data.get("blocked_actions", 0),
            not_fixable_actions=data.get("not_fixable_actions", 0),
            unknown_fixability_actions=data.get("unknown_fixability_actions", 0),
            actions_by_type=dict(data.get("actions_by_type", {})),
            estimated_affected_size=data.get("estimated_affected_size"),
            highest_priority_action_id=data.get("highest_priority_action_id"),
            highest_severity_action_id=data.get("highest_severity_action_id"),
            largest_affected_action_id=data.get("largest_affected_action_id"),
            generated_at=generated_at,
        )


# ── Action Planner ────────────────────────────────────────────────────────────


class ActionPlanner:
    """
    Plans remediation actions from prioritized findings.

    Guarantees:
    - Deterministic action IDs
    - Safety-first gating (never overrides SafetyAssessment)
    - Immutability (all output objects are frozen/read-only)
    - Zero system modification
    - Path validation (FORBIDDEN_ROOTS, traversal, symlinks, junctions, reparse points)
    - Registry target validation (hive allowlist, protected keys, parent-key protection)
    - Typed preconditions (machine-verifiable contracts)
    - Snapshot freshness tracking

    Does NOT:
    - Modify system state
    - Execute cleanup or actions
    - Call cleaners, optimizer, or Electron APIs
    """

    def __init__(
        self,
        asset_snapshot_resolver: Optional[AssetSnapshotResolver] = None,
        strategy_version: str = "1.0.0",
        safety_gate: Optional[SafetyGate] = None,
        snapshot_ttl_seconds: int = 3600,
    ) -> None:
        """
        Initialize action planner.

        Args:
            asset_snapshot_resolver: Optional callable to resolve asset
                snapshot state from asset_id. Required for accurate
                missing/locked/inaccessible detection.
            strategy_version: Version string for deterministic action IDs.
            safety_gate: Optional SafetyGate implementation. If provided,
                used to validate planned actions independently.
            snapshot_ttl_seconds: Maximum age of snapshot in seconds.
        """
        self._asset_snapshot_resolver = asset_snapshot_resolver
        self._strategy_version = strategy_version
        self._safety_gate = safety_gate or create_safety_gate(
            snapshot_ttl_seconds=snapshot_ttl_seconds
        )
        self._snapshot_ttl_seconds = snapshot_ttl_seconds

    def plan(self, result: PrioritizedResult) -> ActionPlan:
        """
        Plan actions from prioritized findings.

        Args:
            result: PrioritizedResult from FindingPrioritizer.

        Returns:
            ActionPlan with planned actions and summary.
        """
        actions_list: list[RemediationAction] = []

        for priority in result.priorities:
            action = self._plan_action(priority)
            if action is not None:
                actions_list.append(action)

        # Deduplicate and handle conflicts
        deduped_actions = self._deduplicate_and_resolve_conflicts(actions_list)

        # Sort deterministically
        deduped_actions.sort(key=self._action_sort_key)
        actions_tuple = tuple(deduped_actions)

        # Build summary
        summary = self._build_action_summary(result, actions_tuple)

        # Capture snapshot timestamp for freshness tracking
        snapshot_timestamp = None
        snapshot_version = None
        for priority in result.priorities:
            snapshot = self._resolve_asset_snapshot(priority.finding.asset_id)
            if (
                snapshot is not None
                and getattr(snapshot, "snapshot_timestamp", None) is not None
            ):
                snapshot_timestamp = snapshot.snapshot_timestamp
                snapshot_version = getattr(snapshot, "snapshot_version", None)
                break

        return ActionPlan(
            actions=actions_tuple,
            summary=summary,
            generated_at=datetime.now(UTC),
            snapshot_timestamp=snapshot_timestamp,
            snapshot_version=snapshot_version,
            snapshot_ttl_seconds=self._snapshot_ttl_seconds,
        )

    def _plan_action(self, priority: FindingPriority) -> Optional[RemediationAction]:
        """
        Plan a single action from a finding priority.

        Returns None if the finding cannot produce an action.
        """
        finding = priority.finding

        # Safety gate
        if priority.is_blocked:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.BLOCKED,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Action blocked by safety assessment",
            )

        if (
            not priority.is_actionable
            and priority.fixability != Fixability.REVIEW_REQUIRED
        ):
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.NOT_FIXABLE,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Finding is not actionable",
            )

        if priority.fixability == Fixability.UNKNOWN:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.NOT_FIXABLE,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Fixability is unknown",
            )

        if priority.fixability == Fixability.REVIEW_REQUIRED:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.REVIEW_REQUIRED,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Action requires human review",
            )

        if priority.rule_capability != RuleCapability.REMEDIATION_AVAILABLE:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.NOT_FIXABLE,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Rule has no remediation capability",
            )

        # Asset snapshot validation
        snapshot = self._resolve_asset_snapshot(finding.asset_id)
        if snapshot is None:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.MISSING_TARGET,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Asset snapshot missing",
            )

        if not snapshot.exists:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.MISSING_TARGET,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Asset snapshot does not exist",
            )

        if not snapshot.is_accessible:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.LOCKED_TARGET,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Target is inaccessible",
            )

        if snapshot.is_locked:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.LOCKED_TARGET,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Target is locked",
            )

        # Determine action type from finding category and asset type
        action_type = self._infer_action_type(finding)
        if action_type is None:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.NOT_FIXABLE,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="No supported action type for this finding",
            )

        # Build target with validation
        target = self._build_target(finding, action_type, snapshot)
        if target is None:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.NOT_FIXABLE,
                target=self._make_no_target(),
                preconditions=PreconditionSet(conditions=()),
                reason="Could not construct action target",
            )

        # Build typed preconditions
        preconditions = self._build_preconditions(finding, target, snapshot)

        return self._make_action(
            priority=priority,
            action_type=action_type,
            state=ActionState.PLANNED,
            target=target,
            preconditions=preconditions,
            reason=f"Planned {action_type.value} for {finding.finding_id}",
        )

    def _make_action(
        self,
        priority: FindingPriority,
        action_type: ActionType,
        state: ActionState,
        target: ActionTarget,
        preconditions: PreconditionSet,
        reason: str,
    ) -> RemediationAction:
        """Create a RemediationAction with deterministic ID."""
        action_id = self._build_action_id(priority.finding, action_type, state)

        return RemediationAction(
            action_id=action_id,
            action_type=action_type,
            state=state,
            target=target,
            finding_id=priority.finding.finding_id,
            rule_id=priority.finding.rule_id,
            rule_version=priority.finding.rule_version,
            asset_id=priority.finding.asset_id,
            priority_score=priority.priority_score,
            fixability=priority.fixability,
            is_blocked=priority.is_blocked,
            requires_review=priority.requires_review,
            is_actionable=priority.is_actionable,
            is_auto_fixable=priority.is_auto_fixable,
            is_fixable=priority.is_fixable,
            rule_capability=priority.rule_capability,
            preconditions=preconditions,
            safety_assessment=priority.finding.safety.level.value,
            reason=reason,
            estimated_size=priority.finding.estimated_size,
            backup_required=target.backup_required if target else False,
            rollback_supported=target.rollback_supported if target else False,
            backup_location=target.backup_location if target else None,
            backup_identity=target.backup_identity if target else None,
            computed_at=datetime.now(UTC),
        )

    def _build_action_id(
        self, finding: DetectionFinding, action_type: ActionType, state: ActionState
    ) -> str:
        """
        Build deterministic action identity.

        Format: finding_id|action_type|state|strategy_version
        """
        raw = f"{finding.finding_id}|{action_type.value}|{state.value}|{self._strategy_version}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def _make_no_target(self) -> ActionTarget:
        """Create a no-op target for non-actionable states."""
        return _NoTarget()  # type: ignore[return-value]

    def _infer_action_type(self, finding: DetectionFinding) -> Optional[ActionType]:
        """
        Infer the appropriate action type from finding properties.
        """
        category = finding.rule_category
        asset_type = finding.asset_type

        if category == RuleCategory.JUNK or category == RuleCategory.TEMPORARY:
            if asset_type == AssetType.DIRECTORY:
                return ActionType.DELETE_DIRECTORY
            return ActionType.DELETE_FILE

        if category == RuleCategory.CACHE:
            return ActionType.CLEAR_CACHE

        if category == RuleCategory.REGISTRY:
            if asset_type == AssetType.REGISTRY_VALUE:
                return ActionType.REMOVE_REGISTRY_VALUE
            if asset_type == AssetType.REGISTRY_KEY:
                return ActionType.REMOVE_REGISTRY_KEY

        if category == RuleCategory.STARTUP:
            return ActionType.DISABLE_STARTUP_ENTRY

        if category == RuleCategory.BROWSER:
            return ActionType.CLEAR_BROWSER_CACHE

        return None

    def _build_target(
        self,
        finding: DetectionFinding,
        action_type: ActionType,
        snapshot: _AssetSnapshot,
    ) -> Optional[ActionTarget]:
        """
        Build appropriate target for the action type with validation.
        """
        if action_type in (
            ActionType.DELETE_FILE,
            ActionType.DELETE_DIRECTORY,
            ActionType.CLEAR_CACHE,
        ):
            # Validate path safety
            if not is_path_safe_for_planning(snapshot.canonical_path):
                return None

            return FilesystemActionTarget(
                asset_id=finding.asset_id,
                canonical_path=snapshot.canonical_path,
                allowed_location=self._extract_allowed_location(finding),
                scope=self._determine_scope(finding),
                backup_required=action_type == ActionType.DELETE_FILE,
                rollback_supported=action_type == ActionType.DELETE_FILE,
            )

        if action_type in (
            ActionType.REMOVE_REGISTRY_VALUE,
            ActionType.REMOVE_REGISTRY_KEY,
        ):
            hive = self._extract_hive(finding)
            key_path = self._extract_registry_key(finding)
            value_name = (
                self._extract_registry_value(finding)
                if action_type == ActionType.REMOVE_REGISTRY_VALUE
                else None
            )

            # Validate registry target safety
            try:
                validate_registry_target(hive, key_path, value_name, action_type.value)
            except RegistryValidationError:
                return None

            # Determine view (WOW6432Node awareness)
            view = "default"
            if "WOW6432Node" in key_path.split("\\"):
                view = "wow6432node"

            return RegistryActionTarget(
                asset_id=finding.asset_id,
                hive=hive,
                key_path=key_path,
                value_name=value_name,
                view=view,
            )

        if action_type == ActionType.DISABLE_STARTUP_ENTRY:
            return StartupActionTarget(
                asset_id=finding.asset_id,
                entry_id=self._extract_startup_entry_id(finding),
                scope=self._determine_scope(finding),
            )

        if action_type == ActionType.CLEAR_BROWSER_CACHE:
            # Browser safety contracts
            browser = self._extract_browser(finding)
            profile = self._extract_browser_profile(finding)
            cache_type = self._determine_browser_cache_type(finding)

            # Only allow cache-type targets
            if cache_type not in ("cache",):
                return None

            return BrowserActionTarget(
                asset_id=finding.asset_id,
                browser=browser,
                profile=profile,
                cache_type=cache_type,
                path=snapshot.canonical_path,
                user_data_safe=True,
                cache_only=True,
            )

        return None

    def _build_preconditions(
        self, finding: DetectionFinding, target: ActionTarget, snapshot: _AssetSnapshot
    ) -> PreconditionSet:
        """
        Build typed preconditions for an action.
        """
        conditions: list[Any] = [
            TargetExists(expected=snapshot.exists),
            TargetAccessible(expected=snapshot.is_accessible),
            TargetNotLocked(expected=not snapshot.is_locked),
            TargetIdentityMatches(expected_asset_id=snapshot.asset_id),
            NotSymlink(),
            NotJunction(),
            NotReparsePoint(),
            SafetyLevelValid(allowed_levels=("safe", "low_risk")),
        ]

        # Snapshot freshness
        if getattr(snapshot, "snapshot_timestamp", None) is not None:
            conditions.append(SnapshotFresh(max_age_seconds=self._snapshot_ttl_seconds))

        # Size verification
        if getattr(snapshot, "size", None) is not None:
            conditions.append(SizeMatches(expected_size=snapshot.size))

        # Modified time verification
        if getattr(snapshot, "modified_time", None) is not None:
            conditions.append(
                ModifiedTimeMatches(expected_mtime=snapshot.modified_time)
            )

        # Hash verification (content_hash takes precedence over content_fingerprint)
        observed_hash = getattr(snapshot, "content_hash", None) or getattr(
            snapshot, "content_fingerprint", None
        )
        if observed_hash is not None:
            conditions.append(HashMatches(expected_hash=observed_hash))

        # Target-specific preconditions
        if hasattr(target, "allowed_location") and target.allowed_location:
            conditions.append(
                PathWithinAllowedScope(
                    allowed_location=target.allowed_location,
                    canonical_path=snapshot.canonical_path,
                )
            )

        if isinstance(target, RegistryActionTarget):
            conditions.append(RegistryHiveMatches(expected_hive=target.hive))
            conditions.append(RegistryKeyExists(expected=True))
            if target.value_name is not None:
                conditions.append(RegistryValueExists(expected=True))

        if isinstance(target, BrowserActionTarget):
            conditions.append(BrowserNotRunning(browser=target.browser))
            conditions.append(ProfileExists(profile=target.profile))
            conditions.append(CacheScopeValid(cache_type=target.cache_type))

        return PreconditionSet(conditions=tuple(conditions))

    def _resolve_asset_snapshot(self, asset_id: str) -> Optional[_AssetSnapshot]:
        """
        Resolve asset snapshot.

        Falls back to None if no resolver configured or resolution fails.
        """
        if self._asset_snapshot_resolver is not None:
            try:
                return self._asset_snapshot_resolver(asset_id)
            except Exception:
                pass
        return None

    def _extract_allowed_location(self, finding: DetectionFinding) -> str:
        """Extract allowed location from finding."""
        if finding.canonical_path:
            return finding.canonical_path
        return finding.asset_id

    def _determine_scope(self, finding: DetectionFinding) -> str:
        """Determine scope of action."""
        category_scope = {
            RuleCategory.JUNK: "user_junk",
            RuleCategory.TEMPORARY: "user_temp",
            RuleCategory.CACHE: "user_cache",
            RuleCategory.STARTUP: "startup",
            RuleCategory.BROWSER: "browser",
        }
        return category_scope.get(finding.rule_category, "unknown")

    def _extract_hive(self, finding: DetectionFinding) -> str:
        """Extract registry hive from finding."""
        if finding.canonical_path:
            parts = finding.canonical_path.split("\\")
            if parts:
                return parts[0]
        return "HKLM"

    def _extract_registry_key(self, finding: DetectionFinding) -> str:
        """Extract registry key path from finding."""
        if finding.canonical_path:
            parts = finding.canonical_path.split("\\")
            if len(parts) > 1:
                return "\\".join(parts[1:])
        return finding.asset_id

    def _extract_registry_value(self, finding: DetectionFinding) -> Optional[str]:
        """Extract registry value name from finding."""
        return finding.asset_id

    def _extract_startup_entry_id(self, finding: DetectionFinding) -> str:
        """Extract startup entry identifier."""
        return finding.asset_id

    def _extract_browser(self, finding: DetectionFinding) -> str:
        """Extract browser name from finding."""
        if finding.canonical_path:
            parts = finding.canonical_path.replace("\\", "/").split("/")
            for part in parts:
                if part.lower() in ("chrome", "firefox", "edge", "brave"):
                    return part
        return "unknown"

    def _extract_browser_profile(self, finding: DetectionFinding) -> str:
        """Extract browser profile from finding."""
        return "default"

    def _determine_browser_cache_type(self, finding: DetectionFinding) -> str:
        """Determine browser cache type."""
        return "cache"

    def _deduplicate_and_resolve_conflicts(
        self, actions: list[RemediationAction]
    ) -> list[RemediationAction]:
        """
        Deduplicate compatible actions and mark conflicts for review.

        Only PLANNED actions are deduplicated.
        Non-planned actions (BLOCKED, REVIEW_REQUIRED, etc.) are preserved.
        """
        planned: dict[str, RemediationAction] = {}
        other: list[RemediationAction] = []
        conflicts: list[RemediationAction] = []

        for action in actions:
            if action.state != ActionState.PLANNED:
                other.append(action)
                continue

            key = action.target.target_identity()
            if key in planned:
                existing = planned[key]
                if existing.action_type == action.action_type:
                    continue
                conflicts.append(action)
                planned[key] = action
            else:
                planned[key] = action

        result = list(planned.values()) + other
        for conflict in conflicts:
            conflict = _replace_state(conflict, ActionState.CONFLICT)
            result.append(conflict)

        return result

    def _action_sort_key(self, action: RemediationAction) -> tuple:
        """
        Build deterministic sort key for actions.
        """
        return (
            -action.priority_score,
            action.action_type.value,
            action.asset_id,
            action.action_id,
        )

    def _build_action_summary(
        self, result: PrioritizedResult, actions: tuple[RemediationAction, ...]
    ) -> ActionSummary:
        """
        Build summary statistics from actions.
        """
        total_findings = len(result.priorities)
        auto_fixable = sum(1 for a in actions if a.is_auto_fixable)
        review_req = sum(1 for a in actions if a.requires_review and not a.is_blocked)
        blocked = sum(1 for a in actions if a.is_blocked)
        not_fixable = sum(1 for a in actions if a.state == ActionState.NOT_FIXABLE)
        unknown = sum(1 for a in actions if a.fixability == Fixability.UNKNOWN)

        actions_by_type: dict[str, int] = {}
        for action in actions:
            actions_by_type[action.action_type.value] = (
                actions_by_type.get(action.action_type.value, 0) + 1
            )

        known_sizes = [
            a.estimated_size for a in actions if a.estimated_size is not None
        ]
        total_size: Optional[int] = sum(known_sizes) if known_sizes else None
        if any(a.estimated_size is None for a in actions):
            total_size = None

        highest_priority_id = self._find_extreme_action_id(
            actions, lambda a: -a.priority_score
        )
        highest_severity_id = self._find_extreme_action_id(
            actions, lambda a: a.asset_id
        )
        largest_affected_id = self._find_extreme_action_id(
            actions, lambda a: -(a.estimated_size or 0)
        )

        return ActionSummary(
            total_findings=total_findings,
            actions_planned=len(actions),
            auto_fixable_actions=auto_fixable,
            review_required_actions=review_req,
            blocked_actions=blocked,
            not_fixable_actions=not_fixable,
            unknown_fixability_actions=unknown,
            actions_by_type=dict(sorted(actions_by_type.items())),
            estimated_affected_size=total_size,
            highest_priority_action_id=highest_priority_id,
            highest_severity_action_id=highest_severity_id,
            largest_affected_action_id=largest_affected_id,
            generated_at=datetime.now(UTC),
        )

    def _find_extreme_action_id(
        self,
        actions: tuple[RemediationAction, ...],
        key_func: Callable[[RemediationAction], Any],
    ) -> Optional[str]:
        """Find the action_id of the extreme element."""
        if not actions:
            return None
        best = min(actions, key=key_func)
        return best.action_id


def _replace_state(
    action: RemediationAction, new_state: ActionState
) -> RemediationAction:
    """Create a copy of an action with a different state."""
    return RemediationAction(
        action_id=action.action_id,
        action_type=action.action_type,
        state=new_state,
        target=action.target,
        finding_id=action.finding_id,
        rule_id=action.rule_id,
        rule_version=action.rule_version,
        asset_id=action.asset_id,
        priority_score=action.priority_score,
        fixability=action.fixability,
        is_blocked=action.is_blocked,
        requires_review=action.requires_review,
        is_actionable=action.is_actionable,
        is_auto_fixable=action.is_auto_fixable,
        is_fixable=action.is_fixable,
        rule_capability=action.rule_capability,
        preconditions=action.preconditions,
        safety_assessment=action.safety_assessment,
        reason=action.reason,
        estimated_size=action.estimated_size,
        backup_required=action.backup_required,
        rollback_supported=action.rollback_supported,
        backup_location=action.backup_location,
        backup_identity=action.backup_identity,
        computed_at=action.computed_at,
        metadata=dict(action.metadata),
    )


# ── Convenience Functions ─────────────────────────────────────────────────────


def plan_actions(
    result: PrioritizedResult,
    asset_snapshot_resolver: Optional[AssetSnapshotResolver] = None,
    strategy_version: str = "1.0.0",
    safety_gate: Optional[SafetyGate] = None,
    snapshot_ttl_seconds: int = 3600,
) -> ActionPlan:
    """
    Convenience function to plan actions from a PrioritizedResult.
    """
    planner = ActionPlanner(
        asset_snapshot_resolver=asset_snapshot_resolver,
        strategy_version=strategy_version,
        safety_gate=safety_gate,
        snapshot_ttl_seconds=snapshot_ttl_seconds,
    )
    return planner.plan(result)
