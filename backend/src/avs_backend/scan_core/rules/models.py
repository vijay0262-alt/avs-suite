"""
SC-8A Rule Engine — Core Models

Defines rule identifiers, versioning, and metadata structures.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RuleIdentifier:
    """
    Deterministic rule identifier.
    
    Format: category.subcategory.target[.detail]
    
    Examples:
        junk.browser.chrome.cache
        registry.orphaned.startup
        startup.missing.target
        privacy.browser.history
        security.unsigned.executable
    
    Rule IDs must be stable across versions.
    DO NOT use random UUIDs.
    """
    
    identifier: str
    
    def __post_init__(self) -> None:
        """Validate identifier format."""
        if not self.identifier:
            raise ValueError("Rule identifier cannot be empty")
        
        # Must be lowercase alphanumeric with dots and underscores
        if not re.match(r'^[a-z0-9_.]+$', self.identifier):
            raise ValueError(
                f"Invalid rule identifier: {self.identifier}. "
                "Must be lowercase alphanumeric with dots and underscores only."
            )
        
        # Must have at least 2 segments
        parts = self.identifier.split('.')
        if len(parts) < 2:
            raise ValueError(
                f"Invalid rule identifier: {self.identifier}. "
                "Must have at least 2 segments (e.g., 'category.target')."
            )
    
    @property
    def category(self) -> str:
        """Get the category portion of the identifier."""
        return self.identifier.split('.')[0]
    
    @property
    def subcategory(self) -> Optional[str]:
        """Get the subcategory portion if present."""
        parts = self.identifier.split('.')
        return parts[1] if len(parts) > 1 else None
    
    @property
    def target(self) -> Optional[str]:
        """Get the target portion if present."""
        parts = self.identifier.split('.')
        return parts[2] if len(parts) > 2 else None
    
    def __str__(self) -> str:
        return self.identifier


@dataclass(frozen=True)
class RuleVersion:
    """
    Semantic version for a rule.
    
    Format: major.minor.patch
    
    - major: Breaking changes to rule logic
    - minor: Non-breaking enhancements
    - patch: Bug fixes
    """
    
    major: int
    minor: int
    patch: int
    
    def __post_init__(self) -> None:
        """Validate version components."""
        if self.major < 0 or self.minor < 0 or self.patch < 0:
            raise ValueError("Version components must be non-negative")
    
    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"
    
    def to_string(self) -> str:
        """Convert to string representation."""
        return str(self)
    
    @classmethod
    def from_string(cls, version_str: str) -> RuleVersion:
        """
        Parse version from string.
        
        Args:
            version_str: Version string in format "major.minor.patch"
        
        Returns:
            RuleVersion instance
        
        Raises:
            ValueError: If version string is invalid
        """
        try:
            parts = version_str.split('.')
            if len(parts) != 3:
                raise ValueError(f"Invalid version format: {version_str}")
            
            major, minor, patch = map(int, parts)
            return cls(major=major, minor=minor, patch=patch)
        except (ValueError, AttributeError) as e:
            raise ValueError(f"Invalid version string: {version_str}") from e
    
    def __lt__(self, other: RuleVersion) -> bool:
        """Compare versions for ordering."""
        return (self.major, self.minor, self.patch) < (other.major, other.minor, other.patch)
    
    def __le__(self, other: RuleVersion) -> bool:
        """Compare versions for ordering."""
        return (self.major, self.minor, self.patch) <= (other.major, other.minor, other.patch)
    
    def __gt__(self, other: RuleVersion) -> bool:
        """Compare versions for ordering."""
        return (self.major, self.minor, self.patch) > (other.major, other.minor, other.patch)
    
    def __ge__(self, other: RuleVersion) -> bool:
        """Compare versions for ordering."""
        return (self.major, self.minor, self.patch) >= (other.major, other.minor, other.patch)
