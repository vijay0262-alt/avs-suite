"""
SC-8C11 Phase 1 — Smart Optimization Adapter Tests

Tests for Smart Optimization to scan_core ActionPlan conversion.
"""

import pytest
from datetime import UTC, datetime

from avs_backend.scan_core.adapters.smart_optimization_adapter import (
    SmartOptimizationAdapter,
    SMART_OPT_ACTION_MAPPINGS,
    is_smart_optimization_action_supported,
    get_smart_optimization_action_mapping,
)
from avs_backend.scan_core.rules.action import (
    ActionState,
    ActionType,
    FilesystemActionTarget,
    StartupActionTarget,
    _NoTarget,
)
from avs_backend.scan_core.rules.actionability import Fixability
from avs_backend.scan_core.rules.priority import RuleCapability


# ── Test Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def adapter():
    """Create a Smart Optimization adapter instance."""
    return SmartOptimizationAdapter()


@pytest.fixture
def sample_temp_files_action():
    """Sample Smart Optimization temp files cleanup action."""
    return {
        "id": "action-temp-1",
        "type": "clean_temp_files",
        "title": "Clean Temporary Files",
        "description": "Remove 2.5 GB of temporary files",
        "impact": {
            "score": 75,
            "tier": "high",
            "primaryBenefit": "storageRecoveryMB",
            "estimatedHealthScoreGain": 5,
            "description": "Significant storage recovery",
        },
        "risk": {
            "level": "low",
            "score": 10,
            "reversible": True,
            "requiresRestart": False,
            "estimatedDurationSeconds": 30,
            "userConfirmationRequired": False,
            "factors": [],
            "mitigations": ["Backup available"],
        },
        "benefits": {
            "performanceImprovement": 0,
            "storageRecoveryMB": 2500,
            "ramRecoveryMB": 0,
            "startupImprovementMs": 0,
            "privacyImprovement": 0,
            "batteryImprovement": 0,
            "thermalImprovement": 0,
            "stabilityImpact": 0,
        },
        "confidence": 0.95,
        "rollbackAvailable": True,
        "sourceModule": "junk_cleaner",
        "sourceFindingId": "finding-temp-1",
    }


@pytest.fixture
def sample_startup_action():
    """Sample Smart Optimization startup disable action."""
    return {
        "id": "action-startup-1",
        "type": "disable_startup_entry",
        "title": "Disable High-Impact Startup Entry",
        "description": "Disable startup entry consuming 500ms",
        "impact": {
            "score": 60,
            "tier": "high",
            "primaryBenefit": "startupImprovementMs",
            "estimatedHealthScoreGain": 3,
            "description": "Faster startup time",
        },
        "risk": {
            "level": "low",
            "score": 15,
            "reversible": True,
            "requiresRestart": True,
            "estimatedDurationSeconds": 5,
            "userConfirmationRequired": False,
            "factors": [],
            "mitigations": ["Can be re-enabled"],
        },
        "benefits": {
            "performanceImprovement": 5,
            "storageRecoveryMB": 0,
            "ramRecoveryMB": 50,
            "startupImprovementMs": 500,
            "privacyImprovement": 0,
            "batteryImprovement": 0,
            "thermalImprovement": 0,
            "stabilityImpact": 0,
        },
        "confidence": 0.85,
        "rollbackAvailable": True,
        "sourceModule": "startup_manager",
        "sourceFindingId": "finding-startup-1",
    }


@pytest.fixture
def sample_unsupported_action():
    """Sample unsupported Smart Optimization action."""
    return {
        "id": "action-process-1",
        "type": "close_background_process",
        "title": "Close Background Process",
        "description": "Close high-memory background process",
        "impact": {
            "score": 40,
            "tier": "medium",
            "primaryBenefit": "ramRecoveryMB",
            "estimatedHealthScoreGain": 2,
            "description": "Memory recovery",
        },
        "risk": {
            "level": "moderate",
            "score": 40,
            "reversible": False,
            "requiresRestart": False,
            "estimatedDurationSeconds": 1,
            "userConfirmationRequired": True,
            "factors": ["Process may restart automatically"],
            "mitigations": [],
        },
        "benefits": {
            "performanceImprovement": 10,
            "storageRecoveryMB": 0,
            "ramRecoveryMB": 500,
            "startupImprovementMs": 0,
            "privacyImprovement": 0,
            "batteryImprovement": 0,
            "thermalImprovement": 0,
            "stabilityImpact": 0,
        },
        "confidence": 0.70,
        "rollbackAvailable": False,
        "sourceModule": "process_ai",
        "sourceFindingId": "finding-process-1",
    }


