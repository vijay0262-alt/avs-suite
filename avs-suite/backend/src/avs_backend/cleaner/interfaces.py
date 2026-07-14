"""Public contracts for the Junk Cleaner engine.

Every concrete cleaner (WindowsTempCleaner, BrowserCacheCleaner, ...)
implements :class:`ICleaner`. The :class:`ScanManager` orchestrates a
set of ICleaners; the JSON-RPC layer never talks to concrete classes
directly, only to the manager and these interfaces.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from threading import Event
from typing import Callable


class ScanStatus(str, Enum):
    """Lifecycle states for a cleaner or a whole scan."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class CleanerCategory(str, Enum):
    """Broad classification used by the UI for grouping and iconography."""

    SYSTEM = "system"
    USER = "user"
    APPLICATIONS = "applications"
    BROWSERS = "browsers"
    LOGS = "logs"


@dataclass(slots=True)
class ScanItem:
    """Single file discovered by a cleaner.

    ``modified_at`` is a POSIX timestamp (seconds since epoch) so it
    serialises trivially over JSON-RPC.
    """

    path: str
    name: str
    extension: str
    size: int
    modified_at: float


@dataclass(slots=True)
class CleanerResult:
    """Result envelope returned by :meth:`ICleaner.scan`."""

    cleaner_id: str
    name: str
    description: str
    category: CleanerCategory
    status: ScanStatus = ScanStatus.PENDING
    total_files: int = 0
    total_bytes: int = 0
    errors: list[str] = field(default_factory=list)
    elapsed_ms: int = 0
    items: list[ScanItem] = field(default_factory=list)

    def to_summary(self) -> dict[str, object]:
        """UI-friendly dictionary excluding the (potentially huge) items list."""
        return {
            "id": self.cleaner_id,
            "name": self.name,
            "description": self.description,
            "category": self.category.value,
            "status": self.status.value,
            "totalFiles": self.total_files,
            "totalBytes": self.total_bytes,
            "errors": list(self.errors),
            "elapsedMs": self.elapsed_ms,
        }

    def to_items_page(self, offset: int, limit: int) -> list[dict[str, object]]:
        """Serialised slice of :attr:`items` for the details table."""
        end = min(len(self.items), offset + limit)
        return [
            {
                "path": it.path,
                "name": it.name,
                "extension": it.extension,
                "size": it.size,
                "modifiedAt": it.modified_at,
                "category": self.category.value,
                "cleanerId": self.cleaner_id,
            }
            for it in self.items[offset:end]
        ]


# A per-cleaner progress callback. The manager passes an int in
# ``0..100`` and the cleaner may call it multiple times during a scan.
ProgressCallback = Callable[[int], None]


class ICleaner(ABC):
    """Common interface for every junk-scanning module.

    Contract:

    * ``id``, ``name``, ``description``, ``category`` are metadata used
      by the UI. They must be pure-constant properties (no I/O).
    * ``scan(cancel_event, on_progress)`` must be non-blocking with
      respect to ``cancel_event`` — cleaners should check the event
      periodically (typically per directory) so users can abort.
    * ``scan`` must not raise. All exceptions must be captured into the
      returned :class:`CleanerResult.errors` list.
    """

    id: str
    name: str
    description: str
    category: CleanerCategory

    @abstractmethod
    def scan(self, cancel: Event, on_progress: ProgressCallback) -> CleanerResult:
        """Execute the scan and return the populated result."""
