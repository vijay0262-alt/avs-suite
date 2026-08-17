"""
SC-8C12 Phase 3 — Security Remediation Backend Integration Tests

Tests for converting Security Center remediation actions into canonical
ActionPlan, persisting via ActionPlanRepository, and the
scan_core.security_remediation.plan RPC.

Covers:
### Plan creation
1. builder initializes
2. valid actions create ActionPlan
3. backend generates plan_id
4. plan contains canonical RemediationActions
5. quarantine action becomes DELETE_FILE
6. quarantine has backup_required=True
7. quarantine has rollback_supported=True
8. delete action mapping
9. startup persistence mapping
10. registry persistence mapping
11. unsupported actions become NOT_FIXABLE
12. mixed supported/unsupported actions
13. accurate statistics
14. estimated affected size

### Persistence
15. ActionPlan saved successfully
16. saved plan can be loaded by a new repository instance
17. plan_id remains stable
18. persistence failure returns error
19. no success response when save fails

### RPC
20. RPC is registered
21. valid request returns plan_id
22. missing actions rejected
23. empty actions rejected
24. malformed actions rejected safely
25. adapter conversion errors handled
26. response is privacy-safe
27. no raw target information returned
28. no fake plan_id on failure

### Security
29. no legacy execution call
30. no quarantine execution call
31. no executor invocation
32. no filesystem mutation
33. no registry mutation
34. no subprocess
35. no SafetyGate bypass
36. no RemediationCoordinator.execute
37. no automatic approval
38. no automatic execution

### Contract
39. generated plan is compatible with existing prepare()
40. generated plan can be loaded through existing plan_details path
41. unsupported actions remain clearly classified
42. rollback metadata is preserved for quarantine
43. no sensitive target data crosses the RPC response
"""

import inspect
import os
import sys
from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from avs_backend.api.registry import all_methods, get as get_method
from avs_backend import scan_core_rpc  # noqa: F401 — triggers RPC registration
from avs_backend.scan_core.adapters.security_remediation_adapter import (
    SecurityRemediationAdapter,
)
from avs_backend.scan_core.adapters.security_remediation_plan_builder import (
    SecurityRemediationPlanBuilder,
    _build_action_summary,
)
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionState,
    ActionType,
    FilesystemActionTarget,
    RegistryActionTarget,
    RemediationAction,
    StartupActionTarget,
    _NoTarget,
)
from avs_backend.scan_core.rules.actionability import Fixability
from avs_backend.scan_core.rules.priority import RuleCapability


# ── Test Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def sample_security_actions():
    """Sample Security Center actions with supported and unsupported types."""
    return [
        {
            "id": "action-quarantine-1",
            "type": "quarantine",
            "threatId": "threat-123",
            "title": "Quarantine Suspicious File",
            "description": "Move suspicious.exe to encrypted quarantine",
            "reason": "Detected spyware threat",
            "confidence": 0.95,
            "severity": "high",
            "category": "spyware",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-quarantine-1",
            "rollbackAvailable": True,
            "target": {
                "type": "file",
                "path": "C:\\Users\\Public\\suspicious.exe",
                "name": "suspicious.exe",
            },
        },
        {
            "id": "action-startup-1",
            "type": "disable_startup_entry",
            "threatId": "threat-789",
            "title": "Disable Malicious Startup Entry",
            "description": "Disable startup entry that runs malware at boot",
            "reason": "Startup entry persists malware across reboots",
            "confidence": 0.90,
            "severity": "medium",
            "category": "suspicious_startup_entry",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-startup-1",
            "rollbackAvailable": True,
            "target": {
                "type": "startup_entry",
                "path": "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\MaliciousEntry",
                "name": "MaliciousEntry",
            },
        },
        {
            "id": "action-persistence-reg-1",
            "type": "remove_persistence",
            "threatId": "threat-reg-1",
            "title": "Remove Registry Persistence",
            "description": "Remove registry value used for persistence",
            "reason": "Registry value persists malware across reboots",
            "confidence": 0.88,
            "severity": "high",
            "category": "spyware",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-persistence-reg-1",
            "rollbackAvailable": True,
            "target": {
                "type": "registry",
                "path": "HKCU\\Software\\Malicious\\Run\\payload",
                "name": "payload",
            },
        },
        {
            "id": "action-task-1",
            "type": "disable_scheduled_task",
            "threatId": "threat-task-1",
            "title": "Disable Suspicious Scheduled Task",
            "description": "Disable scheduled task that runs malware",
            "reason": "Scheduled task persists malware",
            "confidence": 0.80,
            "severity": "medium",
            "category": "suspicious_scheduled_task",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-task-1",
            "rollbackAvailable": True,
            "target": {
                "type": "scheduled_task",
                "path": "\\Microsoft\\Windows\\MaliciousTask",
                "name": "MaliciousTask",
            },
        },
        {
            "id": "action-review-1",
            "type": "review",
            "threatId": "threat-review-1",
            "title": "Review Detected Threat",
            "description": "Review the detected threat before taking action",
            "reason": "Threat requires manual review",
            "confidence": 0.50,
            "severity": "low",
            "category": "unknown",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-review-1",
            "rollbackAvailable": True,
            "target": {
                "type": "file",
                "path": "C:\\Users\\Public\\unknown.exe",
                "name": "unknown.exe",
            },
        },
    ]


