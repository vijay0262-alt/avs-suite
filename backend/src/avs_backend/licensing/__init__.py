"""License bridge module — exposes AVS License SDK via JSON-RPC handlers.

This module is the ONLY place in the AVS Suite backend that interacts with
the AVS License SDK. All license operations (activate, validate, refresh,
deactivate, status, updates) are routed through here.

The Electron main process calls these handlers via JSON-RPC over stdio.
The renderer never calls REST APIs directly — only through this bridge.
"""

from __future__ import annotations

import functools
import logging
import os
from typing import Any, Callable

from avs_backend.api import registry

log = logging.getLogger("avs_backend.licensing")

# ── Singleton LicenseClient ─────────────────────────────────

_client: Any = None  # LicenseClient instance, lazily initialized


def _get_client() -> Any:
    """Get or create the singleton LicenseClient."""
    global _client
    if _client is not None:
        return _client

    from avs_license_sdk import LicenseClient

    server_url = os.environ.get("LICENSE_SERVER_URL", "http://localhost:8000")
    product_code = os.environ.get("PRODUCT_CODE", "AVS_PC_OPTIMIZER")
    app_version = os.environ.get("APP_VERSION", "1.0.0")
    grace_days = int(os.environ.get("OFFLINE_GRACE_DAYS", "7"))
    refresh_hours = int(os.environ.get("REFRESH_INTERVAL_HOURS", "24"))
    log_level_str = os.environ.get("SDK_LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    _client = LicenseClient(
        server_url=server_url,
        product_code=product_code,
        app_version=app_version,
        grace_days=grace_days,
        refresh_interval_hours=refresh_hours,
        log_level=log_level,
    )
    log.info("LicenseClient initialized (server=%s, product=%s)", server_url, product_code)
    return _client


def _status_to_dict(status: Any) -> dict[str, Any]:
    """Convert a StatusResult to a JSON-serializable dict."""
    return {
        "status": status.status.value if hasattr(status.status, "value") else str(status.status),
        "edition": status.edition,
        "expiry": status.expiry.isoformat() if status.expiry else None,
        "grace_expiry": status.grace_expiry.isoformat() if status.grace_expiry else None,
        "days_remaining": status.days_remaining,
        "remaining_devices": status.remaining_devices,
        "last_validated": status.last_validated.isoformat() if status.last_validated else None,
        "is_offline": status.is_offline,
        "message": status.message,
    }


def _license_info_to_dict(info: Any) -> dict[str, Any]:
    """Convert a LicenseInfo to a JSON-serializable dict."""
    return {
        "license_key": info.license_key,
        "email": info.email,
        "device_fingerprint": info.device_fingerprint,
        "device_name": info.device_name,
        "edition": info.edition,
        "status": info.status,
        "expiry": info.expiry.isoformat() if info.expiry else None,
        "grace_expiry": info.grace_expiry.isoformat() if info.grace_expiry else None,
        "max_devices": info.max_devices,
        "active_devices": info.active_devices,
        "remaining_devices": info.remaining_devices,
        "last_validated": info.last_validated.isoformat() if info.last_validated else None,
        "last_refreshed": info.last_refreshed.isoformat() if info.last_refreshed else None,
        "activation_success": info.activation_success,
        "days_remaining": info.days_remaining(),
    }


def _update_check_to_dict(result: Any) -> dict[str, Any]:
    """Convert an UpdateCheckResult to a JSON-serializable dict."""
    return {
        "product_found": result.product_found,
        "product_name": result.product_name,
        "update_available": result.update_available,
        "force_upgrade": result.force_upgrade,
        "critical": result.critical,
        "latest_version": result.latest_version,
        "current_version": result.current_version,
        "download_url": result.download_url,
        "sha256": result.sha256,
        "release_notes": result.release_notes,
        "file_size": result.file_size,
        "channel": result.channel,
        "architecture": result.architecture,
        "release_id": result.release_id,
    }


def _error_response(exc: Exception) -> dict[str, Any]:
    """Convert an SDK exception to a JSON-RPC error payload."""
    error_code = getattr(exc, "error_code", "UNKNOWN")
    return {
        "success": False,
        "error": str(exc),
        "error_code": error_code,
    }


# ── RPC Handlers ────────────────────────────────────────────


