"""
SC-8B Rule Applicability

Determines whether a rule can apply to an asset before evaluation.

This is a performance optimization and correctness boundary.
"""

from __future__ import annotations

from enum import Enum
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .rule import Rule
    from ..assets import ScanAsset


class ApplicabilityStatus(str, Enum):
    """
    Result of applicability check.
    
    IMPORTANT: This is NOT the same as rule match status.
    
    APPLICABLE: Rule can be evaluated
    NOT_APPLICABLE: Rule cannot apply (wrong asset type/category)
    DISABLED: Rule is disabled
    UNSUPPORTED_ASSET: Asset type not supported by rule
    INVALID_RULE: Rule configuration is invalid
    """
    
    APPLICABLE = "applicable"
    NOT_APPLICABLE = "not_applicable"
    DISABLED = "disabled"
    UNSUPPORTED_ASSET = "unsupported_asset"
    INVALID_RULE = "invalid_rule"


@dataclass(frozen=True)
class ApplicabilityResult:
    """
    Result of applicability check.
    
    Indicates whether a rule should be evaluated for an asset.
    """
    
    status: ApplicabilityStatus
    reason: str
    
    @property
    def is_applicable(self) -> bool:
        """Check if rule is applicable."""
        return self.status == ApplicabilityStatus.APPLICABLE
    
    @classmethod
    def applicable(cls, reason: str = "Rule is applicable") -> ApplicabilityResult:
        """Create APPLICABLE result."""
        return cls(status=ApplicabilityStatus.APPLICABLE, reason=reason)
    
    @classmethod
    def not_applicable(cls, reason: str) -> ApplicabilityResult:
        """Create NOT_APPLICABLE result."""
        return cls(status=ApplicabilityStatus.NOT_APPLICABLE, reason=reason)
    
    @classmethod
    def disabled(cls, reason: str = "Rule is disabled") -> ApplicabilityResult:
        """Create DISABLED result."""
        return cls(status=ApplicabilityStatus.DISABLED, reason=reason)
    
    @classmethod
    def unsupported_asset(cls, reason: str) -> ApplicabilityResult:
        """Create UNSUPPORTED_ASSET result."""
        return cls(status=ApplicabilityStatus.UNSUPPORTED_ASSET, reason=reason)
    
    @classmethod
    def invalid_rule(cls, reason: str) -> ApplicabilityResult:
        """Create INVALID_RULE result."""
        return cls(status=ApplicabilityStatus.INVALID_RULE, reason=reason)


class ApplicabilityEngine:
    """
    Determines rule applicability before evaluation.
    
    Filters rules based on:
    - Rule status (enabled/disabled)
    - Asset type compatibility
    - Asset category (optional)
    - Tags (optional)
    
    Does NOT execute rule logic.
    """
    
    @staticmethod
    def check_applicability(rule: Rule, asset: ScanAsset) -> ApplicabilityResult:
        """
        Check if rule is applicable to asset.
        
        Args:
            rule: Rule to check
            asset: Asset to check against
        
        Returns:
            ApplicabilityResult indicating whether rule should be evaluated
        """
        metadata = rule.metadata
        
        # Check if rule is enabled
        if not metadata.is_enabled:
            return ApplicabilityResult.disabled(
                f"Rule '{metadata.rule_id}' is {metadata.status.value}"
            )
        
        # Check asset type compatibility
        if not metadata.supports_asset_type(asset.asset_type):
            return ApplicabilityResult.unsupported_asset(
                f"Rule '{metadata.rule_id}' does not support asset type '{asset.asset_type.value}'"
            )
        
        # Rule is applicable
        return ApplicabilityResult.applicable(
            f"Rule '{metadata.rule_id}' is applicable to {asset.asset_type.value}"
        )
    
    @staticmethod
    def filter_applicable_rules(
        rules: list[Rule],
        asset: ScanAsset,
    ) -> list[tuple[Rule, ApplicabilityResult]]:
        """
        Filter rules to only those applicable to asset.
        
        Args:
            rules: List of rules to check
            asset: Asset to check against
        
        Returns:
            List of (rule, result) tuples for all rules
        """
        results: list[tuple[Rule, ApplicabilityResult]] = []
        
        for rule in rules:
            result = ApplicabilityEngine.check_applicability(rule, asset)
            results.append((rule, result))
        
        return results
    
    @staticmethod
    def get_applicable_rules(
        rules: list[Rule],
        asset: ScanAsset,
    ) -> list[Rule]:
        """
        Get only applicable rules for asset.
        
        Args:
            rules: List of rules to check
            asset: Asset to check against
        
        Returns:
            List of applicable rules only
        """
        applicable: list[Rule] = []
        
        for rule in rules:
            result = ApplicabilityEngine.check_applicability(rule, asset)
            if result.is_applicable:
                applicable.append(rule)
        
        return applicable
