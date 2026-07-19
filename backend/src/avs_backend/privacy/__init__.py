"""Privacy cleaner — clean privacy-related files and data."""

from __future__ import annotations

import logging
from threading import Event
from typing import Any

from avs_backend.api.registry import register
from avs_backend.privacy.privacy_cleaner import (
    PrivacyCategory,
    ScanResult,
    CleanResult,
    scan_privacy_items,
    clean_privacy_items,
)

logger = logging.getLogger(__name__)


@register("privacy.scan")
def privacy_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan for privacy items."""
    try:
        cancel = Event()

        # Get selected categories from params
        selected_categories = None
        if params and "categories" in params:
            selected_categories = {PrivacyCategory(cat) for cat in params["categories"]}

        result = scan_privacy_items(cancel, None, selected_categories)

        return {
            "items": [
                {
                    "category": item.category.value,
                    "path": item.path,
                    "size": item.size,
                    "description": item.description,
                    "safeToDelete": item.safe_to_delete,
                }
                for item in result.items
            ],
            "totalSize": result.total_size,
            "categoriesFound": [cat.value for cat in result.categories_found],
            "browsersDetected": [browser.value for browser in result.browsers_detected],
            "itemCount": len(result.items),
        }
    except Exception as e:
        logger.error(f"Privacy scan failed: {e}")
        raise


@register("privacy.clean")
def privacy_clean(params: dict[str, Any] | None) -> dict[str, Any]:
    """Clean privacy items."""
    try:
        from avs_backend.privacy.privacy_cleaner import PrivacyItem

        cancel = Event()

        # Get items to clean from params
        items_to_clean = []
        if params and "items" in params:
            items_to_clean = [
                PrivacyItem(
                    category=PrivacyCategory(item["category"]),
                    path=item["path"],
                    size=item["size"],
                    description=item["description"],
                    safe_to_delete=item.get("safeToDelete", True),
                )
                for item in params["items"]
            ]

        result = clean_privacy_items(items_to_clean, cancel, None)

        return {
            "status": result.status,
            "itemsCleaned": result.items_cleaned,
            "spaceFreed": result.space_freed,
            "categoriesCleaned": [cat.value for cat in result.categories_cleaned],
            "errors": result.errors,
            "durationMs": result.duration_ms,
        }
    except Exception as e:
        logger.error(f"Privacy clean failed: {e}")
        raise