@registry.register("license.startup")
def license_startup(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Perform startup sequence: load local license, validate or check grace.

    If no license exists and the server is reachable, automatically register
    this installation to create a Free license. This only happens once —
    subsequent startups reuse the stored license.
    """
    try:
        client = _get_client()
        status = client.startup()

        # Auto-register Free license on first install if no license exists.
        # The SDK's startup() returns status='free' when no local license is stored.
        # We attempt to register with the server to create a permanent Free license.
        if status.status.value == "free" or (hasattr(status, 'is_offline') and status.is_offline is False and status.edition == "free"):
            try:
                # Attempt auto-registration — the SDK checks if a device already
                # has a license before creating a new one, so this is idempotent.
                auto_status = client.auto_register_free()
                if auto_status is not None:
                    log.info("Auto-registered Free license for device %s", client.fingerprint)
                    return _status_to_dict(auto_status)
            except AttributeError:
                # SDK doesn't support auto_register_free yet — continue with free status
                log.debug("SDK does not support auto_register_free — continuing in free mode")
            except Exception as reg_err:
                # Registration failed (server unreachable, already exists, etc.)
                # Continue with free status — the app still works in Free mode.
                log.debug("Auto Free license registration failed: %s", reg_err)

        return _status_to_dict(status)
    except Exception as exc:
        log.error("License startup failed: %s", exc)
        return _error_response(exc)


@registry.register("license.activate")
def license_activate(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Activate a license with a key and email."""
    if not params:
        return {"success": False, "error": "Missing parameters"}
    try:
        client = _get_client()
        info = client.activate(
            license_key=params["license_key"],
            email=params["email"],
            device_name=params.get("device_name"),
            app_version=params.get("app_version"),
        )
        return {
            "success": True,
            "license": _license_info_to_dict(info),
        }
    except Exception as exc:
        log.error("Activation failed: %s", exc)
        return _error_response(exc)


@registry.register("license.validate")
def license_validate(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Validate the current license online."""
    try:
        client = _get_client()
        status = client.validate()
        return _status_to_dict(status)
    except Exception as exc:
        log.error("Validation failed: %s", exc)
        return _error_response(exc)


@registry.register("license.refresh")
def license_refresh(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Refresh license information from the server."""
    try:
        client = _get_client()
        info = client.refresh()
        return {
            "success": True,
            "license": _license_info_to_dict(info),
        }
    except Exception as exc:
        log.error("Refresh failed: %s", exc)
        return _error_response(exc)


@registry.register("license.deactivate")
def license_deactivate(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Deactivate the license on this device."""
    try:
        client = _get_client()
        success = client.deactivate()
        return {"success": success}
    except Exception as exc:
        log.error("Deactivation failed: %s", exc)
        return _error_response(exc)


@registry.register("license.get_status")
def license_get_status(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get the current license status (online or offline grace)."""
    try:
        client = _get_client()
        status = client.get_status()
        return _status_to_dict(status)
    except Exception as exc:
        log.error("Get status failed: %s", exc)
        return _error_response(exc)


@registry.register("license.is_licensed")
def license_is_licensed(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Check if the license is currently active."""
    try:
        client = _get_client()
        return {"licensed": client.is_licensed()}
    except Exception as exc:
        log.error("is_licensed failed: %s", exc)
        return {"licensed": False, "error": str(exc)}


@registry.register("license.days_remaining")
def license_days_remaining(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return days remaining until license expiry."""
    try:
        client = _get_client()
        return {"days_remaining": client.days_remaining()}
    except Exception as exc:
        return {"days_remaining": None, "error": str(exc)}


@registry.register("license.remaining_devices")
def license_remaining_devices(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return the number of additional devices that can be activated."""
    try:
        client = _get_client()
        return {"remaining_devices": client.remaining_devices()}
    except Exception as exc:
        return {"remaining_devices": 0, "error": str(exc)}


@registry.register("license.offline_status")
def license_offline_status(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return a human-readable offline status description."""
    try:
        client = _get_client()
        return {"offline_status": client.offline_status()}
    except Exception as exc:
        return {"offline_status": "No license found", "error": str(exc)}


@registry.register("license.get_info")
def license_get_info(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get detailed license info (for About window and diagnostics)."""
    try:
        client = _get_client()
        status = client.get_status()
        days = client.days_remaining()
        remaining = client.remaining_devices()
        offline = client.offline_status()
        return {
            "status": _status_to_dict(status),
            "days_remaining": days,
            "remaining_devices": remaining,
            "offline_status": offline,
            "server_url": client.server_url,
            "fingerprint": client.fingerprint,
            "sdk_version": _get_sdk_version(),
            "product_code": os.environ.get("PRODUCT_CODE", "AVS_PC_OPTIMIZER"),
            "app_version": os.environ.get("APP_VERSION", "1.0.0"),
        }
    except Exception as exc:
        log.error("Get info failed: %s", exc)
        return _error_response(exc)


@registry.register("license.check_updates")
def license_check_updates(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Check if a newer version is available on the server."""
    try:
        client = _get_client()
        channel = (params or {}).get("channel", os.environ.get("UPDATE_CHANNEL", "stable"))
        architecture = (params or {}).get("architecture", "x64")
        result = client.check_for_updates(channel=channel, architecture=architecture)
        return _update_check_to_dict(result)
    except Exception as exc:
        log.error("Check updates failed: %s", exc)
        return _error_response(exc)


@registry.register("license.download_update")
def license_download_update(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Download an update installer."""
    if not params or "release_id" not in params:
        return {"success": False, "error": "Missing release_id"}
    try:
        client = _get_client()
        dest_path = client.download_update(
            release_id=int(params["release_id"]),
            dest_path=params.get("dest_path"),
            verify_sha256=params.get("verify_sha256", True),
        )
        return {"success": True, "file_path": dest_path}
    except Exception as exc:
        log.error("Download update failed: %s", exc)
        return _error_response(exc)


@registry.register("license.install_update")
def license_install_update(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Launch the installer to install an update."""
    if not params or "file_path" not in params:
        return {"success": False, "error": "Missing file_path"}
    try:
        client = _get_client()
        client.install_update(
            file_path=params["file_path"],
            silent=params.get("silent", False),
        )
        return {"success": True}
    except Exception as exc:
        log.error("Install update failed: %s", exc)
        return _error_response(exc)


@registry.register("license.close")
def license_close(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Clean up SDK resources (stop auto-refresh, close HTTP client)."""
    global _client
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
        _client = None
    return {"success": True}


# ── Backend Edition Guard ─────────────────────────────────────

# Maps RPC method names to the minimum edition required to execute them.
# This mirrors the frontend FeatureGate / FEATURE_MAP so that locked
# modules cannot be bypassed by calling the RPC directly.
_FEATURE_EDITION_RANK: dict[str, int] = {
    "free": 0,
    "professional": 1,
    "ultimate": 2,
    "trial": 2,  # trial has access to everything
}

# RPC methods that require a minimum edition.
# Format: { "rpc.method.name": "minimum_edition" }
_LOCKED_RPC_METHODS: dict[str, str] = {
    "registry.clean": "professional",
    "privacy.clean": "professional",
    "startup.disable": "professional",
    "startup.enable": "professional",
    "duplicate.delete": "professional",
    "updater.upgrade": "professional",
    "updater.upgradeAll": "ultimate",
    "performance.optimize": "professional",
}


def _get_current_edition() -> str:
    """Get the current license edition from the SDK client.

    Returns 'free' if the SDK is unavailable or no license is active.
    """
    try:
        client = _get_client()
        status = client.get_status()
        edition = status.edition.lower() if status.edition else "free"
        # If license is expired/invalid, downgrade to free
        status_value = status.status.value if hasattr(status.status, "value") else str(status.status)
        if status_value in ("expired", "invalid", "revoked"):
            return "free"
        if edition not in _FEATURE_EDITION_RANK:
            return "free"
        return edition
    except Exception:
        return "free"


def require_feature(rpc_method: str) -> Callable:
    """Decorator: enforce edition restrictions on an RPC handler.

    If the current license edition doesn't meet the minimum required
    edition for the given RPC method, return an error response instead
    of executing the handler.

    Usage:
        @register("registry.clean")
        @require_feature("registry.clean")
        def registry_clean(params): ...
    """

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(params: dict[str, Any] | None = None) -> Any:
            required_edition = _LOCKED_RPC_METHODS.get(rpc_method)
            if required_edition is not None:
                current_edition = _get_current_edition()
                if _FEATURE_EDITION_RANK.get(current_edition, 0) < _FEATURE_EDITION_RANK.get(required_edition, 0):
                    log.warning(
                        "RPC %s blocked: edition '%s' requires '%s'",
                        rpc_method, current_edition, required_edition,
                    )
                    return {
                        "success": False,
                        "error": f"This feature requires {required_edition.title()} edition. Please upgrade to use it.",
                        "error_code": "EDITION_LOCKED",
                        "required_edition": required_edition,
                        "current_edition": current_edition,
                    }
            return fn(params)

        return wrapper

    return decorator


def _get_sdk_version() -> str:
    """Get the SDK version string."""
    try:
        from avs_license_sdk import __version__
        return __version__
    except Exception:
        return "unknown"
