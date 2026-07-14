"""Performance tuning presets — scaffold only."""

from __future__ import annotations

from typing import Any

from avs_backend.api.registry import register
from avs_backend.common.errors import INTERNAL_ERROR, RpcError


@register("performance.apply")
def performance_apply(_params: dict[str, Any] | None) -> dict[str, Any]:
    raise RpcError(INTERNAL_ERROR, "performance.apply is not yet implemented in this build.")
