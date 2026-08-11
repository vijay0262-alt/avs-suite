"""
Base Asset Adapter — SC-6B

Common interface for all asset adapters.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, TypeVar, Generic

from ..assets import ScanAsset, validate_asset, ValidationResult

T = TypeVar('T')


@dataclass
class AdapterStatistics:
    """Statistics for adapter conversions."""

    total_converted: int = 0
    total_failed: int = 0
    total_validated: int = 0
    total_validation_errors: int = 0

    def record_success(self) -> None:
        """Record a successful conversion."""
        self.total_converted += 1

    def record_failure(self) -> None:
        """Record a failed conversion."""
        self.total_failed += 1

    def record_validation(self, result: ValidationResult) -> None:
        """Record a validation result."""
        self.total_validated += 1
        if not result.is_valid:
            self.total_validation_errors += 1

    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        total = self.total_converted + self.total_failed
        if total == 0:
            return 0.0
        return self.total_converted / total

    @property
    def validation_success_rate(self) -> float:
        """Calculate validation success rate."""
        if self.total_validated == 0:
            return 0.0
        return (self.total_validated - self.total_validation_errors) / self.total_validated


class BaseAssetAdapter(ABC, Generic[T]):
    """
    Base class for all asset adapters.

    Adapters are pure translation components that convert
    existing Scan Core models into Universal ScanAsset instances.

    They NEVER:
    - Clean, repair, score, classify
    - Cache, optimize, verify
    - Modify source data

    They ONLY translate.
    """

    def __init__(self):
        self.statistics = AdapterStatistics()

    @abstractmethod
    def supports(self, obj: Any) -> bool:
        """
        Check if this adapter supports the given object type.

        Args:
            obj: Object to check

        Returns:
            True if this adapter can convert the object
        """
        pass

    @abstractmethod
    def convert(self, obj: T) -> ScanAsset:
        """
        Convert a source object to ScanAsset.

        Args:
            obj: Source object to convert

        Returns:
            Converted ScanAsset instance

        Raises:
            ValueError: If object type not supported
            TypeError: If object is invalid
        """
        pass

    def convert_many(self, objects: list[T]) -> list[ScanAsset]:
        """
        Convert multiple objects to ScanAssets.

        Args:
            objects: List of source objects

        Returns:
            List of converted ScanAsset instances
        """
        results = []
        for obj in objects:
            try:
                asset = self.convert(obj)
                results.append(asset)
                self.statistics.record_success()
            except (ValueError, TypeError) as e:
                self.statistics.record_failure()
                # Log error but continue processing
                continue
        return results

    def validate(self, asset: ScanAsset) -> ValidationResult:
        """
        Validate a converted ScanAsset.

        Args:
            asset: ScanAsset to validate

        Returns:
            ValidationResult with errors/warnings
        """
        result = validate_asset(asset)
        self.statistics.record_validation(result)
        return result

    def get_statistics(self) -> AdapterStatistics:
        """Get adapter statistics."""
        return self.statistics

    def reset_statistics(self) -> None:
        """Reset adapter statistics."""
        self.statistics = AdapterStatistics()
