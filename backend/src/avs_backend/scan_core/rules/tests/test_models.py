"""
SC-8A Rule Engine — Model Tests
"""

import pytest

from avs_backend.scan_core.rules.models import RuleIdentifier, RuleVersion


class TestRuleIdentifier:
    """Test RuleIdentifier model."""
    
    def test_valid_identifier(self):
        """Test creating valid identifiers."""
        id1 = RuleIdentifier("junk.browser.chrome.cache")
        assert id1.identifier == "junk.browser.chrome.cache"
        assert str(id1) == "junk.browser.chrome.cache"
        
        id2 = RuleIdentifier("registry.orphaned.startup")
        assert id2.identifier == "registry.orphaned.startup"
    
    def test_identifier_parts(self):
        """Test extracting identifier parts."""
        identifier = RuleIdentifier("junk.browser.chrome.cache")
        assert identifier.category == "junk"
        assert identifier.subcategory == "browser"
        assert identifier.target == "chrome"
    
    def test_minimum_segments(self):
        """Test minimum segment requirement."""
        # Valid: 2 segments
        RuleIdentifier("junk.temp")
        
        # Invalid: 1 segment
        with pytest.raises(ValueError, match="at least 2 segments"):
            RuleIdentifier("junk")
    
    def test_empty_identifier(self):
        """Test empty identifier is rejected."""
        with pytest.raises(ValueError, match="cannot be empty"):
            RuleIdentifier("")
    
    def test_invalid_characters(self):
        """Test invalid characters are rejected."""
        # Uppercase not allowed
        with pytest.raises(ValueError, match="Invalid rule identifier"):
            RuleIdentifier("Junk.Browser")
        
        # Spaces not allowed
        with pytest.raises(ValueError, match="Invalid rule identifier"):
            RuleIdentifier("junk browser")
        
        # Special chars not allowed (except . and _)
        with pytest.raises(ValueError, match="Invalid rule identifier"):
            RuleIdentifier("junk-browser")
    
    def test_valid_characters(self):
        """Test valid characters are accepted."""
        # Lowercase, numbers, dots, underscores
        RuleIdentifier("junk.browser_cache.chrome2.v1")
    
    def test_immutability(self):
        """Test identifier is immutable."""
        identifier = RuleIdentifier("junk.temp")
        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            identifier.identifier = "other"
    
    def test_equality(self):
        """Test identifier equality."""
        id1 = RuleIdentifier("junk.temp")
        id2 = RuleIdentifier("junk.temp")
        id3 = RuleIdentifier("junk.cache")
        
        assert id1 == id2
        assert id1 != id3


class TestRuleVersion:
    """Test RuleVersion model."""
    
    def test_valid_version(self):
        """Test creating valid versions."""
        v1 = RuleVersion(1, 0, 0)
        assert v1.major == 1
        assert v1.minor == 0
        assert v1.patch == 0
        assert str(v1) == "1.0.0"
        
        v2 = RuleVersion(2, 3, 5)
        assert str(v2) == "2.3.5"
    
    def test_negative_version_components(self):
        """Test negative version components are rejected."""
        with pytest.raises(ValueError, match="non-negative"):
            RuleVersion(-1, 0, 0)
        
        with pytest.raises(ValueError, match="non-negative"):
            RuleVersion(1, -1, 0)
        
        with pytest.raises(ValueError, match="non-negative"):
            RuleVersion(1, 0, -1)
    
    def test_version_from_string(self):
        """Test parsing version from string."""
        v1 = RuleVersion.from_string("1.0.0")
        assert v1.major == 1
        assert v1.minor == 0
        assert v1.patch == 0
        
        v2 = RuleVersion.from_string("2.3.5")
        assert v2.major == 2
        assert v2.minor == 3
        assert v2.patch == 5
    
    def test_invalid_version_string(self):
        """Test invalid version strings are rejected."""
        with pytest.raises(ValueError, match="Invalid version"):
            RuleVersion.from_string("1.0")
        
        with pytest.raises(ValueError, match="Invalid version"):
            RuleVersion.from_string("1.0.0.0")
        
        with pytest.raises(ValueError, match="Invalid version"):
            RuleVersion.from_string("abc")
        
        with pytest.raises(ValueError, match="Invalid version"):
            RuleVersion.from_string("")
    
    def test_version_to_string(self):
        """Test converting version to string."""
        v = RuleVersion(1, 2, 3)
        assert v.to_string() == "1.2.3"
        assert str(v) == "1.2.3"
    
    def test_version_comparison(self):
        """Test version comparison operators."""
        v1_0_0 = RuleVersion(1, 0, 0)
        v1_0_1 = RuleVersion(1, 0, 1)
        v1_1_0 = RuleVersion(1, 1, 0)
        v2_0_0 = RuleVersion(2, 0, 0)
        
        # Less than
        assert v1_0_0 < v1_0_1
        assert v1_0_1 < v1_1_0
        assert v1_1_0 < v2_0_0
        
        # Greater than
        assert v2_0_0 > v1_1_0
        assert v1_1_0 > v1_0_1
        assert v1_0_1 > v1_0_0
        
        # Equality
        assert v1_0_0 == RuleVersion(1, 0, 0)
        assert v1_0_0 != v1_0_1
        
        # Less than or equal
        assert v1_0_0 <= v1_0_0
        assert v1_0_0 <= v1_0_1
        
        # Greater than or equal
        assert v1_0_1 >= v1_0_1
        assert v1_0_1 >= v1_0_0
    
    def test_immutability(self):
        """Test version is immutable."""
        version = RuleVersion(1, 0, 0)
        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            version.major = 2
    
    def test_equality(self):
        """Test version equality."""
        v1 = RuleVersion(1, 0, 0)
        v2 = RuleVersion(1, 0, 0)
        v3 = RuleVersion(1, 0, 1)
        
        assert v1 == v2
        assert v1 != v3
