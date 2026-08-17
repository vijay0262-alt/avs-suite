"""
SC-8C13 Phase 2 — Dashboard Optimization Adapter Tests

Tests for Dashboard Optimize to scan_core RemediationAction conversion.
"""

import pytest
from datetime import UTC, datetime

from avs_backend.scan_core.adapters.dashboard_optimization_adapter import (
    DashboardOptimizationAdapter,
    DASHBOARD_OPT_ACTION_MAPPINGS,
    is_dashboard_optimization_action_supported,
    get_dashboard_optimization_action_mapping,
)
from avs_backend.scan_core.rules.action import (
    ActionState,
    ActionType,
    FilesystemActionTarget,
    _NoTarget,
)
from avs_backend.scan_core.rules.actionability import Fixability
from avs_backend.scan_core.rules.priority import RuleCapability


# ── Test Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def adapter():
    """Create a Dashboard Optimization adapter instance."""
    return DashboardOptimizationAdapter()


@pytest.fixture
def sample_temp_files_action():
    """Sample Dashboard Optimize temp files cleanup action."""
    return {
        "id": "action-temp-1",
        "type": "clean_temp_files",
        "title": "Temporary Files",
        "description": "Windows and user temporary files",
        "size": 2500 * 1024 * 1024,
        "rollbackAvailable": True,
    }


@pytest.fixture
def sample_recycle_bin_action():
    """Sample Dashboard Optimize recycle bin action."""
    return {
        "id": "action-recycle-1",
        "type": "empty_recycle_bin",
        "title": "Recycle Bin",
        "description": "Files in Recycle Bin",
        "size": 500 * 1024 * 1024,
        "rollbackAvailable": False,
    }


@pytest.fixture
def sample_browser_cache_action():
    """Sample Dashboard Optimize browser cache action."""
    return {
        "id": "action-browser-1",
        "type": "clean_browser_cache",
        "title": "Browser Cache",
        "description": "Browser temporary files and cache",
        "size": 200 * 1024 * 1024,
        "rollbackAvailable": True,
    }


@pytest.fixture
def sample_thumbnail_cache_action():
    """Sample Dashboard Optimize thumbnail cache action."""
    return {
        "id": "action-thumb-1",
        "type": "clean_thumbnail_cache",
        "title": "Thumbnail Cache",
        "description": "Windows thumbnail and icon cache",
        "size": 50 * 1024 * 1024,
        "rollbackAvailable": False,
    }


@pytest.fixture
def sample_prefetch_action():
    """Sample Dashboard Optimize prefetch action."""
    return {
        "id": "action-prefetch-1",
        "type": "clean_prefetch",
        "title": "Prefetch Files",
        "description": "Windows application prefetch files (auto-regenerated)",
        "size": 30 * 1024 * 1024,
        "rollbackAvailable": False,
    }


@pytest.fixture
def sample_windows_update_cache_action():
    """Sample Dashboard Optimize Windows Update cache action."""
    return {
        "id": "action-wu-1",
        "type": "clean_windows_update_cache",
        "title": "Windows Update Cache",
        "description": "Downloaded Windows Update packages retained after install",
        "size": 1000 * 1024 * 1024,
        "rollbackAvailable": False,
    }


@pytest.fixture
def sample_flush_dns_action():
    """Sample Dashboard Optimize flush DNS action (unsupported)."""
    return {
        "id": "action-dns-1",
        "type": "flush_dns",
        "title": "Flush DNS",
        "description": "Clear DNS resolver cache",
        "size": 0,
        "rollbackAvailable": False,
    }


@pytest.fixture
def sample_trim_memory_action():
    """Sample Dashboard Optimize trim memory action (unsupported)."""
    return {
        "id": "action-mem-1",
        "type": "trim_memory",
        "title": "Trim Memory",
        "description": "Trim working sets of inactive processes",
        "size": 0,
        "rollbackAvailable": False,
    }


@pytest.fixture
def all_supported_actions(
    sample_temp_files_action,
    sample_recycle_bin_action,
    sample_browser_cache_action,
    sample_thumbnail_cache_action,
    sample_prefetch_action,
    sample_windows_update_cache_action,
):
    """All 6 supported Dashboard Optimize actions."""
    return [
        sample_temp_files_action,
        sample_recycle_bin_action,
        sample_browser_cache_action,
        sample_thumbnail_cache_action,
        sample_prefetch_action,
        sample_windows_update_cache_action,
    ]


