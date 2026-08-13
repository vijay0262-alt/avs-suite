"""
SC-8B Rule Registry Tests
"""

import pytest

from avs_backend.scan_core.rules.registry import RuleRegistry, RuleRegistrationError
from avs_backend.scan_core.rules.rule import Rule, RuleMetadata
from avs_backend.scan_core.rules.models import RuleIdentifier, RuleVersion
from avs_backend.scan_core.rules.enums import RuleCategory, Severity, RuleStatus
from avs_backend.scan_core.assets import AssetType


class TestRule(Rule):
    """Test rule implementation."""
    __test__ = False

    def evaluate(self, asset, snapshot=None, context=None):
        raise NotImplementedError("SC-8B: evaluation not implemented")


class TestRuleRegistry:
    """Test RuleRegistry."""
    
    def test_empty_registry(self):
        """Test creating empty registry."""
        registry = RuleRegistry()
        assert registry.count() == 0
        assert registry.list_all() == []
        assert registry.list_enabled() == []
    
    def test_register_rule(self):
        """Test registering a rule."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Temp File Detector",
            description="Detects temporary files",
            category=RuleCategory.TEMPORARY,
            severity=Severity.LOW,
        )
        
        rule = TestRule(metadata)
        registry.register(rule)
        
        assert registry.count() == 1
        assert registry.contains("junk.temp")
        assert registry.get("junk.temp") == rule
    
    def test_register_duplicate_same_version(self):
        """Test registering duplicate rule with same version."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Test",
            description="Test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
        )
        
        rule1 = TestRule(metadata)
        rule2 = TestRule(metadata)
        
        registry.register(rule1)
        
        with pytest.raises(RuleRegistrationError, match="already registered"):
            registry.register(rule2)
    
    def test_register_duplicate_different_version(self):
        """Test registering duplicate rule with different version."""
        registry = RuleRegistry()
        
        metadata_v1 = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Test",
            description="Test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
        )
        
        metadata_v2 = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(2, 0, 0),
            name="Test",
            description="Test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
        )
        
        rule1 = TestRule(metadata_v1)
        rule2 = TestRule(metadata_v2)
        
        registry.register(rule1)
        
        with pytest.raises(RuleRegistrationError, match="version conflict"):
            registry.register(rule2)
    
    def test_unregister_rule(self):
        """Test unregistering a rule."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp"),
            version=RuleVersion(1, 0, 0),
            name="Test",
            description="Test",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
        )
        
        rule = TestRule(metadata)
        registry.register(rule)
        
        assert registry.count() == 1
        
        result = registry.unregister("junk.temp")
        assert result is True
        assert registry.count() == 0
        assert not registry.contains("junk.temp")
    
    def test_unregister_nonexistent(self):
        """Test unregistering nonexistent rule."""
        registry = RuleRegistry()
        result = registry.unregister("nonexistent")
        assert result is False
    
    def test_get_nonexistent(self):
        """Test getting nonexistent rule."""
        registry = RuleRegistry()
        assert registry.get("nonexistent") is None
    
    def test_list_all_deterministic_order(self):
        """Test list_all returns deterministic order."""
        registry = RuleRegistry()
        
        # Register in random order
        for rule_id in ["zebra.rule", "alpha.rule", "middle.rule"]:
            metadata = RuleMetadata(
                identifier=RuleIdentifier(rule_id),
                version=RuleVersion(1, 0, 0),
                name="Test",
                description="Test",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
            )
            registry.register(TestRule(metadata))
        
        rules = registry.list_all()
        rule_ids = [r.rule_id for r in rules]
        
        # Should be sorted alphabetically
        assert rule_ids == ["alpha.rule", "middle.rule", "zebra.rule"]
    
    def test_list_enabled(self):
        """Test listing only enabled rules."""
        registry = RuleRegistry()
        
        # Register enabled rule
        metadata_enabled = RuleMetadata(
            identifier=RuleIdentifier("enabled.rule"),
            version=RuleVersion(1, 0, 0),
            name="Enabled",
            description="Enabled",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.ENABLED,
        )
        registry.register(TestRule(metadata_enabled))
        
        # Register disabled rule
        metadata_disabled = RuleMetadata(
            identifier=RuleIdentifier("disabled.rule"),
            version=RuleVersion(1, 0, 0),
            name="Disabled",
            description="Disabled",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.DISABLED,
        )
        registry.register(TestRule(metadata_disabled))
        
        enabled_rules = registry.list_enabled()
        assert len(enabled_rules) == 1
        assert enabled_rules[0].rule_id == "enabled.rule"
    
    def test_get_by_category(self):
        """Test getting rules by category."""
        registry = RuleRegistry()
        
        # Register junk rule
        metadata_junk = RuleMetadata(
            identifier=RuleIdentifier("junk.rule"),
            version=RuleVersion(1, 0, 0),
            name="Junk",
            description="Junk",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
        )
        registry.register(TestRule(metadata_junk))
        
        # Register cache rule
        metadata_cache = RuleMetadata(
            identifier=RuleIdentifier("cache.rule"),
            version=RuleVersion(1, 0, 0),
            name="Cache",
            description="Cache",
            category=RuleCategory.CACHE,
            severity=Severity.LOW,
        )
        registry.register(TestRule(metadata_cache))
        
        junk_rules = registry.get_by_category(RuleCategory.JUNK)
        assert len(junk_rules) == 1
        assert junk_rules[0].rule_id == "junk.rule"
        
        cache_rules = registry.get_by_category(RuleCategory.CACHE)
        assert len(cache_rules) == 1
        assert cache_rules[0].rule_id == "cache.rule"
    
    def test_get_by_asset_type_all_types(self):
        """Test getting rules that support all asset types."""
        registry = RuleRegistry()
        
        # Register rule with no asset type restrictions
        metadata = RuleMetadata(
            identifier=RuleIdentifier("universal.rule"),
            version=RuleVersion(1, 0, 0),
            name="Universal",
            description="Universal",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple(),  # Empty = all types
        )
        registry.register(TestRule(metadata))
        
        # Should be returned for any asset type
        file_rules = registry.get_by_asset_type(AssetType.FILE)
        assert len(file_rules) == 1
        
        dir_rules = registry.get_by_asset_type(AssetType.DIRECTORY)
        assert len(dir_rules) == 1
        
        reg_rules = registry.get_by_asset_type(AssetType.REGISTRY_KEY)
        assert len(reg_rules) == 1
    
    def test_get_by_asset_type_specific(self):
        """Test getting rules for specific asset types."""
        registry = RuleRegistry()
        
        # Register file-only rule
        metadata_file = RuleMetadata(
            identifier=RuleIdentifier("file.rule"),
            version=RuleVersion(1, 0, 0),
            name="File Rule",
            description="File Rule",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        registry.register(TestRule(metadata_file))
        
        # Register registry-only rule
        metadata_reg = RuleMetadata(
            identifier=RuleIdentifier("registry.rule"),
            version=RuleVersion(1, 0, 0),
            name="Registry Rule",
            description="Registry Rule",
            category=RuleCategory.REGISTRY,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.REGISTRY_KEY.value]),
        )
        registry.register(TestRule(metadata_reg))
        
        file_rules = registry.get_by_asset_type(AssetType.FILE)
        assert len(file_rules) == 1
        assert file_rules[0].rule_id == "file.rule"
        
        reg_rules = registry.get_by_asset_type(AssetType.REGISTRY_KEY)
        assert len(reg_rules) == 1
        assert reg_rules[0].rule_id == "registry.rule"
    
    def test_get_by_status(self):
        """Test getting rules by status."""
        registry = RuleRegistry()
        
        # Register experimental rule
        metadata_exp = RuleMetadata(
            identifier=RuleIdentifier("experimental.rule"),
            version=RuleVersion(1, 0, 0),
            name="Experimental",
            description="Experimental",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.EXPERIMENTAL,
        )
        registry.register(TestRule(metadata_exp))
        
        # Register deprecated rule
        metadata_dep = RuleMetadata(
            identifier=RuleIdentifier("deprecated.rule"),
            version=RuleVersion(1, 0, 0),
            name="Deprecated",
            description="Deprecated",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.DEPRECATED,
        )
        registry.register(TestRule(metadata_dep))
        
        exp_rules = registry.get_by_status(RuleStatus.EXPERIMENTAL)
        assert len(exp_rules) == 1
        assert exp_rules[0].rule_id == "experimental.rule"
        
        dep_rules = registry.get_by_status(RuleStatus.DEPRECATED)
        assert len(dep_rules) == 1
        assert dep_rules[0].rule_id == "deprecated.rule"
    
    def test_clear(self):
        """Test clearing registry."""
        registry = RuleRegistry()
        
        # Register multiple rules
        for i in range(5):
            metadata = RuleMetadata(
                identifier=RuleIdentifier(f"rule.{i}"),
                version=RuleVersion(1, 0, 0),
                name=f"Rule {i}",
                description=f"Rule {i}",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
            )
            registry.register(TestRule(metadata))
        
        assert registry.count() == 5
        
        registry.clear()
        
        assert registry.count() == 0
        assert registry.list_all() == []
    
    def test_invalid_rule_empty_id(self):
        """Test registering rule with empty ID."""
        registry = RuleRegistry()
        
        # Create rule with empty ID (should fail in RuleIdentifier)
        with pytest.raises(ValueError):
            RuleIdentifier("")
    
    def test_invalid_rule_empty_name(self):
        """Test registering rule with empty name."""
        registry = RuleRegistry()
        
        # Create metadata with empty name (should fail in RuleMetadata)
        with pytest.raises(ValueError):
            RuleMetadata(
                identifier=RuleIdentifier("test.rule"),
                version=RuleVersion(1, 0, 0),
                name="",
                description="Test",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
            )
    
    def test_large_registry_performance(self):
        """Test registry with many rules."""
        registry = RuleRegistry()
        
        # Register 100 rules
        for i in range(100):
            metadata = RuleMetadata(
                identifier=RuleIdentifier(f"rule.{i:03d}"),
                version=RuleVersion(1, 0, 0),
                name=f"Rule {i}",
                description=f"Rule {i}",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
            )
            registry.register(TestRule(metadata))
        
        assert registry.count() == 100
        
        # Lookup should be fast
        assert registry.contains("rule.050")
        assert registry.get("rule.050") is not None
        
        # List should be deterministic
        all_rules = registry.list_all()
        assert len(all_rules) == 100
        assert all_rules[0].rule_id == "rule.000"
        assert all_rules[99].rule_id == "rule.099"
