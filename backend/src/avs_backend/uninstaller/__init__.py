"""Uninstaller — RPC handlers for listing and removing installed programs."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature
from avs_backend.uninstaller.program_manager import (
    list_programs,
    scan_leftovers,
    uninstall_program,
)

logger = logging.getLogger(__name__)


@register("uninstaller.list")
def uninstaller_list(params: dict[str, Any] | None) -> dict[str, Any]:
    """List installed programs."""
    try:
        include_system = bool(params.get("includeSystem")) if params else False
        programs = list_programs(include_system=include_system)
        return {
            "programs": [p.to_dict() for p in programs],
            "total": len(programs),
            "totalSizeBytes": sum(p.size_bytes for p in programs),
        }
    except Exception as e:  # noqa: BLE001
        logger.error("Uninstaller list failed: %s", e)
        raise


@register("uninstaller.uninstall")
@require_feature("uninstaller.uninstall")
def uninstaller_uninstall(params: dict[str, Any] | None) -> dict[str, Any]:
    """Launch a program's uninstaller."""
    # Accept either {"id": "SOURCE:subkey"} or {"program": {...}} — only the
    # registry-derived id is used; client-supplied fields are never trusted.
    program = (params or {}).get("program")
    program_id = (params or {}).get("id") or (
        program.get("id") if isinstance(program, dict) else None
    )
    if not program_id:
        raise ValueError("Missing 'id' parameter")
    try:
        quiet = bool((params or {}).get("quiet"))
        return uninstall_program(program_id, quiet=quiet)
    except Exception as e:  # noqa: BLE001
        logger.error("Uninstall failed: %s", e)
        raise


@register("uninstaller.scanLeftovers")
@require_feature("uninstaller.scanLeftovers")
def uninstaller_scan_leftovers(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan for leftover folders belonging to a program."""
    if not params or "program" not in params:
        raise ValueError("Missing 'program' parameter")
    try:
        return scan_leftovers(params["program"])
    except Exception as e:  # noqa: BLE001
        logger.error("Leftover scan failed: %s", e)
        raise
