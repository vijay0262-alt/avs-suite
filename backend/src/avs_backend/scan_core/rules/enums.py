"""
SC-8A Rule Engine — Enumerations

Defines all enum types used throughout the Rule Engine.
"""

from __future__ import annotations

from enum import Enum


class RuleCategory(str, Enum):
    """
    Category of detection rule.
    
    Determines the domain/purpose of the rule.
    """
    
    JUNK = "junk"
    CACHE = "cache"
    TEMPORARY = "temporary"
    PRIVACY = "privacy"
    REGISTRY = "registry"
    STARTUP = "startup"
    BROWSER = "browser"
    PERFORMANCE = "performance"
    SECURITY = "security"
    SYSTEM = "system"
    NETWORK = "network"
    SUSPICIOUS = "suspicious"
    CUSTOM = "custom"


class Severity(str, Enum):
    """
    Severity of a detected condition.
    
    Represents the seriousness of the finding.
    
    IMPORTANT: Severity does NOT imply safety to act.
    A HIGH severity finding may still be BLOCKED from action.
    """
    
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ActionType(str, Enum):
    """
    Possible future action type.
    
    DESCRIPTION ONLY — the Rule Engine never executes these.
    These are recommendations for a future Action Engine.
    """
    
    NONE = "none"
    DELETE = "delete"
    REGISTRY_REMOVE = "registry_remove"
    DISABLE_STARTUP = "disable_startup"
    CLEAR_CACHE = "clear_cache"
    RESET_SETTING = "reset_setting"
    REVIEW = "review"
    DEFER = "defer"
    QUARANTINE = "quarantine"
    REPAIR = "repair"
    OPTIMIZE = "optimize"


class SafetyLevel(str, Enum):
    """
    Safety level for performing an action on a matched asset.
    
    Separate from Severity — a CRITICAL severity finding
    may still be SAFE to act on, or vice versa.
    """
    
    SAFE = "safe"
    LOW_RISK = "low_risk"
    REVIEW_REQUIRED = "review_required"
    HIGH_RISK = "high_risk"
    BLOCKED = "blocked"


class EvidenceType(str, Enum):
    """
    Type of evidence supporting a rule match.
    """
    
    PATH_MATCH = "path_match"
    EXTENSION_MATCH = "extension_match"
    SIZE_MATCH = "size_match"
    AGE_MATCH = "age_match"
    METADATA_MATCH = "metadata_match"
    STATE_MATCH = "state_match"
    RELATIONSHIP_MATCH = "relationship_match"
    TAG_MATCH = "tag_match"
    CATEGORY_MATCH = "category_match"
    TYPE_MATCH = "type_match"
    KNOWN_LOCATION = "known_location"
    KNOWN_PATTERN = "known_pattern"
    HISTORICAL_MATCH = "historical_match"
    APPLICATION_MATCH = "application_match"
    SIGNATURE_MATCH = "signature_match"
    BEHAVIOR_MATCH = "behavior_match"
    CUSTOM = "custom"


class ConfidenceFactor(str, Enum):
    """
    Factor contributing to confidence score.
    """
    
    ASSET_TYPE_MATCH = "asset_type_match"
    PATH_MATCH = "path_match"
    METADATA_MATCH = "metadata_match"
    STATE_MATCH = "state_match"
    HISTORICAL_MATCH = "historical_match"
    APPLICATION_MATCH = "application_match"
    RULE_CERTAINTY = "rule_certainty"
    MULTIPLE_EVIDENCE = "multiple_evidence"
    STRONG_EVIDENCE = "strong_evidence"
    WEAK_EVIDENCE = "weak_evidence"


class SafetyBlocker(str, Enum):
    """
    Reason why an action is blocked despite a rule match.
    """
    
    SYSTEM_CRITICAL = "system_critical"
    ACTIVE = "active"
    LOCKED = "locked"
    PROTECTED = "protected"
    UNKNOWN = "unknown"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"
    USER_DATA = "user_data"
    REQUIRED_DEPENDENCY = "required_dependency"
    CUSTOM = "custom"


class RuleStatus(str, Enum):
    """
    Operational status of a rule.
    """
    
    ENABLED = "enabled"
    DISABLED = "disabled"
    DEPRECATED = "deprecated"
    EXPERIMENTAL = "experimental"
