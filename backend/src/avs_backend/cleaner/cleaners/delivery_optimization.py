"""Windows Delivery Optimization cache cleaner.

Delivery Optimization is Windows' peer-to-peer update delivery system.
It caches downloaded update chunks in ``%WINDIR%\\SoftwareDistribution\\DeliveryOptimization``.
Clearing this cache is safe — Windows re-downloads chunks if needed.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class DeliveryOptimizationCleaner(BaseCleaner):
    id = "delivery-optimization"
    name = "Delivery Optimization Cache"
    description = (
        "Windows Delivery Optimization peer-to-peer update cache — "
        "safe to clear, Windows re-downloads chunks as needed."
    )
    category = CleanerCategory.SYSTEM

    def targets(self) -> Iterable[Path]:
        candidates = [
            r"%WINDIR%\SoftwareDistribution\DeliveryOptimization",
            r"%LOCALAPPDATA%\Microsoft\Windows\DeliveryOptimization",
        ]
        roots: list[Path] = []
        for template in candidates:
            p = expand(template)
            if p.exists():
                roots.append(p)
        return roots
