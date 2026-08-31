"""
SC-8A Rule Engine — Rule Contract

Abstract rule interface and metadata.
NO EVALUATION IMPLEMENTATION YET.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
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
        self._applicable_roots_cache: list[Path] | None | bool = False
    
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

    def get_applicable_roots(self) -> list[Path] | None:
        """Return location roots this rule applies to, or None for universal.

        Override in subclasses to enable path-based pre-filtering in the
        ApplicabilityEngine. When a non-empty list is returned, the engine
        skips this rule for assets whose canonical_path is not under any
        of the listed roots — dramatically reducing rules_evaluated for
        large scans without losing coverage.

        The result is cached on first call since rules are singletons.

        Returns:
            List of root Paths, or None if the rule is universal (applies
            to all assets regardless of path).
        """
        return None

    def get_applicable_roots_cached(self) -> list[Path] | None:
        """Cached version of get_applicable_roots() for performance.

        Computes roots once and caches the result on the instance.
        Rules are singletons (registered once), so the cache is safe.

        Returns:
            List of root Paths, or None if the rule is universal.
        """
        if self._applicable_roots_cache is False:
            self._applicable_roots_cache = self.get_applicable_roots()
        return self._applicable_roots_cache

    def get_applicable_roots_normalized(self) -> list[list[str]] | None:
        """V1.0: Get pre-normalized applicable root parts for fast matching.

        Caches the normalized form so ApplicabilityEngine doesn't need
        to call _normalize_windows_path() for every root on every asset.

        Returns:
            List of normalized root part lists, or None if universal.
        """
        roots = self.get_applicable_roots_cached()
        if roots is None:
            return None
        cache_attr = '_applicable_roots_normalized_cache'
        if not hasattr(self, cache_attr) or getattr(self, cache_attr) is None:
            from ..rules.detection.locations import KnownLocations
            setattr(self, cache_attr, [
                KnownLocations._normalize_windows_path(str(r)) for r in roots
            ])
        return getattr(self, cache_attr)
