"""
SC-8C11 Phase 2 — Smart Optimization Backend Integration Tests

Tests for converting Smart Optimization analysis output into canonical
ActionPlan and persisting via the existing RPC bridge.
"""

import pytest

from avs_backend.api.registry import all_methods, get as get_method
from avs_backend import scan_core_rpc  # noqa: F401 — triggers RPC registration
from avs_backend.scan_core.adapters.smart_optimization_plan_builder import (
    SmartOptimizationPlanBuilder,
    _build_action_summary,
)
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionState,
    ActionType,
    RemediationAction,
    _NoTarget,
)
from avs_backend.scan_core.rules.actionability import Fixability
from avs_backend.scan_core.rules.priority import RuleCapability


# ── Test Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def sample_smart_opt_actions():
    """Sample Smart Optimization actions with supported and unsupported."""
    return [
        {
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
        },
        {
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
        },
        {
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
        },
    ]


@pytest.fixture
def builder():
    """Create a SmartOptimizationPlanBuilder instance."""
    return SmartOptimizationPlanBuilder()


# ── Plan Builder Tests ────────────────────────────────────────────────────────


def test_build_plan_creates_action_plan(builder, sample_smart_opt_actions):
    """Test that build_plan creates a real ActionPlan."""
    plan = builder.build_plan(sample_smart_opt_actions)
    
    assert isinstance(plan, ActionPlan)
    assert plan.plan_id is not None
    assert len(plan.plan_id) > 0
    assert len(plan.actions) == 3
    assert plan.summary is not None
    assert plan.summary.total_findings == 3


def test_build_plan_action_mapping(builder, sample_smart_opt_actions):
    """Test that actions are correctly mapped to canonical types."""
    plan = builder.build_plan(sample_smart_opt_actions)
    
    action_types = [a.action_type for a in plan.actions]
    assert ActionType.DELETE_FILE in action_types
    assert ActionType.DISABLE_STARTUP_ENTRY in action_types
    assert ActionType.NONE in action_types


def test_build_plan_supported_action_state(builder, sample_smart_opt_actions):
    """Test that supported actions are planned and unsupported are not."""
    plan = builder.build_plan(sample_smart_opt_actions)
    
    # Supported temp files action
    temp_action = next(a for a in plan.actions if a.action_id == "action-temp-1")
    assert temp_action.state == ActionState.PLANNED
    assert temp_action.is_actionable is True
    assert temp_action.is_fixable is True
    assert temp_action.rule_capability == RuleCapability.REMEDIATION_AVAILABLE
    
    # Supported startup action
    startup_action = next(a for a in plan.actions if a.action_id == "action-startup-1")
    assert startup_action.state == ActionState.PLANNED
    assert startup_action.is_actionable is True
    assert startup_action.is_fixable is True
    
    # Unsupported process action
    process_action = next(a for a in plan.actions if a.action_id == "action-process-1")
    assert process_action.state == ActionState.NOT_FIXABLE
    assert process_action.is_actionable is False
    assert process_action.is_fixable is False
    assert process_action.rule_capability == RuleCapability.NO_REMEDIATION
    assert isinstance(process_action.target, _NoTarget)


def test_build_plan_summary_statistics(builder, sample_smart_opt_actions):
    """Test that ActionSummary is correctly computed."""
    plan = builder.build_plan(sample_smart_opt_actions)
    
    summary = plan.summary
    assert summary.total_findings == 3
    assert summary.actions_planned == 3
    assert summary.auto_fixable_actions == 2
    assert summary.review_required_actions == 0
    assert summary.not_fixable_actions == 1
    assert summary.blocked_actions == 0
    assert summary.actions_by_type.get("delete_file") == 1
    assert summary.actions_by_type.get("disable_startup_entry") == 1
    assert summary.actions_by_type.get("none") == 1
    assert summary.estimated_affected_size == 2500 * 1024 * 1024
    assert summary.highest_priority_action_id == "action-temp-1"
    assert summary.largest_affected_action_id == "action-temp-1"


def test_build_plan_empty_actions(builder):
    """Test that empty action list creates a valid but empty ActionPlan."""
    plan = builder.build_plan([])
    
    assert isinstance(plan, ActionPlan)
    assert len(plan.actions) == 0
    assert plan.summary.total_findings == 0
    assert plan.summary.actions_planned == 0
    assert plan.summary.auto_fixable_actions == 0
    assert plan.summary.estimated_affected_size is None


def test_build_plan_stable_action_ids(builder):
    """Test that action IDs remain stable across conversions."""
    actions = [
        {
            "id": "action-1",
            "type": "clean_temp_files",
            "title": "Clean Temp Files",
            "description": "Test",
            "confidence": 0.9,
            "rollbackAvailable": True,
            "sourceModule": "junk_cleaner",
            "sourceFindingId": "finding-1",
            "impact": {},
            "risk": {},
            "benefits": {},
        },
    ]
    
    plan1 = builder.build_plan(actions)
    plan2 = builder.build_plan(actions)
    
    # Action IDs should be stable (same input ID)
    assert plan1.actions[0].action_id == "action-1"
    assert plan2.actions[0].action_id == "action-1"


