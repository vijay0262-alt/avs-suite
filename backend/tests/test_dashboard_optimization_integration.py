"""
SC-8C13 Phase 2 — Dashboard Optimization Backend Integration Tests

Tests for converting Dashboard Optimize preview actions into canonical
ActionPlan, persisting via ActionPlanRepository, and the RPC bridge.
"""

import pytest

from avs_backend.api.registry import all_methods, get as get_method
from avs_backend import scan_core_rpc  # noqa: F401 — triggers RPC registration
from avs_backend.scan_core.adapters.dashboard_optimization_plan_builder import (
    DashboardOptimizationPlanBuilder,
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
def sample_dashboard_actions():
    """Sample Dashboard Optimize actions with supported and unsupported."""
    return [
        {
            "id": "action-temp-1",
            "type": "clean_temp_files",
            "title": "Temporary Files",
            "description": "Windows and user temporary files",
            "size": 2500 * 1024 * 1024,
            "rollbackAvailable": True,
        },
        {
            "id": "action-recycle-1",
            "type": "empty_recycle_bin",
            "title": "Recycle Bin",
            "description": "Files in Recycle Bin",
            "size": 500 * 1024 * 1024,
            "rollbackAvailable": False,
        },
        {
            "id": "action-browser-1",
            "type": "clean_browser_cache",
            "title": "Browser Cache",
            "description": "Browser temporary files and cache",
            "size": 200 * 1024 * 1024,
            "rollbackAvailable": True,
        },
        {
            "id": "action-thumb-1",
            "type": "clean_thumbnail_cache",
            "title": "Thumbnail Cache",
            "description": "Windows thumbnail and icon cache",
            "size": 50 * 1024 * 1024,
            "rollbackAvailable": False,
        },
        {
            "id": "action-prefetch-1",
            "type": "clean_prefetch",
            "title": "Prefetch Files",
            "description": "Windows application prefetch files",
            "size": 30 * 1024 * 1024,
            "rollbackAvailable": False,
        },
        {
            "id": "action-wu-1",
            "type": "clean_windows_update_cache",
            "title": "Windows Update Cache",
            "description": "Downloaded Windows Update packages",
            "size": 1000 * 1024 * 1024,
            "rollbackAvailable": False,
        },
        {
            "id": "action-dns-1",
            "type": "flush_dns",
            "title": "Flush DNS",
            "description": "Clear DNS resolver cache",
            "size": 0,
            "rollbackAvailable": False,
        },
        {
            "id": "action-mem-1",
            "type": "trim_memory",
            "title": "Trim Memory",
            "description": "Trim working sets of inactive processes",
            "size": 0,
            "rollbackAvailable": False,
        },
    ]


@pytest.fixture
def sample_supported_only_actions():
    """Sample Dashboard Optimize actions with only supported operations."""
    return [
        {
            "id": "action-temp-1",
            "type": "clean_temp_files",
            "title": "Temporary Files",
            "description": "Windows and user temporary files",
            "size": 2500 * 1024 * 1024,
            "rollbackAvailable": True,
        },
        {
            "id": "action-recycle-1",
            "type": "empty_recycle_bin",
            "title": "Recycle Bin",
            "description": "Files in Recycle Bin",
            "size": 500 * 1024 * 1024,
            "rollbackAvailable": False,
        },
    ]


@pytest.fixture
def builder():
    """Create a DashboardOptimizationPlanBuilder instance."""
    return DashboardOptimizationPlanBuilder()


# ── Plan Builder Tests ────────────────────────────────────────────────────────


def test_build_plan_creates_action_plan(builder, sample_dashboard_actions):
    """Test that build_plan creates a real ActionPlan."""
    plan = builder.build_plan(sample_dashboard_actions)

    assert isinstance(plan, ActionPlan)
    assert plan.plan_id is not None
    assert len(plan.plan_id) > 0
    assert len(plan.actions) == 8
    assert plan.summary is not None
    assert plan.summary.total_findings == 8


def test_build_plan_action_mapping(builder, sample_dashboard_actions):
    """Test that actions are correctly mapped to canonical types."""
    plan = builder.build_plan(sample_dashboard_actions)

    action_types = [a.action_type for a in plan.actions]
    assert ActionType.DELETE_FILE in action_types  # temp, prefetch, wu
    assert ActionType.DELETE_DIRECTORY in action_types  # recycle bin
    assert ActionType.CLEAR_BROWSER_CACHE in action_types  # browser cache
    assert ActionType.CLEAR_CACHE in action_types  # thumbnail cache
    assert ActionType.NONE in action_types  # flush_dns, trim_memory


def test_build_plan_supported_action_state(builder, sample_dashboard_actions):
    """Test that supported actions are planned and unsupported are not."""
    plan = builder.build_plan(sample_dashboard_actions)

    # Supported temp files action
    temp_action = next(a for a in plan.actions if a.action_id == "action-temp-1")
    assert temp_action.state == ActionState.PLANNED
    assert temp_action.is_actionable is True
    assert temp_action.is_fixable is True
    assert temp_action.rule_capability == RuleCapability.REMEDIATION_AVAILABLE

    # Unsupported flush DNS action
    dns_action = next(a for a in plan.actions if a.action_id == "action-dns-1")
    assert dns_action.state == ActionState.NOT_FIXABLE
    assert dns_action.is_actionable is False
    assert dns_action.is_fixable is False
    assert dns_action.rule_capability == RuleCapability.NO_REMEDIATION
    assert isinstance(dns_action.target, _NoTarget)

    # Unsupported trim memory action
    mem_action = next(a for a in plan.actions if a.action_id == "action-mem-1")
    assert mem_action.state == ActionState.NOT_FIXABLE
    assert mem_action.is_actionable is False
    assert mem_action.is_fixable is False


def test_build_plan_summary_statistics(builder, sample_dashboard_actions):
    """Test that ActionSummary is correctly computed."""
    plan = builder.build_plan(sample_dashboard_actions)

    summary = plan.summary
    assert summary.total_findings == 8
    assert summary.actions_planned == 8
    assert summary.auto_fixable_actions == 6
    assert summary.review_required_actions == 0
    assert summary.not_fixable_actions == 2
    assert summary.blocked_actions == 0
    # DELETE_FILE appears 3 times (temp, prefetch, wu)
    assert summary.actions_by_type.get("delete_file") == 3
    assert summary.actions_by_type.get("delete_directory") == 1
    assert summary.actions_by_type.get("clear_browser_cache") == 1
    assert summary.actions_by_type.get("clear_cache") == 1
    assert summary.actions_by_type.get("none") == 2
    # Total estimated size = 2500 + 500 + 200 + 50 + 30 + 1000 = 4280 MB
    assert summary.estimated_affected_size == 4280 * 1024 * 1024


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
            "size": 100,
        },
    ]

    plan1 = builder.build_plan(actions)
    plan2 = builder.build_plan(actions)

    assert plan1.actions[0].action_id == "action-1"
    assert plan2.actions[0].action_id == "action-1"