@pytest.fixture
def builder():
    """Create a SecurityRemediationPlanBuilder instance."""
    return SecurityRemediationPlanBuilder()


@pytest.fixture
def tmp_db(tmp_path):
    """Create a temporary MetadataDatabase for persistence tests."""
    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()
    return db


def _invoke(method: str, params):
    """Helper to invoke a registered RPC method directly."""
    handler = get_method(method)
    assert handler is not None, f"Method {method} not registered"
    return handler(params)


# ── Plan Creation Tests (1-14) ────────────────────────────────────────────────


# 1. builder initializes
def test_builder_initializes(builder):
    """Test that the plan builder initializes correctly."""
    assert builder is not None
    assert builder.adapter is not None
    assert isinstance(builder.adapter, SecurityRemediationAdapter)


def test_builder_initializes_with_custom_adapter():
    """Test that the builder accepts a custom adapter."""
    adapter = SecurityRemediationAdapter()
    builder = SecurityRemediationPlanBuilder(adapter=adapter)
    assert builder.adapter is adapter


# 2. valid actions create ActionPlan
def test_build_plan_creates_action_plan(builder, sample_security_actions):
    """Test that build_plan creates a real ActionPlan."""
    plan = builder.build_plan(sample_security_actions)

    assert isinstance(plan, ActionPlan)
    assert plan.summary is not None
    assert plan.summary.total_findings == 5


# 3. backend generates plan_id
def test_build_plan_generates_plan_id(builder, sample_security_actions):
    """Test that the backend generates a plan_id."""
    plan = builder.build_plan(sample_security_actions)

    assert plan.plan_id is not None
    assert isinstance(plan.plan_id, str)
    assert len(plan.plan_id) > 0


def test_build_plan_generates_unique_plan_ids(builder, sample_security_actions):
    """Test that each build generates a unique plan_id."""
    plan1 = builder.build_plan(sample_security_actions)
    plan2 = builder.build_plan(sample_security_actions)

    assert plan1.plan_id != plan2.plan_id


# 4. plan contains canonical RemediationActions
def test_plan_contains_canonical_remediation_actions(builder, sample_security_actions):
    """Test that the plan contains canonical RemediationAction objects."""
    plan = builder.build_plan(sample_security_actions)

    for action in plan.actions:
        assert isinstance(action, RemediationAction)


# 5. quarantine action becomes DELETE_FILE
def test_quarantine_becomes_delete_file(builder, sample_security_actions):
    """Test that quarantine action becomes DELETE_FILE."""
    plan = builder.build_plan(sample_security_actions)

    quarantine_action = next(
        a for a in plan.actions if a.action_id == "action-quarantine-1"
    )
    assert quarantine_action.action_type == ActionType.DELETE_FILE
    assert quarantine_action.state == ActionState.PLANNED


# 6. quarantine has backup_required=True
def test_quarantine_has_backup_required(builder, sample_security_actions):
    """Test that quarantine action has backup_required=True."""
    plan = builder.build_plan(sample_security_actions)

    quarantine_action = next(
        a for a in plan.actions if a.action_id == "action-quarantine-1"
    )
    assert quarantine_action.backup_required is True
    assert quarantine_action.target.backup_required is True


# 7. quarantine has rollback_supported=True
def test_quarantine_has_rollback_supported(builder, sample_security_actions):
    """Test that quarantine action has rollback_supported=True."""
    plan = builder.build_plan(sample_security_actions)

    quarantine_action = next(
        a for a in plan.actions if a.action_id == "action-quarantine-1"
    )
    assert quarantine_action.rollback_supported is True
    assert quarantine_action.target.rollback_supported is True