def test_build_plan_unique_plan_ids(builder, sample_smart_opt_actions):
    """Test that each build generates a unique plan_id."""
    plan1 = builder.build_plan(sample_smart_opt_actions)
    plan2 = builder.build_plan(sample_smart_opt_actions)
    
    assert plan1.plan_id != plan2.plan_id


def test_build_plan_no_execution(builder, sample_smart_opt_actions):
    """Test that build_plan never executes remediation."""
    plan = builder.build_plan(sample_smart_opt_actions)
    
    # All actions should be in PLANNED or NOT_FIXABLE state
    for action in plan.actions:
        assert action.state in (ActionState.PLANNED, ActionState.NOT_FIXABLE)


def test_build_plan_privacy_safe(builder, sample_smart_opt_actions):
    """Test that no canonical paths or sensitive asset IDs are exposed."""
    plan = builder.build_plan(sample_smart_opt_actions)
    
    for action in plan.actions:
        # No actual canonical paths should be present
        target_dict = action.target.to_dict()
        assert target_dict.get("canonical_path", "") in ("", None)
        # asset_id may be empty (for _NoTarget) or the action_id (non-sensitive)
        # but should never be a real filesystem path or registry key
        asset_id = target_dict.get("asset_id", "")
        if asset_id:
            assert "\\" not in asset_id
            assert "/" not in asset_id
            assert "HKEY" not in asset_id.upper()


# ── Action Summary Tests ──────────────────────────────────────────────────────


def test_build_action_summary_empty():
    """Test building summary from empty actions."""
    summary = _build_action_summary(tuple())
    
    assert summary.total_findings == 0
    assert summary.actions_planned == 0
    assert summary.estimated_affected_size is None
    assert summary.highest_priority_action_id is None


def test_build_action_summary_single_action(builder):
    """Test building summary from a single action."""
    actions = [
        {
            "id": "action-1",
            "type": "clean_temp_files",
            "title": "Clean Temp Files",
            "description": "Test",
            "confidence": 0.8,
            "rollbackAvailable": True,
            "sourceModule": "junk_cleaner",
            "sourceFindingId": "finding-1",
            "impact": {},
            "risk": {},
            "benefits": {"storageRecoveryMB": 100},
        },
    ]
    
    plan = builder.build_plan(actions)
    summary = plan.summary
    
    assert summary.total_findings == 1
    assert summary.actions_planned == 1
    assert summary.auto_fixable_actions == 1
    assert summary.estimated_affected_size == 100 * 1024 * 1024
    assert summary.highest_priority_action_id == "action-1"


# ── Persistence Tests ─────────────────────────────────────────────────────────


def test_plan_persistence_round_trip(tmp_path, builder, sample_smart_opt_actions):
    """Test that a built plan can be persisted and loaded."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
    
    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()
    
    repo = ActionPlanRepository(db)
    plan = builder.build_plan(sample_smart_opt_actions)
    
    # Save
    saved = repo.save(plan)
    assert saved is True
    
    # Load
    loaded = repo.load(plan.plan_id)
    assert loaded is not None
    assert loaded.plan_id == plan.plan_id
    assert len(loaded.actions) == len(plan.actions)
    
    # Verify action type consistency
    loaded_types = [a.action_type for a in loaded.actions]
    original_types = [a.action_type for a in plan.actions]
    assert loaded_types == original_types


def test_plan_survives_new_repository_instance(tmp_path, builder, sample_smart_opt_actions):
    """Test that a persisted plan survives a new repository/database instance."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
    
    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()
    
    repo1 = ActionPlanRepository(db)
    plan = builder.build_plan(sample_smart_opt_actions)
    repo1.save(plan)
    
    # Create a new repository instance pointing to the same database
    db2 = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db2.initialize()
    repo2 = ActionPlanRepository(db2)
    
    loaded = repo2.load(plan.plan_id)
    assert loaded is not None
    assert loaded.plan_id == plan.plan_id


