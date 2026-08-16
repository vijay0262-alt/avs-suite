"""
SC-8C12 Phase 2 — Security Remediation Adapter Tests

Tests for Security Center to scan_core RemediationAction conversion.

Covers:
1. Adapter initialization
2. Supported action mapping
3. Unsupported action classification
4. Quarantine → DELETE_FILE mapping
5. Quarantine requires backup
6. Quarantine supports rollback
7. Delete threat mapping
8. Registry persistence mapping
9. Startup persistence mapping
10. Browser/cache mapping (unsupported)
11. Correct target creation
12. Preconditions
13. Statistics
14. Missing/invalid findings
15. Malformed actions
16. Unknown action types
17. Safety classification
18. NOT_FIXABLE behavior
19. No filesystem mutation
20. No subprocess execution
21. No legacy Security Center execution calls
22. No SafetyGate bypass
23. No executor calls
24. Privacy-safe output
25. Edge cases
26. Duplicate/invalid actions
"""

import os
import sys
from datetime import UTC, datetime
from unittest.mock import patch

import pytest

from avs_backend.scan_core.adapters.security_remediation_adapter import (
    REMOVE_PERSISTENCE_TARGET_MAPPINGS,
    SECURITY_ACTION_MAPPINGS,
    SecurityActionMapping,
    SecurityRemediationAdapter,
    get_security_action_mapping,
    is_security_action_remediation,
    is_security_action_supported,
)
from avs_backend.scan_core.rules.action import (
    ActionState,
    ActionType,
    FilesystemActionTarget,
    RegistryActionTarget,
    StartupActionTarget,
    _NoTarget,
)
from avs_backend.scan_core.rules.actionability import Fixability
from avs_backend.scan_core.rules.priority import RuleCapability


# ── Test Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def adapter():
    """Create a Security Remediation adapter instance."""
    return SecurityRemediationAdapter()


@pytest.fixture
def sample_quarantine_action():
    """Sample Security Center quarantine action."""
    return {
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
    }


