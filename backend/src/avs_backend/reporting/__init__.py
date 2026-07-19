"""Reporting — Generate optimization reports."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.reporting.report_generator import (
    ReportData,
    generate_report,
    generate_html_report,
    generate_text_report,
)

logger = logging.getLogger(__name__)


@register("reporting.generate")
def reporting_generate(params: dict[str, Any] | None) -> dict[str, Any]:
    """Generate optimization report."""
    try:
        if not params:
            raise ValueError("Missing required parameters")

        health_score = params.get("healthScore", 0)
        health_status = params.get("healthStatus", "unknown")
        optimizations = params.get("optimizations", [])
        total_space_saved = params.get("totalSpaceSaved", 0)
        total_memory_freed = params.get("totalMemoryFreed", 0)
        startup_changes = params.get("startupChanges", [])
        privacy_items_cleaned = params.get("privacyItemsCleaned", 0)
        duration_ms = params.get("durationMs", 0)
        warnings = params.get("warnings", [])
        errors = params.get("errors", [])

        data = generate_report(
            health_score=health_score,
            health_status=health_status,
            optimizations=optimizations,
            total_space_saved=total_space_saved,
            total_memory_freed=total_memory_freed,
            startup_changes=startup_changes,
            privacy_items_cleaned=privacy_items_cleaned,
            duration_ms=duration_ms,
            warnings=warnings,
            errors=errors,
        )

        return {
            "systemInfo": data.system_info,
            "healthScore": data.health_score,
            "healthStatus": data.health_status,
            "totalSpaceSaved": data.total_space_saved,
            "totalMemoryFreed": data.total_memory_freed,
            "privacyItemsCleaned": data.privacy_items_cleaned,
            "durationMs": data.duration_ms,
            "generatedAt": data.generated_at,
        }
    except Exception as e:
        logger.error(f"Failed to generate report data: {e}")
        raise


@register("reporting.export.html")
def reporting_export_html(params: dict[str, Any] | None) -> dict[str, Any]:
    """Generate and export HTML report."""
    try:
        if not params:
            raise ValueError("Missing required parameters")

        health_score = params.get("healthScore", 0)
        health_status = params.get("healthStatus", "unknown")
        optimizations = params.get("optimizations", [])
        total_space_saved = params.get("totalSpaceSaved", 0)
        total_memory_freed = params.get("totalMemoryFreed", 0)
        startup_changes = params.get("startupChanges", [])
        privacy_items_cleaned = params.get("privacyItemsCleaned", 0)
        duration_ms = params.get("durationMs", 0)
        warnings = params.get("warnings", [])
        errors = params.get("errors", [])

        data = generate_report(
            health_score=health_score,
            health_status=health_status,
            optimizations=optimizations,
            total_space_saved=total_space_saved,
            total_memory_freed=total_memory_freed,
            startup_changes=startup_changes,
            privacy_items_cleaned=privacy_items_cleaned,
            duration_ms=duration_ms,
            warnings=warnings,
            errors=errors,
        )

        html = generate_html_report(data)

        return {
            "html": html,
            "generatedAt": data.generated_at,
        }
    except Exception as e:
        logger.error(f"Failed to generate HTML report: {e}")
        raise


@register("reporting.export.text")
def reporting_export_text(params: dict[str, Any] | None) -> dict[str, Any]:
    """Generate and export text report."""
    try:
        if not params:
            raise ValueError("Missing required parameters")

        health_score = params.get("healthScore", 0)
        health_status = params.get("healthStatus", "unknown")
        optimizations = params.get("optimizations", [])
        total_space_saved = params.get("totalSpaceSaved", 0)
        total_memory_freed = params.get("totalMemoryFreed", 0)
        startup_changes = params.get("startupChanges", [])
        privacy_items_cleaned = params.get("privacyItemsCleaned", 0)
        duration_ms = params.get("durationMs", 0)
        warnings = params.get("warnings", [])
        errors = params.get("errors", [])

        data = generate_report(
            health_score=health_score,
            health_status=health_status,
            optimizations=optimizations,
            total_space_saved=total_space_saved,
            total_memory_freed=total_memory_freed,
            startup_changes=startup_changes,
            privacy_items_cleaned=privacy_items_cleaned,
            duration_ms=duration_ms,
            warnings=warnings,
            errors=errors,
        )

        text = generate_text_report(data)

        return {
            "text": text,
            "generatedAt": data.generated_at,
        }
    except Exception as e:
        logger.error(f"Failed to generate text report: {e}")
        raise