# ── Action Mapping Tests ──────────────────────────────────────────────────────


def test_supported_action_mappings_exist():
    """Test that all expected supported action mappings exist."""
    supported_types = [
        "clean_temp_files",
        "clean_browser_cache",
        "empty_recycle_bin",
        "clear_browser_privacy",
        "clear_privacy_traces",
        "disable_startup_entry",
        "clean_registry",
    ]
    
    for action_type in supported_types:
        assert action_type in SMART_OPT_ACTION_MAPPINGS
        mapping = SMART_OPT_ACTION_MAPPINGS[action_type]
        assert mapping.is_supported is True
        assert mapping.action_type != ActionType.NONE


def test_unsupported_action_mappings_exist():
    """Test that all expected unsupported action mappings exist."""
    unsupported_types = [
        "close_background_process",
        "run_windows_update",
        "optimize_disk",
        "delay_startup_entry",
        "remove_duplicates",
        "move_large_files",
        "delete_large_files",
        "adjust_power_plan",
        "update_driver",
        "custom",
    ]
    
    for action_type in unsupported_types:
        assert action_type in SMART_OPT_ACTION_MAPPINGS
        mapping = SMART_OPT_ACTION_MAPPINGS[action_type]
        assert mapping.is_supported is False
        assert mapping.action_type == ActionType.NONE


def test_is_smart_optimization_action_supported():
    """Test is_smart_optimization_action_supported helper."""
    assert is_smart_optimization_action_supported("clean_temp_files") is True
    assert is_smart_optimization_action_supported("disable_startup_entry") is True
    assert is_smart_optimization_action_supported("close_background_process") is False
    assert is_smart_optimization_action_supported("unknown_action") is False


def test_get_smart_optimization_action_mapping():
    """Test get_smart_optimization_action_mapping helper."""
    mapping = get_smart_optimization_action_mapping("clean_temp_files")
    assert mapping is not None
    assert mapping.smart_opt_type == "clean_temp_files"
    assert mapping.action_type == ActionType.DELETE_FILE
    
    mapping = get_smart_optimization_action_mapping("unknown_action")
    assert mapping is None


# ── Adapter Conversion Tests ──────────────────────────────────────────────────


def test_convert_supported_temp_files_action(adapter, sample_temp_files_action):
    """Test converting a supported temp files cleanup action."""
    action = adapter.convert_action(sample_temp_files_action)
    
    assert action.action_id == "action-temp-1"
    assert action.action_type == ActionType.DELETE_FILE
    assert action.state == ActionState.PLANNED
    assert action.is_actionable is True
    assert action.is_fixable is True
    assert action.is_auto_fixable is True
    assert action.fixability == Fixability.AUTO_FIXABLE
    assert action.rule_capability == RuleCapability.REMEDIATION_AVAILABLE
    assert action.requires_review is False
    assert action.is_blocked is False
    assert action.backup_required is True
    assert action.rollback_supported is True
    assert action.priority_score == 95.0  # confidence * 100
    assert action.estimated_size == 2500 * 1024 * 1024  # 2.5 GB in bytes
    assert action.reason == "Remove 2.5 GB of temporary files"
    assert action.rule_id == "smart_opt_clean_temp_files"
    assert action.finding_id == "finding-temp-1"
    assert action.metadata["source"] == "smart_optimization"
    assert action.metadata["smart_opt_type"] == "clean_temp_files"
    assert action.metadata["confidence"] == 0.95
    assert isinstance(action.target, FilesystemActionTarget)
    assert len(action.preconditions) > 0