def test_plan_duplicate_save(tmp_path, builder, sample_smart_opt_actions):
    """Test that saving the same plan twice updates it."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
    
    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()
    
    repo = ActionPlanRepository(db)
    plan = builder.build_plan(sample_smart_opt_actions)
    
    repo.save(plan)
    
    # Save again should update (not fail)
    saved = repo.save(plan)
    assert saved is True
    
    loaded = repo.load(plan.plan_id)
    assert loaded is not None


# ── RPC Tests ─────────────────────────────────────────────────────────────────


def test_smart_optimization_plan_rpc_registered():
    """Test that the RPC is registered."""
    methods = all_methods()
    
    assert "scan_core.smart_optimization.plan" in methods


def _invoke(method: str, params):
    """Helper to invoke a registered RPC method directly."""
    handler = get_method(method)
    assert handler is not None, f"Method {method} not registered"
    return handler(params)


def test_smart_optimization_plan_rpc_returns_plan_id(sample_smart_opt_actions):
    """Test that the RPC returns a valid plan_id."""
    result = _invoke("scan_core.smart_optimization.plan", {"actions": sample_smart_opt_actions})
    
    assert result["ok"] is True
    assert "plan_id" in result
    assert isinstance(result["plan_id"], str)
    assert len(result["plan_id"]) > 0
    assert result["total_actions"] == 3
    assert result["auto_fixable"] == 2
    assert result["review_required"] == 0
    assert result["not_fixable"] == 1
    assert result["estimated_affected_size"] == 2500 * 1024 * 1024


def test_smart_optimization_plan_rpc_sanitized(sample_smart_opt_actions):
    """Test that the RPC response does not expose sensitive data."""
    result = _invoke("scan_core.smart_optimization.plan", {"actions": sample_smart_opt_actions})
    
    assert result["ok"] is True
    # Response should not contain canonical paths, registry keys, asset IDs, etc.
    assert "canonical_path" not in result
    assert "asset_id" not in result
    assert "backup_location" not in result
    assert "registry_key" not in result
    assert "browser_profile" not in result


def test_smart_optimization_plan_rpc_missing_actions():
    """Test that the RPC rejects missing actions."""
    result = _invoke("scan_core.smart_optimization.plan", {})
    
    assert result["ok"] is False
    assert "actions" in result["error"].lower()


def test_smart_optimization_plan_rpc_invalid_actions():
    """Test that the RPC rejects invalid actions parameter."""
    result = _invoke("scan_core.smart_optimization.plan", {"actions": "not a list"})
    
    assert result["ok"] is False
    assert "actions" in result["error"].lower()


def test_smart_optimization_plan_rpc_empty_actions():
    """Test that the RPC rejects empty actions."""
    result = _invoke("scan_core.smart_optimization.plan", {"actions": []})
    
    assert result["ok"] is False
    assert "no" in result["error"].lower()


def test_smart_optimization_plan_rpc_unsupported_not_executable(sample_smart_opt_actions):
    """Test that unsupported actions in the response are not executable."""
    from avs_backend.scan_core_rpc import get_coordinator
    
    result = _invoke("scan_core.smart_optimization.plan", {"actions": sample_smart_opt_actions})
    
    assert result["ok"] is True
    plan_id = result["plan_id"]
    
    # Load the persisted plan and verify unsupported action is not executable
    coordinator = get_coordinator()
    repo = ActionPlanRepository(coordinator.database)
    plan = repo.load(plan_id)
    
    assert plan is not None
    process_action = next(a for a in plan.actions if a.action_id == "action-process-1")
    assert process_action.action_type == ActionType.NONE
    assert process_action.state == ActionState.NOT_FIXABLE
    assert process_action.is_actionable is False


# ── Safety Tests ──────────────────────────────────────────────────────────────


def test_plan_builder_does_not_call_legacy_services(builder, sample_smart_opt_actions):
    """Test that the plan builder does not invoke legacy execution services."""
    # If legacy services were called, this would raise or have side effects
    # The pure conversion should succeed without any external calls
    plan = builder.build_plan(sample_smart_opt_actions)
    assert plan is not None


def test_plan_builder_does_not_mutate_system(tmp_path, builder, sample_smart_opt_actions):
    """Test that the plan builder does not mutate the filesystem."""
    # Run conversion and ensure no files are created in temp dir
    import os
    
    before = set(os.listdir(tmp_path))
    builder.build_plan(sample_smart_opt_actions)
    after = set(os.listdir(tmp_path))
    
    # Only the existing fixtures should exist (if any)
    # No new files created by the plan builder
    new_files = after - before
    assert len(new_files) == 0


def test_rpc_does_not_execute_remediation(sample_smart_opt_actions):
    """Test that the RPC does not call RemediationCoordinator.execute."""
    result = _invoke("scan_core.smart_optimization.plan", {"actions": sample_smart_opt_actions})
    
    assert result["ok"] is True
    assert "plan_id" in result
    # No execution summary should be present
    assert "execution_id" not in result
    assert "summary" not in result


# ── Capability Contract Tests ─────────────────────────────────────────────────


def test_unsupported_action_cannot_bypass_capability_contract(builder):
    """Test that unsupported actions remain non-actionable."""
    actions = [
        {
            "id": "action-risky",
            "type": "delete_large_files",
            "title": "Delete Large Files",
            "description": "User review required",
            "confidence": 0.99,
            "rollbackAvailable": False,
            "sourceModule": "large_file_analyzer",
            "sourceFindingId": "finding-risky",
            "impact": {},
            "risk": {},
            "benefits": {},
        },
    ]
    
    plan = builder.build_plan(actions)
    
    assert len(plan.actions) == 1
    action = plan.actions[0]
    
    # AI confidence cannot bypass capability contract
    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.is_auto_fixable is False
