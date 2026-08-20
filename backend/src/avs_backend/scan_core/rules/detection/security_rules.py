"""
Security threat detection rules.

Implements detection rules for known security threats so that the
unified scan-detect-clean-results pattern can detect AND clean
security threats via the existing auto-optimize flow:

- Malicious file names (security.malicious_filename)
- Suspicious scripts (security.suspicious_script)
- Suspicious executables (security.suspicious_executable)
- Tracking cookies (security.tracking_cookie)

These rules follow the EXACT same architecture as the cleanup
providers in ``cleanup_providers.py``:

- DETECTION ONLY — no system modification
- Safety via centralized SafetyPolicy
- Uses KnownLocations for path knowledge
- Supports the V1.0 Dashboard eligibility filter (safety.is_safe)

DO NOT bypass SafetyGate.
DO NOT weaken safety checks.
DO NOT execute anything — these rules only generate findings; the
existing auto-optimize flow handles execution of the action plan.
"""

from __future__ import annotations

import os
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
from .locations import KnownLocations
from .safety_policy import SafetyPolicy


# ── Shared constants ──────────────────────────────────────────────

# Executable/script extensions that can carry malicious payloads.
# Only files with these extensions are considered for name-based
# malicious-file detection.
_MALICIOUS_EXECUTABLE_EXTENSIONS: tuple[str, ...] = (
    ".exe",
    ".dll",
    ".scr",
    ".bat",
    ".cmd",
    ".ps1",
    ".vbs",
    ".js",
    ".jar",
    ".com",
)

# Script extensions evaluated by the suspicious-script rule.
_SCRIPT_EXTENSIONS: tuple[str, ...] = (
    ".ps1",
    ".vbs",
    ".bat",
    ".cmd",
    ".js",
)

# Known malicious file-name patterns (lowercase, matched as substrings
# of the file name without extension). Grouped by threat family for
# evidence reporting.
_MALICIOUS_NAME_PATTERNS: dict[str, tuple[str, ...]] = {
    "ransomware": (
        "ransom",
        "cryptolocker",
        "wannacry",
        "locky",
        "ryuk",
        "conti",
        "maze",
        "sodinokibi",
        "gandcrab",
        "revil",
        "blackcat",
        "akira",
        "play",
        "babadeda",
    ),
    "trojan": (
        "emotet",
        "trickbot",
        "zeus",
        "azorult",
        "lokibot",
        "formbook",
        "redline",
        "vidar",
        "racoon",
        "dridex",
        "qakbot",
        "icedid",
        "bazarloader",
    ),
    "spyware_adware": (
        "keylogger",
        "spyware",
        "adware",
        "puptest",
        "optimizerpro",
        "driverupdater",
        "cleanerpro",
    ),
    "miner": (
        "xmrig",
        "ccminer",
        "ethminer",
        "cpuminer",
        "nicehash",
    ),
    "generic": (
        "malware",
        "trojan",
        "backdoor",
        "rootkit",
        "keylog",
        "botnet",
        "dropper",
        "loader",
        "stealer",
        "rat_",
        "_rat",
    ),
}

# Suspicious script content indicators (case-insensitive substrings).
_SUSPICIOUS_SCRIPT_PATTERNS: tuple[str, ...] = (
    "powershell -enc",
    "powershell -encodedcommand",
    "iex(",
    "invoke-expression",
    "downloadstring",
    "downloadfile",
    "wscript.shell",
    "shell.application",
    "reg add",
    "schtasks /create",
)

# Known tracking/suspicious cookie name fragments (lowercase).
_TRACKING_COOKIE_FRAGMENTS: tuple[str, ...] = (
    "cookie",
    "tracking",
    "_ga",
    "_gid",
    "_fbp",
    "doubleclick",
    "adsense",
)


def _get_executable_extension(file_name: str) -> Optional[str]:
    """Return the lowercase extension (with dot) if it is an executable/script ext."""
    try:
        ext = Path(file_name).suffix.lower()
    except Exception:
        return None
    if ext in _MALICIOUS_EXECUTABLE_EXTENSIONS:
        return ext
    return None


def _match_malicious_name(file_name: str) -> Optional[tuple[str, str]]:
    """
    Match a file name against known malicious name patterns.

    Returns:
        Tuple of (family, matched_pattern) if matched, else None.
    """
    try:
        stem = Path(file_name).stem.lower()
    except Exception:
        return None

    for family, patterns in _MALICIOUS_NAME_PATTERNS.items():
        for pattern in patterns:
            if pattern in stem:
                return (family, pattern)
    return None