@pytest.fixture
def all_unsupported_actions(sample_flush_dns_action, sample_trim_memory_action):
    """All unsupported Dashboard Optimize actions."""
    return [sample_flush_dns_action, sample_trim_memory_action]


# ── Supported Operation Mapping Tests ─────────────────────────────────────────


def test_clean_temp_files_maps_to_delete_file(adapter, sample_temp_files_action):
    """Test that clean_temp_files maps to DELETE_FILE."""
    action = adapter.convert_action(sample_temp_files_action)

    assert action.action_type == ActionType.DELETE_FILE
    assert action.state == ActionState.PLANNED
    assert action.is_actionable is True
    assert action.is_fixable is True
    assert action.is_auto_fixable is True
    assert action.fixability == Fixability.AUTO_FIXABLE
    assert action.rule_capability == RuleCapability.REMEDIATION_AVAILABLE


def test_empty_recycle_bin_maps_to_delete_directory(adapter, sample_recycle_bin_action):
    """Test that empty_recycle_bin maps to DELETE_DIRECTORY."""
    action = adapter.convert_action(sample_recycle_bin_action)

    assert action.action_type == ActionType.DELETE_DIRECTORY
    assert action.state == ActionState.PLANNED
    assert action.is_actionable is True
    assert action.is_fixable is True


def test_clean_browser_cache_maps_to_clear_browser_cache(adapter, sample_browser_cache_action):
    """Test that clean_browser_cache maps to CLEAR_BROWSER_CACHE."""
    action = adapter.convert_action(sample_browser_cache_action)

    assert action.action_type == ActionType.CLEAR_BROWSER_CACHE
    assert action.state == ActionState.PLANNED
    assert action.is_actionable is True


def test_clean_thumbnail_cache_maps_to_clear_cache(adapter, sample_thumbnail_cache_action):
    """Test that clean_thumbnail_cache maps to CLEAR_CACHE."""
    action = adapter.convert_action(sample_thumbnail_cache_action)

    assert action.action_type == ActionType.CLEAR_CACHE
    assert action.state == ActionState.PLANNED
    assert action.is_actionable is True


def test_clean_prefetch_maps_to_delete_file(adapter, sample_prefetch_action):
    """Test that clean_prefetch maps to DELETE_FILE."""
    action = adapter.convert_action(sample_prefetch_action)

    assert action.action_type == ActionType.DELETE_FILE
    assert action.state == ActionState.PLANNED
    assert action.is_actionable is True


def test_clean_windows_update_cache_maps_to_delete_file(adapter, sample_windows_update_cache_action):
    """Test that clean_windows_update_cache maps to DELETE_FILE."""
    action = adapter.convert_action(sample_windows_update_cache_action)

    assert action.action_type == ActionType.DELETE_FILE
    assert action.state == ActionState.PLANNED
    assert action.is_actionable is True


# ── Unsupported Operation Handling Tests ──────────────────────────────────────


def test_flush_dns_is_unsupported(adapter, sample_flush_dns_action):
    """Test that flush_dns is classified as unsupported/NOT_FIXABLE."""
    action = adapter.convert_action(sample_flush_dns_action)

    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.is_fixable is False
    assert action.is_auto_fixable is False
    assert action.fixability == Fixability.NOT_FIXABLE
    assert action.rule_capability == RuleCapability.NO_REMEDIATION
    assert isinstance(action.target, _NoTarget)
    assert action.requires_review is True


def test_trim_memory_is_unsupported(adapter, sample_trim_memory_action):
    """Test that trim_memory is classified as unsupported/NOT_FIXABLE."""
    action = adapter.convert_action(sample_trim_memory_action)

    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.is_fixable is False
    assert action.requires_review is True


def test_unsupported_action_cannot_become_executable(adapter, sample_flush_dns_action):
    """Test that an unsupported action cannot accidentally become executable."""
    action = adapter.convert_action(sample_flush_dns_action)

    # Even with rollbackAvailable=True, unsupported actions should not be executable
    sample_flush_dns_action["rollbackAvailable"] = True
    action2 = adapter.convert_action(sample_flush_dns_action)

    assert action2.action_type == ActionType.NONE
    assert action2.is_actionable is False
    assert action2.is_auto_fixable is False
    assert action2.backup_required is False
    assert action2.rollback_supported is False


# ── ActionTarget Tests ────────────────────────────────────────────────────────


