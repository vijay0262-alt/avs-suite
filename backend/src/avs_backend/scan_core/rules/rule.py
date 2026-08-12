"""
SC-8A Rule Engine — Rule Contract

Abstract rule interface and metadata.
NO EVALUATION IMPLEMENTATION YET.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

from .enums import RuleCategory, Severity, RuleStatus
from .models import RuleIdentifier, RuleVersion

if TYPE_CHECKING:
    from ..assets import AssetType, ScanAsset
    from ..context import AssetSnapshot, ScanContext
    from .result import RuleResult


@dataclass(frozen=True)
class RuleMetadata:
    """
    Metadata describing a rule.
    
    Immutable rule configuration and documentation.
    """
    
    # Identity
    identifier: RuleIdentifier
    version: RuleVersion
    
    # Description
    name: str
    description: str
    
    # Classification
    category: RuleCategory
    severity: Severity
    
    # Configuration
    priority: int = 100
    status: RuleStatus = RuleStatus.ENABLED
    
    # Supported asset types (empty = all types)
    supported_asset_types: tuple[str, ...] = field(default_factory=tuple)
    
    # Optional metadata
    tags: tuple[str, ...] = field(default_factory=tuple)
    author: Optional[str] = None
    documentation_url: Optional[str] = None
    
    def __post_init__(self) -> None:
        """Validate metadata."""
        if not self.name:
            raise ValueError("Rule name cannot be empty")
        
        if not self.description:
            raise ValueError("Rule description cannot be empty")
        
        if self.priority < 0:
            raise ValueError("Rule priority must be non-negative")
        
        # Convert lists to tuples for immutability
        if isinstance(object.__getattribute__(self, 'supported_asset_types'), list):
            object.__setattr__(
                self,
                'supported_asset_types',
                tuple(object.__getattribute__(self, 'supported_asset_types'))
            )
        
        if isinstance(object.__getattribute__(self, 'tags'), list):
            object.__setattr__(self, 'tags', tuple(object.__getattribute__(self, 'tags')))
    
    @property
    def rule_id(self) -> str:
        """Get rule ID as string."""
        return str(self.identifier)
    
    @property
    def version_string(self) -> str:
        """Get version as string."""
        return str(self.version)
    
    @property
    def is_enabled(self) -> bool:
        """Check if rule is enabled."""
        return self.status == RuleStatus.ENABLED
    
    @property
    def is_experimental(self) -> bool:
        """Check if rule is experimental."""
        return self.status == RuleStatus.EXPERIMENTAL
    
    def supports_asset_type(self, asset_type: AssetType) -> bool:
        """
        Check if rule supports a specific asset type.
        
        Args:
            asset_type: Asset type to check
        
        Returns:
            True if supported (or if no restrictions)
        """
        # Empty tuple means all types supported
        if not self.supported_asset_types:
            return True
        
        return asset_type.value in self.supported_asset_types


class Rule(ABC):
    """
    Abstract base class for all detection rules.
    
    A Rule is a DECISION / CLASSIFICATION component that:
    - Consumes read-only scan information
    - Evaluates conditions
    - Produces RuleResult
    
    A Rule NEVER:
    - Modifies the filesystem
    - Modifies the registry
    - Executes shell commands
    - Terminates processes
    - Calls cleaners
    - Modifies the orchestrator
    
    Subclasses must implement evaluate().
    """
    
    def __init__(self, metadata: RuleMetadata):
        """
        Initialize rule with metadata.
        
        Args:
            metadata: Immutable rule metadata
        """
        self._metadata = metadata
    
    @property
    def metadata(self) -> RuleMetadata:
        """Get rule metadata."""
        return self._metadata
    
    @property
    def rule_id(self) -> str:
        """Get rule ID."""
        return self._metadata.rule_id
    
    @property
    def version(self) -> RuleVersion:
        """Get rule version."""
        return self._metadata.version
    
    @property
    def is_enabled(self) -> bool:
        """Check if rule is enabled."""
        return self._metadata.is_enabled
    
    @abstractmethod
    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """
        Evaluate rule against an asset.
        
        This method consumes READ-ONLY scan information and produces
        a RuleResult describing the match, confidence, safety, and
        recommended action.
        
        This method MUST NOT:
        - Modify the asset
        - Modify the snapshot
        - Modify the context
        - Perform any system modifications
        
        Args:
            asset: ScanAsset to evaluate (READ-ONLY)
            snapshot: Optional asset snapshot (READ-ONLY)
            context: Optional scan context (READ-ONLY)
        
        Returns:
            RuleResult describing the evaluation outcome
        
        NOTE: Implementation is deferred to SC-8B.
        This is a contract definition only.
        """
        raise NotImplementedError("Rule evaluation not implemented in SC-8A")
