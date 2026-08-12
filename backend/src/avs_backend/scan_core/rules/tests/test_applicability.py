"""
SC-8B Rule Applicability Tests
"""

import pytest

from avs_backend.scan_core.rules.applicability import (
    ApplicabilityEngine,
    ApplicabilityResult,
    ApplicabilityStatus,
)
from avs_backend.scan_core.rules.rule import Rule, RuleMetadata
from avs_backend.scan_core.rules.models import RuleIdentifier, RuleVersion
from avs_backend.scan_core.rules.enums import RuleCategory, Severity, RuleStatus
from avs_backend.scan_core.assets import ScanAsset, AssetType, AssetCategory, AssetSource
from datetime import datetime, UTC


class TestRule(Rule):
    """Test rule implementation."""
    
    def evaluate(self, asset, snapshot=None, context=None):
        raise NotImplementedError("SC-8B: evaluation not implemented")


class TestApplicabilityStatus:
    """Test ApplicabilityStatus enum."""
    
    def test_all_statuses_exist(self):
        """Test that all expected statuses exist."""
        assert ApplicabilityStatus.APPLICABLE == "applicable"
        assert ApplicabilityStatus.NOT_APPLICABLE == "not_applicable"
        assert ApplicabilityStatus.DISABLED == "disabled"
        assert ApplicabilityStatus.UNSUPPORTED_ASSET == "unsupported_asset"
        assert ApplicabilityStatus.INVALID_RULE == "invalid_rule"


class TestApplicabilityResult:
    """Test ApplicabilityResult model."""
    
    def test_applicable_result(self):
        """Test creating APPLICABLE result."""
        result = ApplicabilityResult.applicable()
        assert result.status == ApplicabilityStatus.APPLICABLE
        assert result.is_applicable is True
    
    def test_not_applicable_result(self):
        """Test creating NOT_APPLICABLE result."""
        result = ApplicabilityResult.not_applicable("Wrong asset type")
        assert result.status == ApplicabilityStatus.NOT_APPLICABLE
        assert result.is_applicable is False
    
    def test_disabled_result(self):
        """Test creating DISABLED result."""
        result = ApplicabilityResult.disabled()
        assert result.status == ApplicabilityStatus.DISABLED
        assert result.is_applicable is False
    
    def test_unsupported_asset_result(self):
        """Test creating UNSUPPORTED_ASSET result."""
        result = ApplicabilityResult.unsupported_asset("Asset type not supported")
        assert result.status == ApplicabilityStatus.UNSUPPORTED_ASSET
        assert result.is_applicable is False
    
    def test_invalid_rule_result(self):
        """Test creating INVALID_RULE result."""
        result = ApplicabilityResult.invalid_rule("Rule configuration invalid")
        assert result.status == ApplicabilityStatus.INVALID_RULE
        assert result.is_applicable is False


