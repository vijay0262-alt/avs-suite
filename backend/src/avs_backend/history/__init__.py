"""Optimization History — Track all optimization operations."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.history.history_manager import (
    ModuleType,
    OptimizationType,
    OperationResult,
    HistoryEntry,
    add_history_entry,
    get_history,
    get_history_entry,
    get_history_statistics,
    delete_history_entry,
    clear_all_history,
    export_history_to_csv,
    search_history,
)

logger = logging.getLogger(__name__)


@register("history.list")
def history_list(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get history entries with optional filtering."""
    try:
        limit = params.get("limit", 100) if params else 100
        offset = params.get("offset", 0) if params else 0

        module = None
        if params and "module" in params:
            module = ModuleType(params["module"])

        result = None
        if params and "result" in params:
            result = OperationResult(params["result"])

        date_from = params.get("dateFrom") if params else None
        date_to = params.get("dateTo") if params else None

        entries = get_history(
            limit=limit,
            offset=offset,
            module=module,
            result=result,
            date_from=date_from,
            date_to=date_to,
        )

        return {
            "entries": [
                {
                    "id": entry.id,
                    "date": entry.date,
                    "time": entry.time,
                    "module": entry.module.value,
                    "optimizationType": entry.optimization_type.value,
                    "filesDeleted": entry.files_deleted,
                    "spaceSaved": entry.space_saved,
                    "memoryFreed": entry.memory_freed,
                    "durationMs": entry.duration_ms,
                    "result": entry.result.value,
                    "warnings": entry.warnings,
                    "errors": entry.errors,
                    "details": entry.details,
                }
                for entry in entries
            ],
            "count": len(entries),
        }
    except Exception as e:
        logger.error(f"Failed to get history: {e}")
        raise


@register("history.get")
def history_get(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get a specific history entry by ID."""
    try:
        if not params or "id" not in params:
            raise ValueError("Missing required parameter: id")

        entry_id = params["id"]
        entry = get_history_entry(entry_id)

        if not entry:
            return {"error": "Entry not found"}

        return {
            "id": entry.id,
            "date": entry.date,
            "time": entry.time,
            "module": entry.module.value,
            "optimizationType": entry.optimization_type.value,
            "filesDeleted": entry.files_deleted,
            "spaceSaved": entry.space_saved,
            "memoryFreed": entry.memory_freed,
            "durationMs": entry.duration_ms,
            "result": entry.result.value,
            "warnings": entry.warnings,
            "errors": entry.errors,
            "details": entry.details,
        }
    except Exception as e:
        logger.error(f"Failed to get history entry: {e}")
        raise


@register("history.statistics")
def history_statistics(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get overall history statistics."""
    try:
        stats = get_history_statistics()
        return stats
    except Exception as e:
        logger.error(f"Failed to get history statistics: {e}")
        raise


@register("history.delete")
def history_delete(params: dict[str, Any] | None) -> dict[str, Any]:
    """Delete a specific history entry."""
    try:
        if not params or "id" not in params:
            raise ValueError("Missing required parameter: id")

        entry_id = params["id"]
        success = delete_history_entry(entry_id)

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to delete history entry: {e}")
        raise


@register("history.clear")
def history_clear(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all history entries."""
    try:
        success = clear_all_history()
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to clear history: {e}")
        raise


@register("history.export")
def history_export(params: dict[str, Any] | None) -> dict[str, Any]:
    """Export history to CSV file."""
    try:
        if not params or "path" not in params:
            raise ValueError("Missing required parameter: path")

        output_path = params["path"]
        success = export_history_to_csv(output_path)

        return {"success": success, "path": output_path}
    except Exception as e:
        logger.error(f"Failed to export history: {e}")
        raise


@register("history.search")
def history_search(params: dict[str, Any] | None) -> dict[str, Any]:
    """Search history entries by query."""
    try:
        if not params or "query" not in params:
            raise ValueError("Missing required parameter: query")

        query = params["query"]
        entries = search_history(query)

        return {
            "entries": [
                {
                    "id": entry.id,
                    "date": entry.date,
                    "time": entry.time,
                    "module": entry.module.value,
                    "optimizationType": entry.optimization_type.value,
                    "filesDeleted": entry.files_deleted,
                    "spaceSaved": entry.space_saved,
                    "memoryFreed": entry.memory_freed,
                    "durationMs": entry.duration_ms,
                    "result": entry.result.value,
                    "warnings": entry.warnings,
                    "errors": entry.errors,
                    "details": entry.details,
                }
                for entry in entries
            ],
            "count": len(entries),
        }
    except Exception as e:
        logger.error(f"Failed to search history: {e}")
        raise
