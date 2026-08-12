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

from .models import RuleIdentifier, RuleVersion

from .evidence import Evidence, EvidenceCollection

from .confidence import Confidence, ConfidenceScore

from .safety import SafetyAssessment

from .result import RuleResult, RuleMatchStatus

from .rule import Rule, RuleMetadata

from .registry import RuleRegistry, RuleRegistrationError

from .applicability import ApplicabilityEngine, ApplicabilityResult, ApplicabilityStatus

from .context import RuleEvaluationContext

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
    # Models
    "RuleIdentifier",
    "RuleVersion",
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
    # Registry (SC-8B)
    "RuleRegistry",
    "RuleRegistrationError",
    # Applicability (SC-8B)
    "ApplicabilityEngine",
    "ApplicabilityResult",
    "ApplicabilityStatus",
    # Context (SC-8B)
    "RuleEvaluationContext",
]
