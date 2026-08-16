"""
SC-8C12 Phase 3 — Security Remediation Plan Builder

Builds a canonical scan_core ActionPlan from Security Center remediation actions.

Architecture:
  Security Center remediation actions
    ↓
  SecurityRemediationAdapter (Phase 2)
    ↓
  SecurityRemediationPlanBuilder (Phase 3)
    ↓
  canonical ActionPlan
    ↓
  ActionPlanRepository

This module:
- Builds ActionPlan with correct summary statistics derived from canonical actions
- Generates a backend-owned plan_id
- Does NOT execute remediation
- Does NOT call legacy Security Center execution (ThreatRemediationEngine, security.remediation.*, security.quarantine.*)
- Does NOT call target executors (FilesystemExecutor, RegistryExecutor, StartupExecutor, BrowserExecutor)
- Does NOT call RemediationCoordinator.execute
- Does NOT call SafetyGate
- Does NOT call subprocess or PowerShell
- Does NOT perform filesystem, registry, startup, browser, or process mutation
- ONLY constructs the canonical ActionPlan

The adapter remains the ONLY place responsible for Security action → canonical
action conversion. The builder does NOT duplicate action-mapping logic.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from ..rules.action import ActionPlan, ActionSummary, RemediationAction
from ..rules.actionability import CapabilityContract
from .security_remediation_adapter import SecurityRemediationAdapter

# Snapshot version for Security Center remediation plans.
# This identifies the schema/source of the plan for stale-plan validation.
_SECURITY_REMEDIATION_SNAPSHOT_VERSION = "security_remediation_1.0.0"

# Default snapshot TTL for security remediation plans (1 hour).
# Plans older than this are considered stale and must be regenerated.
_SECURITY_REMEDIATION_SNAPSHOT_TTL_SECONDS = 3600


def _build_action_summary(actions: tuple[RemediationAction, ...]) -> ActionSummary:
    """
    Compute ActionSummary from a collection of RemediationActions.

    Statistics are derived entirely from the canonical converted actions.
    No statistics are fabricated. No second classification system is used.

    Args:
        actions: Tuple of RemediationAction instances

    Returns:
        ActionSummary with accurate statistics
    """
    actions_by_type: dict[str, int] = {}
    auto_fixable = 0
    review_required = 0
    blocked = 0
    not_fixable = 0
    unknown_fixability = 0
    estimated_affected_size: Optional[int] = 0
    highest_priority_action_id: Optional[str] = None
    highest_priority_score = -1.0
    largest_affected_action_id: Optional[str] = None
    largest_affected_size = -1

    for action in actions:
        # Count by action type
        action_type_value = action.action_type.value
        actions_by_type[action_type_value] = (
            actions_by_type.get(action_type_value, 0) + 1
        )

        # Count fixability states (order matters: blocked > not_fixable > review > auto)
        if action.is_blocked:
            blocked += 1
        elif not action.is_fixable:
            not_fixable += 1
        elif action.requires_review:
            review_required += 1
        elif action.is_auto_fixable and action.is_fixable:
            auto_fixable += 1
        else:
            unknown_fixability += 1

        # Track priority
        if action.priority_score > highest_priority_score:
            highest_priority_score = action.priority_score
            highest_priority_action_id = action.action_id

        # Track largest affected size
        if action.estimated_size is not None:
            estimated_affected_size = (estimated_affected_size or 0) + action.estimated_size
            if action.estimated_size > largest_affected_size:
                largest_affected_size = action.estimated_size
                largest_affected_action_id = action.action_id

    # If no size was ever set, preserve None
    if estimated_affected_size is not None and estimated_affected_size == 0:
        if all(a.estimated_size is None for a in actions):
            estimated_affected_size = None

    return ActionSummary(
        total_findings=len(actions),
        actions_planned=len(actions),
        auto_fixable_actions=auto_fixable,
        review_required_actions=review_required,
        blocked_actions=blocked,
        not_fixable_actions=not_fixable,
        unknown_fixability_actions=unknown_fixability,
        actions_by_type=actions_by_type,
        estimated_affected_size=estimated_affected_size,
        highest_priority_action_id=highest_priority_action_id,
        highest_severity_action_id=highest_priority_action_id,
        largest_affected_action_id=largest_affected_action_id,
        generated_at=datetime.now(UTC),
    )


class SecurityRemediationPlanBuilder:
    """
    Builds canonical ActionPlan objects from Security Center remediation actions.

    This builder:
    - Converts Security Center actions via SecurityRemediationAdapter
    - Computes ActionSummary statistics from resulting canonical actions
    - Generates a backend-owned plan_id
    - Does NOT persist the plan (persistence is handled by the RPC layer)
    - Does NOT execute remediation
    - Does NOT call legacy Security Center execution paths
    - Does NOT call target executors or RemediationCoordinator

    The adapter remains the ONLY place responsible for Security action →
    canonical action conversion. The builder does NOT duplicate mapping logic.
    """

    def __init__(
        self,
        adapter: Optional[SecurityRemediationAdapter] = None,
        capability_contract: Optional[CapabilityContract] = None,
    ) -> None:
        """
        Initialize the plan builder.

        Args:
            adapter: Optional SecurityRemediationAdapter instance.
                     If None, a new adapter is created.
            capability_contract: Optional CapabilityContract for the adapter.
                                 Ignored if adapter is provided.
        """
        self.adapter = adapter or SecurityRemediationAdapter(
            capability_contract=capability_contract
        )

    def build_plan(
        self,
        security_actions: list[dict[str, Any]],
        snapshot_timestamp: Optional[datetime] = None,
    ) -> ActionPlan:
        """
        Build a canonical ActionPlan from Security Center remediation actions.

        Args:
            security_actions: List of Security Center action dictionaries.
                              Each action must have at minimum 'id' and 'type'.
            snapshot_timestamp: Optional snapshot timestamp for action preconditions.
                                If None, the current time is used for plan generation.

        Returns:
            Canonical ActionPlan with a backend-generated plan_id.

        Raises:
            ValueError: If security_actions is not a list.
        """
        if not isinstance(security_actions, list):
            raise ValueError("security_actions must be a list")

        # Reset adapter statistics for a clean conversion run
        self.adapter.reset_statistics()

        # Convert Security Center actions to canonical RemediationActions
        # The adapter handles:
        # - action type mapping (quarantine → DELETE_FILE, etc.)
        # - target construction (FilesystemActionTarget, RegistryActionTarget, etc.)
        # - precondition generation
        # - asset ID derivation
        # - priority score computation
        # - privacy-safe metadata
        # - unsupported/non-remediation classification
        actions = self.adapter.convert_actions(
            security_actions,
            snapshot_timestamp=snapshot_timestamp,
        )

        # Convert to tuple for immutability (ActionPlan requires tuple)
        action_tuple = tuple(actions)

        # Build summary from canonical actions
        summary = _build_action_summary(action_tuple)

        # Generate backend-owned plan_id
        plan_id = str(uuid.uuid4())

        # Create canonical ActionPlan
        plan = ActionPlan(
            actions=action_tuple,
            summary=summary,
            generated_at=datetime.now(UTC),
            snapshot_timestamp=snapshot_timestamp,
            snapshot_version=_SECURITY_REMEDIATION_SNAPSHOT_VERSION,
            snapshot_ttl_seconds=_SECURITY_REMEDIATION_SNAPSHOT_TTL_SECONDS,
            plan_id=plan_id,
        )

        return plan

    def get_adapter_statistics(self) -> dict[str, int]:
        """
        Get statistics from the underlying adapter.

        Returns:
            Dictionary with keys: converted, unsupported, non_remediation, errors
        """
        return self.adapter.get_statistics()