# 8. delete action mapping
def test_delete_action_mapping(builder):
    """Test that delete action maps to DELETE_FILE without backup."""
    actions = [
        {
            "id": "action-delete-1",
            "type": "delete",
            "threatId": "threat-456",
            "title": "Permanently Delete Quarantined File",
            "description": "Permanently remove quarantined malware",
            "reason": "User confirmed permanent deletion",
            "confidence": 1.0,
            "severity": "critical",
            "category": "malware",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-delete-1",
            "rollbackAvailable": False,
            "target": {
                "type": "file",
                "path": "C:\\Quarantine\\q-123_malware.exe",
                "name": "malware.exe",
            },
        }
    ]
    plan = builder.build_plan(actions)

    delete_action = plan.actions[0]
    assert delete_action.action_type == ActionType.DELETE_FILE
    assert delete_action.backup_required is False
    assert delete_action.rollback_supported is False


# 9. startup persistence mapping
def test_startup_persistence_mapping(builder, sample_security_actions):
    """Test that disable_startup_entry maps to DISABLE_STARTUP_ENTRY."""
    plan = builder.build_plan(sample_security_actions)

    startup_action = next(
        a for a in plan.actions if a.action_id == "action-startup-1"
    )
    assert startup_action.action_type == ActionType.DISABLE_STARTUP_ENTRY
    assert isinstance(startup_action.target, StartupActionTarget)
    assert startup_action.state == ActionState.PLANNED


# 10. registry persistence mapping
def test_registry_persistence_mapping(builder, sample_security_actions):
    """Test that remove_persistence (registry) maps to REMOVE_REGISTRY_VALUE."""
    plan = builder.build_plan(sample_security_actions)

    reg_action = next(
        a for a in plan.actions if a.action_id == "action-persistence-reg-1"
    )
    assert reg_action.action_type == ActionType.REMOVE_REGISTRY_VALUE
    assert isinstance(reg_action.target, RegistryActionTarget)
    assert reg_action.state == ActionState.PLANNED


# 11. unsupported actions become NOT_FIXABLE
def test_unsupported_actions_become_not_fixable(builder, sample_security_actions):
    """Test that unsupported actions become NOT_FIXABLE."""
    plan = builder.build_plan(sample_security_actions)

    task_action = next(a for a in plan.actions if a.action_id == "action-task-1")
    assert task_action.action_type == ActionType.NONE
    assert task_action.state == ActionState.NOT_FIXABLE
    assert task_action.is_actionable is False
    assert isinstance(task_action.target, _NoTarget)


# 12. mixed supported/unsupported actions
def test_mixed_supported_unsupported(builder, sample_security_actions):
    """Test that mixed actions are correctly classified."""
    plan = builder.build_plan(sample_security_actions)

    assert len(plan.actions) == 5

    supported = [a for a in plan.actions if a.state == ActionState.PLANNED]
    unsupported = [a for a in plan.actions if a.state == ActionState.NOT_FIXABLE]

    assert len(supported) == 3  # quarantine, startup, registry
    assert len(unsupported) == 2  # scheduled task, review


# 13. accurate statistics
def test_accurate_statistics(builder, sample_security_actions):
    """Test that ActionSummary statistics are accurate."""
    plan = builder.build_plan(sample_security_actions)

    summary = plan.summary
    assert summary.total_findings == 5
    assert summary.actions_planned == 5
    assert summary.auto_fixable_actions == 3
    assert summary.not_fixable_actions == 2
    assert summary.review_required_actions == 0
    assert summary.blocked_actions == 0


def test_adapter_statistics_tracked(builder, sample_security_actions):
    """Test that adapter statistics are tracked correctly."""
    builder.build_plan(sample_security_actions)
    stats = builder.get_adapter_statistics()

    assert stats["converted"] == 3
    assert stats["unsupported"] == 1
    assert stats["non_remediation"] == 1
    assert stats["errors"] == 0


# 14. estimated affected size
def test_estimated_affected_size_is_none_for_security(builder, sample_security_actions):
    """Test that estimated_affected_size is None for security actions (no size estimate)."""
    plan = builder.build_plan(sample_security_actions)

    # Security actions do not estimate storage recovery
    assert plan.summary.estimated_affected_size is None


def test_build_action_summary_empty():
    """Test building summary from empty actions."""
    summary = _build_action_summary(tuple())

    assert summary.total_findings == 0
    assert summary.actions_planned == 0
    assert summary.estimated_affected_size is None
    assert summary.highest_priority_action_id is None


