"""
V1.0 AI Security Center — Security Score Regression Tests

Verifies that scan_core.security.score:
- Returns a deterministic score from real Defender telemetry
- Does NOT fabricate score=100 when Defender is unavailable
- Returns score=50 (Unknown) when Defender is disabled/unavailable
- Reduces score when active confirmed threats exist
- Handles missing Defender telemetry honestly
- A successful scan alone does NOT increase the score

The score contract:
  - Defender available + healthy + no threats: score ~100
  - Defender available + RT off: score -15
  - Defender available + signatures old: score -10
  - Defender disabled: score=50 (Unknown)
  - Defender unavailable/query_failed: score=50 (Unknown)
  - Not Windows: score=50 (Unknown)
  - Each active confirmed threat: -20 (capped at -60)
  - Score clamped to [0, 100]
"""
from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest


@pytest.fixture()
def _defender_available_no_threats():
    """Defender is available, RT on, signatures up to date, no threats."""
    from avs_backend.scan_core.security.defender_integration import (
        DefenderStatus,
        DefenderThreatInfo,
        DefenderProtectionState,
    )
    return DefenderThreatInfo(
        status=DefenderStatus.AVAILABLE,
        reason="Windows Defender threat information available",
        threats=(),
        protection_state=DefenderProtectionState(
            defender_available=True,
            real_time_protection_enabled=True,
            antivirus_enabled=True,
            antispyware_enabled=True,
            behavior_monitor_enabled=True,
            on_access_protection_enabled=True,
            ioav_protection_enabled=True,
            is_tamper_protected=True,
            ni_enabled=True,
            signatures_out_of_date=False,
            am_running_mode="Normal",
            am_service_enabled=True,
        ),
    )


@pytest.fixture()
def _defender_disabled():
    """Defender is disabled (third-party AV active)."""
    from avs_backend.scan_core.security.defender_integration import (
        DefenderStatus,
        DefenderThreatInfo,
        DefenderProtectionState,
    )
    return DefenderThreatInfo(
        status=DefenderStatus.DISABLED,
        reason="Windows Defender service is not running",
        threats=(),
        protection_state=DefenderProtectionState(
            defender_available=False,
            real_time_protection_enabled=False,
            antivirus_enabled=False,
            antispyware_enabled=False,
            behavior_monitor_enabled=False,
            on_access_protection_enabled=False,
            ioav_protection_enabled=False,
            is_tamper_protected=False,
            ni_enabled=False,
            signatures_out_of_date=False,
            am_running_mode="Not running",
            am_service_enabled=False,
        ),
    )


@pytest.fixture()
def _defender_available_with_active_threats():
    """Defender is available with 3 active confirmed threats."""
    from avs_backend.scan_core.security.defender_integration import (
        DefenderStatus,
        DefenderThreat,
        DefenderThreatInfo,
        DefenderProtectionState,
    )
    threats = tuple(
        DefenderThreat(
            threat_id=f"tid-{i}",
            threat_name=f"Threat {i}",
            severity="High",
            category="Trojan",
            detection_id=f"det-{i}",
            file_path=f"C:\\Users\\test\\file{i}.exe",
            is_active=True,
        )
        for i in range(3)
    )
    return DefenderThreatInfo(
        status=DefenderStatus.AVAILABLE,
        reason="Windows Defender threat information available",
        threats=threats,
        protection_state=DefenderProtectionState(
            defender_available=True,
            real_time_protection_enabled=True,
            antivirus_enabled=True,
            antispyware_enabled=True,
            behavior_monitor_enabled=True,
            on_access_protection_enabled=True,
            ioav_protection_enabled=True,
            is_tamper_protected=True,
            ni_enabled=True,
            signatures_out_of_date=False,
            am_running_mode="Normal",
            am_service_enabled=True,
        ),
    )


