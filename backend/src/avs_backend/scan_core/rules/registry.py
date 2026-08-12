"""
SC-8B Rule Registry

Thread-safe registry for rule registration, discovery, and lookup.

The registry provides:
- Safe rule registration with duplicate detection
- Efficient rule lookup by ID, category, asset type, status
- Version conflict detection
- Deterministic ordering

NO RULE EVALUATION.
NO SYSTEM MODIFICATION.
"""

from __future__ import annotations

import threading
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .rule import Rule

from .models import RuleIdentifier, RuleVersion
from .enums import RuleCategory, RuleStatus
from ..assets import AssetType


class RuleRegistrationError(Exception):
    """Raised when rule registration fails."""
    pass


class RuleRegistry:
    """
    Thread-safe registry for detection rules.
    
    Provides efficient lookup by:
    - Rule ID
    - Category
    - Asset type
    - Status
    
    Rules are indexed for O(1) lookup where possible.
    """
    
    def __init__(self) -> None:
        """Initialize empty registry."""
        self._rules: dict[str, Rule] = {}
        self._lock = threading.RLock()
        
        # Indexes for efficient lookup
        self._by_category: dict[RuleCategory, list[str]] = {}
        self._by_status: dict[RuleStatus, list[str]] = {}
        self._by_asset_type: dict[str, list[str]] = {}
    
    def register(self, rule: Rule) -> None:
        """
        Register a rule.
        
        Args:
            rule: Rule to register
        
        Raises:
            RuleRegistrationError: If rule is invalid or duplicate exists
        """
        with self._lock:
            rule_id = rule.rule_id
            
            # Validate rule
            self._validate_rule(rule)
            
            # Check for duplicate
            if rule_id in self._rules:
                existing_rule = self._rules[rule_id]
                existing_version = existing_rule.version
                new_version = rule.version
                
                # Same version = duplicate
                if existing_version == new_version:
                    raise RuleRegistrationError(
                        f"Rule '{rule_id}' version {new_version} is already registered"
                    )
                
                # Different version = conflict (no auto-upgrade in SC-8B)
                raise RuleRegistrationError(
                    f"Rule '{rule_id}' version conflict: "
                    f"existing={existing_version}, new={new_version}. "
                    "Unregister existing rule first."
                )
            
            # Register rule
            self._rules[rule_id] = rule
            
            # Update indexes
            self._index_rule(rule)
    
    def unregister(self, rule_id: str) -> bool:
        """
        Unregister a rule.
        
        Args:
            rule_id: Rule identifier
        
        Returns:
            True if rule was removed, False if not found
        """
        with self._lock:
            if rule_id not in self._rules:
                return False
            
            rule = self._rules[rule_id]
            
            # Remove from indexes
            self._unindex_rule(rule)
            
            # Remove from registry
            del self._rules[rule_id]
            
            return True
    
    def get(self, rule_id: str) -> Optional[Rule]:
        """
        Get rule by ID.
        
        Args:
            rule_id: Rule identifier
        
        Returns:
            Rule if found, None otherwise
        """
        with self._lock:
            return self._rules.get(rule_id)
    
    def contains(self, rule_id: str) -> bool:
        """
        Check if rule is registered.
        
        Args:
            rule_id: Rule identifier
        
        Returns:
            True if rule exists
        """
        with self._lock:
            return rule_id in self._rules
    
    def list_all(self) -> list[Rule]:
        """
        List all registered rules.
        
        Returns:
            List of all rules (deterministic order by rule ID)
        """
        with self._lock:
            # Sort by rule ID for deterministic ordering
            return [self._rules[rule_id] for rule_id in sorted(self._rules.keys())]
    
    def list_enabled(self) -> list[Rule]:
        """
        List all enabled rules.
        
        Returns:
            List of enabled rules (deterministic order)
        """
        with self._lock:
            rule_ids = self._by_status.get(RuleStatus.ENABLED, [])
            # Sort for deterministic ordering
            return [self._rules[rule_id] for rule_id in sorted(rule_ids)]
    
    def get_by_category(self, category: RuleCategory) -> list[Rule]:
        """
        Get rules by category.
        
        Args:
            category: Rule category
        
        Returns:
            List of rules in category (deterministic order)
        """
        with self._lock:
            rule_ids = self._by_category.get(category, [])
            # Sort for deterministic ordering
            return [self._rules[rule_id] for rule_id in sorted(rule_ids)]
    
    def get_by_asset_type(self, asset_type: AssetType) -> list[Rule]:
        """
        Get rules applicable to an asset type.
        
        Args:
            asset_type: Asset type
        
        Returns:
            List of applicable rules (deterministic order)
        """
        with self._lock:
            # Rules with no asset type restrictions apply to all
            all_types_rules = self._by_asset_type.get("", [])
            
            # Rules specifically supporting this type
            specific_rules = self._by_asset_type.get(asset_type.value, [])
            
            # Combine and deduplicate
            rule_ids = set(all_types_rules) | set(specific_rules)
            
            # Sort for deterministic ordering
            return [self._rules[rule_id] for rule_id in sorted(rule_ids)]
    
    def get_by_status(self, status: RuleStatus) -> list[Rule]:
        """
        Get rules by status.
        
        Args:
            status: Rule status
        
        Returns:
            List of rules with status (deterministic order)
        """
        with self._lock:
            rule_ids = self._by_status.get(status, [])
            # Sort for deterministic ordering
            return [self._rules[rule_id] for rule_id in sorted(rule_ids)]
    
    def count(self) -> int:
        """
        Get number of registered rules.
        
        Returns:
            Rule count
        """
        with self._lock:
            return len(self._rules)
    
    def clear(self) -> None:
        """Clear all registered rules."""
        with self._lock:
            self._rules.clear()
            self._by_category.clear()
            self._by_status.clear()
            self._by_asset_type.clear()
    
    def _validate_rule(self, rule: Rule) -> None:
        """
        Validate rule before registration.
        
        Args:
            rule: Rule to validate
        
        Raises:
            RuleRegistrationError: If rule is invalid
        """
        metadata = rule.metadata
        
        # Validate required fields
        if not metadata.rule_id:
            raise RuleRegistrationError("Rule ID cannot be empty")
        
        if not metadata.name:
            raise RuleRegistrationError("Rule name cannot be empty")
        
        if not metadata.description:
            raise RuleRegistrationError("Rule description cannot be empty")
        
        # Validate version
        if metadata.version.major < 0 or metadata.version.minor < 0 or metadata.version.patch < 0:
            raise RuleRegistrationError("Rule version components must be non-negative")
    
    def _index_rule(self, rule: Rule) -> None:
        """
        Add rule to indexes.
        
        Args:
            rule: Rule to index
        """
        rule_id = rule.rule_id
        metadata = rule.metadata
        
        # Index by category
        if metadata.category not in self._by_category:
            self._by_category[metadata.category] = []
        self._by_category[metadata.category].append(rule_id)
        
        # Index by status
        if metadata.status not in self._by_status:
            self._by_status[metadata.status] = []
        self._by_status[metadata.status].append(rule_id)
        
        # Index by asset type
        if not metadata.supported_asset_types:
            # Empty = supports all types
            if "" not in self._by_asset_type:
                self._by_asset_type[""] = []
            self._by_asset_type[""].append(rule_id)
        else:
            # Index for each supported type
            for asset_type in metadata.supported_asset_types:
                if asset_type not in self._by_asset_type:
                    self._by_asset_type[asset_type] = []
                self._by_asset_type[asset_type].append(rule_id)
    
    def _unindex_rule(self, rule: Rule) -> None:
        """
        Remove rule from indexes.
        
        Args:
            rule: Rule to unindex
        """
        rule_id = rule.rule_id
        metadata = rule.metadata
        
        # Remove from category index
        if metadata.category in self._by_category:
            self._by_category[metadata.category].remove(rule_id)
            if not self._by_category[metadata.category]:
                del self._by_category[metadata.category]
        
        # Remove from status index
        if metadata.status in self._by_status:
            self._by_status[metadata.status].remove(rule_id)
            if not self._by_status[metadata.status]:
                del self._by_status[metadata.status]
        
        # Remove from asset type index
        if not metadata.supported_asset_types:
            if "" in self._by_asset_type:
                self._by_asset_type[""].remove(rule_id)
                if not self._by_asset_type[""]:
                    del self._by_asset_type[""]
        else:
            for asset_type in metadata.supported_asset_types:
                if asset_type in self._by_asset_type:
                    self._by_asset_type[asset_type].remove(rule_id)
                    if not self._by_asset_type[asset_type]:
                        del self._by_asset_type[asset_type]
