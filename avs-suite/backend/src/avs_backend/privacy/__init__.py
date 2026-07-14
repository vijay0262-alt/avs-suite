"""Privacy cleaner — scaffold only."""

from __future__ import annotations

from typing import Any

from avs_backend.api.registry import register
from avs_backend.common.errors import INTERNAL_ERROR, RpcError


@register("privacy.scan")
def privacy_scan(_params: dict[str, Any] | None) -> dict[str, Any]:
    raise RpcError(INTERNAL_ERROR, "privacy.scan is not yet implemented in this build.")


@register("privacy.clean")
def privacy_clean(_params: dict[str, Any] | None) -> dict[str, Any]:
    raise RpcError(INTERNAL_ERROR, "privacy.clean is not yet implemented in this build.")
