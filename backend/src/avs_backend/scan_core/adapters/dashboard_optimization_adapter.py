"""
SC-8C13 Phase 2 — Dashboard Optimization Adapter

Converts Dashboard One-Click Optimize preview actions into canonical
scan_core RemediationActions for planning purposes.

Architecture:
  Dashboard Optimize preview actions
    ↓
  [THIS ADAPTER] ← SC-8C13 Phase 2
    ↓
  scan_core RemediationActions
    ↓
  DashboardOptimizationPlanBuilder
    ↓
  canonical ActionPlan
    ↓
  ActionPlanRepository

This adapter:
- NEVER executes remediation
- NEVER calls legacy optimization services (dashboard.optimize.execute, orchestrator.optimize)
- NEVER bypasses SafetyGate
- NEVER bypasses CapabilityContract
- NEVER calls target executors
- NEVER mutates filesystem/registry/browser state
- ONLY converts Dashboard Optimize actions to canonical RemediationActions
- ONLY produces RemediationActions for existing supported action types
- Marks unsupported operations (Flush DNS, Trim Memory) as NOT_FIXABLE
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Optional

from ..rules.action import (
    ActionState,
    ActionTarget,
    ActionType,
    FilesystemActionTarget,
    RemediationAction,
    _NoTarget,
)
from ..rules.action_preconditions import PreconditionSet
from ..rules.actionability import CapabilityContract, Fixability
from ..rules.enums import RuleCategory
from ..rules.priority import FindingPriority, RuleCapability


# ── Dashboard Optimization Action Type Mapping ────────────────────────────────


@dataclass(frozen=True)
class DashboardOptimizationActionMapping:
    """
    Mapping from Dashboard Optimize action type to scan_core action type.

    Only includes mappings for actions that can be safely executed
    through existing scan_core executors.
    """

    dashboard_opt_type: str
    action_type: ActionType
    rule_category: RuleCategory
    target_type: str  # "filesystem" | "none"
    is_supported: bool
    reason: str


# Supported Dashboard Optimize action mappings
DASHBOARD_OPT_ACTION_MAPPINGS: dict[str, DashboardOptimizationActionMapping] = {
    # Filesystem cleanup actions — supported via existing executors
    "clean_temp_files": DashboardOptimizationActionMapping(
        dashboard_opt_type="clean_temp_files",
        action_type=ActionType.DELETE_FILE,
        rule_category=RuleCategory.TEMPORARY,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing temp file cleanup executor",
    ),
    "empty_recycle_bin": DashboardOptimizationActionMapping(
        dashboard_opt_type="empty_recycle_bin",
        action_type=ActionType.DELETE_DIRECTORY,
        rule_category=RuleCategory.JUNK,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing directory cleanup executor",
    ),
    "clean_browser_cache": DashboardOptimizationActionMapping(
        dashboard_opt_type="clean_browser_cache",
        action_type=ActionType.CLEAR_BROWSER_CACHE,
        rule_category=RuleCategory.BROWSER,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing browser cache cleanup executor",
    ),
    "clean_thumbnail_cache": DashboardOptimizationActionMapping(
        dashboard_opt_type="clean_thumbnail_cache",
        action_type=ActionType.CLEAR_CACHE,
        rule_category=RuleCategory.CACHE,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing cache cleanup executor",
    ),
    "clean_prefetch": DashboardOptimizationActionMapping(
        dashboard_opt_type="clean_prefetch",
        action_type=ActionType.DELETE_FILE,
        rule_category=RuleCategory.TEMPORARY,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing temp file cleanup executor",
    ),
    "clean_windows_update_cache": DashboardOptimizationActionMapping(
        dashboard_opt_type="clean_windows_update_cache",
        action_type=ActionType.DELETE_FILE,
        rule_category=RuleCategory.TEMPORARY,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing temp file cleanup executor",
    ),

    # Unsupported actions — OUT_OF_SCOPE (no existing ActionType or executor)
    "flush_dns": DashboardOptimizationActionMapping(
        dashboard_opt_type="flush_dns",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.NETWORK,
        target_type="none",
        is_supported=False,
        reason="Flush DNS has no scan_core ActionType or executor — OUT_OF_SCOPE",
    ),
    "trim_memory": DashboardOptimizationActionMapping(
        dashboard_opt_type="trim_memory",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.PERFORMANCE,
        target_type="none",
        is_supported=False,
        reason="Memory trim has no scan_core ActionType or executor — OUT_OF_SCOPE",
    ),
}


# ── Dashboard Optimization Adapter ────────────────────────────────────────────


class DashboardOptimizationAdapter:
    """
    Adapter to convert Dashboard Optimize actions to scan_core RemediationActions.

    This adapter:
    - Accepts Dashboard Optimize action data from the preview RPC
    - Maps supported actions to existing scan_core action types
    - Marks unsupported actions as detection-only (NOT_FIXABLE)
    - Generates RemediationActions with proper preconditions
    - Never executes remediation
    - Never bypasses SafetyGate or CapabilityContract
    - Never calls legacy optimization services
    """

    def __init__(self, capability_contract: Optional[CapabilityContract] = None):
        """
        Initialize the Dashboard Optimization adapter.

        Args:
            capability_contract: Optional capability contract for actionability checks
        """
        self.capability_contract = capability_contract or CapabilityContract()
        self.statistics = {"converted": 0, "unsupported": 0, "errors": 0}

    def convert_action(
        self,
        dashboard_action: dict[str, Any],
        snapshot_timestamp: Optional[datetime] = None,
    ) -> RemediationAction:
        """
        Convert a Dashboard Optimize action to a RemediationAction.

        Args:
            dashboard_action: Dashboard Optimize action data with keys:
                - id: str (optional, generated if missing)
                - type: str (e.g. "clean_temp_files", "flush_dns")
                - title: str (optional)
                - description: str (optional)
                - size: int (optional, estimated bytes recoverable)
                - rollbackAvailable: bool (optional, default False)
            snapshot_timestamp: Optional snapshot timestamp for preconditions

        Returns:
            RemediationAction instance

        Raises:
            ValueError: If action data is invalid or incomplete
        """
        try:
            # Extract action data
            action_type_str = dashboard_action.get("type", "")
            title = dashboard_action.get("title", "")
            description = dashboard_action.get("description", "")
            size = dashboard_action.get("size", 0)
            rollback_available = dashboard_action.get("rollbackAvailable", False)

            # Generate or extract action ID
            action_id = dashboard_action.get("id", "")
            if not action_id:
                # Generate a stable action ID from type if not provided
                action_id = f"dashboard_opt_{action_type_str}"

            # Validate required fields
            if not action_type_str:
                raise ValueError("Dashboard Optimize action missing required field: type")

            # Get action mapping
            mapping = DASHBOARD_OPT_ACTION_MAPPINGS.get(action_type_str)
            if not mapping:
                # Unknown action type — treat as unsupported
                mapping = DashboardOptimizationActionMapping(
                    dashboard_opt_type=action_type_str,
                    action_type=ActionType.NONE,
                    rule_category=RuleCategory.CUSTOM,
                    target_type="none",
                    is_supported=False,
                    reason=f"Unknown Dashboard Optimize action type: {action_type_str}",
                )
                self.statistics["unsupported"] += 1

            # Determine action state
            if not mapping.is_supported:
                state = ActionState.NOT_FIXABLE
                is_actionable = False
                is_fixable = False
                fixability = Fixability.NOT_FIXABLE
                self.statistics["unsupported"] += 1
            else:
                state = ActionState.PLANNED
                is_actionable = True
                is_fixable = True
                fixability = Fixability.AUTO_FIXABLE
                self.statistics["converted"] += 1

            # Create target
            target = self._create_target(
                mapping=mapping,
                action_id=action_id,
                rollback_available=rollback_available,
            )

            # Create preconditions
            preconditions = self._create_preconditions(
                mapping=mapping,
                target=target,
                snapshot_timestamp=snapshot_timestamp,
            )

            # Determine estimated size
            estimated_size = int(size) if size and size > 0 else None

            # Create RemediationAction
            action = RemediationAction(
                action_id=action_id,
                action_type=mapping.action_type,
                state=state,
                target=target,
                finding_id=action_id,
                rule_id=f"dashboard_opt_{action_type_str}",
                rule_version="1.0.0",
                asset_id=action_id,
                priority_score=50.0,  # Dashboard Optimize actions have medium priority
                fixability=fixability,
                is_blocked=False,
                requires_review=not mapping.is_supported,
                is_actionable=is_actionable,
                is_auto_fixable=mapping.is_supported,
                is_fixable=is_fixable,
                rule_capability=RuleCapability.REMEDIATION_AVAILABLE if mapping.is_supported else RuleCapability.NO_REMEDIATION,
                preconditions=preconditions,
                safety_assessment=mapping.reason,
                reason=description or title or mapping.reason,
                estimated_size=estimated_size,
                backup_required=rollback_available and mapping.is_supported,
                rollback_supported=rollback_available and mapping.is_supported,
                backup_location=None,  # Backend will assign during execution
                backup_identity=None,  # Backend will assign during execution
                computed_at=datetime.now(UTC),
                metadata={
                    "source": "dashboard_optimization",
                    "dashboard_opt_type": action_type_str,
                    "title": title,
                },
            )

            return action

        except Exception as e:
            self.statistics["errors"] += 1
            raise ValueError(f"Failed to convert Dashboard Optimize action: {e}") from e

    def _create_target(
        self,
        mapping: DashboardOptimizationActionMapping,
        action_id: str,
        rollback_available: bool,
    ) -> ActionTarget:
        """
        Create an ActionTarget for the Dashboard Optimize action.

        Args:
            mapping: Action mapping
            action_id: Action ID
            rollback_available: Whether rollback is available

        Returns:
            ActionTarget instance
        """
        if not mapping.is_supported or mapping.target_type == "none":
            return _NoTarget()

        if mapping.target_type == "filesystem":
            # Create a placeholder filesystem target
            # Actual target will be resolved during execution
            return FilesystemActionTarget(
                asset_id=action_id,
                canonical_path="",  # Backend will resolve during execution
                allowed_location="temp",  # Dashboard Optimize targets are temp/cache
                scope="user",
                backup_required=rollback_available,
                rollback_supported=rollback_available,
            )

        return _NoTarget()

    def _create_preconditions(
        self,
        mapping: DashboardOptimizationActionMapping,
        target: ActionTarget,
        snapshot_timestamp: Optional[datetime],
    ) -> PreconditionSet:
        """
        Create preconditions for the Dashboard Optimize action.

        Args:
            mapping: Action mapping
            target: Action target
            snapshot_timestamp: Optional snapshot timestamp

        Returns:
            PreconditionSet instance
        """
        # For unsupported actions, no preconditions needed
        if not mapping.is_supported:
            return frozenset()

        # For supported actions, use standard preconditions
        # Actual preconditions will be validated by SafetyGate during execution
        preconditions = set()

        # All actions require target to exist and be accessible
        preconditions.add("TargetExists")
        preconditions.add("TargetAccessible")

        # Filesystem actions require additional preconditions
        if mapping.target_type == "filesystem":
            preconditions.add("PathWithinAllowedScope")
            preconditions.add("NotReparsePoint")
            preconditions.add("NotSymlink")
            preconditions.add("TargetNotLocked")

        return frozenset(preconditions)

    def convert_actions(
        self,
        dashboard_actions: list[dict[str, Any]],
        snapshot_timestamp: Optional[datetime] = None,
    ) -> list[RemediationAction]:
        """
        Convert multiple Dashboard Optimize actions to RemediationActions.

        Args:
            dashboard_actions: List of Dashboard Optimize action data
            snapshot_timestamp: Optional snapshot timestamp for preconditions

        Returns:
            List of RemediationAction instances
        """
        actions = []
        for dashboard_action in dashboard_actions:
            try:
                action = self.convert_action(dashboard_action, snapshot_timestamp)
                actions.append(action)
            except ValueError as e:
                # Log error but continue processing
                self.statistics["errors"] += 1
                continue

        return actions

    def get_statistics(self) -> dict[str, int]:
        """Get adapter statistics."""
        return self.statistics.copy()

    def reset_statistics(self) -> None:
        """Reset adapter statistics."""
        self.statistics = {"converted": 0, "unsupported": 0, "errors": 0}


# ── Helper Functions ──────────────────────────────────────────────────────────


def is_dashboard_optimization_action_supported(action_type: str) -> bool:
    """
    Check if a Dashboard Optimize action type is supported by scan_core.

    Args:
        action_type: Dashboard Optimize action type

    Returns:
        True if supported, False otherwise
    """
    mapping = DASHBOARD_OPT_ACTION_MAPPINGS.get(action_type)
    return mapping is not None and mapping.is_supported


def get_dashboard_optimization_action_mapping(
    action_type: str,
) -> Optional[DashboardOptimizationActionMapping]:
    """
    Get the action mapping for a Dashboard Optimize action type.

    Args:
        action_type: Dashboard Optimize action type

    Returns:
        DashboardOptimizationActionMapping if found, None otherwise
    """
    return DASHBOARD_OPT_ACTION_MAPPINGS.get(action_type)
