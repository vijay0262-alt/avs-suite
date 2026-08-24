"""
SC-8C4 Phase C — Actionability / Capability Contract.

Maps (RuleCategory, AssetType, ActionType) to an explicit actionability verdict
while preserving the authority of SafetyAssessment, Fixability, SafetyGate,
protected-location rules, and missing/locked/inaccessible state.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from ..assets import AssetType
from .enums import RuleCategory
from .priority import Fixability, RuleCapability
from .safety import SafetyAssessment, SafetyLevel


class Actionability(str, Enum):
    """Verdict describing whether a finding can be remediated."""

    ACTIONABLE = "actionable"
    DETECTION_ONLY = "detection_only"
    REVIEW_REQUIRED = "review_required"
    BLOCKED = "blocked"
    UNSUPPORTED = "unsupported"


# SC-8C3/SC-8C4 supported remediation capabilities.
# Each entry is (RuleCategory, AssetType, action_type_value) -> Actionability.
# Anything not in this map is UNSUPPORTED by default.
DEFAULT_CAPABILITY_MATRIX: dict[tuple[RuleCategory, AssetType, str], Actionability] = {
    # Filesystem cleanup
    (RuleCategory.JUNK, AssetType.FILE, "delete_file"): Actionability.ACTIONABLE,
    (
        RuleCategory.JUNK,
        AssetType.DIRECTORY,
        "delete_directory",
    ): Actionability.ACTIONABLE,
    (RuleCategory.TEMPORARY, AssetType.FILE, "delete_file"): Actionability.ACTIONABLE,
    (
        RuleCategory.TEMPORARY,
        AssetType.DIRECTORY,
        "delete_directory",
    ): Actionability.ACTIONABLE,
    (RuleCategory.CACHE, AssetType.FILE, "clear_cache"): Actionability.ACTIONABLE,
    (RuleCategory.CACHE, AssetType.DIRECTORY, "clear_cache"): Actionability.ACTIONABLE,
    # Registry cleanup
    (
        RuleCategory.REGISTRY,
        AssetType.REGISTRY_VALUE,
        "remove_registry_value",
    ): Actionability.ACTIONABLE,
    (
        RuleCategory.REGISTRY,
        AssetType.REGISTRY_KEY,
        "remove_registry_key",
    ): Actionability.ACTIONABLE,
    # Startup cleanup
    (
        RuleCategory.STARTUP,
        AssetType.STARTUP_ENTRY,
        "disable_startup_entry",
    ): Actionability.ACTIONABLE,
    # Browser cleanup
    (
        RuleCategory.BROWSER,
        AssetType.BROWSER_CACHE,
        "clear_browser_cache",
    ): Actionability.ACTIONABLE,
    (
        RuleCategory.BROWSER,
        AssetType.BROWSER_PROFILE,
        "clear_browser_cache",
    ): Actionability.ACTIONABLE,
    # Security quarantine — confirmed threats only (Defender-backed).
    # Heuristic-only findings use RuleCategory.SUSPICIOUS which has NO
    # actionability mapping and therefore never auto-remediates.
    (
        RuleCategory.SECURITY,
        AssetType.FILE,
        "quarantine_file",
    ): Actionability.ACTIONABLE,
}


class CapabilityContract:
    """
    Explicit actionability contract for rule findings.

    The contract is subordinate to safety and fixability:
    - BLOCKED safety or fixability always returns BLOCKED.
    - REVIEW_REQUIRED safety or fixability always returns REVIEW_REQUIRED.
    - HIGH_RISK or UNKNOWN fixability returns DETECTION_ONLY.
    - A supported (category, asset_type, action_type) only becomes ACTIONABLE
      when safety is SAFE/LOW_RISK, fixability is AUTO_FIXABLE, and the rule
      declares REMEDIATION_AVAILABLE.
    - Any (category, asset_type, action_type) outside the matrix is UNSUPPORTED.
    """

    def __init__(
        self,
        matrix: Optional[
            dict[tuple[RuleCategory, AssetType, str], Actionability]
        ] = None,
    ) -> None:
        """Initialize with an optional capability matrix."""
        self._matrix = (
            matrix if matrix is not None else DEFAULT_CAPABILITY_MATRIX.copy()
        )

    def infer_action_type(
        self,
        category: RuleCategory,
        asset_type: AssetType,
    ) -> Optional[str]:
        """
        Return the single supported action type value for a category/asset pair.

        Returns None when no supported remediation action exists.
        """
        matching = [
            action_type
            for (cat, at, action_type), verdict in self._matrix.items()
            if cat == category
            and at == asset_type
            and verdict == Actionability.ACTIONABLE
        ]
        if not matching:
            return None
        return matching[0]

    def is_supported(
        self,
        category: RuleCategory,
        asset_type: AssetType,
        action_type_value: Optional[str],
    ) -> bool:
        """Return True if the exact (category, asset_type, action_type) is in the matrix."""
        if action_type_value is None:
            return False
        return (
            self._matrix.get((category, asset_type, action_type_value))
            == Actionability.ACTIONABLE
        )

    def resolve(
        self,
        category: RuleCategory,
        asset_type: AssetType,
        action_type_value: Optional[str],
        safety: SafetyAssessment,
        fixability: Fixability,
        rule_capability: RuleCapability,
    ) -> Actionability:
        """
        Resolve the actionability verdict for a finding.

        Safety, fixability, and capability are evaluated before the matrix:
        the matrix cannot turn an unsafe or unsupported finding into ACTIONABLE.
        """
        # 1. Safety assessment is authoritative.
        if (
            safety.is_blocked
            or fixability == Fixability.BLOCKED
            or safety.level == SafetyLevel.BLOCKED
        ):
            return Actionability.BLOCKED

        if safety.requires_review or fixability == Fixability.REVIEW_REQUIRED:
            return Actionability.REVIEW_REQUIRED

        if safety.level == SafetyLevel.HIGH_RISK:
            return Actionability.DETECTION_ONLY

        if safety.level not in (SafetyLevel.SAFE, SafetyLevel.LOW_RISK):
            # Any other safety level defaults to detection-only.
            return Actionability.DETECTION_ONLY

        # 2. Rule capability determines whether any remediation exists.
        if rule_capability == RuleCapability.NO_REMEDIATION:
            return Actionability.DETECTION_ONLY

        if rule_capability == RuleCapability.REVIEW_REQUIRED:
            return Actionability.REVIEW_REQUIRED

        if rule_capability != RuleCapability.REMEDIATION_AVAILABLE:
            return Actionability.DETECTION_ONLY

        # 3. Fixability gates automatic execution.
        if fixability != Fixability.AUTO_FIXABLE:
            return Actionability.DETECTION_ONLY

        # 4. Capability matrix is the final gate.
        if not self.is_supported(category, asset_type, action_type_value):
            return Actionability.UNSUPPORTED

        return Actionability.ACTIONABLE
