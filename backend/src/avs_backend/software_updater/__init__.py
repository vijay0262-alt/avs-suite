"""Software Updater — RPC handlers for detecting and applying app updates."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.software_updater.update_manager import (
    list_upgrades,
    upgrade_all,
    upgrade_package,
    winget_available,
)

logger = logging.getLogger(__name__)


@register("updater.available")
def updater_available(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Report whether the update backend (winget) is available."""
    return {"available": winget_available()}


@register("updater.list")
def updater_list(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List applications with available updates."""
    try:
        return list_upgrades()
    except Exception as e:  # noqa: BLE001
        logger.error("Updater list failed: %s", e)
        raise


@register("updater.upgrade")
def updater_upgrade(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update a single package by id."""
    if not params or "packageId" not in params:
        raise ValueError("Missing 'packageId' parameter")
    try:
        return upgrade_package(params["packageId"])
    except Exception as e:  # noqa: BLE001
        logger.error("Updater upgrade failed: %s", e)
        raise


@register("updater.upgradeAll")
def updater_upgrade_all(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Update all packages with available upgrades."""
    try:
        return upgrade_all()
    except Exception as e:  # noqa: BLE001
        logger.error("Updater upgrade-all failed: %s", e)
        raise