@pytest.fixture()
def _defender_available_rt_off():
    """Defender is available but real-time protection is off."""
    from avs_backend.scan_core.security.defender_integration import (
        DefenderStatus,
        DefenderThreatInfo,
        DefenderProtectionState,
    )
    return DefenderThreatInfo(
        status=DefenderStatus.AVAILABLE,
        reason="Windows Defender threat information available",
        threats=(),
        protection_state=DefenderProtectionState(
            defender_available=True,
            real_time_protection_enabled=False,
            antivirus_enabled=True,
            antispyware_enabled=True,
            behavior_monitor_enabled=True,
            on_access_protection_enabled=True,
            ioav_protection_enabled=True,
            is_tamper_protected=True,
            ni_enabled=True,
            signatures_out_of_date=False,
            am_running_mode="Normal",
            am_service_enabled=True,
        ),
    )


@pytest.fixture()
def _defender_query_failed():
    """Defender query failed — telemetry unavailable."""
    from avs_backend.scan_core.security.defender_integration import (
        DefenderStatus,
        DefenderThreatInfo,
    )
    return DefenderThreatInfo(
        status=DefenderStatus.QUERY_FAILED,
        reason="Get-MpComputerStatus query failed: timeout",
        threats=(),
        protection_state=None,
    )


# ── Tests ────────────────────────────────────────────────────────────


class TestSecurityScoreAvailable:
    """Scenario A: Defender healthy + no confirmed threats → score ~100."""

    def test_score_is_high_when_defender_healthy(
        self, _defender_available_no_threats
    ):
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        result = _compute_security_score_from_defender(_defender_available_no_threats)
        assert result["ok"] is True
        assert result["score"] == 100
        assert result["label"] == "Secure"
        assert result["available"] is True

    def test_score_is_deterministic(
        self, _defender_available_no_threats
    ):
        """Same inputs → same score, every time."""
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        r1 = _compute_security_score_from_defender(_defender_available_no_threats)
        r2 = _compute_security_score_from_defender(_defender_available_no_threats)
        assert r1["score"] == r2["score"]


class TestSecurityScoreDisabled:
    """Scenario B: Defender disabled → score=50, NOT 100."""

    def test_disabled_defender_does_not_produce_fake_100(
        self, _defender_disabled
    ):
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        result = _compute_security_score_from_defender(_defender_disabled)
        assert result["ok"] is True
        assert result["score"] == 50
        assert result["score"] != 100  # NEVER fake 100
        assert result["label"] == "Unknown"
        assert result["available"] is False


class TestSecurityScoreWithThreats:
    """Scenario C: Confirmed threat present → score reduced."""

    def test_active_threats_reduce_score(
        self, _defender_available_with_active_threats
    ):
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        result = _compute_security_score_from_defender(_defender_available_with_active_threats)
        assert result["ok"] is True
        # 3 active threats × 20 = 60 penalty → 100 - 60 = 40
        assert result["score"] == 40
        assert result["label"] == "Unprotected"
        assert result["inputs"]["active_threat_count"] == 3


class TestSecurityScoreQuarantined:
    """Scenario D: Threats quarantined (not active) → no penalty."""

    def test_quarantined_threats_do_not_reduce_score(
        self, _defender_available_no_threats
    ):
        from avs_backend.scan_core.security.defender_integration import (
            DefenderStatus,
            DefenderThreat,
            DefenderThreatInfo,
            DefenderProtectionState,
        )
        # 3 threats but all inactive (quarantined)
        threats = tuple(
            DefenderThreat(
                threat_id=f"tid-{i}",
                threat_name=f"Threat {i}",
                severity="High",
                category="Trojan",
                detection_id=f"det-{i}",
                file_path=f"C:\\Users\\test\\file{i}.exe",
                is_active=False,  # quarantined
            )
            for i in range(3)
        )
        info = DefenderThreatInfo(
            status=DefenderStatus.AVAILABLE,
            reason="available",
            threats=threats,
            protection_state=DefenderProtectionState(
                defender_available=True,
                real_time_protection_enabled=True,
                antivirus_enabled=True,
                antispyware_enabled=True,
                behavior_monitor_enabled=True,
                on_access_protection_enabled=True,
                ioav_protection_enabled=True,
                is_tamper_protected=True,
                ni_enabled=True,
                signatures_out_of_date=False,
                am_running_mode="Normal",
                am_service_enabled=True,
            ),
        )
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        result = _compute_security_score_from_defender(info)
        assert result["score"] == 100  # No active threats → no penalty
        assert result["inputs"]["active_threat_count"] == 0
        assert result["inputs"]["total_threat_count"] == 3


