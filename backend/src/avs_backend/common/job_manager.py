"""Centralized Background Job Manager.

Every long-running task (junk scan, registry scan, disk analysis, duplicate
search, privacy scan, etc.) runs as a registered job.  The manager:

* Assigns a unique ``job_id`` and tracks status/progress.
* Runs each job on a dedicated worker pool so no job blocks another.
* Provides a unified ``job.status`` RPC for the frontend to poll.
* Supports cancellation via ``job.cancel``.
* Auto-cleans completed jobs after 10 minutes.

This replaces the ad-hoc per-module scan/cancel/status patterns with
a single, consistent lifecycle.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable

log = logging.getLogger("avs.jobs")

# Maximum concurrent jobs.  Each job is typically I/O-bound (filesystem
# scan, registry read) so threads release the GIL frequently.
_MAX_CONCURRENT_JOBS = 4

# Completed jobs are retained for 10 minutes so the UI can read final status.
_RETENTION_SECONDS = 600


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(slots=True)
class JobSnapshot:
    """Immutable view returned to the RPC layer."""

    job_id: str
    job_type: str
    status: JobStatus
    progress: int  # 0..100
    started_at: float
    finished_at: float | None
    result: dict[str, Any] | None
    error: str | None
    duration_ms: int
    eta_ms: int | None


@dataclass(slots=True)
class _Job:
    job_id: str
    job_type: str
    status: JobStatus = JobStatus.PENDING
    progress: int = 0
    started_at: float = 0.0
    finished_at: float | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    future: Future[dict[str, Any]] | None = None
    _last_progress_update: float = 0.0


class JobManager:
    """Thread-safe registry of background jobs."""

    def __init__(self, max_workers: int = _MAX_CONCURRENT_JOBS) -> None:
        self._pool = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="job-worker"
        )
        self._jobs: dict[str, _Job] = {}
        self._lock = threading.Lock()
        self._cleanup_timer: threading.Timer | None = None
        self._start_cleanup_loop()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def submit(
        self,
        job_type: str,
        fn: Callable[[threading.Event, Callable[[int], None]], dict[str, Any]],
    ) -> str:
        """Submit a job for background execution.

        ``fn`` receives:
          * A ``threading.Event`` that is set when the user requests cancellation.
          * A progress callback ``on_progress(percent: int)``.

        Returns the ``job_id`` immediately.
        """
        job_id = uuid.uuid4().hex[:12]
        job = _Job(
            job_id=job_id,
            job_type=job_type,
            status=JobStatus.PENDING,
            started_at=time.time(),
        )

        def on_progress(percent: int) -> None:
            job.progress = max(0, min(100, percent))

        def run() -> dict[str, Any]:
            job.status = JobStatus.RUNNING
            try:
                result = fn(job.cancel_event, on_progress)
                job.result = result
                job.status = JobStatus.CANCELLED if job.cancel_event.is_set() else JobStatus.COMPLETED
                return result
            except Exception as e:
                job.error = str(e)
                job.status = JobStatus.FAILED
                log.exception("Job %s (%s) failed", job_id, job_type)
                raise
            finally:
                job.finished_at = time.time()
                job.progress = 100

        with self._lock:
            self._jobs[job_id] = job
        job.future = self._pool.submit(run)
        log.info("Job %s (%s) submitted", job_id, job_type)
        return job_id

    def status(self, job_id: str) -> JobSnapshot | None:
        """Get an immutable snapshot of a job's state."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            return self._snapshot(job)

    def cancel(self, job_id: str) -> bool:
        """Request cancellation of a running job."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return False
            if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                return False
            job.cancel_event.set()
            return True

    def list_jobs(self, job_type: str | None = None) -> list[JobSnapshot]:
        """List all known jobs, optionally filtered by type."""
        with self._lock:
            jobs = list(self._jobs.values())
        snapshots = [self._snapshot(j) for j in jobs]
        if job_type:
            snapshots = [s for s in snapshots if s.job_type == job_type]
        return snapshots

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _snapshot(self, job: _Job) -> JobSnapshot:
        duration_ms = int((job.finished_at or time.time() - job.started_at) * 1000)
        eta_ms: int | None = None
        if job.status == JobStatus.RUNNING and job.progress > 0:
            elapsed = time.time() - job.started_at
            total_est = elapsed / (job.progress / 100.0)
            eta_ms = int((total_est - elapsed) * 1000)
        return JobSnapshot(
            job_id=job.job_id,
            job_type=job.job_type,
            status=job.status,
            progress=job.progress,
            started_at=job.started_at,
            finished_at=job.finished_at,
            result=job.result,
            error=job.error,
            duration_ms=duration_ms,
            eta_ms=eta_ms,
        )

    def _start_cleanup_loop(self) -> None:
        def cleanup() -> None:
            cutoff = time.time() - _RETENTION_SECONDS
            with self._lock:
                to_remove = [
                    jid for jid, j in self._jobs.items()
                    if j.finished_at is not None and j.finished_at < cutoff
                ]
                for jid in to_remove:
                    del self._jobs[jid]
            if to_remove:
                log.debug("Cleaned up %d completed jobs", len(to_remove))
            self._cleanup_timer = threading.Timer(60.0, cleanup)
            self._cleanup_timer.daemon = True
            self._cleanup_timer.start()

        self._cleanup_timer = threading.Timer(60.0, cleanup)
        self._cleanup_timer.daemon = True
        self._cleanup_timer.start()

    def shutdown(self) -> None:
        if self._cleanup_timer:
            self._cleanup_timer.cancel()
        self._pool.shutdown(wait=False, cancel_futures=True)


# Singleton
_job_manager: JobManager | None = None
_job_manager_lock = threading.Lock()


def get_job_manager() -> JobManager:
    global _job_manager
    if _job_manager is None:
        with _job_manager_lock:
            if _job_manager is None:
                _job_manager = JobManager()
    return _job_manager
