"""Duplicate finder — scaffold only."""

from __future__ import annotations

from typing import Any

from avs_backend.api.registry import register
from avs_backend.common.errors import INTERNAL_ERROR, RpcError


@register("duplicate.scan")
def duplicate_scan(_params: dict[str, Any] | None) -> dict[str, Any]:
    raise RpcError(INTERNAL_ERROR, "duplicate.scan is not yet implemented in this build.")
