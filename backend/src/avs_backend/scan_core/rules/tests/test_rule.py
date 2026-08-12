"""
SC-8A Rule Engine — Rule Contract Tests
"""

import pytest

from avs_backend.scan_core.rules.rule import Rule, RuleMetadata
from avs_backend.scan_core.rules.models import RuleIdentifier, RuleVersion
from avs_backend.scan_core.rules.enums import RuleCategory, Severity, RuleStatus
from avs_backend.scan_core.assets import AssetType


class TestRuleMetadata:
    """Test RuleMetadata model."""
    
    def test_valid_metadata(self):
        """Test creating valid rule metadata."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.browser.cache"),
            version=RuleVersion(1, 0, 0),
            name="Browser Cache Detector",
            description="Detects browser cache files",
            category=RuleCategory.CACHE,
            severity=Severity.LOW,
            priority=100,
            status=RuleStatus.ENABLED,
        )
        
        assert metadata.rule_id == "junk.browser.cache"
        assert metadata.version_string == "1.0.0"
        assert metadata.name == "Browser Cache Detector"
        assert metadata.description == "Detects browser cache files"
        assert metadata.category == RuleCategory.CACHE
        assert metadata.severity == Severity.LOW
        assert metadata.priority == 100
        assert metadata.status == RuleStatus.ENABLED
    
    def test_empty_name(self):
        """Test empty name is rejected."""
        with pytest.raises(ValueError, match="name cannot be empty"):
            RuleMetadata(
                identifier=RuleIdentifier("junk.temp"),
                version=RuleVersion(1, 0, 0),
                name="",
                description="test",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
            )
    
    def test_empty_description(self):
        """Test empty description is rejected."""
        with pytest.raises(ValueError, match="description cannot be empty"):
            RuleMetadata(
                identifier=RuleIdentifier("junk.temp"),
                version=RuleVersion(1, 0, 0),
                name="test",
                description="",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
            )
    
    def test_negative_priority(self):
        """Test negative priority is rejected."""
        with pytest.raises(ValueError, match="priority must be non-negative"):
            RuleMetadata(
                identifier=RuleIdentifier("junk.temp"),
                version=RuleVersion(1, 0, 0),
                name="test",
                description="test",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
                priority=-1,
            )
    
    def test_is_enabled(self):
        """Test is_enabled property."""
        metadata_enabled = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
        )
        assert metadata_enabled.is_enabled is True
        
        metadata_disabled = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.DISABLED,
        )
        assert metadata_disabled.is_enabled is False
    
    def test_is_experimental(self):
        """Test is_experimental property."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.EXPERIMENTAL,
        )
        assert metadata.is_experimental is True
    
    def test_supports_asset_type_all(self):
        """Test supports_asset_type with no restrictions."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple(),  # Empty = all types
        )
        
        # Should support all types
        assert metadata.supports_asset_type(AssetType.FILE) is True
        assert metadata.supports_asset_type(AssetType.DIRECTORY) is True
        assert metadata.supports_asset_type(AssetType.REGISTRY_KEY) is True
    
    def test_supports_asset_type_restricted(self):
        """Test supports_asset_type with restrictions."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value, AssetType.DIRECTORY.value]),
        )
        
        # Should support only specified types
        assert metadata.supports_asset_type(AssetType.FILE) is True
        assert metadata.supports_asset_type(AssetType.DIRECTORY) is True
        assert metadata.supports_asset_type(AssetType.REGISTRY_KEY) is False
    
    def test_metadata_with_tags(self):
        """Test metadata with tags."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            tags=tuple(["browser", "cache", "safe"]),
        )
        
        assert len(metadata.tags) == 3
        assert "browser" in metadata.tags
        assert "cache" in metadata.tags
        assert "safe" in metadata.tags
    
    def test_metadata_with_author(self):
        """Test metadata with author."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            author="AVS Shield Team",
        )
        
        assert metadata.author == "AVS Shield Team"
    
    def test_metadata_with_documentation_url(self):
        """Test metadata with documentation URL."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            documentation_url="https://docs.avsshield.com/rules/junk.temp",
        )
        
        assert metadata.documentation_url == "https://docs.avsshield.com/rules/junk.temp"
    
    def test_immutability(self):
        """Test metadata is immutable."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
        )
        
        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            metadata.name = "modified"


class TestRule:
    """Test Rule abstract base class."""
    
    def test_rule_initialization(self):
        """Test rule initialization with metadata."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Temp File Detector",
            description="Detects temporary files",
            category=RuleCategory.TEMPORARY,
            severity=Severity.LOW,
        )
        
        # Create concrete implementation for testing
        class TestRule(Rule):
            def evaluate(self, asset, snapshot=None, context=None):
                raise NotImplementedError("SC-8A: evaluation not implemented")
        
        rule = TestRule(metadata)
        assert rule.metadata == metadata
        assert rule.rule_id == "junk.temp"
        assert rule.version == RuleVersion(1, 0, 0)
        assert rule.is_enabled is True
    
    def test_rule_cannot_be_instantiated_directly(self):
        """Test that Rule is abstract and cannot be instantiated."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
        )
        
        # Cannot instantiate abstract class
        with pytest.raises(TypeError):
            Rule(metadata)
    
    def test_rule_evaluate_not_implemented(self):
        """Test that evaluate() raises NotImplementedError in SC-8A."""
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="test",
            description="test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
        )
        
        class TestRule(Rule):
            def evaluate(self, asset, snapshot=None, context=None):
                # SC-8A: evaluation not implemented yet
                raise NotImplementedError("Rule evaluation not implemented in SC-8A")
        
        rule = TestRule(metadata)
        
        # evaluate() should raise NotImplementedError
        with pytest.raises(NotImplementedError, match="not implemented in SC-8A"):
            rule.evaluate(asset=None)