def _read_file_content_safely(canonical_path: str, max_bytes: int = 64 * 1024) -> Optional[str]:
    """
    Read up to ``max_bytes`` of a file's text content for pattern inspection.

    Returns None if the file cannot be read or is too large. This is a
    DETECTION-ONLY read — no modification is performed.
    """
    try:
        p = Path(canonical_path)
        if not p.is_file() or p.is_symlink():
            return None
        size = p.stat().st_size
        if size > max_bytes:
            # Only inspect the head of larger files.
            with open(p, "rb") as fh:
                raw = fh.read(max_bytes)
        else:
            with open(p, "rb") as fh:
                raw = fh.read()
        # Decode leniently — scripts are text, but be tolerant of errors.
        try:
            return raw.decode("utf-8", errors="ignore")
        except Exception:
            return raw.decode("latin-1", errors="ignore")
    except OSError:
        return None
    except Exception:
        return None


def _contains_base64_block(text: str, min_length: int = 200) -> bool:
    """Heuristic: detect a long run of base64 characters (obfuscation indicator)."""
    import re

    pattern = re.compile(r"[A-Za-z0-9+/=]{%d,}" % min_length)
    return pattern.search(text) is not None


def _is_in_scan_locations(asset_path: str, roots: list[Path]) -> Optional[str]:
    """
    Return the matched root string if asset_path is under one of roots.

    Args:
        asset_path: Asset canonical path.
        roots: List of root directory paths.

    Returns:
        Matched root string, or None if not under any root.
    """
    for root in roots:
        if KnownLocations.is_under_path(asset_path, root):
            return str(root)
    return None


def _get_security_scan_roots() -> list[Path]:
    """
    Get the union of temp, browser cache, and downloads directories.

    These are the locations where security threats commonly land.
    """
    roots: list[Path] = []
    roots.extend(KnownLocations.get_user_temp_roots())
    roots.append(KnownLocations.get_windows_temp_root())
    roots.extend(KnownLocations.get_browser_cache_roots())
    # User Downloads folder — common landing zone for threats.
    roots.append(KnownLocations.expand(r"%USERPROFILE%\Downloads"))
    return roots


def _get_script_scan_roots() -> list[Path]:
    """Temp + browser cache + downloads — where suspicious scripts appear."""
    return _get_security_scan_roots()


def _get_browser_cache_roots_only() -> list[Path]:
    """Browser cache directories only (for cookie / cache-bound threats)."""
    return KnownLocations.get_browser_cache_roots()


# ── Rule 1: Malicious file name ───────────────────────────────────