def test_convert_supported_startup_action(adapter, sample_startup_action):
    """Test converting a supported startup disable action."""
    action = adapter.convert_action(sample_startup_action)
    
    assert action.action_id == "action-startup-1"
    assert action.action_type == ActionType.DISABLE_STARTUP_ENTRY
    assert action.state == ActionState.PLANNED
    assert action.is_actionable is True
    assert action.is_fixable is True
    assert action.is_auto_fixable is True
    assert action.fixability == Fixability.AUTO_FIXABLE
    assert action.rule_capability == RuleCapability.REMEDIATION_AVAILABLE
    assert action.requires_review is False
    assert action.is_blocked is False
    assert action.backup_required is True
    assert action.rollback_supported is True
    assert action.priority_score == 85.0  # confidence * 100
    assert action.estimated_size is None  # No storage recovery
    assert action.reason == "Disable startup entry consuming 500ms"
    assert action.rule_id == "smart_opt_disable_startup_entry"
    assert action.finding_id == "finding-startup-1"
    assert isinstance(action.target, StartupActionTarget)
    assert len(action.preconditions) > 0


def test_convert_unsupported_action(adapter, sample_unsupported_action):
    """Test converting an unsupported action (detection-only)."""
    action = adapter.convert_action(sample_unsupported_action)
    
    assert action.action_id == "action-process-1"
    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.is_fixable is False
    assert action.is_auto_fixable is False
    assert action.fixability == Fixability.NOT_FIXABLE
    assert action.rule_capability == RuleCapability.NO_REMEDIATION
    assert action.requires_review is True
    assert action.is_blocked is False
    assert action.backup_required is False
    assert action.rollback_supported is False
    assert action.priority_score == 70.0  # confidence * 100
    assert action.estimated_size is None  # No storage recovery
    assert action.reason == "Close high-memory background process"
    assert action.rule_id == "smart_opt_close_background_process"
    assert action.finding_id == "finding-process-1"
    assert isinstance(action.target, _NoTarget)
    assert len(action.preconditions) == 0


def test_convert_action_missing_required_fields(adapter):
    """Test converting an action with missing required fields."""
    invalid_action = {
        "title": "Invalid Action",
        # Missing id and type
    }
    
    with pytest.raises(ValueError, match="missing required fields"):
        adapter.convert_action(invalid_action)


def test_convert_action_unknown_type(adapter):
    """Test converting an action with unknown type."""
    unknown_action = {
        "id": "action-unknown-1",
        "type": "unknown_action_type",
        "title": "Unknown Action",
        "description": "This action type is not recognized",
        "confidence": 0.80,
        "rollbackAvailable": False,
        "sourceModule": "unknown",
        "sourceFindingId": "finding-unknown-1",
        "impact": {},
        "risk": {},
        "benefits": {},
    }
    
    action = adapter.convert_action(unknown_action)
    
    # Unknown actions should be treated as unsupported
    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.requires_review is True


def test_convert_multiple_actions(adapter, sample_temp_files_action, sample_startup_action, sample_unsupported_action):
    """Test converting multiple actions at once."""
    actions_data = [
        sample_temp_files_action,
        sample_startup_action,
        sample_unsupported_action,
    ]
    
    actions = adapter.convert_actions(actions_data)
    
    assert len(actions) == 3
    assert actions[0].action_type == ActionType.DELETE_FILE
    assert actions[1].action_type == ActionType.DISABLE_STARTUP_ENTRY
    assert actions[2].action_type == ActionType.NONE


def test_convert_multiple_actions_with_errors(adapter):
    """Test converting multiple actions with some invalid."""
    actions_data = [
        {
            "id": "action-1",
            "type": "clean_temp_files",
            "title": "Valid Action",
            "description": "Valid",
            "confidence": 0.90,
            "rollbackAvailable": True,
            "sourceModule": "junk_cleaner",
            "sourceFindingId": "finding-1",
            "impact": {},
            "risk": {},
            "benefits": {},
        },
        {
            # Missing required fields
            "title": "Invalid Action",
        },
        {
            "id": "action-3",
            "type": "disable_startup_entry",
            "title": "Another Valid Action",
            "description": "Valid",
            "confidence": 0.85,
            "rollbackAvailable": True,
            "sourceModule": "startup_manager",
            "sourceFindingId": "finding-3",
            "impact": {},
            "risk": {},
            "benefits": {},
        },
    ]
    
    actions = adapter.convert_actions(actions_data)
    
    # Should skip invalid action but continue processing
    assert len(actions) == 2
    assert actions[0].action_id == "action-1"
    assert actions[1].action_id == "action-3"