def test_build_plan_empty_actions(builder):
    """Test that empty action list creates a valid but empty ActionPlan."""
    plan = builder.build_plan([])

    assert isinstance(plan, ActionPlan)
    assert len(plan.actions) == 0
    assert plan.summary.total_findings == 0
    assert plan.summary.auto_fixable_actions == 0


def test_build_plan_resets_adapter_statistics(builder, sample_security_actions):
    """Test that build_plan resets adapter statistics before each run."""
    # First build
    builder.build_plan(sample_security_actions)
    assert builder.get_adapter_statistics()["converted"] == 3

    # Second build should reset statistics
    builder.build_plan(sample_security_actions)
    stats = builder.get_adapter_statistics()
    assert stats["converted"] == 3  # Same count after reset + rebuild
    assert stats["errors"] == 0


def test_build_plan_non_list_raises(builder):
    """Test that build_plan raises ValueError for non-list input."""
    with pytest.raises(ValueError, match="must be a list"):
        builder.build_plan("not a list")


# ── Persistence Tests (15-19) ─────────────────────────────────────────────────


# 15. ActionPlan saved successfully
def test_plan_persistence_round_trip(builder, sample_security_actions, tmp_db):
    """Test that a built plan can be persisted and loaded."""
    repo = ActionPlanRepository(tmp_db)
    plan = builder.build_plan(sample_security_actions)

    saved = repo.save(plan)
    assert saved is True

    loaded = repo.load(plan.plan_id)
    assert loaded is not None
    assert loaded.plan_id == plan.plan_id
    assert len(loaded.actions) == len(plan.actions)


# 16. saved plan can be loaded by a new repository instance
def test_plan_survives_new_repository_instance(
    builder, sample_security_actions, tmp_path
):
    """Test that a persisted plan survives a new repository/database instance."""
    db_path = tmp_path / "test_metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()

    repo1 = ActionPlanRepository(db)
    plan = builder.build_plan(sample_security_actions)
    repo1.save(plan)

    # Create a new repository instance pointing to the same database
    db2 = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db2.initialize()
    repo2 = ActionPlanRepository(db2)

    loaded = repo2.load(plan.plan_id)
    assert loaded is not None
    assert loaded.plan_id == plan.plan_id
    assert len(loaded.actions) == len(plan.actions)


# 17. plan_id remains stable
def test_plan_id_remains_stable_after_persistence(
    builder, sample_security_actions, tmp_db
):
    """Test that plan_id remains stable after persistence round-trip."""
    repo = ActionPlanRepository(tmp_db)
    plan = builder.build_plan(sample_security_actions)
    original_plan_id = plan.plan_id

    repo.save(plan)
    loaded = repo.load(original_plan_id)

    assert loaded is not None
    assert loaded.plan_id == original_plan_id


# 18. persistence failure returns error
def test_persistence_failure_returns_error(builder, sample_security_actions):
    """Test that persistence failure raises RuntimeError."""
    # Create a repository with a None database to trigger failure
    repo = ActionPlanRepository.__new__(ActionPlanRepository)
    repo.db = None  # type: ignore

    plan = builder.build_plan(sample_security_actions)

    with pytest.raises(Exception):
        repo.save(plan)


# 19. no success response when save fails
def test_rpc_no_success_on_save_failure(sample_security_actions, monkeypatch):
    """Test that the RPC returns an error when save fails."""
    from avs_backend.scan_core_rpc import get_coordinator

    coordinator = get_coordinator()
    if coordinator is None:
        pytest.skip("Coordinator not available")

    # Patch ActionPlanRepository.save to raise
    original_save = ActionPlanRepository.save

    def failing_save(self, plan, status="PLANNED"):
        raise RuntimeError("Simulated database failure")

    monkeypatch.setattr(ActionPlanRepository, "save", failing_save)

    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is False
    assert "error" in result
    assert "plan_id" not in result or result.get("plan_id") is None

    # Restore
    monkeypatch.setattr(ActionPlanRepository, "save", original_save)


# ── RPC Tests (20-28) ─────────────────────────────────────────────────────────


# 20. RPC is registered
def test_rpc_registered():
    """Test that the RPC is registered."""
    methods = all_methods()
    assert "scan_core.security_remediation.plan" in methods