def test_build_plan_unique_plan_ids(builder, sample_dashboard_actions):
    """Test that each build generates a unique plan_id."""
    plan1 = builder.build_plan(sample_dashboard_actions)
    plan2 = builder.build_plan(sample_dashboard_actions)

    assert plan1.plan_id != plan2.plan_id


def test_build_plan_no_execution(builder, sample_dashboard_actions):
    """Test that build_plan never executes remediation."""
    plan = builder.build_plan(sample_dashboard_actions)

    for action in plan.actions:
        assert action.state in (ActionState.PLANNED, ActionState.NOT_FIXABLE)


def test_build_plan_privacy_safe(builder, sample_dashboard_actions):
    """Test that no canonical paths or sensitive asset IDs are exposed."""
    plan = builder.build_plan(sample_dashboard_actions)

    for action in plan.actions:
        target_dict = action.target.to_dict()
        assert target_dict.get("canonical_path", "") in ("", None)
        asset_id = target_dict.get("asset_id", "")
        if asset_id:
            assert "\\" not in asset_id
            assert "/" not in asset_id
            assert "HKEY" not in asset_id.upper()


def test_build_plan_snapshot_version(builder, sample_dashboard_actions):
    """Test that the plan has the correct snapshot version."""
    plan = builder.build_plan(sample_dashboard_actions)

    assert plan.snapshot_version == "dashboard_optimization_1.0.0"


def test_build_plan_snapshot_ttl(builder, sample_dashboard_actions):
    """Test that the plan has the correct snapshot TTL."""
    plan = builder.build_plan(sample_dashboard_actions)

    assert plan.snapshot_ttl_seconds == 3600


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
            "size": 100 * 1024 * 1024,
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


