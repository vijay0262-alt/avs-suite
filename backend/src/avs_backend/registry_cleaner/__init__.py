"""Registry Cleaner — RPC handlers for scan/clean/backup/restore."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.registry_cleaner.registry_scanner import (
    CATEGORIES,
    RegistryIssue,
    fix_issues,
    list_backups,
    restore_backup,
    scan_registry,
)

logger = logging.getLogger(__name__)


@register("registry.categories")
def registry_categories(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List the categories the registry scanner supports."""
    return {
        "categories": [
            {"id": cid, "name": name} for cid, name in CATEGORIES.items()
        ]
    }


@register("registry.scan")
def registry_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan the registry for invalid entries."""
    try:
        categories = params.get("categories") if params else None
        result = scan_registry(categories)
        return {
            "issues": [issue.to_dict() for issue in result.issues],
            "totalIssues": result.total,
            "categoryBreakdown": result.breakdown(),
        }
    except Exception as e:  # noqa: BLE001
        logger.error("Registry scan failed: %s", e)
        raise


@register("registry.clean")
def registry_clean(params: dict[str, Any] | None) -> dict[str, Any]:
    """Back up and remove the selected invalid registry entries."""
    if not params or "issues" not in params:
        raise ValueError("Missing 'issues' parameter")
    try:
        issues = [RegistryIssue.from_dict(d) for d in params["issues"]]

        # Enforce Free edition limit: max 20 issues per scan
        from avs_backend.licensing import get_edition_limit

        limit = get_edition_limit("registry.issues_per_run")
        if limit is not None and len(issues) > limit:
            logger.warning(
                "Registry clean blocked: %d issues exceed Free limit of %d",
                len(issues), limit,
            )
            return {
                "fixed": 0,
                "failed": 0,
                "backupId": None,
                "errors": [
                    f"Free edition repairs up to {limit} issues per scan. "
                    f"Upgrade to Professional for unlimited repairs."
                ],
                "limitExceeded": True,
                "limit": limit,
            }

        return fix_issues(issues)
    except Exception as e:  # noqa: BLE001
        logger.error("Registry clean failed: %s", e)
        raise


@register("registry.backups")
def registry_backups(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List available registry backups."""
    return {"backups": list_backups()}


@register("registry.restore")
def registry_restore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Restore a previous registry backup."""
    if not params or "backupId" not in params:
        raise ValueError("Missing 'backupId' parameter")
    try:
        return restore_backup(params["backupId"])
    except Exception as e:  # noqa: BLE001
        logger.error("Registry restore failed: %s", e)
        raise