# 21. valid request returns plan_id
def test_rpc_returns_plan_id(sample_security_actions):
    """Test that the RPC returns a valid plan_id."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True
    assert "plan_id" in result
    assert isinstance(result["plan_id"], str)
    assert len(result["plan_id"]) > 0
    assert result["total_actions"] == 5
    assert result["auto_fixable"] == 3
    assert result["review_required"] == 0
    assert result["not_fixable"] == 2


# 22. missing actions rejected
def test_rpc_missing_actions_rejected():
    """Test that the RPC rejects missing actions."""
    result = _invoke("scan_core.security_remediation.plan", {})

    assert result["ok"] is False
    assert "actions" in result["error"].lower()


# 23. empty actions rejected
def test_rpc_empty_actions_rejected():
    """Test that the RPC rejects empty actions."""
    result = _invoke("scan_core.security_remediation.plan", {"actions": []})

    assert result["ok"] is False
    assert "no" in result["error"].lower()


# 24. malformed actions rejected safely
def test_rpc_malformed_actions_rejected_safely():
    """Test that the RPC rejects malformed actions parameter."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": "not a list"},
    )

    assert result["ok"] is False
    assert "actions" in result["error"].lower()


def test_rpc_null_params_rejected():
    """Test that the RPC handles null params safely."""
    result = _invoke("scan_core.security_remediation.plan", None)

    assert result["ok"] is False


# 25. adapter conversion errors handled
def test_rpc_adapter_conversion_errors_handled():
    """Test that the RPC handles adapter conversion errors gracefully."""
    actions = [
        {
            "id": "action-valid-1",
            "type": "quarantine",
            "title": "Valid",
            "description": "Valid action",
            "confidence": 0.90,
            "severity": "high",
            "category": "spyware",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-1",
            "rollbackAvailable": True,
            "target": {"type": "file", "path": "C:\\test.exe", "name": "test.exe"},
        },
        {
            # Missing required fields — will be skipped by adapter
            "title": "Invalid Action",
        },
    ]
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": actions},
    )

    # Invalid action is skipped, valid action is converted
    assert result["ok"] is True
    assert result["total_actions"] == 1
    assert result["statistics"]["errors"] == 1


# 26. response is privacy-safe
def test_rpc_response_is_privacy_safe(sample_security_actions):
    """Test that the RPC response does not expose sensitive data."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True
    # Response should not contain sensitive fields
    assert "canonical_path" not in result
    assert "asset_id" not in result
    assert "backup_location" not in result
    assert "quarantine_path" not in result
    assert "registry_key" not in result
    assert "browser_profile" not in result
    assert "target" not in result
    assert "actions" not in result  # No raw action data in response
    assert "evidence" not in result


# 27. no raw target information returned
def test_rpc_no_raw_target_info(sample_security_actions):
    """Test that no raw target information is returned in the RPC response."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True
    # Check all values in the response for raw paths
    response_str = str(result)
    assert "C:\\" not in response_str
    assert "HKEY" not in response_str
    assert "HKCU" not in response_str


# 28. no fake plan_id on failure
def test_rpc_no_fake_plan_id_on_failure():
    """Test that the RPC does not return a fake plan_id on failure."""
    result = _invoke("scan_core.security_remediation.plan", {})

    assert result["ok"] is False
    assert "plan_id" not in result


# ── Security Tests (29-38) ────────────────────────────────────────────────────


# 29. no legacy execution call
def test_builder_does_not_call_legacy_execution(builder, sample_security_actions):
    """Test that the builder does not invoke legacy Security Center execution."""
    source = inspect.getsource(SecurityRemediationPlanBuilder)
    assert "ThreatRemediationEngine" not in source
    assert "security.remediation.execute" not in source
    assert "security.quarantine" not in source
    assert "ThreatApprovalManager" not in source
    assert "ThreatRollbackManager" not in source
    assert "ThreatQuarantineManager" not in source


# 30. no quarantine execution call
def test_no_quarantine_execution_call(builder, sample_security_actions):
    """Test that the builder does not call quarantine execution."""
    source = inspect.getsource(SecurityRemediationPlanBuilder)
    assert "quarantine_file" not in source
    assert "restore_quarantined" not in source
    assert "delete_quarantined" not in source


# 31. no executor invocation
def test_no_executor_invocation(builder, sample_security_actions):
    """Test that the builder does not invoke any target executors."""
    source = inspect.getsource(SecurityRemediationPlanBuilder)
    assert "FilesystemExecutor" not in source
    assert "RegistryExecutor" not in source
    assert "StartupExecutor" not in source
    assert "BrowserExecutor" not in source
    assert "DefaultExecutor" not in source