class MaliciousFileNameRule(Rule):
    """
    Detect files with known malicious names/patterns.

    Matches well-known ransomware, trojan, spyware/adware, miner, and
    generic malware family names in the file stem. Only files with
    executable/script extensions are considered.

    Safety: centralized via SafetyPolicy. Threats typically land in
    temp / cache / downloads which are NOT protected roots, so they
    pass the protected-location check and are SAFE to delete. Files
    that happen to land in protected locations are BLOCKED.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("security.malicious_filename"),
            version=RuleVersion(1, 0, 0),
            name="Malicious File Name",
            description=(
                "Detects files with known malicious names (ransomware, "
                "trojan, spyware, miner, generic malware families)"
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
        """Evaluate if asset has a known malicious file name."""

        ext = _get_executable_extension(asset.display_name)
        if ext is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset does not have an executable/script extension",
            )

        match = _match_malicious_name(asset.display_name)
        if match is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset name does not match known malicious patterns",
            )

        family, pattern = match

        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        evidence_items: list[Evidence] = []
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_PATTERN,
                source=self.rule_id,
                description=(
                    f"File name matches known {family} malware pattern: "
                    f"'{pattern}'"
                ),
                value=pattern,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.EXTENSION_MATCH,
                source=self.rule_id,
                description=f"File has executable/script extension: {ext}",
                value=ext,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description=(
                    f"File name is associated with the {family} threat family"
                ),
                value=family,
            )
        )

        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=90.0,
                description="File name matches a known malware family pattern",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=85.0,
                description=f"Pattern '{pattern}' is a known {family} indicator",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE with executable extension",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Malicious file is safe to remove",
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
            reason=f"Malicious file name ({family}): '{pattern}' in {asset.display_name}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


# ── Rule 2: Suspicious script ─────────────────────────────────────


class SuspiciousScriptRule(Rule):
    """
    Detect suspicious script files in temp / browser cache / downloads.

    Evaluates PowerShell (.ps1), VBS, batch (.bat/.cmd), and JS files
    located in temp directories, browser cache, or the downloads
    folder. Inspects file content for known malicious indicators:

    - ``powershell -enc`` / ``powershell -encodedcommand``
    - ``IEX(`` / ``Invoke-Expression``
    - ``DownloadString`` / ``DownloadFile``
    - ``WScript.Shell`` / ``Shell.Application``
    - Long base64-encoded blocks (obfuscation)
    - ``reg add`` / ``schtasks /create``

    Safety: centralized via SafetyPolicy. Temp and browser cache
    locations are NOT protected roots, so scripts there are SAFE to
    delete. Files in Downloads are in a protected root and will be
    BLOCKED from automatic deletion (detection still reported).
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("security.suspicious_script"),
            version=RuleVersion(1, 0, 0),
            name="Suspicious Script",
            description=(
                "Detects suspicious script files (PS1/VBS/BAT/JS) in "
                "temp/cache/downloads with malicious content indicators"
            ),
            category=RuleCategory.SECURITY,
            severity=Severity.MEDIUM,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a suspicious script file."""

        # Must be a script extension.
        try:
            ext = Path(asset.display_name).suffix.lower()
        except Exception:
            ext = ""
        if ext not in _SCRIPT_EXTENSIONS:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not a script file",
            )

        # Must be in a temp / cache / downloads location.
        scan_roots = _get_script_scan_roots()
        matched_root = _is_in_scan_locations(asset.canonical_path, scan_roots)
        if matched_root is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in a temp/cache/downloads location",
            )

        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Inspect content for malicious indicators.
        content = _read_file_content_safely(asset.canonical_path)
        matched_patterns: list[str] = []
        if content is not None:
            content_lower = content.lower()
            for indicator in _SUSPICIOUS_SCRIPT_PATTERNS:
                if indicator in content_lower:
                    matched_patterns.append(indicator)
            if _contains_base64_block(content):
                matched_patterns.append("long_base64_block")

        if not matched_patterns:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Script content does not contain suspicious indicators",
            )

        evidence_items: list[Evidence] = []
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Script is in a temp/cache/downloads location: {matched_root}",
                value=matched_root,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.EXTENSION_MATCH,
                source=self.rule_id,
                description=f"File has script extension: {ext}",
                value=ext,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description=(
                    "Script content contains suspicious indicators: "
                    + ", ".join(matched_patterns)
                ),
                value="; ".join(matched_patterns),
            )
        )

        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=70.0,
                description="Script is in a temp/cache/downloads location",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=75.0,
                description="Script content matches known malicious indicators",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE with script extension",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Suspicious script is safe to remove",
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
            reason=(
                f"Suspicious script in {matched_root} with indicators: "
                + ", ".join(matched_patterns)
            ),
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


# ── Rule 3: Suspicious executable ─────────────────────────────────


class SuspiciousExecutableRule(Rule):
    """
    Detect suspicious executables in temp / browser cache locations.

    Legitimate software rarely runs from temp directories or browser
    cache. Executables (.exe) and screen savers (.scr) in these
    locations are common malware delivery vectors. Batch files
    (.bat/.cmd) in the user profile root or startup are also flagged.

    Safety: centralized via SafetyPolicy. Temp and browser cache
    locations are NOT protected roots, so executables there are SAFE
    to delete. Files in protected locations are BLOCKED.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("security.suspicious_executable"),
            version=RuleVersion(1, 0, 0),
            name="Suspicious Executable",
            description=(
                "Detects suspicious executables (.exe/.scr) in temp/cache "
                "and batch files in user profile root/startup"
            ),
            category=RuleCategory.SECURITY,
            severity=Severity.MEDIUM,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a suspicious executable."""

        try:
            ext = Path(asset.display_name).suffix.lower()
        except Exception:
            ext = ""

        # Temp / browser cache roots for exe/scr evaluation.
        temp_cache_roots: list[Path] = []
        temp_cache_roots.extend(KnownLocations.get_user_temp_roots())
        temp_cache_roots.append(KnownLocations.get_windows_temp_root())
        temp_cache_roots.extend(KnownLocations.get_browser_cache_roots())

        matched_root: Optional[str] = None
        reason_detail: str = ""

        if ext in (".exe", ".scr"):
            # Executables/screen savers in temp or browser cache.
            matched_root = _is_in_scan_locations(asset.canonical_path, temp_cache_roots)
            if matched_root is None:
                return RuleResult.create_no_match(
                    rule_id=self.rule_id,
                    rule_version=str(self.version),
                    asset_id=asset.asset_id,
                    reason="Executable is not in a temp/cache location",
                )
            reason_detail = f"{ext} file in temp/cache: {matched_root}"
        elif ext in (".bat", ".cmd"):
            # Batch files in user profile root or startup.
            user_profile = KnownLocations.expand(r"%USERPROFILE%")
            startup_roots = [
                KnownLocations.expand(
                    r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
                ),
                KnownLocations.expand(
                    r"%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
                ),
            ]
            # User profile root means directly under %USERPROFILE% (one level).
            try:
                asset_path_obj = Path(asset.canonical_path)
                profile_obj = Path(str(user_profile))
                # Normalize for comparison via KnownLocations helpers.
                asset_parts = KnownLocations._normalize_windows_path(
                    asset.canonical_path
                )
                profile_parts = KnownLocations._normalize_windows_path(
                    str(user_profile)
                )
                is_in_profile_root = (
                    len(asset_parts) == len(profile_parts) + 1
                    and asset_parts[: len(profile_parts)] == profile_parts
                )
            except Exception:
                is_in_profile_root = False

            in_startup = _is_in_scan_locations(asset.canonical_path, startup_roots)
            if in_startup is not None:
                matched_root = in_startup
                reason_detail = f"{ext} file in startup: {matched_root}"
            elif is_in_profile_root:
                matched_root = str(user_profile)
                reason_detail = f"{ext} file in user profile root: {matched_root}"
            else:
                return RuleResult.create_no_match(
                    rule_id=self.rule_id,
                    rule_version=str(self.version),
                    asset_id=asset.asset_id,
                    reason="Batch file is not in user profile root or startup",
                )
        else:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not a suspicious executable type",
            )

        assert matched_root is not None

        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        evidence_items: list[Evidence] = []
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Executable is in a suspicious location: {matched_root}",
                value=matched_root,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.EXTENSION_MATCH,
                source=self.rule_id,
                description=f"File has executable/script extension: {ext}",
                value=ext,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description=(
                    "Legitimate software rarely runs from temp/cache/startup; "
                    "this is a common malware delivery vector"
                ),
                value="suspicious_execution_location",
            )
        )

        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=60.0,
                description="Executable is in a temp/cache/startup location",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=70.0,
                description="Executables in these locations are commonly malicious",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE with executable extension",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Suspicious executable is safe to remove",
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
            reason=reason_detail,
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


# ── Rule 4: Tracking cookie ───────────────────────────────────────


class TrackingCookieRule(Rule):
    """
    Detect tracking/suspicious cookies in browser cache directories.

    Matches files whose names contain cookie-related fragments or
    known tracking-domain indicators, located under browser cache
    directories.

    Safety: centralized via SafetyPolicy. Browser cache directories
    are NOT protected roots, so cookie files there are SAFE to delete.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("security.tracking_cookie"),
            version=RuleVersion(1, 0, 0),
            name="Tracking Cookie",
            description=(
                "Detects tracking/suspicious cookie files in browser "
                "cache directories"
            ),
            category=RuleCategory.SECURITY,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a tracking/suspicious cookie file."""

        # Must be in a browser cache directory.
        browser_roots = _get_browser_cache_roots_only()
        matched_root = _is_in_scan_locations(asset.canonical_path, browser_roots)
        if matched_root is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in a browser cache directory",
            )

        # Name must contain a cookie/tracking fragment.
        try:
            name_lower = Path(asset.display_name).name.lower()
        except Exception:
            name_lower = asset.display_name.lower()

        matched_fragment: Optional[str] = None
        for fragment in _TRACKING_COOKIE_FRAGMENTS:
            if fragment in name_lower:
                matched_fragment = fragment
                break

        if matched_fragment is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset name does not match cookie/tracking patterns",
            )

        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        evidence_items: list[Evidence] = []
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Cookie file is in browser cache: {matched_root}",
                value=matched_root,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_PATTERN,
                source=self.rule_id,
                description=(
                    f"File name matches tracking/cookie indicator: "
                    f"'{matched_fragment}'"
                ),
                value=matched_fragment,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description="Tracking cookies are used for cross-site tracking",
                value="tracking_cookie",
            )
        )

        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=40.0,
                description="File is in a browser cache directory",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=60.0,
                description="File name matches a known tracking/cookie indicator",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Tracking cookie file is safe to remove",
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
            reason=f"Tracking cookie file in browser cache: {asset.display_name}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


# ── Registration ──────────────────────────────────────────────────


def register_security_rules(registry) -> None:
    """
    Register all security threat detection rules with the registry.

    Args:
        registry: RuleRegistry instance
    """
    registry.register(MaliciousFileNameRule())
    registry.register(SuspiciousScriptRule())
    registry.register(SuspiciousExecutableRule())
    registry.register(TrackingCookieRule())