def test_plan_persistence_round_trip(tmp_path, builder, sample_dashboard_actions):
    """Test that a built plan can be persisted and loaded."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase

    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()

    repo = ActionPlanRepository(db)
    plan = builder.build_plan(sample_dashboard_actions)

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


def test_plan_survives_new_repository_instance(tmp_path, builder, sample_dashboard_actions):
    """Test that a persisted plan survives a new repository/database instance."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase

    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()

    repo1 = ActionPlanRepository(db)
    plan = builder.build_plan(sample_dashboard_actions)
    repo1.save(plan)

    # Create a new repository instance pointing to the same database
    db2 = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db2.initialize()
    repo2 = ActionPlanRepository(db2)

    loaded = repo2.load(plan.plan_id)
    assert loaded is not None
    assert loaded.plan_id == plan.plan_id


def test_plan_duplicate_save(tmp_path, builder, sample_dashboard_actions):
    """Test that saving the same plan twice updates it."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase

    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()

    repo = ActionPlanRepository(db)
    plan = builder.build_plan(sample_dashboard_actions)

    repo.save(plan)

    # Save again should update (not fail)
    saved = repo.save(plan)
    assert saved is True

    loaded = repo.load(plan.plan_id)
    assert loaded is not None


def test_persisted_plan_unsupported_actions_remain_not_fixable(
    tmp_path, builder, sample_dashboard_actions
):
    """Test that unsupported actions remain NOT_FIXABLE after persistence round-trip."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase

    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()

    repo = ActionPlanRepository(db)
    plan = builder.build_plan(sample_dashboard_actions)
    repo.save(plan)

    loaded = repo.load(plan.plan_id)
    assert loaded is not None

    # Check unsupported actions
    dns_action = next(a for a in loaded.actions if a.action_id == "action-dns-1")
    assert dns_action.action_type == ActionType.NONE
    assert dns_action.state == ActionState.NOT_FIXABLE
    assert dns_action.is_actionable is False

    mem_action = next(a for a in loaded.actions if a.action_id == "action-mem-1")
    assert mem_action.action_type == ActionType.NONE
    assert mem_action.state == ActionState.NOT_FIXABLE
    assert mem_action.is_actionable is False


