"""Integration tests for the licensing bridge module.

Tests the JSON-RPC handlers that bridge the AVS Suite backend to the
AVS License SDK. Uses mock SDK responses to avoid requiring a running
license server.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from typing import Any

import pytest

from avs_backend.api import registry

# Import the licensing module to trigger @register decorators
import avs_backend.licensing  # noqa: F401


def _call(method: str, params: dict[str, Any] | None = None) -> Any:
    """Call a registered RPC handler directly."""
    handler = registry.get(method)
    assert handler is not None, f"Method {method} not registered"
    return handler(params)


def _make_status(
    status: str = "active",
    edition: str = "professional",
    days_remaining: int = 30,
    is_offline: bool = False,
) -> MagicMock:
    """Create a mock StatusResult."""
    s = MagicMock()
    s.status.value = status
    s.status = MagicMock(__class__=type("Enum", (), {"value": status}))
    s.status.value = status
    s.edition = edition
    s.expiry = datetime(2026, 12, 31, tzinfo=timezone.utc)
    s.grace_expiry = None
    s.days_remaining = days_remaining
    s.remaining_devices = 2
    s.last_validated = datetime.now(timezone.utc)
    s.is_offline = is_offline
    s.message = "License is valid"
    return s


def _make_license_info(
    edition: str = "professional",
    status: str = "active",
    days_remaining: int = 30,
) -> MagicMock:
    """Create a mock LicenseInfo."""
    info = MagicMock()
    info.license_key = "AVS-TEST-KEY"
    info.email = "test@example.com"
    info.device_fingerprint = "abc123"
    info.device_name = "TEST-PC"
    info.edition = edition
    info.status = status
    info.expiry = datetime(2026, 12, 31, tzinfo=timezone.utc)
    info.grace_expiry = None
    info.max_devices = 3
    info.active_devices = 1
    info.remaining_devices = 2
    info.last_validated = datetime.now(timezone.utc)
    info.last_refreshed = datetime.now(timezone.utc)
    info.activation_success = True
    info.days_remaining.return_value = days_remaining
    return info


def _make_update_check(
    update_available: bool = True,
    force_upgrade: bool = False,
    critical: bool = False,
) -> MagicMock:
    """Create a mock UpdateCheckResult."""
    r = MagicMock()
    r.product_found = True
    r.product_name = "AVS PC Optimizer"
    r.update_available = update_available
    r.force_upgrade = force_upgrade
    r.critical = critical
    r.latest_version = "1.1.0"
    r.current_version = "1.0.0"
    r.download_url = "http://localhost:8000/api/update/download/1"
    r.sha256 = "abc123"
    r.release_notes = "Bug fixes and improvements"
    r.file_size = 50000000
    r.channel = "stable"
    r.architecture = "x64"
    r.release_id = 1
    return r


# ── Registration Tests ───────────────────────────────────────


class TestLicensingHandlersRegistered:
    """Verify all license RPC handlers are registered."""

    def test_all_methods_registered(self):
        expected = [
            "license.startup",
            "license.activate",
            "license.validate",
            "license.refresh",
            "license.deactivate",
            "license.get_status",
            "license.is_licensed",
            "license.days_remaining",
            "license.remaining_devices",
            "license.offline_status",
            "license.get_info",
            "license.check_updates",
            "license.download_update",
            "license.install_update",
            "license.close",
        ]
        for method in expected:
            assert registry.get(method) is not None, f"{method} not registered"


# ── Startup Tests ────────────────────────────────────────────


class TestLicenseStartup:
    @patch("avs_backend.licensing._get_client")
    def test_startup_success(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.startup.return_value = _make_status()
        mock_get_client.return_value = mock_client

        result = _call("license.startup")
        assert result["status"] == "active"
        assert result["edition"] == "professional"
        assert result["days_remaining"] == 30

    @patch("avs_backend.licensing._get_client")
    def test_startup_no_license(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.startup.return_value = _make_status(
            status="invalid", edition="", days_remaining=None, is_offline=False,
        )
        mock_get_client.return_value = mock_client

        result = _call("license.startup")
        assert result["status"] == "invalid"


# ── Activation Tests ─────────────────────────────────────────


class TestLicenseActivate:
    @patch("avs_backend.licensing._get_client")
    def test_activate_success(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.activate.return_value = _make_license_info()
        mock_get_client.return_value = mock_client

        result = _call("license.activate", {
            "license_key": "AVS-TEST-KEY",
            "email": "test@example.com",
        })
        assert result["success"] is True
        assert result["license"]["edition"] == "professional"
        assert result["license"]["email"] == "test@example.com"

    @patch("avs_backend.licensing._get_client")
    def test_activate_missing_params(self, mock_get_client):
        result = _call("license.activate", None)
        assert result["success"] is False
        assert "Missing" in result["error"]

    @patch("avs_backend.licensing._get_client")
    def test_activate_failure(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.activate.side_effect = Exception("Invalid key")
        mock_get_client.return_value = mock_client

        result = _call("license.activate", {
            "license_key": "BAD-KEY",
            "email": "test@example.com",
        })
        assert result["success"] is False
        assert "Invalid key" in result["error"]


# ── Validate / Refresh / Deactivate Tests ────────────────────


class TestLicenseValidate:
    @patch("avs_backend.licensing._get_client")
    def test_validate_success(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.validate.return_value = _make_status()
        mock_get_client.return_value = mock_client

        result = _call("license.validate")
        assert result["status"] == "active"

    @patch("avs_backend.licensing._get_client")
    def test_validate_failure(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.validate.side_effect = Exception("No license")
        mock_get_client.return_value = mock_client

        result = _call("license.validate")
        assert result["success"] is False


class TestLicenseRefresh:
    @patch("avs_backend.licensing._get_client")
    def test_refresh_success(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.refresh.return_value = _make_license_info()
        mock_get_client.return_value = mock_client

        result = _call("license.refresh")
        assert result["success"] is True
        assert result["license"]["edition"] == "professional"


class TestLicenseDeactivate:
    @patch("avs_backend.licensing._get_client")
    def test_deactivate_success(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.deactivate.return_value = True
        mock_get_client.return_value = mock_client

        result = _call("license.deactivate")
        assert result["success"] is True

    @patch("avs_backend.licensing._get_client")
    def test_deactivate_failure(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.deactivate.return_value = False
        mock_get_client.return_value = mock_client

        result = _call("license.deactivate")
        assert result["success"] is False


# ── Status / Info Tests ──────────────────────────────────────


class TestLicenseStatus:
    @patch("avs_backend.licensing._get_client")
    def test_get_status(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.get_status.return_value = _make_status()
        mock_get_client.return_value = mock_client

        result = _call("license.get_status")
        assert result["status"] == "active"

    @patch("avs_backend.licensing._get_client")
    def test_is_licensed_true(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.is_licensed.return_value = True
        mock_get_client.return_value = mock_client

        result = _call("license.is_licensed")
        assert result["licensed"] is True

    @patch("avs_backend.licensing._get_client")
    def test_is_licensed_false(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.is_licensed.return_value = False
        mock_get_client.return_value = mock_client

        result = _call("license.is_licensed")
        assert result["licensed"] is False

    @patch("avs_backend.licensing._get_client")
    def test_days_remaining(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.days_remaining.return_value = 15
        mock_get_client.return_value = mock_client

        result = _call("license.days_remaining")
        assert result["days_remaining"] == 15

    @patch("avs_backend.licensing._get_client")
    def test_remaining_devices(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.remaining_devices.return_value = 2
        mock_get_client.return_value = mock_client

        result = _call("license.remaining_devices")
        assert result["remaining_devices"] == 2

    @patch("avs_backend.licensing._get_client")
    def test_offline_status(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.offline_status.return_value = "Offline grace active — 5 days remaining"
        mock_get_client.return_value = mock_client

        result = _call("license.offline_status")
        assert "Offline grace" in result["offline_status"]

    @patch("avs_backend.licensing._get_client")
    def test_get_info(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.get_status.return_value = _make_status()
        mock_client.days_remaining.return_value = 30
        mock_client.remaining_devices.return_value = 2
        mock_client.offline_status.return_value = "Online"
        mock_client.server_url = "http://localhost:8000"
        mock_client.fingerprint = "abc123"
        mock_get_client.return_value = mock_client

        with patch.dict(os.environ, {"PRODUCT_CODE": "AVS_PC_OPTIMIZER", "APP_VERSION": "1.0.0"}):
            result = _call("license.get_info")
        assert result["status"]["status"] == "active"
        assert result["server_url"] == "http://localhost:8000"
        assert result["product_code"] == "AVS_PC_OPTIMIZER"


# ── Update Tests ─────────────────────────────────────────────


class TestLicenseUpdates:
    @patch("avs_backend.licensing._get_client")
    def test_check_updates(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.check_for_updates.return_value = _make_update_check()
        mock_get_client.return_value = mock_client

        result = _call("license.check_updates", {"channel": "stable"})
        assert result["update_available"] is True
        assert result["latest_version"] == "1.1.0"

    @patch("avs_backend.licensing._get_client")
    def test_check_updates_no_params(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.check_for_updates.return_value = _make_update_check()
        mock_get_client.return_value = mock_client

        result = _call("license.check_updates")
        assert result["update_available"] is True

    @patch("avs_backend.licensing._get_client")
    def test_download_update(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.download_update.return_value = "/tmp/avs_update_1.exe"
        mock_get_client.return_value = mock_client

        result = _call("license.download_update", {"release_id": 1})
        assert result["success"] is True
        assert result["file_path"] == "/tmp/avs_update_1.exe"

    @patch("avs_backend.licensing._get_client")
    def test_download_update_missing_id(self, mock_get_client):
        result = _call("license.download_update", None)
        assert result["success"] is False
        assert "Missing" in result["error"]

    @patch("avs_backend.licensing._get_client")
    def test_install_update(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.install_update.return_value = None
        mock_get_client.return_value = mock_client

        result = _call("license.install_update", {"file_path": "/tmp/avs_update_1.exe"})
        assert result["success"] is True

    @patch("avs_backend.licensing._get_client")
    def test_install_update_missing_path(self, mock_get_client):
        result = _call("license.install_update", None)
        assert result["success"] is False
        assert "Missing" in result["error"]


# ── Close Tests ──────────────────────────────────────────────


class TestLicenseClose:
    @patch("avs_backend.licensing._client")
    def test_close(self, mock_client):
        result = _call("license.close")
        assert result["success"] is True
        mock_client.close.assert_called_once()
