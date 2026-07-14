"""Junk cleaner module — scaffold only.

Public RPC surface:

* ``cleaner.scan``  → returns categorised junk-file candidates.
* ``cleaner.clean`` → deletes selected candidates and returns freed bytes.

The Windows-specific enumeration (Temp folders, browser caches, Windows
Update leftovers, Recycle Bin) will be added in a subsequent step under
``rules/`` inside this package.
"""

from __future__ import annotations

from typing import Any

from avs_backend.api.registry import register
from avs_backend.common.errors import INTERNAL_ERROR, RpcError


@register("cleaner.scan")
def cleaner_scan(_params: dict[str, Any] | None) -> dict[str, Any]:
    raise RpcError(INTERNAL_ERROR, "cleaner.scan is not yet implemented in this build.")


@register("cleaner.clean")
def cleaner_clean(_params: dict[str, Any] | None) -> dict[str, Any]:
    raise RpcError(INTERNAL_ERROR, "cleaner.clean is not yet implemented in this build.")
