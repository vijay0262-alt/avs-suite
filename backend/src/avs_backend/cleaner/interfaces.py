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


class CleaningActionResult(str, Enum):
    """Terminal outcome of a cleaning operation for one cleaner or task."""

    SUCCESS = "success"          # every candidate removed
    PARTIAL = "partial"          # some files removed, some skipped/failed
    NOTHING_TO_DO = "nothing"    # empty candidate list
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


@dataclass(slots=True)
class ValidationIssue:
    """A single reason a candidate path was rejected during validation.

    Rejected paths are dropped from the deletion list; issues are still
    reported to the UI so users understand what will (and won't) happen.
    """

    path: str
    reason: str          # short machine key: 'symlink', 'forbidden', 'missing', 'out-of-scope'
    detail: str = ""     # human message


@dataclass(slots=True)
class CleaningPreview:
    """Per-cleaner preview returned by :meth:`ICleaner.validate`.

    ``candidates`` is the concrete list of paths that WILL be attempted
    at execute time (post-validation). ``warnings`` communicates issues
    the user should see (e.g., "12 files sit inside a symlinked folder
    and will be skipped").
    """

    cleaner_id: str
    name: str
    category: "CleanerCategory"
    candidate_paths: list[str] = field(default_factory=list)
    total_files: int = 0
    total_bytes: int = 0
    warnings: list[ValidationIssue] = field(default_factory=list)


@dataclass(slots=True)
class CleanedFile:
    """One successfully-deleted file record. Kept for the summary
    payload and history log (path-only; no content).
    """

    path: str
    size: int


@dataclass(slots=True)
class CleaningResult:
    """Result envelope returned by :meth:`ICleaner.clean`."""

    cleaner_id: str
    name: str
    category: "CleanerCategory"
    result: CleaningActionResult = CleaningActionResult.NOTHING_TO_DO
    files_removed: int = 0
    bytes_recovered: int = 0
    files_skipped: int = 0
    files_failed: int = 0
    errors: list[str] = field(default_factory=list)
    elapsed_ms: int = 0
    skip_reasons: dict[str, int] = field(default_factory=dict)  # Track why files were skipped
    failure_reasons: dict[str, int] = field(default_factory=dict)  # Track why files failed

    def to_summary(self) -> dict[str, object]:
        return {
            "id": self.cleaner_id,
            "name": self.name,
            "category": self.category.value,
            "result": self.result.value,
            "filesRemoved": self.files_removed,
            "bytesRecovered": self.bytes_recovered,
            "filesSkipped": self.files_skipped,
            "filesFailed": self.files_failed,
            "errors": list(self.errors),
            "elapsedMs": self.elapsed_ms,
            "skipReasons": dict(self.skip_reasons),
            "failureReasons": dict(self.failure_reasons),
        }


class ICleaner(ABC):
    """Common interface for every junk-scanning + cleaning module.

    Contract:

    * ``id``, ``name``, ``description``, ``category`` are metadata used
      by the UI. They must be pure-constant properties (no I/O).
    * ``scan(cancel_event, on_progress)`` must be non-blocking with
      respect to ``cancel_event`` — cleaners should check the event
      periodically (typically per directory) so users can abort.
    * ``scan`` must not raise. All exceptions must be captured into the
      returned :class:`CleanerResult.errors` list.
    * ``validate(paths)`` performs pre-flight safety checks against the
      given candidate paths and returns a :class:`CleaningPreview`
      with the sub-set that is safe to remove.
    * ``clean(paths, cancel_event, on_progress, on_file)`` executes the
      deletions. It must NEVER raise: every ``OSError`` is captured
      into :class:`CleaningResult.errors` and traversal continues.
    * ``rollback_supported()`` — future-proofing flag (all built-in
      cleaners return ``False`` today).
    """

    id: str
    name: str
    description: str
    category: CleanerCategory

    @abstractmethod
    def scan(self, cancel: Event, on_progress: ProgressCallback) -> CleanerResult:
        """Execute the scan and return the populated result."""

    @abstractmethod
    def validate(self, candidate_paths: list[str]) -> CleaningPreview:
        """Pre-flight — filter unsafe / stale candidates and preview."""

    @abstractmethod
    def clean(
        self,
        candidate_paths: list[str],
        cancel: Event,
        on_progress: ProgressCallback,
        on_file: "Callable[[str], None] | None" = None,
    ) -> CleaningResult:
        """Delete the given files. Never raises."""

    @abstractmethod
    def rollback_supported(self) -> bool:
        """Whether an undo of a completed ``clean`` is possible."""