def test_supported_action_has_filesystem_target(adapter, sample_temp_files_action):
    """Test that supported actions create a FilesystemActionTarget."""
    action = adapter.convert_action(sample_temp_files_action)

    assert isinstance(action.target, FilesystemActionTarget)
    # canonical_path should be empty (backend resolves during execution)
    assert action.target.canonical_path == ""
    assert action.target.allowed_location == "temp"
    assert action.target.scope == "user"


def test_unsupported_action_has_no_target(adapter, sample_flush_dns_action):
    """Test that unsupported actions create a _NoTarget."""
    action = adapter.convert_action(sample_flush_dns_action)

    assert isinstance(action.target, _NoTarget)


# ── Precondition Tests ────────────────────────────────────────────────────────


def test_supported_action_has_preconditions(adapter, sample_temp_files_action):
    """Test that supported actions have proper preconditions."""
    action = adapter.convert_action(sample_temp_files_action)

    assert len(action.preconditions) > 0
    assert "TargetExists" in action.preconditions
    assert "TargetAccessible" in action.preconditions
    assert "PathWithinAllowedScope" in action.preconditions
    assert "NotReparsePoint" in action.preconditions
    assert "NotSymlink" in action.preconditions
    assert "TargetNotLocked" in action.preconditions


def test_unsupported_action_has_no_preconditions(adapter, sample_flush_dns_action):
    """Test that unsupported actions have no preconditions."""
    action = adapter.convert_action(sample_flush_dns_action)

    assert len(action.preconditions) == 0


# ── Rollback Capability Tests ─────────────────────────────────────────────────


def test_rollback_available_supported(adapter, sample_temp_files_action):
    """Test that rollback is supported when rollbackAvailable=True and action is supported."""
    action = adapter.convert_action(sample_temp_files_action)

    assert action.backup_required is True
    assert action.rollback_supported is True


def test_rollback_not_available_unsupported(adapter, sample_flush_dns_action):
    """Test that rollback is not supported for unsupported actions."""
    action = adapter.convert_action(sample_flush_dns_action)

    assert action.backup_required is False
    assert action.rollback_supported is False


def test_rollback_false_when_not_available(adapter, sample_recycle_bin_action):
    """Test that rollback is False when rollbackAvailable=False."""
    action = adapter.convert_action(sample_recycle_bin_action)

    assert action.backup_required is False
    assert action.rollback_supported is False


# ── Statistics Tests ──────────────────────────────────────────────────────────


def test_statistics_all_supported(adapter, all_supported_actions):
    """Test statistics when all actions are supported."""
    adapter.convert_actions(all_supported_actions)
    stats = adapter.get_statistics()

    assert stats["converted"] == 6
    assert stats["unsupported"] == 0
    assert stats["errors"] == 0


def test_statistics_all_unsupported(adapter, all_unsupported_actions):
    """Test statistics when all actions are unsupported."""
    adapter.convert_actions(all_unsupported_actions)
    stats = adapter.get_statistics()

    assert stats["converted"] == 0
    assert stats["unsupported"] == 2
    assert stats["errors"] == 0


def test_statistics_mixed(adapter, all_supported_actions, all_unsupported_actions):
    """Test statistics with mixed supported/unsupported actions."""
    all_actions = all_supported_actions + all_unsupported_actions
    adapter.convert_actions(all_actions)
    stats = adapter.get_statistics()

    assert stats["converted"] == 6
    assert stats["unsupported"] == 2
    assert stats["errors"] == 0


# ── Edge Case Tests ───────────────────────────────────────────────────────────


def test_empty_input(adapter):
    """Test that empty action list returns empty list."""
    actions = adapter.convert_actions([])
    assert len(actions) == 0


def test_missing_type_raises_value_error(adapter):
    """Test that missing type field raises ValueError."""
    with pytest.raises(ValueError, match="missing required field: type"):
        adapter.convert_action({"id": "test-1", "title": "Test"})


def test_unknown_action_type_is_unsupported(adapter):
    """Test that unknown action types are classified as unsupported."""
    action = adapter.convert_action({
        "id": "action-unknown-1",
        "type": "some_unknown_operation",
        "title": "Unknown",
        "description": "Unknown operation",
    })

    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.is_fixable is False


def test_missing_id_generates_id(adapter):
    """Test that missing action ID is auto-generated."""
    action = adapter.convert_action({
        "type": "clean_temp_files",
        "title": "Temp Files",
        "size": 100,
    })

    assert action.action_id == "dashboard_opt_clean_temp_files"