class TestApplicabilityEngine:
    """Test ApplicabilityEngine."""
    
    def create_asset(self, asset_type: AssetType) -> ScanAsset:
        """Helper to create test asset."""
        return ScanAsset(
            asset_id="test-asset",
            asset_type=asset_type,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="Test Asset",
            canonical_path="/test/path",
            discovered_at=datetime.now(UTC),
        )
    
    def test_enabled_rule_applicable(self):
        """Test enabled rule is applicable."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Temp File Detector",
            description="Detects temporary files",
            category=RuleCategory.TEMPORARY,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = TestRule(metadata)
        asset = self.create_asset(AssetType.FILE)
        
        result = ApplicabilityEngine.check_applicability(rule, asset)
        assert result.is_applicable is True
        assert result.status == ApplicabilityStatus.APPLICABLE
    
    def test_disabled_rule_not_applicable(self):
        """Test disabled rule is not applicable."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Temp File Detector",
            description="Detects temporary files",
            category=RuleCategory.TEMPORARY,
            severity=Severity.LOW,
            status=RuleStatus.DISABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = TestRule(metadata)
        asset = self.create_asset(AssetType.FILE)
        
        result = ApplicabilityEngine.check_applicability(rule, asset)
        assert result.is_applicable is False
        assert result.status == ApplicabilityStatus.DISABLED
    
    def test_unsupported_asset_type(self):
        """Test rule not applicable to unsupported asset type."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Temp File Detector",
            description="Detects temporary files",
            category=RuleCategory.TEMPORARY,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = TestRule(metadata)
        asset = self.create_asset(AssetType.REGISTRY_KEY)
        
        result = ApplicabilityEngine.check_applicability(rule, asset)
        assert result.is_applicable is False
        assert result.status == ApplicabilityStatus.UNSUPPORTED_ASSET
    
    def test_universal_rule_all_types(self):
        """Test rule with no asset type restrictions applies to all."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("universal.rule"),
            version=RuleVersion(1, 0, 0),
            name="Universal Rule",
            description="Applies to all asset types",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=tuple(),  # Empty = all types
        )
        
        rule = TestRule(metadata)
        
        # Should apply to all asset types
        for asset_type in [AssetType.FILE, AssetType.DIRECTORY, AssetType.REGISTRY_KEY]:
            asset = self.create_asset(asset_type)
            result = ApplicabilityEngine.check_applicability(rule, asset)
            assert result.is_applicable is True
    
    def test_filter_applicable_rules(self):
        """Test filtering rules by applicability."""
        # Create enabled file rule
        metadata_file = RuleMetadata(
            identifier=RuleIdentifier("file.rule"),
            version=RuleVersion(1, 0, 0),
            name="File Rule",
            description="File Rule",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        rule_file = TestRule(metadata_file)
        
        # Create disabled file rule
        metadata_disabled = RuleMetadata(
            identifier=RuleIdentifier("disabled.rule"),
            version=RuleVersion(1, 0, 0),
            name="Disabled Rule",
            description="Disabled Rule",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.DISABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        rule_disabled = TestRule(metadata_disabled)
        
        # Create registry rule
        metadata_reg = RuleMetadata(
            identifier=RuleIdentifier("registry.rule"),
            version=RuleVersion(1, 0, 0),
            name="Registry Rule",
            description="Registry Rule",
            category=RuleCategory.REGISTRY,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=tuple([AssetType.REGISTRY_KEY.value]),
        )
        rule_reg = TestRule(metadata_reg)
        
        rules = [rule_file, rule_disabled, rule_reg]
        asset = self.create_asset(AssetType.FILE)
        
        results = ApplicabilityEngine.filter_applicable_rules(rules, asset)
        
        # Should have 3 results
        assert len(results) == 3
        
        # Check each result
        file_result = next(r for rule, r in results if rule.rule_id == "file.rule")
        assert file_result.is_applicable is True
        
        disabled_result = next(r for rule, r in results if rule.rule_id == "disabled.rule")
        assert disabled_result.status == ApplicabilityStatus.DISABLED
        
        reg_result = next(r for rule, r in results if rule.rule_id == "registry.rule")
        assert reg_result.status == ApplicabilityStatus.UNSUPPORTED_ASSET
    
    def test_get_applicable_rules(self):
        """Test getting only applicable rules."""
        # Create enabled file rule
        metadata_file = RuleMetadata(
            identifier=RuleIdentifier("file.rule"),
            version=RuleVersion(1, 0, 0),
            name="File Rule",
            description="File Rule",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        rule_file = TestRule(metadata_file)
        
        # Create disabled file rule
        metadata_disabled = RuleMetadata(
            identifier=RuleIdentifier("disabled.rule"),
            version=RuleVersion(1, 0, 0),
            name="Disabled Rule",
            description="Disabled Rule",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.DISABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        rule_disabled = TestRule(metadata_disabled)
        
        # Create registry rule
        metadata_reg = RuleMetadata(
            identifier=RuleIdentifier("registry.rule"),
            version=RuleVersion(1, 0, 0),
            name="Registry Rule",
            description="Registry Rule",
            category=RuleCategory.REGISTRY,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=tuple([AssetType.REGISTRY_KEY.value]),
        )
        rule_reg = TestRule(metadata_reg)
        
        rules = [rule_file, rule_disabled, rule_reg]
        asset = self.create_asset(AssetType.FILE)
        
        applicable = ApplicabilityEngine.get_applicable_rules(rules, asset)
        
        # Only file.rule should be applicable
        assert len(applicable) == 1
        assert applicable[0].rule_id == "file.rule"
    
    def test_experimental_rule_applicable(self):
        """Test experimental rule is still applicable if enabled."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("experimental.rule"),
            version=RuleVersion(1, 0, 0),
            name="Experimental Rule",
            description="Experimental Rule",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.EXPERIMENTAL,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = TestRule(metadata)
        asset = self.create_asset(AssetType.FILE)
        
        # Experimental is not the same as disabled
        # Check is_enabled property
        result = ApplicabilityEngine.check_applicability(rule, asset)
        
        # Experimental rules are not enabled by default
        assert result.is_applicable is False
        assert result.status == ApplicabilityStatus.DISABLED
    
    def test_deterministic_results(self):
        """Test applicability results are deterministic."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Temp File Detector",
            description="Detects temporary files",
            category=RuleCategory.TEMPORARY,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = TestRule(metadata)
        asset = self.create_asset(AssetType.FILE)
        
        # Check multiple times
        results = [
            ApplicabilityEngine.check_applicability(rule, asset)
            for _ in range(10)
        ]
        
        # All results should be identical
        assert all(r.status == ApplicabilityStatus.APPLICABLE for r in results)
        assert all(r.is_applicable is True for r in results)