# 32. no filesystem mutation
def test_no_filesystem_mutation(builder, sample_security_actions, tmp_path):
    """Test that the builder does not mutate the filesystem."""
    before = set(os.listdir(tmp_path))
    builder.build_plan(sample_security_actions)
    after = set(os.listdir(tmp_path))
    assert after == before


# 33. no registry mutation
@pytest.mark.skipif(sys.platform != "win32", reason="winreg is only available on Windows")
def test_no_registry_mutation(builder, sample_security_actions):
    """Test that the builder does not mutate the registry."""
    with patch("winreg.DeleteValue") as mock_delete, patch(
        "winreg.DeleteKey"
    ) as mock_delete_key:
        builder.build_plan(sample_security_actions)
        mock_delete.assert_not_called()
        mock_delete_key.assert_not_called()


# 34. no subprocess
def test_no_subprocess(builder, sample_security_actions):
    """Test that the builder never calls subprocess."""
    with patch("subprocess.run") as mock_run, patch(
        "subprocess.Popen"
    ) as mock_popen:
        builder.build_plan(sample_security_actions)
        mock_run.assert_not_called()
        mock_popen.assert_not_called()


def test_builder_source_has_no_subprocess_import():
    """Test that the builder module does not import subprocess."""
    source = inspect.getsource(SecurityRemediationPlanBuilder)
    assert "import subprocess" not in source
    assert "import shutil" not in source


# 35. no SafetyGate bypass
def test_no_safety_gate_bypass(builder, sample_security_actions):
    """Test that the builder does not bypass SafetyGate."""
    source = inspect.getsource(SecurityRemediationPlanBuilder)
    assert "SafetyGate" not in source
    assert "create_safety_gate" not in source
    assert "safety_gate" not in source


# 36. no RemediationCoordinator.execute
def test_no_remediation_coordinator_execute(builder, sample_security_actions):
    """Test that the builder does not call RemediationCoordinator.execute."""
    source = inspect.getsource(SecurityRemediationPlanBuilder)
    # The builder must not import or instantiate RemediationCoordinator.
    # Docstrings may mention it as an architectural reference,
    # but the code must not invoke it.
    assert "from avs_backend.scan_core.orchestration" not in source
    assert "import RemediationCoordinator" not in source
    assert "RemediationCoordinator(" not in source
    assert "coordinator.execute" not in source
    assert "coordinator.prepare" not in source
    assert "coordinator.validate" not in source


# 37. no automatic approval
def test_no_automatic_approval(builder, sample_security_actions):
    """Test that the builder does not automatically approve actions."""
    plan = builder.build_plan(sample_security_actions)

    for action in plan.actions:
        # Actions should be PLANNED or NOT_FIXABLE, never APPROVED
        assert action.state in (ActionState.PLANNED, ActionState.NOT_FIXABLE)
        assert action.state != ActionState.REVIEW_REQUIRED or action.action_type == ActionType.NONE


# 38. no automatic execution
def test_no_automatic_execution(builder, sample_security_actions):
    """Test that the builder does not execute any actions."""
    plan = builder.build_plan(sample_security_actions)

    # All actions must be in PLANNED or NOT_FIXABLE state.
    # No action should be in an execution-complete state.
    execution_states = set()
    if hasattr(ActionState, "COMPLETED"):
        execution_states.add(ActionState.COMPLETED)
    if hasattr(ActionState, "FAILED"):
        execution_states.add(ActionState.FAILED)
    if hasattr(ActionState, "CANCELLED"):
        execution_states.add(ActionState.CANCELLED)

    for action in plan.actions:
        assert action.state not in execution_states


def test_rpc_does_not_execute_remediation(sample_security_actions):
    """Test that the RPC does not execute remediation."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True
    # No execution summary should be present
    assert "execution_id" not in result
    assert "summary" not in result or "execution" not in str(result.get("summary", "")).lower()


# ── Contract Tests (39-43) ────────────────────────────────────────────────────


# 39. generated plan is compatible with existing prepare()
def test_plan_compatible_with_prepare(builder, sample_security_actions, tmp_db):
    """Test that the generated plan can be loaded and used by existing prepare() logic."""
    repo = ActionPlanRepository(tmp_db)
    plan = builder.build_plan(sample_security_actions)
    repo.save(plan)

    loaded = repo.load(plan.plan_id)
    assert loaded is not None

    # The plan must have the structure expected by prepare():
    # - plan_id
    # - actions tuple
    # - summary
    # - generated_at
    # - snapshot_timestamp
    # - snapshot_version
    # - snapshot_ttl_seconds
    assert loaded.plan_id is not None
    assert isinstance(loaded.actions, tuple)
    assert loaded.summary is not None
    assert loaded.generated_at is not None
    assert loaded.snapshot_version is not None
    assert loaded.snapshot_ttl_seconds > 0


# 40. generated plan can be loaded through existing plan_details path
def test_plan_loadable_through_plan_details(builder, sample_security_actions):
    """Test that the generated plan can be loaded through the existing plan_details RPC."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True
    plan_id = result["plan_id"]

    # Load through plan_details RPC
    details_result = _invoke("scan_core.scan.plan_details", {"plan_id": plan_id})

    assert details_result["ok"] is True
    assert details_result["plan_id"] == plan_id


