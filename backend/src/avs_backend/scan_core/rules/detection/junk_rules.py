"""
SC-8C2 Junk Detection Rules

Production rules for detecting temporary files and safe cache data.

DETECTION ONLY - NO ACTION EXECUTION.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ...assets import ScanAsset
    from ...context import AssetSnapshot, ScanContext

from ...assets import AssetType
from ..confidence import Confidence, ConfidenceScore
from ..enums import ActionType, ConfidenceFactor, EvidenceType, RuleCategory, Severity
from ..evidence import Evidence, EvidenceCollection
from ..models import RuleIdentifier, RuleVersion
from ..result import RuleResult
from ..rule import Rule, RuleMetadata
from ..safety import SafetyAssessment
from .locations import KnownLocations
from .safety_policy import SafetyPolicy


class UserTempRule(Rule):
    """
    Detect files in user temporary directories.

    Matches files located under:
    - %LOCALAPPDATA%\\Temp
    - %TEMP%
    - %TMP%

    Evidence required:
    - Asset is under known user temp directory
    - Asset is a FILE (not directory)
    - Asset is accessible

    Safety considerations:
    - Locked files → REVIEW_REQUIRED
    - Inaccessible files → HIGH_RISK
    - Protected locations → BLOCKED
    """

    def __init__(self):
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp.user"),
            version=RuleVersion(1, 0, 0),
            name="User Temporary Files",
            description="Detects temporary files in user-specific temporary directories",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def get_applicable_roots(self) -> list[Path] | None:
        """Path roots this rule applies to (for pre-filtering)."""
        return KnownLocations.get_user_temp_roots()

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a user temporary file.

        V1.0: Fast path for the common case (accessible, not locked, in
        user Temp) — skips evidence/confidence/safety object creation
        that was the evaluation bottleneck for 86,000+ files. The fast
        path creates a minimal RuleResult directly, while the slow path
        retains full evidence/confidence/safety assessment for edge cases.
        """

        # V1.0: Use pre-normalized cached roots for fast path matching.
        normalized_roots = KnownLocations.get_user_temp_roots_normalized()

        if not KnownLocations.is_under_any_root(asset.canonical_path, normalized_roots):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not located in a user temporary directory",
            )

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # V1.0: Fast path — for the common case (accessible, not locked),
        # create a minimal RuleResult directly. This avoids creating 5-6
        # Evidence objects, 3-4 ConfidenceScore objects, a Confidence
        # object, and calling SafetyPolicy.assess() (which calls
        # is_in_protected_location) for 86,000+ files.
        #
        # User Temp is NOT a protected location, so is_in_protected_location
        # will always return False for these files. Skipping it saves
        # ~0.14ms per file (12 seconds for 86,000 files).
        if snapshot and snapshot.exists and snapshot.accessible and not snapshot.locked:
            # Get file size if available
            estimated_size: Optional[int] = None
            size_value = asset.custom_metadata.get("size")
            if size_value is not None and isinstance(size_value, (int, float)):
                estimated_size = int(size_value)

            return RuleResult.create_matched(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                severity=self.metadata.severity,
                confidence=Confidence(
                    score=85.0,
                    factors=(
                        ConfidenceScore(
                            factor=ConfidenceFactor.PATH_MATCH,
                            score=90.0,
                            description="Asset is in a well-known user temporary directory",
                        ),
                        ConfidenceScore(
                            factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                            score=80.0,
                            description="Asset type is FILE",
                        ),
                    ),
                ),
                safety=SafetyAssessment.create_safe(
                    reason="Asset is in user temporary directory and is accessible",
                ),
                reason="Temporary file in user temporary directory",
                evidence=EvidenceCollection((
                    Evidence(
                        evidence_type=EvidenceType.KNOWN_LOCATION,
                        source=self.rule_id,
                        description="Asset is located under user temporary directory",
                        value="user_temp",
                    ),
                )),
                recommended_action=ActionType.DELETE,
                estimated_size=estimated_size,
            )

        # Slow path — full evaluation for edge cases (locked, inaccessible, etc.)
        # Get the matched root for evidence
        user_temp_roots = KnownLocations.get_user_temp_roots()
        matched_root = str(user_temp_roots[0]) if user_temp_roots else "user temp"

        # Build evidence
        evidence_items: list[Evidence] = []

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Asset is located under user temporary directory: {matched_root}",
                value=matched_root,
            )
        )

        # Extension supporting evidence
        if KnownLocations.has_temporary_extension(asset.canonical_path):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.EXTENSION_MATCH,
                    source=self.rule_id,
                    description="Asset has a temporary file extension",
                    value=Path(asset.canonical_path).suffix.lower(),
                )
            )

        # Age supporting evidence
        if KnownLocations.is_asset_old(asset.modified_at):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.AGE_MATCH,
                    source=self.rule_id,
                    description=(
                        f"Asset is older than "
                        f"{KnownLocations.get_default_age_threshold_days()} days"
                    ),
                    value="old",
                )
            )

        # Check snapshot state
        if snapshot:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.METADATA_MATCH,
                    source=self.rule_id,
                    description=f"Asset state: {snapshot.state.value}",
                    value=snapshot.state.value,
                )
            )

            if snapshot.exists:
                evidence_items.append(
                    Evidence(
                        evidence_type=EvidenceType.METADATA_MATCH,
                        source=self.rule_id,
                        description="Asset exists on filesystem",
                        value="exists",
                    )
                )

            if snapshot.accessible:
                evidence_items.append(
                    Evidence(
                        evidence_type=EvidenceType.METADATA_MATCH,
                        source=self.rule_id,
                        description="Asset is accessible",
                        value="accessible",
                    )
                )

            if snapshot.locked:
                evidence_items.append(
                    Evidence(
                        evidence_type=EvidenceType.METADATA_MATCH,
                        source=self.rule_id,
                        description="Asset is locked by another process",
                        value="locked",
                    )
                )

        # Calculate confidence
        confidence_factors: list[ConfidenceScore] = []

        # Known location = high confidence
        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=90.0,
                description="Asset is in a well-known user temporary directory",
            )
        )

        # Asset type confirmation
        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            )
        )

        # Accessibility affects confidence
        if snapshot and snapshot.accessible:
            confidence_factors.append(
                ConfidenceScore(
                    factor=ConfidenceFactor.METADATA_MATCH,
                    score=85.0,
                    description="Asset is accessible for inspection",
                )
            )

        # Calculate overall confidence (average)
        total_score = sum(f.score for f in confidence_factors)
        avg_score = (
            total_score / len(confidence_factors) if confidence_factors else 50.0
        )

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Determine safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Asset is in user temporary directory and is accessible",
        )

        # Get file size if available
        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=self.metadata.severity,
            confidence=confidence,
            safety=safety,
            reason=f"Temporary file in user temporary directory: {matched_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class WindowsTempRule(Rule):
    """
    Detect files in Windows system temporary directory.

    Matches files located under:
    - %SystemRoot%\\Temp (typically C:\\Windows\\Temp)

    Evidence required:
    - Asset is under Windows temp directory
    - Asset is a FILE (not directory)
    - Asset is accessible

    Safety considerations:
    - Locked files → REVIEW_REQUIRED
    - Inaccessible files → HIGH_RISK
    - System-critical patterns → BLOCKED
    """

    def __init__(self):
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp.windows"),
            version=RuleVersion(1, 0, 0),
            name="Windows Temporary Files",
            description="Detects temporary files in Windows system temporary directory",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def get_applicable_roots(self) -> list[Path] | None:
        """Path roots this rule applies to (for pre-filtering)."""
        return [KnownLocations.get_windows_temp_root()]

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a Windows temporary file."""

        # V1.0: Use pre-normalized cached root for fast path matching.
        windows_temp_root = KnownLocations.get_windows_temp_root()
        normalized_root = KnownLocations.get_windows_temp_root_normalized()

        if not KnownLocations.is_under_any_root(asset.canonical_path, [normalized_root]):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not located in Windows temporary directory",
            )

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Build evidence
        evidence_items: list[Evidence] = []

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=(
                    f"Asset is located under Windows temporary directory: {windows_temp_root}"
                ),
                value=str(windows_temp_root),
            )
        )

        # Extension supporting evidence
        if KnownLocations.has_temporary_extension(asset.canonical_path):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.EXTENSION_MATCH,
                    source=self.rule_id,
                    description="Asset has a temporary file extension",
                    value=Path(asset.canonical_path).suffix.lower(),
                )
            )

        # Age supporting evidence
        if KnownLocations.is_asset_old(asset.modified_at):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.AGE_MATCH,
                    source=self.rule_id,
                    description=(
                        f"Asset is older than "
                        f"{KnownLocations.get_default_age_threshold_days()} days"
                    ),
                    value="old",
                )
            )

        # Check snapshot state
        if snapshot:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.METADATA_MATCH,
                    source=self.rule_id,
                    description=f"Asset state: {snapshot.state.value}",
                    value=snapshot.state.value,
                )
            )

            if snapshot.accessible:
                evidence_items.append(
                    Evidence(
                        evidence_type=EvidenceType.METADATA_MATCH,
                        source=self.rule_id,
                        description="Asset is accessible",
                        value="accessible",
                    )
                )

            if snapshot.locked:
                evidence_items.append(
                    Evidence(
                        evidence_type=EvidenceType.METADATA_MATCH,
                        source=self.rule_id,
                        description="Asset is locked by another process",
                        value="locked",
                    )
                )

        # Calculate confidence
        confidence_factors: list[ConfidenceScore] = []

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=90.0,
                description="Asset is in Windows system temporary directory",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            )
        )

        if snapshot and snapshot.accessible:
            confidence_factors.append(
                ConfidenceScore(
                    factor=ConfidenceFactor.METADATA_MATCH,
                    score=85.0,
                    description="Asset is accessible",
                )
            )

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Determine safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Asset is in Windows temporary directory and is accessible",
        )

        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=self.metadata.severity,
            confidence=confidence,
            safety=safety,
            reason=f"Temporary file in Windows temporary directory: {windows_temp_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class ShaderCacheRule(Rule):
    """
    Detect GPU shader cache files.

    Matches files located under known shader cache directories:
    - DirectX Shader Cache
    - NVIDIA caches (DX, GL, Compute)
    - AMD caches (Dx, GL, Dxc)

    These caches are regenerated automatically by GPU drivers.

    Evidence required:
    - Asset is under known shader cache directory
    - Asset is a FILE

    Safety considerations:
    - Locked files → REVIEW_REQUIRED
    - Inaccessible files → REVIEW_REQUIRED
    """

    def __init__(self):
        metadata = RuleMetadata(
            identifier=RuleIdentifier("cache.shader"),
            version=RuleVersion(1, 0, 0),
            name="GPU Shader Cache",
            description="Detects GPU shader cache files (DirectX, NVIDIA, AMD)",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def get_applicable_roots(self) -> list[Path] | None:
        """Path roots this rule applies to (for pre-filtering)."""
        return KnownLocations.get_shader_cache_roots()

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a shader cache file."""

        # Check if asset is under any shader cache root
        shader_cache_roots = KnownLocations.get_shader_cache_roots()
        is_under_cache = False
        matched_root: Optional[str] = None

        for root in shader_cache_roots:
            if KnownLocations.is_under_path(asset.canonical_path, root):
                is_under_cache = True
                matched_root = str(root)
                break

        if not is_under_cache:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not located in a known shader cache directory",
            )

        assert matched_root is not None

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Build evidence
        evidence_items: list[Evidence] = []

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Asset is located in GPU shader cache directory: {matched_root}",
                value=matched_root,
            )
        )

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description="Shader caches are regenerated automatically by GPU drivers",
                value="auto-regenerated",
            )
        )

        if snapshot:
            if snapshot.accessible:
                evidence_items.append(
                    Evidence(
                        evidence_type=EvidenceType.METADATA_MATCH,
                        source=self.rule_id,
                        description="Asset is accessible",
                        value="accessible",
                    )
                )

            if snapshot.locked:
                evidence_items.append(
                    Evidence(
                        evidence_type=EvidenceType.METADATA_MATCH,
                        source=self.rule_id,
                        description="Asset is locked",
                        value="locked",
                    )
                )

        # Calculate confidence
        confidence_factors: list[ConfidenceScore] = []

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=95.0,
                description="Asset is in a well-known GPU shader cache directory",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=90.0,
                description="Shader caches are safe to delete - automatically regenerated",
            )
        )

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Determine safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Shader cache is safe to delete - regenerated by GPU driver",
        )

        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=self.metadata.severity,
            confidence=confidence,
            safety=safety,
            reason=f"GPU shader cache file in shader cache directory: {matched_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class ThumbnailCacheRule(Rule):
    """
    Detect Windows Explorer thumbnail cache files.

    Matches files:
    - Located in %LOCALAPPDATA%\\Microsoft\\Windows\\Explorer
    - Named thumbcache_*.db or iconcache_*.db

    These are rebuilt automatically by Windows Explorer.

    Evidence required:
    - Asset is in thumbnail cache directory
    - Asset matches thumbnail cache naming pattern
    - Asset is a FILE

    Safety considerations:
    - Locked files → REVIEW_REQUIRED
    """

    def __init__(self):
        metadata = RuleMetadata(
            identifier=RuleIdentifier("cache.thumbnail"),
            version=RuleVersion(1, 0, 0),
            name="Windows Thumbnail Cache",
            description="Detects Windows Explorer thumbnail and icon cache files",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def get_applicable_roots(self) -> list[Path] | None:
        """Path roots this rule applies to (for pre-filtering)."""
        return [KnownLocations.get_thumbnail_cache_root()]

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a thumbnail cache file."""

        # Check if asset is a thumbnail cache file
        if not KnownLocations.is_thumbnail_cache_file(asset.canonical_path):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not a Windows Explorer thumbnail cache file",
            )

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Build evidence
        evidence_items: list[Evidence] = []

        thumbnail_root = KnownLocations.get_thumbnail_cache_root()

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Asset is in Windows Explorer cache directory: {thumbnail_root}",
                value=str(thumbnail_root),
            )
        )

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_PATTERN,
                source=self.rule_id,
                description=(
                    "Asset matches thumbnail cache naming pattern "
                    "(thumbcache_*.db or iconcache_*.db)"
                ),
                value="thumbnail_pattern",
            )
        )

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description="Thumbnail caches are rebuilt automatically by Windows Explorer",
                value="auto-regenerated",
            )
        )

        if snapshot and snapshot.locked:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.METADATA_MATCH,
                    source=self.rule_id,
                    description="Asset is locked by Windows Explorer",
                    value="locked",
                )
            )

        # Calculate confidence
        confidence_factors: list[ConfidenceScore] = []

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=95.0,
                description="Asset is in Windows Explorer cache directory",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=95.0,
                description="Asset matches known thumbnail cache naming pattern",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=90.0,
                description="Thumbnail caches are safe to delete - automatically rebuilt",
            )
        )

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Determine safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Thumbnail cache is safe to delete - rebuilt by Windows Explorer",
        )

        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=self.metadata.severity,
            confidence=confidence,
            safety=safety,
            reason=f"Windows Explorer thumbnail/icon cache file in: {thumbnail_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


# Canonical registry of every active detection rule ID.
#
# This is the single source of truth for the rule set. Tests MUST
# assert against this list — never against a hard-coded count — so
# that adding/removing a rule is an explicit, reviewed change here.
CANONICAL_JUNK_RULE_IDS: tuple[str, ...] = (
    # Original junk/cache rules (SC-8C2, 4 original + 5 extended)
    "junk.temp.user",
    "junk.temp.windows",
    "cache.shader",
    "cache.thumbnail",
    "junk.temp.application",
    "cache.browser",
    "cache.installer",
    "cache.windows_update",
    "cache.application",
    # V1.0 Disk Cleanup+ provider rules
    "junk.recycle_bin",
    "cache.delivery_optimization",
    "junk.crash_dump",
    "junk.windows_old",
    "junk.prefetch",
    "junk.downloaded_program_files",
    "junk.offline_web_pages",
    "cache.font_cache",
    "cache.branch_cache",
    "junk.retail_demo",
    "junk.memory_dump",
    # Security threat detection rules
    "security.malicious_filename",
    "security.suspicious_script",
    "security.suspicious_executable",
    "security.tracking_cookie",
    # Defender confirmed threat rule (authoritative malware verdicts)
    "security.defender_confirmed_threat",
)


def register_junk_rules(registry) -> None:
    """
    Register all junk detection rules with the registry.

    The registered set MUST exactly match CANONICAL_JUNK_RULE_IDS.

    Args:
        registry: RuleRegistry instance
    """
    # Original rules
    registry.register(UserTempRule())
    registry.register(WindowsTempRule())
    registry.register(ShaderCacheRule())
    registry.register(ThumbnailCacheRule())

    # Extended rules (SC-8C2 Part 1)
    from .junk_rules_ext import (
        ApplicationCacheRule,
        ApplicationTempRule,
        BrowserCacheRule,
        InstallerCacheRule,
        WindowsUpdateCacheRule,
    )

    registry.register(ApplicationTempRule())
    registry.register(BrowserCacheRule())
    registry.register(InstallerCacheRule())
    registry.register(WindowsUpdateCacheRule())
    registry.register(ApplicationCacheRule())

    # V1.0 Disk Cleanup+ provider rules
    from .cleanup_providers import register_cleanup_provider_rules
    register_cleanup_provider_rules(registry)

    # Suspicious/privacy heuristic rules (NOT auto-remediated)
    from .security_rules import register_security_rules
    register_security_rules(registry)

    # Defender confirmed threat rule (authoritative — auto-quarantined)
    from .defender_confirmed_threat_rule import register_defender_threat_rule
    register_defender_threat_rule(registry)
