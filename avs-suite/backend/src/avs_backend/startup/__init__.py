"""Startup manager — scaffold only."""

from __future__ import annotations

from typing import Any

from avs_backend.api.registry import register
from avs_backend.common.errors import INTERNAL_ERROR, RpcError


@register("startup.list")
def startup_list(_params: dict[str, Any] | None) -> list[dict[str, Any]]:
    raise RpcError(INTERNAL_ERROR, "startup.list is not yet implemented in this build.")


@register("startup.toggle")
def startup_toggle(_params: dict[str, Any] | None) -> dict[str, Any]:
    raise RpcError(INTERNAL_ERROR, "startup.toggle is not yet implemented in this build.")