# 41. unsupported actions remain clearly classified
def test_unsupported_actions_remain_classified(builder, sample_security_actions, tmp_db):
    """Test that unsupported actions remain NOT_FIXABLE after persistence."""
    repo = ActionPlanRepository(tmp_db)
    plan = builder.build_plan(sample_security_actions)
    repo.save(plan)

    loaded = repo.load(plan.plan_id)
    task_action = next(a for a in loaded.actions if a.action_id == "action-task-1")

    assert task_action.action_type == ActionType.NONE
    assert task_action.state == ActionState.NOT_FIXABLE
    assert task_action.is_actionable is False


# 42. rollback metadata is preserved for quarantine
def test_rollback_metadata_preserved_for_quarantine(
    builder, sample_security_actions, tmp_db
):
    """Test that rollback metadata is preserved for quarantine after persistence."""
    repo = ActionPlanRepository(tmp_db)
    plan = builder.build_plan(sample_security_actions)
    repo.save(plan)

    loaded = repo.load(plan.plan_id)
    quarantine_action = next(
        a for a in loaded.actions if a.action_id == "action-quarantine-1"
    )

    assert quarantine_action.backup_required is True
    assert quarantine_action.rollback_supported is True
    assert quarantine_action.target.backup_required is True
    assert quarantine_action.target.rollback_supported is True


# 43. no sensitive target data crosses the RPC response
def test_no_sensitive_target_data_in_rpc_response(sample_security_actions):
    """Test that no sensitive target data crosses the RPC response boundary."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True

    # Recursively check all values in the response
    def check_no_sensitive(obj, path=""):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key in (
                    "canonical_path",
                    "asset_id",
                    "backup_location",
                    "quarantine_path",
                    "key_path",
                    "value_name",
                    "hive",
                    "entry_id",
                    "path",
                    "target",
                ):
                    pytest.fail(f"Sensitive field '{key}' found at {path}")
                check_no_sensitive(value, f"{path}.{key}")
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                check_no_sensitive(item, f"{path}[{i}]")
        elif isinstance(obj, str):
            if "C:\\" in obj or "HKEY" in obj or "HKCU" in obj:
                pytest.fail(f"Sensitive path found at {path}: {obj}")

    check_no_sensitive(result)


# ── Additional Tests ──────────────────────────────────────────────────────────


def test_plan_snapshot_version_set(builder, sample_security_actions):
    """Test that the plan has the security remediation snapshot version."""
    plan = builder.build_plan(sample_security_actions)

    assert plan.snapshot_version == "security_remediation_1.0.0"


def test_plan_snapshot_ttl_set(builder, sample_security_actions):
    """Test that the plan has a snapshot TTL."""
    plan = builder.build_plan(sample_security_actions)

    assert plan.snapshot_ttl_seconds == 3600


def test_plan_generated_at_is_utc(builder, sample_security_actions):
    """Test that the plan generated_at is a UTC datetime."""
    plan = builder.build_plan(sample_security_actions)

    assert isinstance(plan.generated_at, datetime)
    assert plan.generated_at.tzinfo is not None


def test_plan_actions_are_tuple(builder, sample_security_actions):
    """Test that plan actions are stored as a tuple (immutability)."""
    plan = builder.build_plan(sample_security_actions)

    assert isinstance(plan.actions, tuple)


def test_rpc_statistics_match_adapter(builder, sample_security_actions):
    """Test that RPC statistics match the adapter's conversion statistics."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True
    stats = result["statistics"]
    assert stats["converted"] == 3
    assert stats["unsupported"] == 1
    assert stats["errors"] == 0


