"""
SC-8C3 Part 3 — Remediation Action Contract + Action Planning

Immutable domain contract for remediation actions.

Architecture:
  RuleResult
    ↓
  Aggregation (Part 1)
    ↓
  Priority/Fixability (Part 2)
    ↓
  [Action Planning Layer] (Part 3)
    ↓
  Future Safety Gate
    ↓
  Future Execution Engine

This layer:
- NEVER modifies system state
- NEVER executes cleanup or actions
- NEVER calls cleaners, optimizer, or Electron APIs
- ONLY reads PrioritizedResult and produces immutable action plans
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, Callable, Optional, Protocol, runtime_checkable

from ..assets import AssetType
from .aggregation import DetectionFinding
from .enums import RuleCategory
from .priority import FindingPriority, Fixability, PrioritizedResult, RuleCapability

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


AssetSnapshotResolver = Callable[[str], Optional[_AssetSnapshot]]
"""
Resolve current asset snapshot from asset_id.

Returns None if asset cannot be resolved.
"""


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

    def target_identity(self) -> str:
        """Deterministic identity for deduplication."""
        return f"{self.asset_id}|{self.hive}|{self.key_path}|{self.value_name or ''}"

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
        }


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
        }


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


ActionTarget = (
    FilesystemActionTarget
    | RegistryActionTarget
    | BrowserActionTarget
    | StartupActionTarget
)


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
    preconditions: tuple[str, ...]
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

    def __post_init__(self) -> None:
        """Ensure collections are tuples."""
        if isinstance(object.__getattribute__(self, "actions"), list):
            object.__setattr__(self, "actions", tuple(self.actions))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "actions": [a.to_dict() for a in self.actions],
            "summary": self.summary.to_dict(),
            "generated_at": self.generated_at.isoformat(),
        }


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


# ── Action Planner ────────────────────────────────────────────────────────────


class ActionPlanner:
    """
    Plans remediation actions from prioritized findings.

    Guarantees:
    - Deterministic action IDs
    - Safety-first gating (never overrides SafetyAssessment)
    - Immutability (all output objects are frozen/read-only)
    - Zero system modification

    Does NOT:
    - Modify system state
    - Execute cleanup or actions
    - Call cleaners, optimizer, or Electron APIs
    """

    def __init__(
        self,
        asset_snapshot_resolver: Optional[AssetSnapshotResolver] = None,
        strategy_version: str = "1.0.0",
    ) -> None:
        """
        Initialize action planner.

        Args:
            asset_snapshot_resolver: Optional callable to resolve asset
                snapshot state from asset_id. Required for accurate
                missing/locked/inaccessible detection.
            strategy_version: Version string for deterministic action IDs.
        """
        self._asset_snapshot_resolver = asset_snapshot_resolver
        self._strategy_version = strategy_version

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

        return ActionPlan(
            actions=actions_tuple,
            summary=summary,
            generated_at=datetime.now(UTC),
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
                preconditions=("safety_assessment_blocked",),
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
                preconditions=("fixability_not_actionable",),
                reason="Finding is not actionable",
            )

        if priority.fixability == Fixability.UNKNOWN:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.NOT_FIXABLE,
                target=self._make_no_target(),
                preconditions=("fixability_unknown",),
                reason="Fixability is unknown",
            )

        if priority.fixability == Fixability.REVIEW_REQUIRED:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.REVIEW_REQUIRED,
                target=self._make_no_target(),
                preconditions=("requires_human_review",),
                reason="Action requires human review",
            )

        if priority.rule_capability != RuleCapability.REMEDIATION_AVAILABLE:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.NOT_FIXABLE,
                target=self._make_no_target(),
                preconditions=("no_remediation_available",),
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
                preconditions=("asset_missing",),
                reason="Asset snapshot missing",
            )

        if not snapshot.exists:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.MISSING_TARGET,
                target=self._make_no_target(),
                preconditions=("snapshot_exists_false",),
                reason="Asset snapshot does not exist",
            )

        if not snapshot.is_accessible:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.LOCKED_TARGET,
                target=self._make_no_target(),
                preconditions=("target_inaccessible",),
                reason="Target is inaccessible",
            )

        if snapshot.is_locked:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.LOCKED_TARGET,
                target=self._make_no_target(),
                preconditions=("target_locked",),
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
                preconditions=("unsupported_action_type",),
                reason="No supported action type for this finding",
            )

        # Build target
        target = self._build_target(finding, action_type, snapshot)
        if target is None:
            return self._make_action(
                priority=priority,
                action_type=ActionType.NONE,
                state=ActionState.NOT_FIXABLE,
                target=self._make_no_target(),
                preconditions=("target_construction_failed",),
                reason="Could not construct action target",
            )

        # Build preconditions
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
        preconditions: tuple[str, ...],
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

        class _NoTarget:
            target_type = ActionTargetType.FILESYSTEM
            asset_id = ""
            canonical_path = ""
            allowed_location = ""
            scope = ""
            backup_required = False
            rollback_supported = False
            backup_location = None
            backup_identity = None

            def target_identity(self) -> str:
                return ""

            def to_dict(self) -> dict[str, Any]:
                return {}

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
        Build appropriate target for the action type.
        """
        if action_type in (
            ActionType.DELETE_FILE,
            ActionType.DELETE_DIRECTORY,
            ActionType.CLEAR_CACHE,
        ):
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
            return RegistryActionTarget(
                asset_id=finding.asset_id,
                hive=self._extract_hive(finding),
                key_path=self._extract_registry_key(finding),
                value_name=(
                    self._extract_registry_value(finding)
                    if action_type == ActionType.REMOVE_REGISTRY_VALUE
                    else None
                ),
            )

        if action_type == ActionType.DISABLE_STARTUP_ENTRY:
            return StartupActionTarget(
                asset_id=finding.asset_id,
                entry_id=self._extract_startup_entry_id(finding),
                scope=self._determine_scope(finding),
            )

        if action_type == ActionType.CLEAR_BROWSER_CACHE:
            return BrowserActionTarget(
                asset_id=finding.asset_id,
                browser=self._extract_browser(finding),
                profile=self._extract_browser_profile(finding),
                cache_type=self._determine_browser_cache_type(finding),
                path=snapshot.canonical_path,
            )

        return None

    def _build_preconditions(
        self, finding: DetectionFinding, target: ActionTarget, snapshot: _AssetSnapshot
    ) -> tuple[str, ...]:
        """
        Build explicit preconditions for an action.
        """
        preconditions: list[str] = [
            f"target_exists:{snapshot.exists}",
            f"target_accessible:{snapshot.is_accessible}",
            f"target_not_locked:{not snapshot.is_locked}",
            f"identity_matches:{snapshot.asset_id == finding.asset_id}",
            f"canonical_path:{snapshot.canonical_path}",
            f"safety_valid:{finding.safety.level.value}",
        ]

        if hasattr(target, "allowed_location") and target.allowed_location:
            preconditions.append(f"inside_allowed_location:{target.allowed_location}")

        if hasattr(target, "scope") and target.scope:
            preconditions.append(f"scope_valid:{target.scope}")

        return tuple(preconditions)

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
        return finding.display_name or finding.asset_id

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
) -> ActionPlan:
    """
    Convenience function to plan actions from a PrioritizedResult.
    """
    planner = ActionPlanner(
        asset_snapshot_resolver=asset_snapshot_resolver,
        strategy_version=strategy_version,
    )
    return planner.plan(result)