# ── Preconditions Tests ───────────────────────────────────────────────────────


def test_filesystem_action_preconditions(adapter, sample_temp_files_action):
    """Test that filesystem actions have appropriate preconditions."""
    action = adapter.convert_action(sample_temp_files_action)
    
    preconditions = action.preconditions
    assert "TargetExists" in preconditions
    assert "TargetAccessible" in preconditions
    assert "PathWithinAllowedScope" in preconditions
    assert "NotReparsePoint" in preconditions
    assert "NotSymlink" in preconditions
    assert "TargetNotLocked" in preconditions


def test_startup_action_preconditions(adapter, sample_startup_action):
    """Test that startup actions have appropriate preconditions."""
    action = adapter.convert_action(sample_startup_action)
    
    preconditions = action.preconditions
    assert "TargetExists" in preconditions
    assert "TargetAccessible" in preconditions
    assert "PathWithinAllowedScope" in preconditions


def test_unsupported_action_no_preconditions(adapter, sample_unsupported_action):
    """Test that unsupported actions have no preconditions."""
    action = adapter.convert_action(sample_unsupported_action)
    
    assert len(action.preconditions) == 0


# ── Target Creation Tests ─────────────────────────────────────────────────────


def test_filesystem_target_creation(adapter, sample_temp_files_action):
    """Test filesystem target creation."""
    action = adapter.convert_action(sample_temp_files_action)
    
    assert isinstance(action.target, FilesystemActionTarget)
    assert action.target.asset_id == "action-temp-1"
    assert action.target.allowed_location == "temp"
    assert action.target.scope == "user"
    assert action.target.backup_required is True
    assert action.target.rollback_supported is True


def test_startup_target_creation(adapter, sample_startup_action):
    """Test startup target creation."""
    action = adapter.convert_action(sample_startup_action)
    
    assert isinstance(action.target, StartupActionTarget)
    assert action.target.asset_id == "action-startup-1"
    assert action.target.scope == "user"
    assert action.target.backup_required is True
    assert action.target.rollback_supported is True


def test_no_target_for_unsupported(adapter, sample_unsupported_action):
    """Test that unsupported actions get _NoTarget."""
    action = adapter.convert_action(sample_unsupported_action)
    
    assert isinstance(action.target, _NoTarget)


# ── Statistics Tests ──────────────────────────────────────────────────────────


def test_adapter_statistics_tracking(adapter, sample_temp_files_action, sample_unsupported_action):
    """Test that adapter tracks conversion statistics."""
    # Initial statistics
    stats = adapter.get_statistics()
    assert stats["converted"] == 0
    assert stats["unsupported"] == 0
    assert stats["errors"] == 0
    
    # Convert supported action
    adapter.convert_action(sample_temp_files_action)
    stats = adapter.get_statistics()
    assert stats["converted"] == 1
    assert stats["unsupported"] == 0
    
    # Convert unsupported action
    adapter.convert_action(sample_unsupported_action)
    stats = adapter.get_statistics()
    assert stats["converted"] == 1
    assert stats["unsupported"] == 1
    
    # Convert invalid action
    try:
        adapter.convert_action({"title": "Invalid"})
    except ValueError:
        pass
    
    stats = adapter.get_statistics()
    assert stats["errors"] == 1


def test_adapter_statistics_reset(adapter, sample_temp_files_action):
    """Test that adapter statistics can be reset."""
    adapter.convert_action(sample_temp_files_action)
    
    stats = adapter.get_statistics()
    assert stats["converted"] == 1
    
    adapter.reset_statistics()
    
    stats = adapter.get_statistics()
    assert stats["converted"] == 0
    assert stats["unsupported"] == 0
    assert stats["errors"] == 0


# ── Safety Tests ──────────────────────────────────────────────────────────────