def test_rpc_persists_plan(sample_security_actions):
    """Test that the RPC persists the plan to the database."""
    from avs_backend.scan_core_rpc import get_coordinator

    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True
    plan_id = result["plan_id"]

    coordinator = get_coordinator()
    if coordinator is None:
        pytest.skip("Coordinator not available")

    repo = ActionPlanRepository(coordinator.database)
    loaded = repo.load(plan_id)

    assert loaded is not None
    assert loaded.plan_id == plan_id
    assert len(loaded.actions) == 5


def test_rpc_single_quarantine_action():
    """Test the RPC with a single quarantine action."""
    actions = [
        {
            "id": "action-q-1",
            "type": "quarantine",
            "title": "Quarantine",
            "description": "Quarantine a threat",
            "confidence": 0.95,
            "severity": "high",
            "category": "spyware",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-q-1",
            "rollbackAvailable": True,
            "target": {"type": "file", "path": "C:\\test.exe", "name": "test.exe"},
        }
    ]
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": actions},
    )

    assert result["ok"] is True
    assert result["total_actions"] == 1
    assert result["auto_fixable"] == 1
    assert result["not_fixable"] == 0


def test_rpc_all_unsupported_actions():
    """Test the RPC with all unsupported actions."""
    actions = [
        {
            "id": "action-task-1",
            "type": "disable_scheduled_task",
            "title": "Disable Task",
            "description": "Disable scheduled task",
            "confidence": 0.80,
            "severity": "medium",
            "category": "suspicious_scheduled_task",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-task-1",
            "rollbackAvailable": True,
            "target": {"type": "scheduled_task", "path": "", "name": "Task"},
        },
        {
            "id": "action-ext-1",
            "type": "disable_browser_extension",
            "title": "Disable Extension",
            "description": "Disable browser extension",
            "confidence": 0.75,
            "severity": "medium",
            "category": "browser_hijacker",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-ext-1",
            "rollbackAvailable": True,
            "target": {"type": "browser_extension", "path": "", "name": "Ext"},
        },
    ]
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": actions},
    )

    assert result["ok"] is True
    assert result["total_actions"] == 2
    assert result["auto_fixable"] == 0
    assert result["not_fixable"] == 2
    assert result["statistics"]["unsupported"] == 2


def test_builder_module_has_no_destructive_imports():
    """Test that the builder module does not import destructive modules."""
    from avs_backend.scan_core.adapters import security_remediation_plan_builder as module

    source = inspect.getsource(module)
    assert "import subprocess" not in source
    assert "import shutil" not in source
    assert "import os" not in source.split("from")[0]  # No top-level os import for mutation
    assert "from subprocess" not in source
    assert "from shutil" not in source


def test_rpc_module_has_no_legacy_security_imports():
    """Test that the RPC module does not import legacy security remediation."""
    from avs_backend import scan_core_rpc as module

    source = inspect.getsource(module)
    # The RPC file should not import from the legacy security_remediation package
    assert "from avs_backend.security_remediation" not in source
    assert "import security_remediation" not in source.replace(
        "security_remediation_plan_builder", ""
    ).replace("security_remediation_adapter", "")


def test_plan_actions_preserve_action_ids(builder, sample_security_actions):
    """Test that action IDs are preserved from input to plan."""
    plan = builder.build_plan(sample_security_actions)

    action_ids = {a.action_id for a in plan.actions}
    expected_ids = {
        "action-quarantine-1",
        "action-startup-1",
        "action-persistence-reg-1",
        "action-task-1",
        "action-review-1",
    }
    assert action_ids == expected_ids


def test_plan_with_snapshot_timestamp(builder, sample_security_actions):
    """Test that the plan accepts a snapshot timestamp."""
    timestamp = datetime.now(UTC)
    plan = builder.build_plan(sample_security_actions, snapshot_timestamp=timestamp)

    assert plan.snapshot_timestamp == timestamp


def test_rpc_response_has_all_required_fields(sample_security_actions):
    """Test that the RPC response has all required fields."""
    result = _invoke(
        "scan_core.security_remediation.plan",
        {"actions": sample_security_actions},
    )

    assert result["ok"] is True
    required_fields = [
        "plan_id",
        "total_actions",
        "auto_fixable",
        "review_required",
        "not_fixable",
        "estimated_affected_size",
        "statistics",
    ]
    for field in required_fields:
        assert field in result, f"Missing required field: {field}"

    # Statistics sub-fields
    stats = result["statistics"]
    assert "converted" in stats
    assert "unsupported" in stats
    assert "errors" in stats
