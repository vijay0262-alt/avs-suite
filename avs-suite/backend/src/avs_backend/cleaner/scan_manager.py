"""ScanManager — orchestrates a parallel scan across all registered cleaners.

Responsibilities:

* Own the pool of ``ICleaner`` instances.
* Run cleaners **in parallel** using a ``ThreadPoolExecutor`` (I/O-bound
  work — GIL not a bottleneck).
* Emit incremental progress: each cleaner's individual 0..100 progress
  is combined into a whole-scan average.
* Support cancellation: a shared ``threading.Event`` is set from
  ``cancel()``; every cleaner polls it periodically.
* Track state per ``taskId`` so multiple concurrent scans from the
  renderer are impossible by construction (a second start replaces the
  first, cancelling the previous one).
* Expose immutable snapshots via :meth:`snapshot` — safe to serialise
  from the RPC thread while cleaners are running.

The manager itself is thread-safe. RPC handlers call it from the main
JSON-RPC thread; cleaners run on the pool.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field

from .interfaces import CleanerResult, ICleaner, ScanStatus

log = logging.getLogger("avs.cleaner.manager")


@dataclass(slots=True)
class _CleanerRuntime:
    """Per-cleaner runtime state held during a scan."""

    cleaner: ICleaner
    progress: int = 0
    future: Future[CleanerResult] | None = None
    result: CleanerResult | None = None


@dataclass(slots=True)
class ScanSnapshot:
    """Immutable view returned to the RPC layer."""

    task_id: str
    status: ScanStatus
    started_at: float
    finished_at: float | None
    progress: int
    current_cleaner: str | None
    cleaners: list[dict[str, object]]
    total_files: int
    total_bytes: int
    error_count: int
    duration_ms: int
    eta_ms: int | None


@dataclass(slots=True)
class _Task:
    task_id: str
    started_at: float
    finished_at: float | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    runtimes: list[_CleanerRuntime] = field(default_factory=list)
    status: ScanStatus = ScanStatus.PENDING


class ScanManager:
    """Thread-safe orchestrator. Instantiated once per backend process."""

    # Cap parallelism. Most cleaners are single-root, small trees, so
    # 4 workers is a good balance between throughput and I/O contention
    # (a spinning disk with more workers will thrash).
    DEFAULT_MAX_WORKERS = 4

    def __init__(self, cleaners: list[ICleaner], max_workers: int | None = None) -> None:
        self._cleaners = list(cleaners)
        self._max_workers = max_workers or self.DEFAULT_MAX_WORKERS
        self._lock = threading.RLock()
        self._task: _Task | None = None
        self._pool = ThreadPoolExecutor(
            max_workers=self._max_workers, thread_name_prefix="avs-cleaner"
        )

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------
    def list_cleaners(self) -> list[dict[str, str]]:
        return [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "category": c.category.value,
            }
            for c in self._cleaners
        ]

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def start(self, only: list[str] | None = None) -> str:
        """Start a new scan. Cancels any in-flight scan first.

        ``only`` — optional list of cleaner IDs to include; ``None``
        runs every registered cleaner.
        """
        with self._lock:
            if self._task is not None and self._task.status == ScanStatus.RUNNING:
                self._task.cancel_event.set()
                log.info("Superseding running scan %s", self._task.task_id)

            selected = self._cleaners if only is None else [c for c in self._cleaners if c.id in only]
            if not selected:
                raise ValueError("No cleaners selected for scan")

            task = _Task(
                task_id=uuid.uuid4().hex,
                started_at=time.monotonic(),
                status=ScanStatus.RUNNING,
            )
            task.runtimes = [_CleanerRuntime(cleaner=c) for c in selected]
            self._task = task

        # Submit outside the lock to avoid holding it during executor
        # bookkeeping.
        for rt in task.runtimes:
            rt.future = self._pool.submit(self._run_cleaner, task, rt)

        log.info(
            "Scan %s started with %d cleaner(s): %s",
            task.task_id,
            len(task.runtimes),
            ",".join(rt.cleaner.id for rt in task.runtimes),
        )
        return task.task_id

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            if self._task is None or self._task.task_id != task_id:
                return False
            if self._task.status != ScanStatus.RUNNING:
                return False
            self._task.cancel_event.set()
            log.info("Cancellation requested for scan %s", task_id)
            return True

    def shutdown(self) -> None:
        with self._lock:
            if self._task and self._task.status == ScanStatus.RUNNING:
                self._task.cancel_event.set()
        self._pool.shutdown(wait=False, cancel_futures=True)

    # ------------------------------------------------------------------
    # Snapshots / results
    # ------------------------------------------------------------------
    def snapshot(self, task_id: str | None = None) -> ScanSnapshot | None:
        with self._lock:
            task = self._task
            if task is None:
                return None
            if task_id is not None and task.task_id != task_id:
                return None

            # Roll up completions into task status.
            self._roll_up(task)

            progresses = [rt.progress for rt in task.runtimes] or [0]
            avg_progress = int(sum(progresses) / len(progresses))

            current = next(
                (
                    rt.cleaner.name
                    for rt in task.runtimes
                    if rt.future is not None and not rt.future.done()
                ),
                None,
            )

            total_files = sum((rt.result.total_files if rt.result else 0) for rt in task.runtimes)
            total_bytes = sum((rt.result.total_bytes if rt.result else 0) for rt in task.runtimes)
            error_count = sum(len(rt.result.errors) if rt.result else 0 for rt in task.runtimes)

            duration_ms = int(
                ((task.finished_at or time.monotonic()) - task.started_at) * 1000
            )
            eta_ms = self._estimate_eta(task, avg_progress, duration_ms)

            cleaner_dicts = [
                (rt.result.to_summary() if rt.result else self._pending_summary(rt))
                for rt in task.runtimes
            ]
            # Attach the running progress percentage so the UI can show
            # per-cleaner bars even before completion.
            for rt, d in zip(task.runtimes, cleaner_dicts, strict=True):
                d.setdefault("progress", rt.progress)

            return ScanSnapshot(
                task_id=task.task_id,
                status=task.status,
                started_at=task.started_at,
                finished_at=task.finished_at,
                progress=avg_progress,
                current_cleaner=current,
                cleaners=cleaner_dicts,
                total_files=total_files,
                total_bytes=total_bytes,
                error_count=error_count,
                duration_ms=duration_ms,
                eta_ms=eta_ms,
            )

    def items_page(
        self, task_id: str, cleaner_id: str, offset: int, limit: int
    ) -> list[dict[str, object]]:
        """Serialised slice of a single cleaner's results (for the details table)."""
        with self._lock:
            task = self._task
            if task is None or task.task_id != task_id:
                return []
            for rt in task.runtimes:
                if rt.cleaner.id == cleaner_id and rt.result is not None:
                    return rt.result.to_items_page(offset, limit)
            return []

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------
    def _run_cleaner(self, task: _Task, rt: _CleanerRuntime) -> CleanerResult:
        def on_progress(pct: int) -> None:
            if pct < 0:
                pct = 0
            elif pct > 100:
                pct = 100
            # No lock — int assignment is atomic under CPython.
            rt.progress = pct

        try:
            result = rt.cleaner.scan(task.cancel_event, on_progress)
        except Exception as e:  # noqa: BLE001 — engine safety net
            log.exception("Cleaner %s crashed", rt.cleaner.id)
            result = CleanerResult(
                cleaner_id=rt.cleaner.id,
                name=rt.cleaner.name,
                description=rt.cleaner.description,
                category=rt.cleaner.category,
                status=ScanStatus.FAILED,
                errors=[f"crash: {e}"],
            )
        rt.result = result
        rt.progress = 100
        return result

    def _roll_up(self, task: _Task) -> None:
        if task.status != ScanStatus.RUNNING:
            return
        all_done = all(rt.future is not None and rt.future.done() for rt in task.runtimes)
        if not all_done:
            return
        task.finished_at = time.monotonic()
        if task.cancel_event.is_set():
            task.status = ScanStatus.CANCELLED
        elif any(rt.result and rt.result.status == ScanStatus.FAILED for rt in task.runtimes):
            task.status = ScanStatus.FAILED
        else:
            task.status = ScanStatus.COMPLETED

    def _estimate_eta(self, task: _Task, avg_progress: int, elapsed_ms: int) -> int | None:
        if task.status != ScanStatus.RUNNING:
            return None
        if avg_progress <= 0:
            return None
        # Linear extrapolation is imperfect but good enough for a UI
        # tick. Once we have enough progress (>5%) it is reasonably
        # accurate for I/O-bound work.
        if avg_progress < 5:
            return None
        remaining = int((elapsed_ms / avg_progress) * (100 - avg_progress))
        return max(0, remaining)

    def _pending_summary(self, rt: _CleanerRuntime) -> dict[str, object]:
        return {
            "id": rt.cleaner.id,
            "name": rt.cleaner.name,
            "description": rt.cleaner.description,
            "category": rt.cleaner.category.value,
            "status": ScanStatus.PENDING.value,
            "totalFiles": 0,
            "totalBytes": 0,
            "errors": [],
            "elapsedMs": 0,
        }