def test_adapter_never_executes_remediation(adapter, sample_temp_files_action):
    """Test that adapter never executes remediation."""
    # Converting an action should not perform any filesystem operations
    action = adapter.convert_action(sample_temp_files_action)
    
    # Action should be in PLANNED state, not COMPLETED
    assert action.state == ActionState.PLANNED
    
    # No backup should be created during conversion
    assert action.backup_location is None
    assert action.backup_identity is None


def test_adapter_does_not_bypass_safety_gate(adapter, sample_temp_files_action):
    """Test that adapter does not bypass SafetyGate."""
    action = adapter.convert_action(sample_temp_files_action)
    
    # Action should have preconditions that will be validated by SafetyGate
    assert len(action.preconditions) > 0
    
    # Action should be marked as requiring SafetyGate validation
    assert action.is_auto_fixable is True  # Will be validated by SafetyGate
    assert action.is_actionable is True  # Will be validated by CapabilityContract


def test_adapter_marks_dangerous_actions_as_unsupported(adapter):
    """Test that adapter marks dangerous actions as unsupported."""
    dangerous_actions = [
        "close_background_process",  # Process termination
        "delete_large_files",  # Requires user review
        "move_large_files",  # Requires user review
        "remove_duplicates",  # Requires user review
    ]
    
    for action_type in dangerous_actions:
        action_data = {
            "id": f"action-{action_type}",
            "type": action_type,
            "title": f"Dangerous {action_type}",
            "description": "Potentially dangerous action",
            "confidence": 0.90,
            "rollbackAvailable": False,
            "sourceModule": "test",
            "sourceFindingId": f"finding-{action_type}",
            "impact": {},
            "risk": {},
            "benefits": {},
        }
        
        action = adapter.convert_action(action_data)
        
        # Dangerous actions should be marked as unsupported
        assert action.action_type == ActionType.NONE
        assert action.state == ActionState.NOT_FIXABLE
        assert action.is_actionable is False
        assert action.requires_review is True


# ── Edge Cases Tests ──────────────────────────────────────────────────────────


def test_action_without_rollback(adapter):
    """Test converting an action without rollback support."""
    action_data = {
        "id": "action-no-rollback",
        "type": "clean_temp_files",
        "title": "Clean Temp Files (No Rollback)",
        "description": "Cleanup without rollback",
        "confidence": 0.80,
        "rollbackAvailable": False,  # No rollback
        "sourceModule": "junk_cleaner",
        "sourceFindingId": "finding-no-rollback",
        "impact": {},
        "risk": {},
        "benefits": {},
    }
    
    action = adapter.convert_action(action_data)
    
    assert action.backup_required is False
    assert action.rollback_supported is False


def test_action_with_zero_confidence(adapter):
    """Test converting an action with zero confidence."""
    action_data = {
        "id": "action-zero-confidence",
        "type": "clean_temp_files",
        "title": "Clean Temp Files (Zero Confidence)",
        "description": "Cleanup with zero confidence",
        "confidence": 0.0,  # Zero confidence
        "rollbackAvailable": True,
        "sourceModule": "junk_cleaner",
        "sourceFindingId": "finding-zero-confidence",
        "impact": {},
        "risk": {},
        "benefits": {},
    }
    
    action = adapter.convert_action(action_data)
    
    assert action.priority_score == 0.0


def test_action_with_no_storage_recovery(adapter):
    """Test converting an action with no storage recovery benefit."""
    action_data = {
        "id": "action-no-storage",
        "type": "disable_startup_entry",
        "title": "Disable Startup Entry (No Storage)",
        "description": "Startup optimization with no storage benefit",
        "confidence": 0.85,
        "rollbackAvailable": True,
        "sourceModule": "startup_manager",
        "sourceFindingId": "finding-no-storage",
        "impact": {},
        "risk": {},
        "benefits": {
            "storageRecoveryMB": 0,  # No storage recovery
        },
    }
    
    action = adapter.convert_action(action_data)
    
    assert action.estimated_size is None


def test_empty_actions_list(adapter):
    """Test converting an empty list of actions."""
    actions = adapter.convert_actions([])
    
    assert len(actions) == 0
    
    stats = adapter.get_statistics()
    assert stats["converted"] == 0
    assert stats["unsupported"] == 0
    assert stats["errors"] == 0
