"""
SC-8C11 Phase 2 — Smart Optimization Plan Builder

Builds a canonical scan_core ActionPlan from Smart Optimization analysis output.

Architecture:
  Smart Optimization analysis output
    ↓
  SmartOptimizationAdapter (Phase 1)
    ↓
  SmartOptimizationPlanBuilder (Phase 2)
    ↓
  canonical ActionPlan
    ↓
  ActionPlanRepository

This module:
- Builds ActionPlan with correct summary statistics
- NEVER executes remediation
- NEVER calls legacy optimization services
- ONLY constructs/persists the action plan
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from ..rules.action import ActionPlan, ActionSummary, RemediationAction
from ..rules.actionability import CapabilityContract
from .smart_optimization_adapter import SmartOptimizationAdapter


def _build_action_summary(actions: tuple[RemediationAction, ...]) -> ActionSummary:
    """
    Compute ActionSummary from a collection of RemediationActions.
    
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
        actions_by_type[action_type_value] = actions_by_type.get(action_type_value, 0) + 1
        
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


class SmartOptimizationPlanBuilder:
    """
    Builds canonical ActionPlan objects from Smart Optimization analysis output.
    
    This builder:
    - Converts Smart Optimization actions via SmartOptimizationAdapter
    - Computes ActionSummary statistics from resulting actions
    - Generates a backend plan_id
    - Does NOT persist the plan
    - Does NOT execute remediation
    """
    
    def __init__(
        self,
        adapter: Optional[SmartOptimizationAdapter] = None,
        capability_contract: Optional[CapabilityContract] = None,
    ) -> None:
        """
        Initialize the plan builder.
        
        Args:
            adapter: Optional SmartOptimizationAdapter instance
            capability_contract: Optional CapabilityContract for adapter
        """
        self.adapter = adapter or SmartOptimizationAdapter(
            capability_contract=capability_contract
        )
    
    def build_plan(
        self,
        smart_opt_actions: list[dict[str, Any]],
        snapshot_timestamp: Optional[datetime] = None,
    ) -> ActionPlan:
        """
        Build a canonical ActionPlan from Smart Optimization actions.
        
        Args:
            smart_opt_actions: List of Smart Optimization action data
            snapshot_timestamp: Optional snapshot timestamp for action preconditions
        
        Returns:
            Canonical ActionPlan with backend-generated plan_id
        """
        # Convert Smart Optimization actions to RemediationActions
        actions = self.adapter.convert_actions(
            smart_opt_actions,
            snapshot_timestamp=snapshot_timestamp,
        )
        
        # Convert to tuple for immutability
        action_tuple = tuple(actions)
        
        # Build summary from actions
        summary = _build_action_summary(action_tuple)
        
        # Generate backend plan_id
        plan_id = str(uuid.uuid4())
        
        # Create ActionPlan
        plan = ActionPlan(
            actions=action_tuple,
            summary=summary,
            generated_at=datetime.now(UTC),
            snapshot_timestamp=snapshot_timestamp,
            snapshot_version="smart_optimization_1.0.0",
            snapshot_ttl_seconds=3600,
            plan_id=plan_id,
        )
        
        return plan
    
    def get_adapter_statistics(self) -> dict[str, int]:
        """Get statistics from the underlying adapter."""
        return self.adapter.get_statistics()
