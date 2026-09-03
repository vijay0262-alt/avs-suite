"""RPC handlers for System Restore Point operations.

Methods:
  * ``restore.create``  — Create a System Restore Point.
  * ``restore.status``  — Check if System Protection is enabled.
"""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register

from . import create_restore_point, is_system_protection_enabled

log = logging.getLogger("avs.system-restore.rpc")


@register("restore.create")
def _restore_create(params: dict[str, Any] | None) -> dict[str, Any]:
    """Create a System Restore Point.

    Parameters:
      description (str, optional): Description for the restore point.
          Defaults to "AVS AI Shield — Pre-cleaning checkpoint".
    """
    description = "AVS AI Shield — Pre-cleaning checkpoint"
    if params and isinstance(params.get("description"), str):
        description = params["description"]

    result = create_restore_point(description)
    return {
        "success": result.success,
        "description": result.description,
        "sequenceNumber": result.sequence_number,
        "error": result.error,
    }


@register("restore.status")
def _restore_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Check if System Protection is enabled on the system drive."""
    enabled = is_system_protection_enabled()
    return {"enabled": enabled}
