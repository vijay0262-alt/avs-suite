"""
SC-8A Rule Engine — Domain Contracts & Models

The Rule Engine is a DECISION / CLASSIFICATION layer that answers:
- What did we discover?
- Does this asset match a known condition?
- Why does it match?
- How confident are we?
- Is it safe to act on?
- What type of action could eventually be appropriate?

It must NOT actually perform the action.

Architecture:
    Enumerator → ScanAsset → AssetSnapshot → Metadata Cache
        ↓
    Rule Engine (SC-8A)
        ↓
    RuleResult
        ↓
    [Future: Action Engine → Verification]

This module provides:
- Rule identifiers and versioning
- Rule categories, severity, and priority
- Evidence collection and confidence scoring
- Safety assessment and risk evaluation
- Immutable rule results
- Serialization support

NO SYSTEM MODIFICATION.
NO RULE EVALUATION (yet).
NO ACTUAL DETECTION RULES (yet).
"""

from .enums import (
    RuleCategory,
    Severity,
    ActionType,
    SafetyLevel,
    EvidenceType,
    ConfidenceFactor,
    SafetyBlocker,
    RuleStatus,
)
from .evidence import Evidence, EvidenceCollection
from .confidence import Confidence, ConfidenceScore
from .safety import SafetyAssessment
from .result import RuleResult, RuleMatchStatus
from .rule import Rule, RuleMetadata
from .models import RuleIdentifier, RuleVersion

__all__ = [
    # Enums
    "RuleCategory",
    "Severity",
    "ActionType",
    "SafetyLevel",
    "EvidenceType",
    "ConfidenceFactor",
    "SafetyBlocker",
    "RuleStatus",
    # Evidence
    "Evidence",
    "EvidenceCollection",
    # Confidence
    "Confidence",
    "ConfidenceScore",
    # Safety
    "SafetyAssessment",
    # Result
    "RuleResult",
    "RuleMatchStatus",
    # Rule
    "Rule",
    "RuleMetadata",
    # Models
    "RuleIdentifier",
    "RuleVersion",
]