def test_persisted_plan_no_raw_sensitive_data(
    tmp_path, builder, sample_dashboard_actions
):
    """Test that persisted plan contains no prohibited raw privacy data."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase

    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()

    repo = ActionPlanRepository(db)
    plan = builder.build_plan(sample_dashboard_actions)
    repo.save(plan)

    loaded = repo.load(plan.plan_id)
    assert loaded is not None

    for action in loaded.actions:
        target_dict = action.target.to_dict()
        assert target_dict.get("canonical_path", "") in ("", None)
        # No backup locations should be assigned during planning
        assert action.backup_location is None
        assert action.backup_identity is None


# ── RPC Tests ─────────────────────────────────────────────────────────────────


def test_dashboard_optimization_plan_rpc_registered():
    """Test that the RPC is registered."""
    methods = all_methods()

    assert "scan_core.dashboard_optimization.plan" in methods


def _invoke(method: str, params):
    """Helper to invoke a registered RPC method directly."""
    handler = get_method(method)
    assert handler is not None, f"Method {method} not registered"
    return handler(params)


def test_dashboard_optimization_plan_rpc_returns_plan_id(sample_dashboard_actions):
    """Test that the RPC returns a valid plan_id."""
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": sample_dashboard_actions})

    assert result["ok"] is True
    assert "plan_id" in result
    assert isinstance(result["plan_id"], str)
    assert len(result["plan_id"]) > 0
    assert result["total_actions"] == 8
    assert result["auto_fixable"] == 6
    assert result["review_required"] == 0
    assert result["not_fixable"] == 2
    assert result["estimated_affected_size"] == 4280 * 1024 * 1024


def test_dashboard_optimization_plan_rpc_statistics(sample_dashboard_actions):
    """Test that the RPC returns correct adapter statistics."""
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": sample_dashboard_actions})

    assert result["ok"] is True
    stats = result["statistics"]
    assert stats["converted"] == 6
    assert stats["unsupported"] == 2
    assert stats["errors"] == 0


def test_dashboard_optimization_plan_rpc_sanitized(sample_dashboard_actions):
    """Test that the RPC response does not expose sensitive data."""
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": sample_dashboard_actions})

    assert result["ok"] is True
    # Response should not contain canonical paths, registry keys, asset IDs, etc.
    assert "canonical_path" not in result
    assert "asset_id" not in result
    assert "backup_location" not in result
    assert "registry_key" not in result
    assert "browser_profile" not in result


def test_dashboard_optimization_plan_rpc_missing_actions():
    """Test that the RPC rejects missing actions."""
    result = _invoke("scan_core.dashboard_optimization.plan", {})

    assert result["ok"] is False
    assert "actions" in result["error"].lower()


def test_dashboard_optimization_plan_rpc_invalid_actions():
    """Test that the RPC rejects invalid actions parameter."""
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": "not a list"})

    assert result["ok"] is False
    assert "actions" in result["error"].lower()


def test_dashboard_optimization_plan_rpc_empty_actions():
    """Test that the RPC rejects empty actions."""
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": []})

    assert result["ok"] is False
    assert "no" in result["error"].lower()


def test_dashboard_optimization_plan_rpc_supported_only(sample_supported_only_actions):
    """Test that the RPC works with only supported actions."""
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": sample_supported_only_actions})

    assert result["ok"] is True
    assert result["total_actions"] == 2
    assert result["auto_fixable"] == 2
    assert result["not_fixable"] == 0


def test_dashboard_optimization_plan_rpc_unsupported_only():
    """Test that the RPC works with only unsupported actions."""
    actions = [
        {"id": "action-dns-1", "type": "flush_dns", "title": "Flush DNS", "size": 0},
        {"id": "action-mem-1", "type": "trim_memory", "title": "Trim Memory", "size": 0},
    ]
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": actions})

    assert result["ok"] is True
    assert result["total_actions"] == 2
    assert result["auto_fixable"] == 0
    assert result["not_fixable"] == 2


def test_dashboard_optimization_plan_rpc_unsupported_not_executable(sample_dashboard_actions):
    """Test that unsupported actions in the persisted plan are not executable."""
    from avs_backend.scan_core_rpc import get_coordinator

    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": sample_dashboard_actions})

    assert result["ok"] is True
    plan_id = result["plan_id"]

    # Load the persisted plan and verify unsupported action is not executable
    coordinator = get_coordinator()
    repo = ActionPlanRepository(coordinator.database)
    plan = repo.load(plan_id)

    assert plan is not None
    dns_action = next(a for a in plan.actions if a.action_id == "action-dns-1")
    assert dns_action.action_type == ActionType.NONE
    assert dns_action.state == ActionState.NOT_FIXABLE
    assert dns_action.is_actionable is False

    mem_action = next(a for a in plan.actions if a.action_id == "action-mem-1")
    assert mem_action.action_type == ActionType.NONE
    assert mem_action.state == ActionState.NOT_FIXABLE
    assert mem_action.is_actionable is False


def test_dashboard_optimization_plan_rpc_plan_id_only_when_persisted(sample_dashboard_actions):
    """Test that plan_id is returned only when persistence succeeds."""
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": sample_dashboard_actions})

    assert result["ok"] is True
    assert "plan_id" in result
    assert isinstance(result["plan_id"], str)
    assert len(result["plan_id"]) > 0

    # Verify the plan was actually persisted
    from avs_backend.scan_core_rpc import get_coordinator
    coordinator = get_coordinator()
    repo = ActionPlanRepository(coordinator.database)
    loaded = repo.load(result["plan_id"])
    assert loaded is not None


def test_dashboard_optimization_plan_rpc_no_execution(sample_dashboard_actions):
    """Test that the RPC performs no execution — all actions remain PLANNED or NOT_FIXABLE."""
    from avs_backend.scan_core_rpc import get_coordinator

    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": sample_dashboard_actions})

    assert result["ok"] is True
    plan_id = result["plan_id"]

    coordinator = get_coordinator()
    repo = ActionPlanRepository(coordinator.database)
    plan = repo.load(plan_id)

    assert plan is not None
    for action in plan.actions:
        assert action.state in (ActionState.PLANNED, ActionState.NOT_FIXABLE)


def test_dashboard_optimization_plan_rpc_does_not_call_legacy_execute(sample_dashboard_actions):
    """Test that the RPC does not call legacy dashboard.optimize.execute."""
    # The RPC should only create a plan, not execute anything.
    # We verify by checking that the result only contains planning metadata.
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": sample_dashboard_actions})

    assert result["ok"] is True
    # No execution-related fields should be present
    assert "execution_id" not in result
    assert "executed" not in result
    assert "results" not in result
    assert "cleaned" not in result


def test_dashboard_optimization_plan_rpc_unknown_action_type():
    """Test that the RPC handles unknown action types safely."""
    actions = [
        {"id": "action-1", "type": "clean_temp_files", "title": "Temp", "size": 100},
        {"id": "action-2", "type": "unknown_operation", "title": "Unknown", "size": 0},
    ]
    result = _invoke("scan_core.dashboard_optimization.plan", {"actions": actions})

    assert result["ok"] is True
    assert result["total_actions"] == 2
    assert result["auto_fixable"] == 1
    assert result["not_fixable"] == 1