@pytest.fixture
def sample_delete_action():
    """Sample Security Center delete (permanent deletion of quarantined file)."""
    return {
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


@pytest.fixture
def sample_disable_startup_action():
    """Sample Security Center disable startup entry action."""
    return {
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
    }


@pytest.fixture
def sample_remove_persistence_registry_action():
    """Sample Security Center remove_persistence action (registry target)."""
    return {
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
    }


@pytest.fixture
def sample_remove_persistence_startup_action():
    """Sample Security Center remove_persistence action (startup target)."""
    return {
        "id": "action-persistence-startup-1",
        "type": "remove_persistence",
        "threatId": "threat-startup-1",
        "title": "Remove Startup Persistence",
        "description": "Disable startup entry used for persistence",
        "reason": "Startup entry persists threat across reboots",
        "confidence": 0.85,
        "severity": "medium",
        "category": "suspicious_startup_entry",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-persistence-startup-1",
        "rollbackAvailable": True,
        "target": {
            "type": "startup_entry",
            "path": "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\BadEntry",
            "name": "BadEntry",
        },
    }


@pytest.fixture
def sample_unsupported_scheduled_task_action():
    """Sample unsupported Security Center action (scheduled task)."""
    return {
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
    }


@pytest.fixture
def sample_unsupported_browser_extension_action():
    """Sample unsupported Security Center action (browser extension)."""
    return {
        "id": "action-ext-1",
        "type": "disable_browser_extension",
        "threatId": "threat-ext-1",
        "title": "Disable Malicious Browser Extension",
        "description": "Disable browser extension that hijacks searches",
        "reason": "Browser extension is hijacking searches",
        "confidence": 0.75,
        "severity": "medium",
        "category": "browser_hijacker",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-ext-1",
        "rollbackAvailable": True,
        "target": {
            "type": "browser_extension",
            "path": "chrome-extension://abc123/",
            "name": "MaliciousExtension",
        },
    }


@pytest.fixture
def sample_review_action():
    """Sample non-remediation Security Center action (review)."""
    return {
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
    }


@pytest.fixture
def sample_mark_false_positive_action():
    """Sample non-remediation Security Center action (mark_false_positive)."""
    return {
        "id": "action-fp-1",
        "type": "mark_false_positive",
        "threatId": "threat-fp-1",
        "title": "Mark as False Positive",
        "description": "Mark this detection as a false positive",
        "reason": "User confirmed this is a false positive",
        "confidence": 0.0,
        "severity": "info",
        "category": "unknown",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-fp-1",
        "rollbackAvailable": False,
        "target": {
            "type": "file",
            "path": "C:\\Program Files\\Legit\\app.exe",
            "name": "app.exe",
        },
    }


# ── 1. Adapter Initialization Tests ───────────────────────────────────────────


def test_adapter_initialization(adapter):
    """Test that adapter initializes correctly."""
    assert adapter is not None
    assert adapter.capability_contract is not None
    stats = adapter.get_statistics()
    assert stats["converted"] == 0
    assert stats["unsupported"] == 0
    assert stats["non_remediation"] == 0
    assert stats["errors"] == 0


def test_adapter_initialization_with_custom_capability_contract():
    """Test that adapter accepts a custom capability contract."""
    from avs_backend.scan_core.rules.actionability import CapabilityContract

    contract = CapabilityContract()
    adapter = SecurityRemediationAdapter(capability_contract=contract)
    assert adapter.capability_contract is contract


# ── 2. Supported Action Mapping Tests ─────────────────────────────────────────


def test_supported_action_mappings_exist():
    """Test that all expected supported action mappings exist."""
    supported_types = ["quarantine", "delete", "disable_startup_entry"]
    for action_type in supported_types:
        assert action_type in SECURITY_ACTION_MAPPINGS
        mapping = SECURITY_ACTION_MAPPINGS[action_type]
        assert mapping.is_supported is True
        assert mapping.is_remediation is True
        assert mapping.action_type != ActionType.NONE


def test_remove_persistence_registry_mapping_exists():
    """Test that remove_persistence registry mapping exists."""
    assert "registry" in REMOVE_PERSISTENCE_TARGET_MAPPINGS
    mapping = REMOVE_PERSISTENCE_TARGET_MAPPINGS["registry"]
    assert mapping.is_supported is True
    assert mapping.action_type == ActionType.REMOVE_REGISTRY_VALUE


def test_remove_persistence_startup_mapping_exists():
    """Test that remove_persistence startup mapping exists."""
    assert "startup_entry" in REMOVE_PERSISTENCE_TARGET_MAPPINGS
    mapping = REMOVE_PERSISTENCE_TARGET_MAPPINGS["startup_entry"]
    assert mapping.is_supported is True
    assert mapping.action_type == ActionType.DISABLE_STARTUP_ENTRY


# ── 3. Unsupported Action Classification Tests ────────────────────────────────


def test_unsupported_action_mappings_exist():
    """Test that all expected unsupported action mappings exist."""
    unsupported_types = [
        "disable_scheduled_task",
        "disable_browser_extension",
        "reset_browser_setting",
    ]
    for action_type in unsupported_types:
        assert action_type in SECURITY_ACTION_MAPPINGS
        mapping = SECURITY_ACTION_MAPPINGS[action_type]
        assert mapping.is_supported is False
        assert mapping.action_type == ActionType.NONE


def test_non_remediation_action_mappings_exist():
    """Test that non-remediation actions are classified correctly."""
    non_remediation_types = [
        "review",
        "ignore",
        "mark_false_positive",
        "restore",
        "export_investigation",
    ]
    for action_type in non_remediation_types:
        assert action_type in SECURITY_ACTION_MAPPINGS
        mapping = SECURITY_ACTION_MAPPINGS[action_type]
        assert mapping.is_remediation is False
        assert mapping.is_supported is False


# ── 4. Quarantine → DELETE_FILE Mapping Tests ─────────────────────────────────


def test_quarantine_maps_to_delete_file(adapter, sample_quarantine_action):
    """Test that quarantine maps to ActionType.DELETE_FILE."""
    action = adapter.convert_action(sample_quarantine_action)

    assert action.action_type == ActionType.DELETE_FILE
    assert action.state == ActionState.PLANNED


def test_quarantine_maps_to_filesystem_target(adapter, sample_quarantine_action):
    """Test that quarantine creates a FilesystemActionTarget."""
    action = adapter.convert_action(sample_quarantine_action)

    assert isinstance(action.target, FilesystemActionTarget)


# ── 5. Quarantine Requires Backup Tests ───────────────────────────────────────


def test_quarantine_requires_backup(adapter, sample_quarantine_action):
    """Test that quarantine actions require backup (backup IS quarantine copy)."""
    action = adapter.convert_action(sample_quarantine_action)

    assert action.backup_required is True
    assert action.target.backup_required is True


# ── 6. Quarantine Supports Rollback Tests ─────────────────────────────────────


def test_quarantine_supports_rollback(adapter, sample_quarantine_action):
    """Test that quarantine actions support rollback (restore from backup)."""
    action = adapter.convert_action(sample_quarantine_action)

    assert action.rollback_supported is True
    assert action.target.rollback_supported is True


def test_quarantine_no_backup_location_during_planning(adapter, sample_quarantine_action):
    """Test that no backup location is assigned during planning (backend assigns during execution)."""
    action = adapter.convert_action(sample_quarantine_action)

    assert action.backup_location is None
    assert action.backup_identity is None


# ── 7. Delete Threat Mapping Tests ────────────────────────────────────────────


def test_delete_maps_to_delete_file(adapter, sample_delete_action):
    """Test that delete maps to ActionType.DELETE_FILE."""
    action = adapter.convert_action(sample_delete_action)

    assert action.action_type == ActionType.DELETE_FILE
    assert action.state == ActionState.PLANNED


def test_delete_does_not_require_backup(adapter, sample_delete_action):
    """Test that permanent deletion does not require backup (irreversible)."""
    action = adapter.convert_action(sample_delete_action)

    assert action.backup_required is False
    assert action.target.backup_required is False


def test_delete_does_not_support_rollback(adapter, sample_delete_action):
    """Test that permanent deletion does not support rollback."""
    action = adapter.convert_action(sample_delete_action)

    assert action.rollback_supported is False
    assert action.target.rollback_supported is False


# ── 8. Registry Persistence Mapping Tests ─────────────────────────────────────


def test_remove_persistence_registry_maps_to_remove_registry_value(
    adapter, sample_remove_persistence_registry_action
):
    """Test that registry-based remove_persistence maps to REMOVE_REGISTRY_VALUE."""
    action = adapter.convert_action(sample_remove_persistence_registry_action)

    assert action.action_type == ActionType.REMOVE_REGISTRY_VALUE
    assert action.state == ActionState.PLANNED
    assert isinstance(action.target, RegistryActionTarget)


def test_remove_persistence_registry_target_has_correct_hive(
    adapter, sample_remove_persistence_registry_action
):
    """Test that registry persistence target has correct hive."""
    action = adapter.convert_action(sample_remove_persistence_registry_action)

    target = action.target
    assert isinstance(target, RegistryActionTarget)
    assert target.hive == "HKCU"
    assert target.value_name == "payload"


def test_remove_persistence_registry_requires_backup(
    adapter, sample_remove_persistence_registry_action
):
    """Test that registry persistence removal requires backup."""
    action = adapter.convert_action(sample_remove_persistence_registry_action)

    assert action.backup_required is True
    assert action.rollback_supported is True


# ── 9. Startup Persistence Mapping Tests ──────────────────────────────────────


def test_remove_persistence_startup_maps_to_disable_startup_entry(
    adapter, sample_remove_persistence_startup_action
):
    """Test that startup-based remove_persistence maps to DISABLE_STARTUP_ENTRY."""
    action = adapter.convert_action(sample_remove_persistence_startup_action)

    assert action.action_type == ActionType.DISABLE_STARTUP_ENTRY
    assert action.state == ActionState.PLANNED
    assert isinstance(action.target, StartupActionTarget)


def test_disable_startup_entry_maps_correctly(adapter, sample_disable_startup_action):
    """Test that disable_startup_entry maps to DISABLE_STARTUP_ENTRY."""
    action = adapter.convert_action(sample_disable_startup_action)

    assert action.action_type == ActionType.DISABLE_STARTUP_ENTRY
    assert isinstance(action.target, StartupActionTarget)
    assert action.backup_required is True
    assert action.rollback_supported is True


# ── 10. Browser/Cache Mapping Tests (Unsupported) ─────────────────────────────


def test_disable_browser_extension_is_unsupported(
    adapter, sample_unsupported_browser_extension_action
):
    """Test that disable_browser_extension is classified as unsupported."""
    action = adapter.convert_action(sample_unsupported_browser_extension_action)

    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.requires_review is True


def test_reset_browser_setting_is_unsupported(adapter):
    """Test that reset_browser_setting is classified as unsupported."""
    action_data = {
        "id": "action-reset-1",
        "type": "reset_browser_setting",
        "title": "Reset Browser Setting",
        "description": "Reset hijacked browser setting",
        "confidence": 0.80,
        "severity": "medium",
        "category": "browser_hijacker",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-reset-1",
        "rollbackAvailable": True,
        "target": {"type": "browser_setting", "path": "", "name": "homepage"},
    }
    action = adapter.convert_action(action_data)

    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE


# ── 11. Correct Target Creation Tests ─────────────────────────────────────────


def test_filesystem_target_creation(adapter, sample_quarantine_action):
    """Test that filesystem target is created with correct fields."""
    action = adapter.convert_action(sample_quarantine_action)

    target = action.target
    assert isinstance(target, FilesystemActionTarget)
    assert target.canonical_path == "C:\\Users\\Public\\suspicious.exe"
    assert target.allowed_location == "C:\\Users\\Public"
    assert target.scope == "user"
    assert target.backup_required is True
    assert target.rollback_supported is True


def test_startup_target_creation(adapter, sample_disable_startup_action):
    """Test that startup target is created with correct fields."""
    action = adapter.convert_action(sample_disable_startup_action)

    target = action.target
    assert isinstance(target, StartupActionTarget)
    assert target.entry_id == "MaliciousEntry"
    assert target.scope == "user"
    assert target.backup_required is True
    assert target.rollback_supported is True


def test_registry_target_creation(adapter, sample_remove_persistence_registry_action):
    """Test that registry target is created with correct fields."""
    action = adapter.convert_action(sample_remove_persistence_registry_action)

    target = action.target
    assert isinstance(target, RegistryActionTarget)
    assert target.hive == "HKCU"
    assert target.value_name == "payload"
    assert target.backup_required is True
    assert target.rollback_supported is True


def test_no_target_for_unsupported(adapter, sample_unsupported_scheduled_task_action):
    """Test that unsupported actions get _NoTarget."""
    action = adapter.convert_action(sample_unsupported_scheduled_task_action)

    assert isinstance(action.target, _NoTarget)


def test_no_target_for_non_remediation(adapter, sample_review_action):
    """Test that non-remediation actions get _NoTarget."""
    action = adapter.convert_action(sample_review_action)

    assert isinstance(action.target, _NoTarget)


# ── 12. Preconditions Tests ───────────────────────────────────────────────────


def test_filesystem_action_has_preconditions(adapter, sample_quarantine_action):
    """Test that filesystem actions have appropriate preconditions."""
    action = adapter.convert_action(sample_quarantine_action)

    preconditions = action.preconditions
    assert len(preconditions) > 0
    contract_strings = preconditions.to_contract_strings()
    # Should have TargetExists, TargetAccessible, TargetNotLocked, NotSymlink, etc.
    assert any("target_exists" in c for c in contract_strings)
    assert any("target_accessible" in c for c in contract_strings)
    assert any("target_not_locked" in c for c in contract_strings)
    assert any("not_symlink" in c for c in contract_strings)
    assert any("not_junction" in c for c in contract_strings)
    assert any("not_reparse_point" in c for c in contract_strings)


def test_filesystem_action_has_path_within_allowed_scope(
    adapter, sample_quarantine_action
):
    """Test that filesystem actions have PathWithinAllowedScope precondition."""
    action = adapter.convert_action(sample_quarantine_action)

    contract_strings = action.preconditions.to_contract_strings()
    assert any("inside_allowed_location" in c for c in contract_strings)


def test_registry_action_has_registry_preconditions(
    adapter, sample_remove_persistence_registry_action
):
    """Test that registry actions have registry-specific preconditions."""
    action = adapter.convert_action(sample_remove_persistence_registry_action)

    contract_strings = action.preconditions.to_contract_strings()
    assert any("registry_hive_matches" in c for c in contract_strings)
    assert any("registry_key_exists" in c for c in contract_strings)
    assert any("registry_value_exists" in c for c in contract_strings)


def test_startup_action_has_preconditions(adapter, sample_disable_startup_action):
    """Test that startup actions have appropriate preconditions."""
    action = adapter.convert_action(sample_disable_startup_action)

    preconditions = action.preconditions
    assert len(preconditions) > 0
    contract_strings = preconditions.to_contract_strings()
    assert any("target_exists" in c for c in contract_strings)
    assert any("target_accessible" in c for c in contract_strings)


def test_unsupported_action_no_preconditions(
    adapter, sample_unsupported_scheduled_task_action
):
    """Test that unsupported actions have no preconditions."""
    action = adapter.convert_action(sample_unsupported_scheduled_task_action)

    assert len(action.preconditions) == 0


def test_non_remediation_action_no_preconditions(adapter, sample_review_action):
    """Test that non-remediation actions have no preconditions."""
    action = adapter.convert_action(sample_review_action)

    assert len(action.preconditions) == 0


# ── 13. Statistics Tests ───────────────────────────────────────────────────────


def test_statistics_tracking_supported(adapter, sample_quarantine_action):
    """Test that adapter tracks converted statistics."""
    adapter.convert_action(sample_quarantine_action)
    stats = adapter.get_statistics()
    assert stats["converted"] == 1
    assert stats["unsupported"] == 0
    assert stats["non_remediation"] == 0


def test_statistics_tracking_unsupported(
    adapter, sample_unsupported_scheduled_task_action
):
    """Test that adapter tracks unsupported statistics."""
    adapter.convert_action(sample_unsupported_scheduled_task_action)
    stats = adapter.get_statistics()
    assert stats["converted"] == 0
    assert stats["unsupported"] == 1
    assert stats["non_remediation"] == 0


def test_statistics_tracking_non_remediation(adapter, sample_review_action):
    """Test that adapter tracks non-remediation statistics."""
    adapter.convert_action(sample_review_action)
    stats = adapter.get_statistics()
    assert stats["converted"] == 0
    assert stats["unsupported"] == 0
    assert stats["non_remediation"] == 1


def test_statistics_tracking_errors(adapter):
    """Test that adapter tracks error statistics."""
    with pytest.raises(ValueError):
        adapter.convert_action({"title": "Invalid"})
    stats = adapter.get_statistics()
    assert stats["errors"] == 1


def test_statistics_reset(adapter, sample_quarantine_action):
    """Test that adapter statistics can be reset."""
    adapter.convert_action(sample_quarantine_action)
    assert adapter.get_statistics()["converted"] == 1

    adapter.reset_statistics()
    stats = adapter.get_statistics()
    assert stats["converted"] == 0
    assert stats["unsupported"] == 0
    assert stats["non_remediation"] == 0
    assert stats["errors"] == 0


# ── 14. Missing/Invalid Findings Tests ────────────────────────────────────────


def test_missing_id_raises_error(adapter):
    """Test that missing id raises ValueError."""
    action_data = {
        "type": "quarantine",
        "title": "Missing ID",
    }
    with pytest.raises(ValueError, match="missing required fields"):
        adapter.convert_action(action_data)


def test_missing_type_raises_error(adapter):
    """Test that missing type raises ValueError."""
    action_data = {
        "id": "action-1",
        "title": "Missing Type",
    }
    with pytest.raises(ValueError, match="missing required fields"):
        adapter.convert_action(action_data)


def test_empty_action_raises_error(adapter):
    """Test that an empty action dict raises ValueError."""
    with pytest.raises(ValueError):
        adapter.convert_action({})


# ── 15. Malformed Actions Tests ───────────────────────────────────────────────


def test_malformed_target_data(adapter):
    """Test that malformed target data does not crash the adapter."""
    action_data = {
        "id": "action-malformed-1",
        "type": "quarantine",
        "title": "Malformed Target",
        "description": "Action with malformed target",
        "confidence": 0.90,
        "severity": "high",
        "category": "spyware",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-malformed-1",
        "rollbackAvailable": True,
        "target": "not-a-dict",  # Malformed target
    }
    # Should not raise — non-dict target falls back to empty dict
    action = adapter.convert_action(action_data)
    assert action.action_type == ActionType.DELETE_FILE
    assert isinstance(action.target, FilesystemActionTarget)
    assert action.target.canonical_path == ""  # Empty path from fallback


def test_missing_target_uses_defaults(adapter):
    """Test that missing target uses safe defaults."""
    action_data = {
        "id": "action-no-target-1",
        "type": "quarantine",
        "title": "No Target",
        "description": "Action without target",
        "confidence": 0.90,
        "severity": "high",
        "category": "spyware",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-no-target-1",
        "rollbackAvailable": True,
    }
    action = adapter.convert_action(action_data)
    assert action.action_type == ActionType.DELETE_FILE
    assert isinstance(action.target, FilesystemActionTarget)
    assert action.target.canonical_path == ""


# ── 16. Unknown Action Types Tests ────────────────────────────────────────────


def test_unknown_action_type_is_unsupported(adapter):
    """Test that unknown action types are classified as unsupported."""
    action_data = {
        "id": "action-unknown-1",
        "type": "completely_unknown_action",
        "title": "Unknown Action",
        "description": "This action type is not recognized",
        "confidence": 0.80,
        "severity": "medium",
        "category": "unknown",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-unknown-1",
        "rollbackAvailable": False,
        "target": {"type": "file", "path": "C:\\test.exe", "name": "test.exe"},
    }
    action = adapter.convert_action(action_data)

    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.requires_review is True


def test_unknown_remove_persistence_target_is_unsupported(adapter):
    """Test that remove_persistence with unknown target type is unsupported."""
    action_data = {
        "id": "action-unknown-target-1",
        "type": "remove_persistence",
        "title": "Unknown Persistence Target",
        "description": "remove_persistence with unknown target type",
        "confidence": 0.80,
        "severity": "medium",
        "category": "unknown",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-unknown-target-1",
        "rollbackAvailable": True,
        "target": {"type": "unknown_target_type", "path": "", "name": "unknown"},
    }
    action = adapter.convert_action(action_data)

    assert action.action_type == ActionType.NONE
    assert action.state == ActionState.NOT_FIXABLE


# ── 17. Safety Classification Tests ───────────────────────────────────────────


def test_supported_action_is_actionable(adapter, sample_quarantine_action):
    """Test that supported actions are marked as actionable."""
    action = adapter.convert_action(sample_quarantine_action)

    assert action.is_actionable is True
    assert action.is_fixable is True
    assert action.is_auto_fixable is True
    assert action.fixability == Fixability.AUTO_FIXABLE
    assert action.rule_capability == RuleCapability.REMEDIATION_AVAILABLE
    assert action.requires_review is False
    assert action.is_blocked is False


def test_unsupported_action_is_not_actionable(
    adapter, sample_unsupported_scheduled_task_action
):
    """Test that unsupported actions are not actionable."""
    action = adapter.convert_action(sample_unsupported_scheduled_task_action)

    assert action.is_actionable is False
    assert action.is_fixable is False
    assert action.is_auto_fixable is False
    assert action.fixability == Fixability.NOT_FIXABLE
    assert action.rule_capability == RuleCapability.NO_REMEDIATION
    assert action.requires_review is True


# ── 18. NOT_FIXABLE Behavior Tests ────────────────────────────────────────────


def test_unsupported_action_is_not_fixable(
    adapter, sample_unsupported_scheduled_task_action
):
    """Test that unsupported actions have NOT_FIXABLE state."""
    action = adapter.convert_action(sample_unsupported_scheduled_task_action)

    assert action.state == ActionState.NOT_FIXABLE


def test_non_remediation_action_is_not_fixable(adapter, sample_review_action):
    """Test that non-remediation actions have NOT_FIXABLE state."""
    action = adapter.convert_action(sample_review_action)

    assert action.state == ActionState.NOT_FIXABLE
    assert action.is_actionable is False
    assert action.requires_review is True


def test_mark_false_positive_is_not_fixable(adapter, sample_mark_false_positive_action):
    """Test that mark_false_positive is NOT_FIXABLE (stays in security domain per D4)."""
    action = adapter.convert_action(sample_mark_false_positive_action)

    assert action.state == ActionState.NOT_FIXABLE
    assert action.action_type == ActionType.NONE
    assert action.is_actionable is False


# ── 19. No Filesystem Mutation Tests ──────────────────────────────────────────


def test_no_filesystem_mutation(adapter, sample_quarantine_action, tmp_path):
    """Test that adapter never mutates the filesystem."""
    # Create a real file to verify the adapter does not touch it
    test_file = tmp_path / "target.exe"
    test_file.write_bytes(b"test content")

    action_data = dict(sample_quarantine_action)
    action_data["target"] = {
        "type": "file",
        "path": str(test_file),
        "name": "target.exe",
    }

    original_content = test_file.read_bytes()
    action = adapter.convert_action(action_data)

    # File must still exist and have the same content
    assert test_file.exists()
    assert test_file.read_bytes() == original_content
    # Action must be in PLANNED state (not executed)
    assert action.state == ActionState.PLANNED


def test_no_filesystem_mutation_for_delete(adapter, sample_delete_action, tmp_path):
    """Test that adapter never deletes files even for delete actions."""
    test_file = tmp_path / "quarantined.exe"
    test_file.write_bytes(b"malware content")

    action_data = dict(sample_delete_action)
    action_data["target"] = {
        "type": "file",
        "path": str(test_file),
        "name": "quarantined.exe",
    }

    action = adapter.convert_action(action_data)

    # File must still exist
    assert test_file.exists()
    assert action.state == ActionState.PLANNED


# ── 20. No Subprocess Execution Tests ─────────────────────────────────────────


def test_no_subprocess_execution(adapter, sample_quarantine_action):
    """Test that adapter never calls subprocess."""
    with patch("subprocess.run") as mock_run, patch("subprocess.Popen") as mock_popen:
        adapter.convert_action(sample_quarantine_action)
        mock_run.assert_not_called()
        mock_popen.assert_not_called()


def test_no_os_remove_or_shutil(adapter, sample_quarantine_action):
    """Test that adapter never calls os.remove or shutil operations."""
    with patch("os.remove") as mock_remove, patch(
        "shutil.move"
    ) as mock_move, patch("shutil.rmtree") as mock_rmtree:
        adapter.convert_action(sample_quarantine_action)
        mock_remove.assert_not_called()
        mock_move.assert_not_called()
        mock_rmtree.assert_not_called()


# ── 21. No Legacy Security Center Execution Calls Tests ───────────────────────


def test_no_threat_remediation_engine_execution(adapter, sample_quarantine_action):
    """Test that adapter never calls ThreatRemediationEngine (frontend class)."""
    # The adapter is a backend Python module; it cannot import frontend TS.
    # This test verifies the adapter source does not reference legacy execution.
    import inspect

    source = inspect.getsource(SecurityRemediationAdapter)
    assert "ThreatRemediationEngine" not in source
    assert "security.remediation.execute" not in source
    assert "security.quarantine" not in source
    assert "security.quarantine.delete" not in source
    assert "security.quarantine.restore" not in source


def test_adapter_module_has_no_legacy_imports():
    """Test that the adapter module does not import legacy security remediation."""
    import inspect

    from avs_backend.scan_core.adapters import security_remediation_adapter as module

    source = inspect.getsource(module)
    assert "security_remediation" not in source.replace(
        "security_remediation_adapter", ""
    )
    assert "from avs_backend.security_remediation" not in source
    assert "import security_remediation" not in source


# ── 22. No SafetyGate Bypass Tests ────────────────────────────────────────────


def test_adapter_does_not_bypass_safety_gate(adapter, sample_quarantine_action):
    """Test that adapter produces actions with preconditions for SafetyGate validation."""
    action = adapter.convert_action(sample_quarantine_action)

    # Supported actions must have preconditions that SafetyGate will validate
    assert len(action.preconditions) > 0
    contract_strings = action.preconditions.to_contract_strings()
    assert any("safety_valid" in c for c in contract_strings)


def test_adapter_does_not_call_safety_gate_directly(adapter, sample_quarantine_action):
    """Test that adapter does not invoke SafetyGate (it only prepares actions for it)."""
    import inspect

    source = inspect.getsource(SecurityRemediationAdapter)
    # The adapter must not import or instantiate SafetyGate.
    # Docstrings may mention SafetyGate as an architectural reference,
    # but the code must not invoke it.
    assert "create_safety_gate" not in source
    assert "from avs_backend.scan_core.rules.safety_gate" not in source
    assert "SafetyGate(" not in source
    assert "safety_gate.evaluate" not in source
    assert "safety_gate.validate" not in source


# ── 23. No Executor Calls Tests ───────────────────────────────────────────────


def test_adapter_does_not_call_executors(adapter, sample_quarantine_action):
    """Test that adapter never calls target executors."""
    import inspect

    source = inspect.getsource(SecurityRemediationAdapter)
    assert "FilesystemExecutor" not in source
    assert "RegistryExecutor" not in source
    assert "StartupExecutor" not in source
    assert "BrowserExecutor" not in source
    assert "DefaultExecutor" not in source
    assert "RemediationCoordinator" not in source


# ── 24. Privacy-Safe Output Tests ─────────────────────────────────────────────


def test_metadata_does_not_contain_raw_paths(adapter, sample_quarantine_action):
    """Test that action metadata does not contain raw filesystem paths."""
    action = adapter.convert_action(sample_quarantine_action)

    metadata = action.metadata
    # Metadata should contain safe fields only
    assert "source" in metadata
    assert "source_module" in metadata
    assert "security_type" in metadata
    assert "threat_id" in metadata
    assert "display_name" in metadata
    # Metadata should NOT contain raw paths
    assert "canonical_path" not in metadata
    assert "asset_id" not in metadata
    assert "backup_location" not in metadata
    assert "quarantine_path" not in metadata
    assert "path" not in metadata


def test_metadata_does_not_contain_registry_keys(
    adapter, sample_remove_persistence_registry_action
):
    """Test that action metadata does not contain raw registry keys."""
    action = adapter.convert_action(sample_remove_persistence_registry_action)

    metadata = action.metadata
    assert "hive" not in metadata
    assert "key_path" not in metadata
    assert "value_name" not in metadata
    assert "registry_key" not in metadata


def test_safety_assessment_is_safe_string(adapter, sample_quarantine_action):
    """Test that safety_assessment is a safe human-readable string."""
    action = adapter.convert_action(sample_quarantine_action)

    assert isinstance(action.safety_assessment, str)
    assert len(action.safety_assessment) > 0
    # Should not contain raw paths
    assert "C:\\" not in action.safety_assessment


# ── 25. Edge Cases Tests ──────────────────────────────────────────────────────


def test_action_without_rollback(adapter):
    """Test converting an action without rollback support."""
    action_data = {
        "id": "action-no-rollback",
        "type": "quarantine",
        "title": "Quarantine (No Rollback)",
        "description": "Quarantine without rollback",
        "confidence": 0.80,
        "severity": "medium",
        "category": "spyware",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-no-rollback",
        "rollbackAvailable": False,
        "target": {"type": "file", "path": "C:\\test.exe", "name": "test.exe"},
    }
    action = adapter.convert_action(action_data)

    # Quarantine always requires backup (backup IS quarantine copy)
    # regardless of rollbackAvailable flag
    assert action.backup_required is True
    assert action.rollback_supported is True


def test_action_with_zero_confidence(adapter):
    """Test converting an action with zero confidence."""
    action_data = {
        "id": "action-zero-confidence",
        "type": "quarantine",
        "title": "Quarantine (Zero Confidence)",
        "description": "Quarantine with zero confidence",
        "confidence": 0.0,
        "severity": "high",
        "category": "spyware",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-zero-confidence",
        "rollbackAvailable": True,
        "target": {"type": "file", "path": "C:\\test.exe", "name": "test.exe"},
    }
    action = adapter.convert_action(action_data)

    # Priority score should be severity_weight * 0.5 (confidence=0)
    # high severity = 80.0, so 80.0 * 0.5 = 40.0
    assert action.priority_score == 40.0


def test_action_with_max_confidence(adapter):
    """Test converting an action with maximum confidence."""
    action_data = {
        "id": "action-max-confidence",
        "type": "quarantine",
        "title": "Quarantine (Max Confidence)",
        "description": "Quarantine with max confidence",
        "confidence": 1.0,
        "severity": "critical",
        "category": "malware",
        "sourceModule": "security-center",
        "sourceFindingId": "finding-max-confidence",
        "rollbackAvailable": True,
        "target": {"type": "file", "path": "C:\\test.exe", "name": "test.exe"},
    }
    action = adapter.convert_action(action_data)

    # Priority score should be severity_weight * 1.0 (confidence=1)
    # critical severity = 100.0, so 100.0 * 1.0 = 100.0
    assert action.priority_score == 100.0


def test_empty_actions_list(adapter):
    """Test converting an empty list of actions."""
    actions = adapter.convert_actions([])

    assert len(actions) == 0
    stats = adapter.get_statistics()
    assert stats["converted"] == 0
    assert stats["unsupported"] == 0
    assert stats["non_remediation"] == 0
    assert stats["errors"] == 0


def test_convert_multiple_actions(
    adapter,
    sample_quarantine_action,
    sample_disable_startup_action,
    sample_unsupported_scheduled_task_action,
    sample_review_action,
):
    """Test converting multiple actions of different types."""
    actions_data = [
        sample_quarantine_action,
        sample_disable_startup_action,
        sample_unsupported_scheduled_task_action,
        sample_review_action,
    ]
    actions = adapter.convert_actions(actions_data)

    assert len(actions) == 4
    assert actions[0].action_type == ActionType.DELETE_FILE
    assert actions[1].action_type == ActionType.DISABLE_STARTUP_ENTRY
    assert actions[2].action_type == ActionType.NONE
    assert actions[3].action_type == ActionType.NONE

    stats = adapter.get_statistics()
    assert stats["converted"] == 2
    assert stats["unsupported"] == 1
    assert stats["non_remediation"] == 1


# ── 26. Duplicate/Invalid Actions Tests ───────────────────────────────────────


def test_convert_multiple_actions_with_errors(adapter):
    """Test that invalid actions are skipped but processing continues."""
    actions_data = [
        {
            "id": "action-1",
            "type": "quarantine",
            "title": "Valid Action",
            "description": "Valid",
            "confidence": 0.90,
            "severity": "high",
            "category": "spyware",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-1",
            "rollbackAvailable": True,
            "target": {"type": "file", "path": "C:\\test1.exe", "name": "test1.exe"},
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
            "severity": "medium",
            "category": "suspicious_startup_entry",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-3",
            "rollbackAvailable": True,
            "target": {
                "type": "startup_entry",
                "path": "HKCU\\Run\\TestEntry",
                "name": "TestEntry",
            },
        },
    ]
    actions = adapter.convert_actions(actions_data)

    # Invalid action should be skipped
    assert len(actions) == 2
    assert actions[0].action_id == "action-1"
    assert actions[1].action_id == "action-3"

    stats = adapter.get_statistics()
    assert stats["errors"] == 1


def test_duplicate_action_ids_produce_same_action_id(adapter, sample_quarantine_action):
    """Test that duplicate action IDs produce actions with the same action_id."""
    action1 = adapter.convert_action(sample_quarantine_action)
    action2 = adapter.convert_action(sample_quarantine_action)

    assert action1.action_id == action2.action_id
    # Both should have the same action_type
    assert action1.action_type == action2.action_type


# ── Helper Function Tests ─────────────────────────────────────────────────────


def test_is_security_action_supported_helper():
    """Test is_security_action_supported helper function."""
    assert is_security_action_supported("quarantine") is True
    assert is_security_action_supported("delete") is True
    assert is_security_action_supported("disable_startup_entry") is True
    assert is_security_action_supported("disable_scheduled_task") is False
    assert is_security_action_supported("review") is False
    assert is_security_action_supported("unknown_action") is False


def test_get_security_action_mapping_helper():
    """Test get_security_action_mapping helper function."""
    mapping = get_security_action_mapping("quarantine")
    assert mapping is not None
    assert mapping.security_type == "quarantine"
    assert mapping.action_type == ActionType.DELETE_FILE

    mapping = get_security_action_mapping("unknown_action")
    assert mapping is None


def test_is_security_action_remediation_helper():
    """Test is_security_action_remediation helper function."""
    assert is_security_action_remediation("quarantine") is True
    assert is_security_action_remediation("delete") is True
    assert is_security_action_remediation("disable_scheduled_task") is True  # remediation but unsupported
    assert is_security_action_remediation("review") is False
    assert is_security_action_remediation("ignore") is False
    assert is_security_action_remediation("mark_false_positive") is False


# ── Rule ID and Finding ID Tests ───────────────────────────────────────────────


def test_rule_id_format(adapter, sample_quarantine_action):
    """Test that rule_id follows the security_ prefix convention."""
    action = adapter.convert_action(sample_quarantine_action)

    assert action.rule_id == "security_quarantine"
    assert action.rule_version == "1.0.0"


def test_finding_id_preserved(adapter, sample_quarantine_action):
    """Test that sourceFindingId is preserved as finding_id."""
    action = adapter.convert_action(sample_quarantine_action)

    assert action.finding_id == "finding-quarantine-1"


def test_asset_id_is_deterministic(adapter, sample_quarantine_action):
    """Test that asset_id is deterministic for the same target path."""
    action1 = adapter.convert_action(sample_quarantine_action)
    action2 = adapter.convert_action(sample_quarantine_action)

    assert action1.asset_id == action2.asset_id
    assert len(action1.asset_id) > 0


# ── Computed At Tests ─────────────────────────────────────────────────────────


def test_computed_at_is_utc(adapter, sample_quarantine_action):
    """Test that computed_at is a UTC datetime."""
    action = adapter.convert_action(sample_quarantine_action)

    assert isinstance(action.computed_at, datetime)
    assert action.computed_at.tzinfo is not None
