"""Junk-cleaner RPC surface.

Method map (kept in sync with ``packages/shared/src/rpc/index.ts``):

* ``cleaner.list``         → catalog of available cleaners.
* ``cleaner.scan.start``   → start a new scan; returns ``{ taskId }``.
* ``cleaner.scan.status``  → progress snapshot for ``taskId``.
* ``cleaner.scan.cancel``  → co-operative cancellation.
* ``cleaner.scan.results`` → paged details for a single cleaner (used
                             by the "View details" table).

Handlers are thin — they translate JSON parameters into ScanManager
calls and serialise the returned :class:`ScanSnapshot`.
"""

from __future__ import annotations

from typing import Any

from avs_backend.api.registry import register
from avs_backend.common.errors import INVALID_PARAMS, RpcError

from .cleaners import all_cleaners
from .interfaces import ScanStatus
from .scan_manager import ScanManager

# Singleton — the scan manager owns a ThreadPoolExecutor and per-task
# state. One instance for the life of the backend process.
_manager = ScanManager(cleaners=all_cleaners())


def _need_str(params: dict[str, Any] | None, key: str) -> str:
    if not params or not isinstance(params.get(key), str):
        raise RpcError(INVALID_PARAMS, f"Missing string parameter: {key}")
    return params[key]


@register("cleaner.list")
def cleaner_list(_params: dict[str, Any] | None) -> list[dict[str, str]]:
    """Return the metadata catalog of every registered cleaner."""
    return _manager.list_cleaners()


@register("cleaner.scan.start")
def cleaner_scan_start(params: dict[str, Any] | None) -> dict[str, str]:
    """Start a new scan. Optional ``only`` param filters cleaner IDs."""
    only = None
    if params and isinstance(params.get("only"), list):
        only = [str(x) for x in params["only"]]
    task_id = _manager.start(only=only)
    return {"taskId": task_id}


@register("cleaner.scan.status")
def cleaner_scan_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Snapshot of the current scan. ``taskId`` is optional; when
    omitted the most recent scan is returned."""
    task_id = params.get("taskId") if params else None
    snap = _manager.snapshot(task_id if isinstance(task_id, str) else None)
    if snap is None:
        return {"present": False}
    return {
        "present": True,
        "taskId": snap.task_id,
        "status": snap.status.value,
        "startedAt": snap.started_at,
        "finishedAt": snap.finished_at,
        "progress": snap.progress,
        "currentCleaner": snap.current_cleaner,
        "cleaners": snap.cleaners,
        "totalFiles": snap.total_files,
        "totalBytes": snap.total_bytes,
        "errorCount": snap.error_count,
        "durationMs": snap.duration_ms,
        "etaMs": snap.eta_ms,
    }


@register("cleaner.scan.cancel")
def cleaner_scan_cancel(params: dict[str, Any] | None) -> dict[str, bool]:
    task_id = _need_str(params, "taskId")
    return {"cancelled": _manager.cancel(task_id)}


@register("cleaner.scan.results")
def cleaner_scan_results(params: dict[str, Any] | None) -> dict[str, Any]:
    """Paged details for a single cleaner. Params:

    * ``taskId``    — required
    * ``cleanerId`` — required
    * ``offset``    — default 0
    * ``limit``     — default 500 (max 5000)
    """
    task_id = _need_str(params, "taskId")
    cleaner_id = _need_str(params, "cleanerId")
    offset = int((params or {}).get("offset", 0) or 0)
    limit = int((params or {}).get("limit", 500) or 500)
    if offset < 0:
        offset = 0
    if limit <= 0:
        limit = 1
    if limit > 5000:
        limit = 5000
    return {
        "offset": offset,
        "limit": limit,
        "items": _manager.items_page(task_id, cleaner_id, offset, limit),
    }


# Exposed for tests.
__all__ = ["_manager", "ScanStatus"]
