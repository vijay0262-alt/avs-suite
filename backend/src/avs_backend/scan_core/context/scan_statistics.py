"""
Scan Statistics — SC-6C

Performance metrics for scan execution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class EnumeratorTiming:
    """Timing statistics for a single enumerator."""
    
    enumerator_name: str
    duration_ms: int
    assets_discovered: int
    assets_failed: int
    assets_skipped: int
    
    @property
    def assets_per_second(self) -> float:
        """Calculate assets discovered per second."""
        if self.duration_ms == 0:
            return 0.0
        return (self.assets_discovered / self.duration_ms) * 1000.0


@dataclass
class AdapterTiming:
    """Timing statistics for a single adapter."""
    
    adapter_name: str
    duration_ms: int
    assets_converted: int
    assets_failed: int
    
    @property
    def assets_per_second(self) -> float:
        """Calculate assets converted per second."""
        if self.duration_ms == 0:
            return 0.0
        return (self.assets_converted / self.duration_ms) * 1000.0


@dataclass
class ScanStatistics:
    """
    Performance metrics for scan execution.
    
    Tracks enumerator and adapter performance.
    """
    
    # Overall metrics
    total_assets_discovered: int = 0
    total_assets_converted: int = 0
    total_assets_skipped: int = 0
    total_assets_failed: int = 0
    total_assets_deferred: int = 0
    total_bytes_discovered: int = 0
    
    # Timing
    scan_duration_ms: int = 0
    enumeration_duration_ms: int = 0
    conversion_duration_ms: int = 0
    
    # Detailed timings
    enumerator_timings: list[EnumeratorTiming] = field(default_factory=list)
    adapter_timings: list[AdapterTiming] = field(default_factory=list)
    
    # Schema versioning
    schema_version: int = 1
    
    @property
    def total_duration_seconds(self) -> float:
        """Get total scan duration in seconds."""
        return self.scan_duration_ms / 1000.0
    
    @property
    def assets_per_second(self) -> float:
        """Calculate overall assets discovered per second."""
        if self.scan_duration_ms == 0:
            return 0.0
        return (self.total_assets_discovered / self.scan_duration_ms) * 1000.0
    
    @property
    def conversion_rate(self) -> float:
        """Calculate conversion success rate."""
        total = self.total_assets_converted + self.total_assets_failed
        if total == 0:
            return 0.0
        return self.total_assets_converted / total
    
    @property
    def success_rate(self) -> float:
        """Calculate overall success rate."""
        total = self.total_assets_discovered + self.total_assets_failed
        if total == 0:
            return 0.0
        return self.total_assets_discovered / total
    
    def add_enumerator_timing(self, timing: EnumeratorTiming) -> None:
        """Add enumerator timing."""
        self.enumerator_timings.append(timing)
        self.total_assets_discovered += timing.assets_discovered
        self.total_assets_failed += timing.assets_failed
        self.total_assets_skipped += timing.assets_skipped
        self.enumeration_duration_ms += timing.duration_ms
    
    def add_adapter_timing(self, timing: AdapterTiming) -> None:
        """Add adapter timing."""
        self.adapter_timings.append(timing)
        self.total_assets_converted += timing.assets_converted
        self.conversion_duration_ms += timing.duration_ms
    
    def record_asset_discovered(self, size: Optional[int] = None) -> None:
        """Record a discovered asset."""
        self.total_assets_discovered += 1
        if size is not None:
            self.total_bytes_discovered += size
    
    def record_asset_failed(self) -> None:
        """Record a failed asset."""
        self.total_assets_failed += 1
    
    def record_asset_skipped(self) -> None:
        """Record a skipped asset."""
        self.total_assets_skipped += 1
    
    def record_asset_deferred(self) -> None:
        """Record a deferred asset."""
        self.total_assets_deferred += 1
    
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        return {
            "schema_version": self.schema_version,
            "total_assets_discovered": self.total_assets_discovered,
            "total_assets_converted": self.total_assets_converted,
            "total_assets_skipped": self.total_assets_skipped,
            "total_assets_failed": self.total_assets_failed,
            "total_assets_deferred": self.total_assets_deferred,
            "total_bytes_discovered": self.total_bytes_discovered,
            "scan_duration_ms": self.scan_duration_ms,
            "enumeration_duration_ms": self.enumeration_duration_ms,
            "conversion_duration_ms": self.conversion_duration_ms,
            "enumerator_timings": [
                {
                    "enumerator_name": t.enumerator_name,
                    "duration_ms": t.duration_ms,
                    "assets_discovered": t.assets_discovered,
                    "assets_failed": t.assets_failed,
                    "assets_skipped": t.assets_skipped,
                }
                for t in self.enumerator_timings
            ],
            "adapter_timings": [
                {
                    "adapter_name": t.adapter_name,
                    "duration_ms": t.duration_ms,
                    "assets_converted": t.assets_converted,
                    "assets_failed": t.assets_failed,
                }
                for t in self.adapter_timings
            ],
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> ScanStatistics:
        """Deserialize from dictionary."""
        stats = cls(
            total_assets_discovered=data.get("total_assets_discovered", 0),
            total_assets_converted=data.get("total_assets_converted", 0),
            total_assets_skipped=data.get("total_assets_skipped", 0),
            total_assets_failed=data.get("total_assets_failed", 0),
            total_assets_deferred=data.get("total_assets_deferred", 0),
            total_bytes_discovered=data.get("total_bytes_discovered", 0),
            scan_duration_ms=data.get("scan_duration_ms", 0),
            enumeration_duration_ms=data.get("enumeration_duration_ms", 0),
            conversion_duration_ms=data.get("conversion_duration_ms", 0),
            schema_version=data.get("schema_version", 1),
        )
        
        # Restore enumerator timings
        for t_data in data.get("enumerator_timings", []):
            timing = EnumeratorTiming(
                enumerator_name=t_data["enumerator_name"],
                duration_ms=t_data["duration_ms"],
                assets_discovered=t_data["assets_discovered"],
                assets_failed=t_data["assets_failed"],
                assets_skipped=t_data["assets_skipped"],
            )
            stats.enumerator_timings.append(timing)
        
        # Restore adapter timings
        for t_data in data.get("adapter_timings", []):
            timing = AdapterTiming(
                adapter_name=t_data["adapter_name"],
                duration_ms=t_data["duration_ms"],
                assets_converted=t_data["assets_converted"],
                assets_failed=t_data["assets_failed"],
            )
            stats.adapter_timings.append(timing)
        
        return stats