def test_estimated_size_set_correctly(adapter, sample_temp_files_action):
    """Test that estimated_size is set from the size field."""
    action = adapter.convert_action(sample_temp_files_action)

    assert action.estimated_size == 2500 * 1024 * 1024


def test_estimated_size_none_when_zero(adapter, sample_flush_dns_action):
    """Test that estimated_size is None when size is 0."""
    action = adapter.convert_action(sample_flush_dns_action)

    assert action.estimated_size is None


def test_estimated_size_none_when_missing(adapter):
    """Test that estimated_size is None when size is missing."""
    action = adapter.convert_action({
        "id": "action-1",
        "type": "clean_temp_files",
        "title": "Temp Files",
    })

    assert action.estimated_size is None


# ── No Execution Tests ────────────────────────────────────────────────────────


def test_adapter_performs_no_execution(adapter, all_supported_actions):
    """Test that the adapter only converts, never executes."""
    actions = adapter.convert_actions(all_supported_actions)

    # All actions should be in PLANNED state (not executed)
    for action in actions:
        assert action.state == ActionState.PLANNED


# ── Helper Function Tests ─────────────────────────────────────────────────────


def test_is_dashboard_optimization_action_supported_supported():
    """Test helper function for supported actions."""
    assert is_dashboard_optimization_action_supported("clean_temp_files") is True
    assert is_dashboard_optimization_action_supported("empty_recycle_bin") is True
    assert is_dashboard_optimization_action_supported("clean_browser_cache") is True
    assert is_dashboard_optimization_action_supported("clean_thumbnail_cache") is True
    assert is_dashboard_optimization_action_supported("clean_prefetch") is True
    assert is_dashboard_optimization_action_supported("clean_windows_update_cache") is True


def test_is_dashboard_optimization_action_supported_unsupported():
    """Test helper function for unsupported actions."""
    assert is_dashboard_optimization_action_supported("flush_dns") is False
    assert is_dashboard_optimization_action_supported("trim_memory") is False


def test_is_dashboard_optimization_action_supported_unknown():
    """Test helper function for unknown actions."""
    assert is_dashboard_optimization_action_supported("unknown_type") is False


def test_get_dashboard_optimization_action_mapping_exists():
    """Test helper function returns mapping for known types."""
    mapping = get_dashboard_optimization_action_mapping("clean_temp_files")
    assert mapping is not None
    assert mapping.is_supported is True
    assert mapping.action_type == ActionType.DELETE_FILE


def test_get_dashboard_optimization_action_mapping_not_found():
    """Test helper function returns None for unknown types."""
    mapping = get_dashboard_optimization_action_mapping("unknown_type")
    assert mapping is None


# ── Mapping Table Tests ───────────────────────────────────────────────────────


def test_mapping_table_has_8_entries():
    """Test that the mapping table has exactly 8 entries (6 supported + 2 unsupported)."""
    assert len(DASHBOARD_OPT_ACTION_MAPPINGS) == 8


def test_mapping_table_supported_count():
    """Test that exactly 6 mappings are supported."""
    supported = [m for m in DASHBOARD_OPT_ACTION_MAPPINGS.values() if m.is_supported]
    assert len(supported) == 6


def test_mapping_table_unsupported_count():
    """Test that exactly 2 mappings are unsupported."""
    unsupported = [m for m in DASHBOARD_OPT_ACTION_MAPPINGS.values() if not m.is_supported]
    assert len(unsupported) == 2


# ── Privacy Tests ─────────────────────────────────────────────────────────────


def test_no_canonical_path_in_target(adapter, all_supported_actions):
    """Test that no canonical paths are exposed in targets."""
    actions = adapter.convert_actions(all_supported_actions)

    for action in actions:
        target_dict = action.target.to_dict()
        assert target_dict.get("canonical_path", "") in ("", None)


def test_no_sensitive_data_in_metadata(adapter, all_supported_actions):
    """Test that metadata does not contain sensitive data."""
    actions = adapter.convert_actions(all_supported_actions)

    for action in actions:
        metadata = action.metadata
        assert "source" in metadata
        assert metadata["source"] == "dashboard_optimization"
        # No paths, registry keys, or browser profiles in metadata
        for key, value in metadata.items():
            if isinstance(value, str):
                assert "HKEY" not in value.upper()
                assert "C:\\" not in value
                assert "/home/" not in value
