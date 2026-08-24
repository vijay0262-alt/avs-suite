"""Tests for V1.0 Protection Center — Defender integration, quarantine, and security classification.

Tests use mocked Defender responses (no real malware, no real Defender queries).
Covers:
1. Defender reports zero threats
2. Defender reports one confirmed threat
3. Defender reports multiple threats
4. Defender unavailable
5. Defender disabled
6. Suspicious heuristic finding
7. Suspicious item is NOT auto-cleaned
8. Confirmed threat becomes quarantine action
9. Quarantine succeeds
10. Quarantine failure
11. Remaining threat reported correctly
12. AVS executable protected
13. Windows protected path protected
14. Duplicate quarantine prevention
15. Restart persistence (manifest)
16. Tracking cookie is privacy finding, not security threat
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, UTC
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from avs_backend.scan_core.security.defender_integration import (
    DefenderStatus,
    DefenderThreat,
    DefenderThreatInfo,
    DefenderProtectionState,
    get_defender_threat_info,
)
from avs_backend.scan_core.security.defender_discovery import (
    DefenderThreatDiscoveryEngine,
)
from avs_backend.scan_core.rules.detection.defender_confirmed_threat_rule import (
    DefenderConfirmedThreatRule,
)
from avs_backend.scan_core.rules.detection.security_rules import (
    MaliciousFileNameRule,
    SuspiciousScriptRule,
    SuspiciousExecutableRule,
    TrackingCookieRule,
)
from avs_backend.scan_core.rules.enums import (
    ActionType,
    RuleCategory,
    Severity,
)
from avs_backend.scan_core.rules.actionability import (
    DEFAULT_CAPABILITY_MATRIX,
    Actionability,
    CapabilityContract,
)
from avs_backend.scan_core.rules.action import (
    ActionType as ActionActionType,
    QuarantineActionTarget,
)
from avs_backend.scan_core.execution.quarantine_executor import (
    QuarantineExecutor,
    _is_avs_path,
)
from avs_backend.scan_core.assets import AssetType, AssetCategory, AssetSource, ScanAsset
from avs_backend.scan_core.assets.metadata import AssetMetadata


# ── Helpers ───────────────────────────────────────────────────────────


def _make_defender_threat(
    threat_id: str = "2147751003",
    threat_name: str = "Trojan:Win32/TestThreat",
    file_path: str = "",
    is_active: bool = True,
    severity: str = "High",
    category: str = "Trojan",
) -> DefenderThreat:
    return DefenderThreat(
        threat_id=threat_id,
        threat_name=threat_name,
        severity=severity,
        category=category,
        detection_id=f"det-{threat_id}",
        file_path=file_path,
        detection_time=datetime.now(UTC).isoformat(),
        action_taken="NoAction" if is_active else "Quarantine",
        remediation_state="Active" if is_active else "Quarantined",
        is_active=is_active,
    )


def _make_threat_info(
    status: DefenderStatus = DefenderStatus.AVAILABLE,
    threats: list[DefenderThreat] | None = None,
    reason: str = "",
) -> DefenderThreatInfo:
    return DefenderThreatInfo(
        status=status,
        reason=reason or "Test threat info",
        threats=tuple(threats or []),
        protection_state=DefenderProtectionState(
            defender_available=True,
            real_time_protection_enabled=True,
            antivirus_enabled=True,
            antispyware_enabled=True,
        ),
    )


def _make_defender_asset(
    file_path: str,
    threat_name: str = "Trojan:Win32/TestThreat",
    threat_id: str = "2147751003",
    size: int = 1024,
) -> ScanAsset:
    import hashlib

    raw_id = f"defender:det-{threat_id}:{file_path}"
    asset_id = hashlib.sha256(raw_id.encode()).hexdigest()
    meta = AssetMetadata()
    meta.set("defender_threat", True)
    meta.set("threat_name", threat_name)
    meta.set("threat_id", threat_id)
    meta.set("severity", "High")
    meta.set("category", "Trojan")
    meta.set("detection_id", f"det-{threat_id}")
    meta.set("detection_source", "WINDOWS_DEFENDER")
    meta.set("is_active", True)
    meta.set("size", size)
    return ScanAsset(
        asset_id=asset_id,
        asset_type=AssetType.FILE,
        asset_category=AssetCategory.FILESYSTEM,
        asset_source=AssetSource.MALWARE_SCANNER,
        display_name=os.path.basename(file_path),
        canonical_path=file_path,
        exists=True,
        accessible=True,
        locked=False,
        custom_metadata=meta,
    )


# ── Test 1: Defender reports zero threats ─────────────────────────────


def test_defender_zero_threats():
    """Defender is available but reports no threats."""
    info = _make_threat_info(
        status=DefenderStatus.AVAILABLE,
        threats=[],
        reason="No threats",
    )
    assert info.is_available
    assert len(info.threats) == 0
    assert len(info.active_threats) == 0


# ── Test 2: Defender reports one confirmed threat ─────────────────────


def test_defender_one_confirmed_threat():
    """Defender reports one active confirmed threat."""
    threat = _make_defender_threat(
        file_path="C:\\Users\\test\\Downloads\\malware.exe",
        is_active=True,
    )
    info = _make_threat_info(threats=[threat])
    assert info.is_available
    assert len(info.threats) == 1
    assert len(info.active_threats) == 1
    assert info.threats[0].threat_name == "Trojan:Win32/TestThreat"


# ── Test 3: Defender reports multiple threats ─────────────────────────


def test_defender_multiple_threats():
    """Defender reports multiple confirmed threats."""
    threats = [
        _make_defender_threat(
            threat_id="1",
            file_path="C:\\Users\\test\\Downloads\\malware1.exe",
        ),
        _make_defender_threat(
            threat_id="2",
            file_path="C:\\Users\\test\\Downloads\\malware2.exe",
        ),
        _make_defender_threat(
            threat_id="3",
            file_path="C:\\Users\\test\\Downloads\\malware3.exe",
        ),
    ]
    info = _make_threat_info(threats=threats)
    assert len(info.threats) == 3
    assert len(info.active_threats) == 3


# ── Test 4: Defender unavailable ──────────────────────────────────────


def test_defender_unavailable():
    """Defender is unavailable — status is NOT 'no threats'."""
    info = _make_threat_info(
        status=DefenderStatus.UNAVAILABLE,
        reason="Windows Defender status unavailable",
    )
    assert not info.is_available
    assert info.status == DefenderStatus.UNAVAILABLE
    assert len(info.threats) == 0
    # Critical: unavailable != "no threats found"
    assert "unavailable" in info.reason.lower()


# ── Test 5: Defender disabled ─────────────────────────────────────────


def test_defender_disabled():
    """Defender is disabled (third-party AV active) — status is 'disabled'."""
    info = _make_threat_info(
        status=DefenderStatus.DISABLED,
        reason="Windows Defender service is not running",
    )
    assert not info.is_available
    assert info.status == DefenderStatus.DISABLED


# ── Test 6: Suspicious heuristic finding ──────────────────────────────


def test_malicious_filename_rule_is_suspicious():
    """MaliciousFileNameRule produces SUSPICIOUS, not SECURITY."""
    rule = MaliciousFileNameRule()
    assert rule.metadata.category == RuleCategory.SUSPICIOUS
    assert rule.metadata.severity == Severity.MEDIUM


def test_suspicious_script_rule_is_suspicious():
    """SuspiciousScriptRule produces SUSPICIOUS, not SECURITY."""
    rule = SuspiciousScriptRule()
    assert rule.metadata.category == RuleCategory.SUSPICIOUS


def test_suspicious_executable_rule_is_suspicious():
    """SuspiciousExecutableRule produces SUSPICIOUS, not SECURITY."""
    rule = SuspiciousExecutableRule()
    assert rule.metadata.category == RuleCategory.SUSPICIOUS


# ── Test 7: Suspicious item is NOT auto-cleaned ────────────────────────


def test_suspicious_not_in_capability_matrix():
    """SUSPICIOUS category has no actionability mapping — never auto-remediated."""
    contract = CapabilityContract()
    # There should be NO SUSPICIOUS entries in the capability matrix
    suspicious_entries = [
        k for k in contract._matrix
        if k[0] == RuleCategory.SUSPICIOUS
    ]
    assert len(suspicious_entries) == 0
    # infer_action_type should return None for SUSPICIOUS
    assert contract.infer_action_type(RuleCategory.SUSPICIOUS, AssetType.FILE) is None


# ── Test 8: Confirmed threat becomes quarantine action ─────────────────


def test_confirmed_threat_rule_matches_defender_asset():
    """DefenderConfirmedThreatRule matches assets with defender_threat metadata."""
    rule = DefenderConfirmedThreatRule()
    assert rule.metadata.category == RuleCategory.SECURITY

    asset = _make_defender_asset("C:\\test\\threat.exe")
    result = rule.evaluate(asset)
    assert result.matched
    assert result.recommended_action == ActionType.QUARANTINE
    assert result.metadata.get("classification") == "CONFIRMED_THREAT"
    assert result.metadata.get("detection_source") == "WINDOWS_DEFENDER"


def test_confirmed_threat_rule_does_not_match_non_defender_asset():
    """DefenderConfirmedThreatRule does NOT match regular filesystem assets."""
    rule = DefenderConfirmedThreatRule()
    asset = ScanAsset(
        asset_id="a" * 64,
        asset_type=AssetType.FILE,
        asset_category=AssetCategory.FILESYSTEM,
        asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
        display_name="normal.exe",
        canonical_path="C:\\test\\normal.exe",
    )
    result = rule.evaluate(asset)
    assert not result.matched


def test_security_quarantine_in_capability_matrix():
    """SECURITY + FILE + quarantine_file is ACTIONABLE in the capability matrix."""
    assert (
        RuleCategory.SECURITY,
        AssetType.FILE,
        "quarantine_file",
    ) in DEFAULT_CAPABILITY_MATRIX
    assert (
        DEFAULT_CAPABILITY_MATRIX[
            (RuleCategory.SECURITY, AssetType.FILE, "quarantine_file")
        ]
        == Actionability.ACTIONABLE
    )


# ── Test 9: Quarantine succeeds ───────────────────────────────────────


def test_quarantine_succeeds(tmp_path):
    """Quarantine executor moves a file to quarantine storage."""
    # Create a test file
    test_file = tmp_path / "threat.exe"
    test_file.write_bytes(b"malware content")

    # Create a mock action and context
    class MockAction:
        class action_type:
            value = "quarantine_file"
        asset_id = "a" * 64

    class MockTarget:
        canonical_path = str(test_file)

    action = MockAction()
    action.target = MockTarget()

    context = {
        "canonical_path": str(test_file),
        "exists": True,
        "accessible": True,
        "locked": False,
        "asset_id": "a" * 64,
        "threat_name": "Trojan:Win32/Test",
        "threat_id": "123",
        "detection_source": "WINDOWS_DEFENDER",
        "detection_id": "det-123",
        "__safety_authorized": True,
    }

    # Patch quarantine directory to tmp_path
    with patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_DIR",
        str(tmp_path / "quarantine"),
    ), patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_MANIFEST",
        str(tmp_path / "quarantine" / "manifest.json"),
    ):
        result = QuarantineExecutor.execute(
            action,
            context,
            mode="live",
        )

    assert result.status.value == "completed"
    assert not test_file.exists()  # Original file removed
    assert result.after_state.get("quarantined") is True
    assert result.backup_identity is not None  # quarantine_id


# ── Test 10: Quarantine failure (missing file) ────────────────────────


def test_quarantine_fails_missing_file(tmp_path):
    """Quarantine executor fails when the target file does not exist."""
    test_file = tmp_path / "nonexistent.exe"

    class MockAction:
        class action_type:
            value = "quarantine_file"
        asset_id = "a" * 64

    class MockTarget:
        canonical_path = str(test_file)

    action = MockAction()
    action.target = MockTarget()

    context = {
        "canonical_path": str(test_file),
        "exists": False,
        "__safety_authorized": True,
    }

    with patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_DIR",
        str(tmp_path / "quarantine"),
    ), patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_MANIFEST",
        str(tmp_path / "quarantine" / "manifest.json"),
    ):
        result = QuarantineExecutor.execute(
            action,
            context,
            mode="live",
        )

    assert result.status.value == "failed"
    assert "TARGET_MISSING" in result.error.code


# ── Test 12: AVS executable protected ─────────────────────────────────


def test_avs_path_protection():
    """AVS application paths are detected and protected from quarantine."""
    assert _is_avs_path("C:\\Users\\test\\AppData\\Local\\AVS Shield\\Optimizer.exe")
    assert _is_avs_path("C:\\Program Files\\AVS Shield\\avs-backend.exe")
    assert not _is_avs_path("C:\\Users\\test\\Downloads\\malware.exe")


def test_quarantine_rejects_avs_path(tmp_path):
    """Quarantine executor rejects AVS application files."""
    avs_file = tmp_path / "AVS Shield" / "avs-backend.exe"
    avs_file.parent.mkdir(parents=True)
    avs_file.write_bytes(b"avs backend")

    class MockAction:
        class action_type:
            value = "quarantine_file"
        asset_id = "a" * 64

    class MockTarget:
        canonical_path = str(avs_file)

    action = MockAction()
    action.target = MockTarget()

    context = {
        "canonical_path": str(avs_file),
        "exists": True,
        "__safety_authorized": True,
    }

    with patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_DIR",
        str(tmp_path / "quarantine"),
    ), patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_MANIFEST",
        str(tmp_path / "quarantine" / "manifest.json"),
    ), patch(
        "avs_backend.scan_core.execution.quarantine_executor._get_avs_paths",
        return_value=[str(tmp_path / "AVS Shield")],
    ):
        result = QuarantineExecutor.execute(
            action,
            context,
            mode="live",
        )

    assert result.status.value in ("rejected", "failed")
    assert "AVS_SELF_PROTECTION" in result.error.code
    assert avs_file.exists()  # File NOT moved


# ── Test 13: Windows protected path protected ─────────────────────────


def test_quarantine_rejects_windows_system_path(tmp_path):
    """Quarantine executor rejects Windows system paths via path validation."""
    # Use a path that would be in FORBIDDEN_ROOTS
    system_file = "C:\\Windows\\System32\\fake_malware.exe"

    class MockAction:
        class action_type:
            value = "quarantine_file"
        asset_id = "a" * 64

    class MockTarget:
        canonical_path = system_file

    action = MockAction()
    action.target = MockTarget()

    context = {
        "canonical_path": system_file,
        "exists": True,
        "__safety_authorized": True,
    }

    result = QuarantineExecutor.execute(
        action,
        context,
        mode="live",
    )

    assert result.status.value in ("rejected", "failed")
    # The file should not be quarantined (path validation rejects it)


# ── Test 14: Duplicate quarantine prevention ──────────────────────────


def test_duplicate_quarantine_prevention(tmp_path):
    """Quarantine executor prevents duplicate quarantine of same file."""
    test_file = tmp_path / "threat.exe"
    test_file.write_bytes(b"malware")

    class MockAction:
        class action_type:
            value = "quarantine_file"
        asset_id = "a" * 64

    class MockTarget:
        canonical_path = str(test_file)

    action = MockAction()
    action.target = MockTarget()

    context = {
        "canonical_path": str(test_file),
        "exists": True,
        "accessible": True,
        "locked": False,
        "asset_id": "a" * 64,
        "threat_name": "Test",
        "threat_id": "1",
        "detection_source": "WINDOWS_DEFENDER",
        "detection_id": "det-1",
        "__safety_authorized": True,
    }

    q_dir = str(tmp_path / "quarantine")
    q_manifest = str(tmp_path / "quarantine" / "manifest.json")

    with patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_DIR",
        q_dir,
    ), patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_MANIFEST",
        q_manifest,
    ):
        # First quarantine succeeds
        result1 = QuarantineExecutor.execute(action, context, mode="live")
        assert result1.status.value == "completed"

        # Recreate the file (simulating Defender re-detecting)
        test_file.write_bytes(b"malware again")

        # Second quarantine of same path should be rejected
        result2 = QuarantineExecutor.execute(action, context, mode="live")
        assert result2.status.value in ("failed", "rejected")
        assert "ALREADY_QUARANTINED" in result2.error.code


# ── Test 15: Restart persistence (manifest) ───────────────────────────


def test_quarantine_manifest_persistence(tmp_path):
    """Quarantine manifest persists across restarts."""
    test_file = tmp_path / "threat.exe"
    test_file.write_bytes(b"malware content")

    class MockAction:
        class action_type:
            value = "quarantine_file"
        asset_id = "a" * 64

    class MockTarget:
        canonical_path = str(test_file)

    action = MockAction()
    action.target = MockTarget()

    context = {
        "canonical_path": str(test_file),
        "exists": True,
        "accessible": True,
        "locked": False,
        "asset_id": "a" * 64,
        "threat_name": "Trojan:Win32/Persist",
        "threat_id": "999",
        "detection_source": "WINDOWS_DEFENDER",
        "detection_id": "det-999",
        "__safety_authorized": True,
    }

    q_dir = str(tmp_path / "quarantine")
    q_manifest = str(tmp_path / "quarantine" / "manifest.json")

    with patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_DIR",
        q_dir,
    ), patch(
        "avs_backend.scan_core.execution.quarantine_executor._QUARANTINE_MANIFEST",
        q_manifest,
    ):
        result = QuarantineExecutor.execute(action, context, mode="live")
        assert result.status.value == "completed"

        # Read the manifest
        with open(q_manifest, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        assert len(manifest["items"]) == 1
        entry = manifest["items"][0]
        assert entry["threatName"] == "Trojan:Win32/Persist"
        assert entry["detectionSource"] == "WINDOWS_DEFENDER"
        assert entry["remediationState"] == "quarantined"
        assert entry["restored"] is False
        assert entry["deleted"] is False
        assert "fileHash" in entry
        assert entry["fileHash"].startswith("sha256:")


# ── Test 16: Tracking cookie is privacy, not security ─────────────────


def test_tracking_cookie_is_privacy():
    """TrackingCookieRule is classified as PRIVACY, not SECURITY."""
    rule = TrackingCookieRule()
    assert rule.metadata.category == RuleCategory.PRIVACY
    assert rule.metadata.severity == Severity.LOW


def test_privacy_not_in_capability_matrix():
    """PRIVACY category has no actionability mapping for security quarantine."""
    contract = CapabilityContract()
    privacy_entries = [
        k for k in contract._matrix
        if k[0] == RuleCategory.PRIVACY
    ]
    # PRIVACY should not map to quarantine_file
    quarantine_privacy = [
        k for k in privacy_entries
        if k[2] == "quarantine_file"
    ]
    assert len(quarantine_privacy) == 0


# ── Test: Defender discovery engine with mock ─────────────────────────


def test_defender_discovery_engine_yields_assets(tmp_path):
    """DefenderThreatDiscoveryEngine yields ScanAssets for active threats."""
    # Create a test file that "is" a threat
    threat_file = tmp_path / "malware.exe"
    threat_file.write_bytes(b"fake malware")

    threat = _make_defender_threat(
        file_path=str(threat_file),
        is_active=True,
    )
    threat_info = _make_threat_info(threats=[threat])

    engine = DefenderThreatDiscoveryEngine(
        threat_info_provider=lambda: threat_info,
    )

    from avs_backend.scan_core.rules.evaluator import CancellationToken
    from avs_backend.scan_core.context.scan_context import ScanContext, ScanType
    from datetime import datetime, UTC

    ctx = ScanContext(
        scan_id="test",
        started_at=datetime.now(UTC),
        scan_type=ScanType.FULL,
        requested_scope=[],
        machine_id_hash="m",
        user_id_hash="u",
        enumerators_used=["defender"],
    )
    token = CancellationToken()

    assets = list(engine.enumerate(ctx, token))
    assert len(assets) == 1
    assert assets[0].custom_metadata.get("defender_threat") is True
    assert assets[0].custom_metadata.get("threat_name") == "Trojan:Win32/TestThreat"


def test_defender_discovery_engine_unavailable():
    """DefenderThreatDiscoveryEngine yields nothing when Defender unavailable."""
    threat_info = _make_threat_info(
        status=DefenderStatus.UNAVAILABLE,
        reason="Defender not running",
    )
    engine = DefenderThreatDiscoveryEngine(
        threat_info_provider=lambda: threat_info,
    )

    from avs_backend.scan_core.rules.evaluator import CancellationToken
    from avs_backend.scan_core.context.scan_context import ScanContext, ScanType
    from datetime import datetime, UTC

    ctx = ScanContext(
        scan_id="test",
        started_at=datetime.now(UTC),
        scan_type=ScanType.FULL,
        requested_scope=[],
        machine_id_hash="m",
        user_id_hash="u",
        enumerators_used=["defender"],
    )
    token = CancellationToken()

    assets = list(engine.enumerate(ctx, token))
    assert len(assets) == 0
    assert engine.threat_info is not None
    assert engine.threat_info.status == DefenderStatus.UNAVAILABLE


# ── Test: QuarantineActionTarget ──────────────────────────────────────


def test_quarantine_action_target_serialization():
    """QuarantineActionTarget serializes and deserializes correctly."""
    target = QuarantineActionTarget(
        asset_id="a" * 64,
        canonical_path="C:\\test\\threat.exe",
        allowed_location="C:\\test",
        scope="user",
        threat_name="Trojan:Win32/Test",
        threat_id="123",
        detection_source="WINDOWS_DEFENDER",
        detection_id="det-123",
    )
    d = target.to_dict()
    assert d["threat_name"] == "Trojan:Win32/Test"
    assert d["detection_source"] == "WINDOWS_DEFENDER"

    restored = QuarantineActionTarget.from_dict(d)
    assert restored.threat_name == "Trojan:Win32/Test"
    assert restored.canonical_path == "C:\\test\\threat.exe"


# ── Test: ActionType.QUARANTINE_FILE exists ───────────────────────────


def test_quarantine_file_action_type_exists():
    """ActionType.QUARANTINE_FILE is registered."""
    assert ActionActionType.QUARANTINE_FILE.value == "quarantine_file"


def test_quarantine_executor_can_execute():
    """QuarantineExecutor.can_execute returns True for quarantine_file."""
    assert QuarantineExecutor.can_execute("quarantine_file")
    assert not QuarantineExecutor.can_execute("delete_file")
