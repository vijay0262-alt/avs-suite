"""
SC-8C11 Phase 1 — Smart Optimization Adapter

Converts Smart Optimization AI findings into canonical scan_core ActionPlan.

Architecture:
  Smart Optimization AI Engine (frontend)
    ↓
  Smart Optimization findings/actions
    ↓
  [THIS ADAPTER] ← SC-8C11 Phase 1
    ↓
  scan_core ActionPlan
    ↓
  RemediationCoordinator
    ↓
  DefaultExecutor

This adapter:
- NEVER executes remediation
- NEVER calls legacy optimization services
- NEVER bypasses SafetyGate
- NEVER bypasses CapabilityContract
- ONLY converts Smart Optimization findings to canonical RemediationActions
- ONLY produces ActionPlans for existing supported action types
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Optional

from ..rules.action import (
    ActionState,
    ActionTarget,
    ActionType,
    FilesystemActionTarget,
    RemediationAction,
    StartupActionTarget,
    _NoTarget,
)
from ..rules.action_preconditions import PreconditionSet
from ..rules.actionability import CapabilityContract, Fixability
from ..rules.enums import RuleCategory
from ..rules.priority import FindingPriority, RuleCapability


# ── Smart Optimization Action Type Mapping ────────────────────────────────────


@dataclass(frozen=True)
class SmartOptimizationActionMapping:
    """
    Mapping from Smart Optimization action type to scan_core action type.
    
    Only includes mappings for actions that can be safely executed
    through existing scan_core executors.
    """
    
    smart_opt_type: str
    action_type: ActionType
    rule_category: RuleCategory
    target_type: str  # "filesystem" | "startup" | "none"
    is_supported: bool
    reason: str


# Supported Smart Optimization action mappings
SMART_OPT_ACTION_MAPPINGS: dict[str, SmartOptimizationActionMapping] = {
    # Filesystem cleanup actions
    "clean_temp_files": SmartOptimizationActionMapping(
        smart_opt_type="clean_temp_files",
        action_type=ActionType.DELETE_FILE,
        rule_category=RuleCategory.TEMPORARY,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing temp file cleanup executor",
    ),
    "clean_browser_cache": SmartOptimizationActionMapping(
        smart_opt_type="clean_browser_cache",
        action_type=ActionType.CLEAR_BROWSER_CACHE,
        rule_category=RuleCategory.BROWSER,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing browser cache cleanup executor",
    ),
    "empty_recycle_bin": SmartOptimizationActionMapping(
        smart_opt_type="empty_recycle_bin",
        action_type=ActionType.DELETE_DIRECTORY,
        rule_category=RuleCategory.JUNK,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing directory cleanup executor",
    ),
    "clear_browser_privacy": SmartOptimizationActionMapping(
        smart_opt_type="clear_browser_privacy",
        action_type=ActionType.CLEAR_BROWSER_CACHE,
        rule_category=RuleCategory.BROWSER,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing browser cache cleanup executor",
    ),
    "clear_privacy_traces": SmartOptimizationActionMapping(
        smart_opt_type="clear_privacy_traces",
        action_type=ActionType.CLEAR_CACHE,
        rule_category=RuleCategory.PRIVACY,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing cache cleanup executor",
    ),
    
    # Startup optimization actions
    "disable_startup_entry": SmartOptimizationActionMapping(
        smart_opt_type="disable_startup_entry",
        action_type=ActionType.DISABLE_STARTUP_ENTRY,
        rule_category=RuleCategory.STARTUP,
        target_type="startup",
        is_supported=True,
        reason="Maps to existing startup disable executor",
    ),
    
    # Registry cleanup actions
    "clean_registry": SmartOptimizationActionMapping(
        smart_opt_type="clean_registry",
        action_type=ActionType.REMOVE_REGISTRY_VALUE,
        rule_category=RuleCategory.REGISTRY,
        target_type="filesystem",  # Registry actions use filesystem target type
        is_supported=True,
        reason="Maps to existing registry cleanup executor",
    ),
    
    # Unsupported actions (detection-only)
    "close_background_process": SmartOptimizationActionMapping(
        smart_opt_type="close_background_process",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.PERFORMANCE,
        target_type="none",
        is_supported=False,
        reason="Process termination not supported by scan_core executors",
    ),
    "run_windows_update": SmartOptimizationActionMapping(
        smart_opt_type="run_windows_update",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.SYSTEM,
        target_type="none",
        is_supported=False,
        reason="Windows Update requires manual user action",
    ),
    "optimize_disk": SmartOptimizationActionMapping(
        smart_opt_type="optimize_disk",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.PERFORMANCE,
        target_type="none",
        is_supported=False,
        reason="Disk optimization requires manual user action",
    ),
    "delay_startup_entry": SmartOptimizationActionMapping(
        smart_opt_type="delay_startup_entry",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.STARTUP,
        target_type="none",
        is_supported=False,
        reason="Startup delay not supported by scan_core executors",
    ),
    "remove_duplicates": SmartOptimizationActionMapping(
        smart_opt_type="remove_duplicates",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.JUNK,
        target_type="none",
        is_supported=False,
        reason="Duplicate removal requires user review and selection",
    ),
    "move_large_files": SmartOptimizationActionMapping(
        smart_opt_type="move_large_files",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.JUNK,
        target_type="none",
        is_supported=False,
        reason="File move requires user review and destination selection",
    ),
    "delete_large_files": SmartOptimizationActionMapping(
        smart_opt_type="delete_large_files",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.JUNK,
        target_type="none",
        is_supported=False,
        reason="Large file deletion requires explicit user review",
    ),
    "adjust_power_plan": SmartOptimizationActionMapping(
        smart_opt_type="adjust_power_plan",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.PERFORMANCE,
        target_type="none",
        is_supported=False,
        reason="Power plan adjustment requires manual user action",
    ),
    "update_driver": SmartOptimizationActionMapping(
        smart_opt_type="update_driver",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.SYSTEM,
        target_type="none",
        is_supported=False,
        reason="Driver update requires manual user action",
    ),
    "custom": SmartOptimizationActionMapping(
        smart_opt_type="custom",
        action_type=ActionType.NONE,
        rule_category=RuleCategory.CUSTOM,
        target_type="none",
        is_supported=False,
        reason="Custom actions not supported by scan_core executors",
    ),
}


# ── Smart Optimization Adapter ────────────────────────────────────────────────


class SmartOptimizationAdapter:
    """
    Adapter to convert Smart Optimization findings to scan_core RemediationActions.
    
    This adapter:
    - Accepts Smart Optimization action data from the AI engine
    - Maps supported actions to existing scan_core action types
    - Marks unsupported actions as detection-only
    - Generates RemediationActions with proper preconditions
    - Never executes remediation
    - Never bypasses SafetyGate or CapabilityContract
    """
    
    def __init__(self, capability_contract: Optional[CapabilityContract] = None):
        """
        Initialize the Smart Optimization adapter.
        
        Args:
            capability_contract: Optional capability contract for actionability checks
        """
        self.capability_contract = capability_contract or CapabilityContract()
        self.statistics = {"converted": 0, "unsupported": 0, "errors": 0}
    
    def convert_action(
        self,
        smart_opt_action: dict[str, Any],
        snapshot_timestamp: Optional[datetime] = None,
    ) -> RemediationAction:
        """
        Convert a Smart Optimization action to a RemediationAction.
        
        Args:
            smart_opt_action: Smart Optimization action data with keys:
                - id: str
                - type: str (OptimizationActionType)
                - title: str
                - description: str
                - impact: dict (OptimizationImpact)
                - risk: dict (OptimizationRisk)
                - benefits: dict (OptimizationBenefits)
                - confidence: float
                - rollbackAvailable: bool
                - sourceModule: str
                - sourceFindingId: str
            snapshot_timestamp: Optional snapshot timestamp for preconditions
        
        Returns:
            RemediationAction instance
        
        Raises:
            ValueError: If action data is invalid or incomplete
        """
        try:
            # Extract action data
            action_id = smart_opt_action.get("id", "")
            action_type_str = smart_opt_action.get("type", "")
            title = smart_opt_action.get("title", "")
            description = smart_opt_action.get("description", "")
            confidence = smart_opt_action.get("confidence", 0.0)
            rollback_available = smart_opt_action.get("rollbackAvailable", False)
            source_module = smart_opt_action.get("sourceModule", "smart_optimization")
            source_finding_id = smart_opt_action.get("sourceFindingId", action_id)
            
            # Validate required fields
            if not action_id or not action_type_str:
                raise ValueError("Smart Optimization action missing required fields: id, type")
            
            # Get action mapping
            mapping = SMART_OPT_ACTION_MAPPINGS.get(action_type_str)
            if not mapping:
                # Unknown action type - treat as unsupported
                mapping = SmartOptimizationActionMapping(
                    smart_opt_type=action_type_str,
                    action_type=ActionType.NONE,
                    rule_category=RuleCategory.CUSTOM,
                    target_type="none",
                    is_supported=False,
                    reason=f"Unknown Smart Optimization action type: {action_type_str}",
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
                title=title,
                rollback_available=rollback_available,
            )
            
            # Create preconditions
            preconditions = self._create_preconditions(
                mapping=mapping,
                target=target,
                snapshot_timestamp=snapshot_timestamp,
            )
            
            # Determine priority score (0-100)
            # Use Smart Optimization confidence as priority
            priority_score = confidence * 100.0
            
            # Determine estimated size
            benefits = smart_opt_action.get("benefits", {})
            storage_recovery_mb = benefits.get("storageRecoveryMB", 0)
            estimated_size = int(storage_recovery_mb * 1024 * 1024) if storage_recovery_mb > 0 else None
            
            # Create RemediationAction
            action = RemediationAction(
                action_id=action_id,
                action_type=mapping.action_type,
                state=state,
                target=target,
                finding_id=source_finding_id,
                rule_id=f"smart_opt_{action_type_str}",
                rule_version="1.0.0",
                asset_id=action_id,  # Use action_id as asset_id for Smart Optimization
                priority_score=priority_score,
                fixability=fixability,
                is_blocked=False,
                requires_review=not mapping.is_supported,
                is_actionable=is_actionable,
                is_auto_fixable=mapping.is_supported,
                is_fixable=is_fixable,
                rule_capability=RuleCapability.REMEDIATION_AVAILABLE if mapping.is_supported else RuleCapability.NO_REMEDIATION,
                preconditions=preconditions,
                safety_assessment=mapping.reason,
                reason=description or title,
                estimated_size=estimated_size,
                backup_required=rollback_available and mapping.is_supported,
                rollback_supported=rollback_available and mapping.is_supported,
                backup_location=None,  # Backend will assign during execution
                backup_identity=None,  # Backend will assign during execution
                computed_at=datetime.now(UTC),
                metadata={
                    "source": "smart_optimization",
                    "source_module": source_module,
                    "smart_opt_type": action_type_str,
                    "confidence": confidence,
                    "title": title,
                },
            )
            
            return action
            
        except Exception as e:
            self.statistics["errors"] += 1
            raise ValueError(f"Failed to convert Smart Optimization action: {e}") from e
    
    def _create_target(
        self,
        mapping: SmartOptimizationActionMapping,
        action_id: str,
        title: str,
        rollback_available: bool,
    ) -> ActionTarget:
        """
        Create an ActionTarget for the Smart Optimization action.
        
        Args:
            mapping: Action mapping
            action_id: Action ID
            title: Action title
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
                allowed_location="temp",  # Smart Optimization targets are typically temp/cache
                scope="user",
                backup_required=rollback_available,
                rollback_supported=rollback_available,
            )
        
        if mapping.target_type == "startup":
            # Create a placeholder startup target
            # Actual target will be resolved during execution
            return StartupActionTarget(
                asset_id=action_id,
                entry_id="",  # Backend will resolve during execution
                scope="user",
                backup_required=rollback_available,
                rollback_supported=rollback_available,
            )
        
        return _NoTarget()
    
    def _create_preconditions(
        self,
        mapping: SmartOptimizationActionMapping,
        target: ActionTarget,
        snapshot_timestamp: Optional[datetime],
    ) -> PreconditionSet:
        """
        Create preconditions for the Smart Optimization action.
        
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
        
        # Startup actions require additional preconditions
        if mapping.target_type == "startup":
            preconditions.add("PathWithinAllowedScope")
        
        return frozenset(preconditions)
    
    def convert_actions(
        self,
        smart_opt_actions: list[dict[str, Any]],
        snapshot_timestamp: Optional[datetime] = None,
    ) -> list[RemediationAction]:
        """
        Convert multiple Smart Optimization actions to RemediationActions.
        
        Args:
            smart_opt_actions: List of Smart Optimization action data
            snapshot_timestamp: Optional snapshot timestamp for preconditions
        
        Returns:
            List of RemediationAction instances
        """
        actions = []
        for smart_opt_action in smart_opt_actions:
            try:
                action = self.convert_action(smart_opt_action, snapshot_timestamp)
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


def is_smart_optimization_action_supported(action_type: str) -> bool:
    """
    Check if a Smart Optimization action type is supported by scan_core.
    
    Args:
        action_type: Smart Optimization action type
    
    Returns:
        True if supported, False otherwise
    """
    mapping = SMART_OPT_ACTION_MAPPINGS.get(action_type)
    return mapping is not None and mapping.is_supported


def get_smart_optimization_action_mapping(action_type: str) -> Optional[SmartOptimizationActionMapping]:
    """
    Get the action mapping for a Smart Optimization action type.
    
    Args:
        action_type: Smart Optimization action type
    
    Returns:
        SmartOptimizationActionMapping if found, None otherwise
    """
    return SMART_OPT_ACTION_MAPPINGS.get(action_type)
