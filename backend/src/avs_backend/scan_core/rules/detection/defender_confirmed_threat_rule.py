"""Defender confirmed threat detection rule.

This rule matches ScanAssets that carry Windows Defender threat metadata
(set by DefenderThreatDiscoveryEngine) and produces CONFIRMED_THREAT
findings with recommended_action=QUARANTINE_FILE.

Only assets with ``custom_metadata["defender_threat"] == True`` are
matched. This rule NEVER matches heuristic-only findings — confirmed
threats require authoritative Defender evidence.

The rule is registered as ``RuleCategory.SECURITY`` so the capability
matrix can map it to the ``quarantine_file`` action type.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ...assets import ScanAsset
    from ...context import AssetSnapshot, ScanContext

from ...assets import AssetType
from ..confidence import Confidence, ConfidenceScore
from ..enums import (
    ActionType,
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    Severity,
)
from ..evidence import Evidence, EvidenceCollection
from ..models import RuleIdentifier, RuleVersion
from ..result import RuleResult
from ..rule import Rule, RuleMetadata
from ..safety import SafetyAssessment


# ── Severity mapping ──────────────────────────────────────────────────

_SEVERITY_MAP = {
    "severe": Severity.CRITICAL,
    "high": Severity.HIGH,
    "moderate": Severity.MEDIUM,
    "low": Severity.LOW,
    "informational": Severity.INFO,
    "unknown": Severity.MEDIUM,
}


class DefenderConfirmedThreatRule(Rule):
    """Detect confirmed threats from Windows Defender.

    Matches assets that have ``custom_metadata["defender_threat"] == True``
    (set by DefenderThreatDiscoveryEngine). These are authoritative
    Defender verdicts — NOT heuristic filename/path matches.

    The rule produces a CONFIRMED_THREAT finding with:
    - recommended_action = QUARANTINE_FILE
    - safety = SAFE (quarantine is a safe, reversible operation)
    - confidence = 1.0 (authoritative source)
    - severity mapped from Defender's severity rating

    Safety:
        The SafetyGate and path validation still apply at execution time.
        Protected system paths are rejected by validate_filesystem_path().
        AVS self-protection is enforced by the quarantine executor.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("security.defender_confirmed_threat"),
            version=RuleVersion(1, 0, 0),
            name="Defender Confirmed Threat",
            description=(
                "Confirmed malware threats from Windows Defender "
                "threat detection history. Only matches assets with "
                "authoritative Defender evidence — never heuristic matches."
            ),
            category=RuleCategory.SECURITY,
            severity=Severity.HIGH,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a confirmed Defender threat."""

        # Only match assets with Defender threat metadata.
        is_defender_threat = asset.custom_metadata.get("defender_threat")
        if not is_defender_threat:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not a Defender confirmed threat",
            )

        # Extract Defender threat metadata.
        threat_name = str(
            asset.custom_metadata.get("threat_name", "Unknown Threat")
        )
        threat_id = str(asset.custom_metadata.get("threat_id", ""))
        severity_str = str(
            asset.custom_metadata.get("severity", "unknown")
        ).lower()
        category = str(asset.custom_metadata.get("category", "Unknown"))
        detection_id = str(asset.custom_metadata.get("detection_id", ""))
        detection_source = str(
            asset.custom_metadata.get("detection_source", "WINDOWS_DEFENDER")
        )

        severity = _SEVERITY_MAP.get(severity_str, Severity.MEDIUM)

        # Build evidence from authoritative Defender verdict.
        evidence_items: list[Evidence] = [
            Evidence(
                evidence_type=EvidenceType.SIGNATURE_MATCH,
                source=self.rule_id,
                description=(
                    f"Windows Defender identified this file as: {threat_name} "
                    f"(threat ID: {threat_id})"
                ),
                value=threat_name,
            ),
            Evidence(
                evidence_type=EvidenceType.CATEGORY_MATCH,
                source=self.rule_id,
                description=f"Defender threat category: {category}",
                value=category,
            ),
            Evidence(
                evidence_type=EvidenceType.HISTORICAL_MATCH,
                source=self.rule_id,
                description=(
                    f"Defender detection ID: {detection_id}, "
                    f"source: {detection_source}"
                ),
                value=detection_id,
            ),
        ]

        # Confidence is 1.0 — this is an authoritative Defender verdict.
        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=100.0,
                description="Authoritative Windows Defender threat verdict",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.RULE_CERTAINTY,
                score=100.0,
                description="Defender signature/behavior detection confirmed",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=100.0,
                description="Asset type is FILE with Defender threat metadata",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(
            confidence_factors
        )
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        # Safety: SAFE — quarantine is a reversible operation.
        # The quarantine executor and path validation enforce:
        # - No AVS files are quarantined
        # - No Windows system files are quarantined
        # - No locked files are quarantined
        # - TOCTOU revalidation before action
        safety = SafetyAssessment.create_safe(
            reason=(
                "Confirmed Defender threat — safe to quarantine "
                "(executor enforces path protection and TOCTOU checks)"
            )
        )

        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=severity,
            confidence=confidence,
            safety=safety,
            reason=(
                f"Confirmed threat: {threat_name} ({category}) — "
                f"identified by Windows Defender"
            ),
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.QUARANTINE,
            estimated_size=estimated_size,
            metadata={
                "classification": "CONFIRMED_THREAT",
                "detection_source": detection_source,
                "threat_name": threat_name,
                "threat_id": threat_id,
                "defender_category": category,
                "defender_severity": severity_str,
                "detection_id": detection_id,
            },
        )


def register_defender_threat_rule(registry) -> None:
    """Register the Defender confirmed threat rule.

    Args:
        registry: RuleRegistry instance
    """
    registry.register(DefenderConfirmedThreatRule())
