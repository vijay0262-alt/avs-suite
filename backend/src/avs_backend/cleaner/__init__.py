"""Junk-cleaner RPC surface — scan + safe-clean.

Method map (kept in sync with ``packages/shared/src/rpc/index.ts``):

Scan lifecycle (existing):

* ``cleaner.list``         → catalog of available cleaners.
* ``cleaner.scan.start``   → start a new scan; returns ``{ taskId }``.
* ``cleaner.scan.status``  → progress snapshot for ``taskId``.
* ``cleaner.scan.cancel``  → co-operative cancellation.
* ``cleaner.scan.results`` → paged details for a single cleaner.

Cleaning lifecycle (new):

* ``cleaner.clean.preview``  → per-cleaner preview + warnings.
* ``cleaner.clean.execute``  → start a cleaning task; ``{ cleaningTaskId }``.
* ``cleaner.clean.status``   → progress snapshot for a cleaning task.
* ``cleaner.clean.logs``     → paged, searchable cleaning history.

Handlers are thin — they translate JSON parameters into calls on the
scan / cleaning / history singletons and serialise the responses.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from avs_backend.api.registry import register
from avs_backend.common.errors import INVALID_PARAMS, RpcError

from .cleaners import all_cleaners
from .cleaning_manager import CleaningManager
from .history_store import HistoryStore, default_history_path
from .interfaces import ScanStatus
from .scan_manager import ScanManager

log = logging.getLogger("avs.cleaner.rpc")

# ---------------------------------------------------------------------
# Singletons — the manager pair owns thread pools and shared state.
# ---------------------------------------------------------------------
_cleaners = all_cleaners()
_cleaner_by_id = {c.id: c for c in _cleaners}

_scan_manager = ScanManager(cleaners=_cleaners)
_history = HistoryStore(default_history_path())
_cleaning_manager = CleaningManager(
    scan_manager=_scan_manager, cleaner_by_id=_cleaner_by_id, history_store=_history
)


def _need_str(params: dict[str, Any] | None, key: str) -> str:
    if not params or not isinstance(params.get(key), str):
        raise RpcError(INVALID_PARAMS, f"Missing string parameter: {key}")
    return params[key]


def _optional_str_list(params: dict[str, Any] | None, key: str) -> list[str] | None:
    if not params or key not in params:
        return None
    raw = params[key]
    if raw is None:
        return None
    if not isinstance(raw, list):
        raise RpcError(INVALID_PARAMS, f"Parameter {key} must be an array of strings")
    return [str(x) for x in raw]


# =====================================================================
# Scan lifecycle
# =====================================================================


@register("cleaner.list")
def cleaner_list(_params: dict[str, Any] | None) -> list[dict[str, str]]:
    log.info("[RPC] cleaner.list called")
    start = time.monotonic()
    result = _scan_manager.list_cleaners()
    log.info("[RPC] cleaner.list completed in %.2fs", time.monotonic() - start)
    return result


@register("cleaner.scan.start")
def cleaner_scan_start(params: dict[str, Any] | None) -> dict[str, str]:
    log.info("[RPC] cleaner.scan.start called with params: %s", params)
    start = time.monotonic()
    only = _optional_str_list(params, "only")
    task_id = _scan_manager.start(only=only)
    log.info("[RPC] cleaner.scan.start completed in %.2fs, taskId=%s", time.monotonic() - start, task_id)
    return {"taskId": task_id}


@register("cleaner.scan.status")
def cleaner_scan_status(params: dict[str, Any] | None) -> dict[str, Any]:
    task_id = params.get("taskId") if params else None
    log.debug("[RPC] cleaner.scan.status called for taskId=%s", task_id)
    snap = _scan_manager.snapshot(task_id if isinstance(task_id, str) else None)
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
    log.info("[RPC] cleaner.scan.cancel called for taskId=%s", task_id)
    result = {"cancelled": _scan_manager.cancel(task_id)}
    log.info("[RPC] cleaner.scan.cancel completed: %s", result)
    return result


@register("cleaner.scan.refreshCache")
def cleaner_scan_refresh_cache(_params: dict[str, Any] | None) -> dict[str, bool]:
    """Invalidate the scan cache so the next scan performs a fresh pass."""
    log.info("[RPC] cleaner.scan.refreshCache called")
    _scan_manager.invalidate_cache()
    return {"refreshed": True}


@register("cleaner.scan.results")
def cleaner_scan_results(params: dict[str, Any] | None) -> dict[str, Any]:
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
    log.debug("[RPC] cleaner.scan.results called for taskId=%s, cleanerId=%s, offset=%d, limit=%d", task_id, cleaner_id, offset, limit)
    return {
        "offset": offset,
        "limit": limit,
        "items": _scan_manager.items_page(task_id, cleaner_id, offset, limit),
    }


# =====================================================================
# Cleaning lifecycle
# =====================================================================


@register("cleaner.clean.preview")
def cleaner_clean_preview(params: dict[str, Any] | None) -> dict[str, Any]:
    """Validate scan results and return per-cleaner previews."""
    scan_task_id = _need_str(params, "taskId")
    only = _optional_str_list(params, "only")
    log.info("[RPC] cleaner.clean.preview called for taskId=%s, only=%s", scan_task_id, only)
    start = time.monotonic()
    
    previews = _cleaning_manager.preview(scan_task_id, only)

    total_files = sum(p.total_files for p in previews)
    total_bytes = sum(p.total_bytes for p in previews)
    warning_count = sum(len(p.warnings) for p in previews)

    result = {
        "totalFiles": total_files,
        "totalBytes": total_bytes,
        "warningCount": warning_count,
        "cleaners": [
            {
                "id": p.cleaner_id,
                "name": p.name,
                "category": p.category.value,
                "totalFiles": p.total_files,
                "totalBytes": p.total_bytes,
                "warnings": [
                    {"path": w.path, "reason": w.reason, "detail": w.detail}
                    for w in p.warnings[:100]  # cap so payload stays bounded
                ],
                "warningCount": len(p.warnings),
            }
            for p in previews
        ],
    }
    log.info("[RPC] cleaner.clean.preview completed in %.2fs, totalFiles=%d, totalBytes=%d", 
             time.monotonic() - start, total_files, total_bytes)
    return result


@register("cleaner.clean.execute")
def cleaner_clean_execute(params: dict[str, Any] | None) -> dict[str, str]:
    scan_task_id = _need_str(params, "taskId")
    only = _optional_str_list(params, "only")
    log.info("[RPC] cleaner.clean.execute called for taskId=%s, only=%s", scan_task_id, only)
    start = time.monotonic()
    try:
        cleaning_task_id = _cleaning_manager.execute(scan_task_id, only)
    except ValueError as e:
        log.error("[RPC] cleaner.clean.execute failed with ValueError: %s", e)
        raise RpcError(INVALID_PARAMS, str(e)) from e
    log.info("[RPC] cleaner.clean.execute completed in %.2fs, cleaningTaskId=%s", 
             time.monotonic() - start, cleaning_task_id)
    return {"cleaningTaskId": cleaning_task_id}


@register("cleaner.clean.status")
def cleaner_clean_status(params: dict[str, Any] | None) -> dict[str, Any]:
    task_id = params.get("cleaningTaskId") if params else None
    log.debug("[RPC] cleaner.clean.status called for cleaningTaskId=%s", task_id)
    snap = _cleaning_manager.snapshot(task_id if isinstance(task_id, str) else None)
    if snap is None:
        return {"present": False}
    return {
        "present": True,
        "cleaningTaskId": snap.task_id,
        "scanTaskId": snap.scan_task_id,
        "status": snap.status.value,
        "startedAt": snap.started_at,
        "finishedAt": snap.finished_at,
        "progress": snap.progress,
        "currentCleaner": snap.current_cleaner,
        "currentFile": snap.current_file,
        "cleaners": snap.cleaners,
        "totalFilesRemoved": snap.total_files_removed,
        "totalBytesRecovered": snap.total_bytes_recovered,
        "totalFilesSkipped": snap.total_files_skipped,
        "totalFilesFailed": snap.total_files_failed,
        "durationMs": snap.duration_ms,
        "etaMs": snap.eta_ms,
    }


@register("cleaner.clean.cancel")
def cleaner_clean_cancel(params: dict[str, Any] | None) -> dict[str, bool]:
    """Cancel a running cleaning task (co-operative)."""
    cleaning_task_id = _need_str(params, "cleaningTaskId")
    log.info("[RPC] cleaner.clean.cancel called for cleaningTaskId=%s", cleaning_task_id)
    result = {"cancelled": _cleaning_manager.cancel(cleaning_task_id)}
    log.info("[RPC] cleaner.clean.cancel completed: %s", result)
    return result


@register("cleaner.clean.logs")
def cleaner_clean_logs(params: dict[str, Any] | None) -> dict[str, Any]:
    """Paged, searchable cleaning history."""
    p = params or {}
    query = p.get("query") if isinstance(p.get("query"), str) else None
    category = p.get("category") if isinstance(p.get("category"), str) else None
    result = p.get("result") if isinstance(p.get("result"), str) else None
    offset = int(p.get("offset", 0) or 0)
    limit = int(p.get("limit", 100) or 100)
    if offset < 0:
        offset = 0
    if limit <= 0:
        limit = 1
    if limit > 500:
        limit = 500

    log.debug("[RPC] cleaner.clean.logs called with query=%s, category=%s, result=%s, offset=%d, limit=%d",
              query, category, result, offset, limit)
    
    entries = _cleaning_manager.history(
        query=query, category=category, result=result, offset=offset, limit=limit
    )
    total = _history.count(search=query, category=category, result=result)
    return {"total": total, "offset": offset, "limit": limit, "entries": entries}


@register("cleaner.clean.undo")
def cleaner_clean_undo(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Undo the last cleaning operation by restoring from Recycle Bin."""
    log.info("[RPC] cleaner.clean.undo called")
    start = time.monotonic()
    result = _cleaning_manager.undo_last_clean()
    log.info("[RPC] cleaner.clean.undo completed in %.2fs, success=%s", time.monotonic() - start, result.get("success"))
    return result


__all__ = [
    "_scan_manager",
    "_cleaning_manager",
    "_history",
    "ScanStatus",
]
