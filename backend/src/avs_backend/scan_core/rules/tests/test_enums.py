"""
SC-8A Rule Engine — Enum Tests
"""

import pytest

from avs_backend.scan_core.rules.enums import (
    RuleCategory,
    Severity,
    ActionType,
    SafetyLevel,
    EvidenceType,
    ConfidenceFactor,
    SafetyBlocker,
    RuleStatus,
)


class TestRuleCategory:
    """Test RuleCategory enum."""
    
    def test_all_categories_exist(self):
        """Test that all expected categories exist."""
        assert RuleCategory.JUNK == "junk"
        assert RuleCategory.CACHE == "cache"
        assert RuleCategory.TEMPORARY == "temporary"
        assert RuleCategory.PRIVACY == "privacy"
        assert RuleCategory.REGISTRY == "registry"
        assert RuleCategory.STARTUP == "startup"
        assert RuleCategory.BROWSER == "browser"
        assert RuleCategory.PERFORMANCE == "performance"
        assert RuleCategory.SECURITY == "security"
        assert RuleCategory.SYSTEM == "system"
        assert RuleCategory.NETWORK == "network"
        assert RuleCategory.SUSPICIOUS == "suspicious"
        assert RuleCategory.CUSTOM == "custom"
    
    def test_category_values_are_strings(self):
        """Test that category values are strings."""
        for category in RuleCategory:
            assert isinstance(category.value, str)
    
    def test_category_from_string(self):
        """Test creating category from string."""
        assert RuleCategory("junk") == RuleCategory.JUNK
        assert RuleCategory("security") == RuleCategory.SECURITY


class TestSeverity:
    """Test Severity enum."""
    
    def test_all_severities_exist(self):
        """Test that all expected severities exist."""
        assert Severity.INFO == "info"
        assert Severity.LOW == "low"
        assert Severity.MEDIUM == "medium"
        assert Severity.HIGH == "high"
        assert Severity.CRITICAL == "critical"
    
    def test_severity_ordering(self):
        """Test severity levels are distinct."""
        severities = [Severity.INFO, Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]
        assert len(set(severities)) == 5


class TestActionType:
    """Test ActionType enum."""
    
    def test_all_action_types_exist(self):
        """Test that all expected action types exist."""
        assert ActionType.NONE == "none"
        assert ActionType.DELETE == "delete"
        assert ActionType.REGISTRY_REMOVE == "registry_remove"
        assert ActionType.DISABLE_STARTUP == "disable_startup"
        assert ActionType.CLEAR_CACHE == "clear_cache"
        assert ActionType.RESET_SETTING == "reset_setting"
        assert ActionType.REVIEW == "review"
        assert ActionType.DEFER == "defer"
        assert ActionType.QUARANTINE == "quarantine"
        assert ActionType.REPAIR == "repair"
        assert ActionType.OPTIMIZE == "optimize"
    
    def test_action_type_is_descriptive_only(self):
        """Test that action types are descriptions, not executable."""
        # This is a documentation test - action types should never be executed
        assert ActionType.DELETE.value == "delete"  # Description only


class TestSafetyLevel:
    """Test SafetyLevel enum."""
    
    def test_all_safety_levels_exist(self):
        """Test that all expected safety levels exist."""
        assert SafetyLevel.SAFE == "safe"
        assert SafetyLevel.LOW_RISK == "low_risk"
        assert SafetyLevel.REVIEW_REQUIRED == "review_required"
        assert SafetyLevel.HIGH_RISK == "high_risk"
        assert SafetyLevel.BLOCKED == "blocked"
    
    def test_safety_levels_are_distinct(self):
        """Test safety levels are distinct from severity."""
        # Safety and severity are separate concepts
        assert SafetyLevel.SAFE != Severity.LOW
        assert SafetyLevel.BLOCKED != Severity.CRITICAL


class TestEvidenceType:
    """Test EvidenceType enum."""
    
    def test_common_evidence_types_exist(self):
        """Test that common evidence types exist."""
        assert EvidenceType.PATH_MATCH == "path_match"
        assert EvidenceType.EXTENSION_MATCH == "extension_match"
        assert EvidenceType.SIZE_MATCH == "size_match"
        assert EvidenceType.METADATA_MATCH == "metadata_match"
        assert EvidenceType.KNOWN_LOCATION == "known_location"
        assert EvidenceType.CUSTOM == "custom"


class TestConfidenceFactor:
    """Test ConfidenceFactor enum."""
    
    def test_common_confidence_factors_exist(self):
        """Test that common confidence factors exist."""
        assert ConfidenceFactor.ASSET_TYPE_MATCH == "asset_type_match"
        assert ConfidenceFactor.PATH_MATCH == "path_match"
        assert ConfidenceFactor.METADATA_MATCH == "metadata_match"
        assert ConfidenceFactor.RULE_CERTAINTY == "rule_certainty"
        assert ConfidenceFactor.MULTIPLE_EVIDENCE == "multiple_evidence"


class TestSafetyBlocker:
    """Test SafetyBlocker enum."""
    
    def test_all_blockers_exist(self):
        """Test that all expected blockers exist."""
        assert SafetyBlocker.SYSTEM_CRITICAL == "system_critical"
        assert SafetyBlocker.ACTIVE == "active"
        assert SafetyBlocker.LOCKED == "locked"
        assert SafetyBlocker.PROTECTED == "protected"
        assert SafetyBlocker.UNKNOWN == "unknown"
        assert SafetyBlocker.INSUFFICIENT_EVIDENCE == "insufficient_evidence"
        assert SafetyBlocker.USER_DATA == "user_data"
        assert SafetyBlocker.REQUIRED_DEPENDENCY == "required_dependency"
        assert SafetyBlocker.CUSTOM == "custom"


class TestRuleStatus:
    """Test RuleStatus enum."""
    
    def test_all_statuses_exist(self):
        """Test that all expected statuses exist."""
        assert RuleStatus.ENABLED == "enabled"
        assert RuleStatus.DISABLED == "disabled"
        assert RuleStatus.DEPRECATED == "deprecated"
        assert RuleStatus.EXPERIMENTAL == "experimental"