class TestSecurityScoreMultipleRemaining:
    """Scenario E: Multiple remaining threats → penalty capped at -60."""

    def test_penalty_capped_at_60(self):
        from avs_backend.scan_core.security.defender_integration import (
            DefenderStatus,
            DefenderThreat,
            DefenderThreatInfo,
            DefenderProtectionState,
        )
        # 10 active threats × 20 = 200, but capped at 60
        threats = tuple(
            DefenderThreat(
                threat_id=f"tid-{i}",
                threat_name=f"Threat {i}",
                severity="High",
                category="Trojan",
                detection_id=f"det-{i}",
                file_path=f"C:\\Users\\test\\file{i}.exe",
                is_active=True,
            )
            for i in range(10)
        )
        info = DefenderThreatInfo(
            status=DefenderStatus.AVAILABLE,
            reason="available",
            threats=threats,
            protection_state=DefenderProtectionState(
                defender_available=True,
                real_time_protection_enabled=True,
                antivirus_enabled=True,
                antispyware_enabled=True,
                behavior_monitor_enabled=True,
                on_access_protection_enabled=True,
                ioav_protection_enabled=True,
                is_tamper_protected=True,
                ni_enabled=True,
                signatures_out_of_date=False,
                am_running_mode="Normal",
                am_service_enabled=True,
            ),
        )
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        result = _compute_security_score_from_defender(info)
        assert result["score"] == 40  # 100 - 60 (capped)
        assert result["inputs"]["active_threat_count"] == 10


class TestSecurityScoreMissingTelemetry:
    """Scenario F: Missing Defender telemetry → score=50, NOT 100."""

    def test_query_failed_returns_50(self, _defender_query_failed):
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        result = _compute_security_score_from_defender(_defender_query_failed)
        assert result["score"] == 50
        assert result["score"] != 100
        assert result["label"] == "Unknown"
        assert result["available"] is False

    def test_not_windows_returns_50(self):
        from avs_backend.scan_core.security.defender_integration import (
            DefenderStatus,
            DefenderThreatInfo,
        )
        info = DefenderThreatInfo(
            status=DefenderStatus.NOT_WINDOWS,
            reason="Windows Defender is only available on Windows",
        )
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        result = _compute_security_score_from_defender(info)
        assert result["score"] == 50
        assert result["label"] == "Unknown"


class TestSecurityScoreRTOff:
    """Defender available but RT off → -15 penalty."""

    def test_rt_off_reduces_score(self, _defender_available_rt_off):
        from avs_backend.scan_core_rpc import _compute_security_score_from_defender
        result = _compute_security_score_from_defender(_defender_available_rt_off)
        assert result["score"] == 85  # 100 - 15
        assert result["label"] == "Protected"


class TestSecurityScoreRPC:
    """Test the full RPC endpoint with mocked Defender."""

    def test_rpc_returns_ok(self, _defender_available_no_threats):
        with patch(
            "avs_backend.scan_core.security.defender_integration.get_defender_threat_info",
            return_value=_defender_available_no_threats,
        ):
            from avs_backend.scan_core_rpc import _scan_core_security_score
            result = _scan_core_security_score(None)
            assert result["ok"] is True
            assert "score" in result
            assert "label" in result
            assert "inputs" in result
            assert "computed_at" in result

    def test_rpc_handles_exception(self):
        with patch(
            "avs_backend.scan_core.security.defender_integration.get_defender_threat_info",
            side_effect=Exception("PowerShell timeout"),
        ):
            from avs_backend.scan_core_rpc import _scan_core_security_score
            result = _scan_core_security_score(None)
            assert result["ok"] is False
            assert result["score"] == 50
            assert result["label"] == "Unknown"
            assert "error" in result
