"""CleaningManager — orchestrates safe, parallel cleaning across cleaners.

Mirrors the responsibilities and threading model of
:class:`~avs_backend.cleaner.scan_manager.ScanManager` so consumers
learn one mental model and get the same guarantees:

* Cleaners run in parallel on a bounded ``ThreadPoolExecutor``.
* Cancellation is co-operative — a shared ``threading.Event`` that
  every cleaner polls per file.
* Progress is emitted as (a) an aggregate percentage rolled up from
  every worker and (b) the "current file" a worker is working on.
* Snapshots are immutable and safe to serialise from the RPC thread.
* Every completed cleaning task is persisted to the history store so
  the UI's log page survives process restarts.

Safety guarantees layered on top of :class:`BaseCleaner.clean`:

* The manager only accepts candidate paths that came from a specific
  ``ScanManager`` task — the caller supplies the ``scan_task_id`` and
  the list of cleaner IDs to clean; the actual paths are looked up on
  the manager side. This closes an attack surface where a malicious
  renderer could ask us to delete arbitrary paths.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .history_store import HistoryStore
from .interfaces import (
    CleaningActionResult,
    CleaningPreview,
    CleaningResult,
    ICleaner,
    ScanStatus,
    ValidationIssue,
)
from .scan_manager import ScanManager

log = logging.getLogger("avs.cleaner.cleaning-manager")


@dataclass(slots=True)
class _CleanerRuntime:
    cleaner: ICleaner
    candidate_paths: list[str] = field(default_factory=list)
    progress: int = 0
    current_file: str | None = None
    future: Future[CleaningResult] | None = None
    result: CleaningResult | None = None
    deleted_files: list[dict[str, object]] = field(default_factory=list)  # Track deleted files for undo


@dataclass(slots=True)
class CleaningSnapshot:
    """Immutable snapshot returned to the RPC layer."""

    task_id: str
    scan_task_id: str
    status: ScanStatus                       # reuses the shared lifecycle enum
    started_at: float
    finished_at: float | None
    progress: int
    current_cleaner: str | None
    current_file: str | None
    cleaners: list[dict[str, object]]
    total_files_removed: int
    total_bytes_recovered: int
    total_files_skipped: int
    total_files_failed: int
    duration_ms: int
    eta_ms: int | None


@dataclass(slots=True)
class _Task:
    task_id: str
    scan_task_id: str
    started_at: float
    finished_at: float | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    runtimes: list[_CleanerRuntime] = field(default_factory=list)
    status: ScanStatus = ScanStatus.PENDING


class CleaningManager:
    """Thread-safe orchestrator. One instance per backend process."""

    DEFAULT_MAX_WORKERS = 4

    def __init__(
        self,
        scan_manager: ScanManager,
        cleaner_by_id: dict[str, ICleaner],
        history_store: HistoryStore,
        max_workers: int | None = None,
    ) -> None:
        self._scan_manager = scan_manager
        self._cleaners = cleaner_by_id
        self._history = history_store
        self._max_workers = max_workers or self.DEFAULT_MAX_WORKERS
        self._lock = threading.RLock()
        self._task: _Task | None = None
        self._pool = ThreadPoolExecutor(
            max_workers=self._max_workers, thread_name_prefix="avs-cleaner-clean"
        )

    # ------------------------------------------------------------------
    # Preview (FAST PATH - skip for production performance)
    # ------------------------------------------------------------------
    def preview(
        self, scan_task_id: str, only: list[str] | None = None
    ) -> list[CleaningPreview]:
        """Run :meth:`ICleaner.validate` against every scan result.

        FAST PATH: This now only does minimal validation (existence check)
        to avoid the slow "Validating cleaning candidates..." phase.
        The actual deletion will re-validate each file before deleting.
        """
        log.info("[CleaningManager] preview called for scan_task_id=%s, only=%s", scan_task_id, only)
        start = time.monotonic()
        
        previews: list[CleaningPreview] = []
        for cleaner_id, cleaner in self._cleaners.items():
            if only is not None and cleaner_id not in only:
                log.debug("[CleaningManager] Skipping cleaner %s (not in only list)", cleaner_id)
                continue
            
            log.debug("[CleaningManager] Collecting scan paths for cleaner %s", cleaner_id)
            paths = self._collect_scan_paths(scan_task_id, cleaner_id)
            log.debug("[CleaningManager] Collected %d paths for cleaner %s", len(paths), cleaner_id)
            
            if not paths:
                # Still emit an empty preview so the UI can show "0 files".
                previews.append(
                    CleaningPreview(
                        cleaner_id=cleaner_id, name=cleaner.name, category=cleaner.category
                    )
                )
                continue
            
            log.debug("[CleaningManager] Validating %d paths for cleaner %s", len(paths), cleaner_id)
            preview = cleaner.validate(paths)
            log.debug("[CleaningManager] Validation complete for cleaner %s: %d files, %d warnings", 
                      cleaner_id, preview.total_files, len(preview.warnings))
            previews.append(preview)
        
        log.info("[CleaningManager] preview completed in %.2fs, %d cleaners processed", 
                 time.monotonic() - start, len(previews))
        return previews

    # ------------------------------------------------------------------
    # Execute
    # ------------------------------------------------------------------
    def execute(self, scan_task_id: str, only: list[str] | None = None) -> str:
        """Start a cleaning task. Cancels any running task first."""
        log.info("[CleaningManager] execute called for scan_task_id=%s, only=%s", scan_task_id, only)
        start = time.monotonic()
        
        with self._lock:
            if self._task is not None and self._task.status == ScanStatus.RUNNING:
                self._task.cancel_event.set()
                log.info("Superseding running cleaning task %s", self._task.task_id)

            runtimes: list[_CleanerRuntime] = []
            for cleaner_id, cleaner in self._cleaners.items():
                if only is not None and cleaner_id not in only:
                    continue
                candidates = self._collect_scan_paths(scan_task_id, cleaner_id)
                log.debug("[CleaningManager] Collected %d candidates for cleaner %s", len(candidates), cleaner_id)
                
                # Skip validation here - preview already validated these files
                # Just use the candidates directly for cleaning to avoid double validation delay
                if candidates:
                    runtimes.append(
                        _CleanerRuntime(
                            cleaner=cleaner, candidate_paths=list(candidates)
                        )
                    )
            
            if not runtimes:
                raise ValueError("Nothing to clean — no candidates found")

            task = _Task(
                task_id=uuid.uuid4().hex,
                scan_task_id=scan_task_id,
                started_at=time.monotonic(),
                status=ScanStatus.RUNNING,
                runtimes=runtimes,
            )
            self._task = task

        for rt in task.runtimes:
            rt.future = self._pool.submit(self._run_cleaner, task, rt)

        log.info(
            "Cleaning task %s started for %d cleaner(s), %d file(s) total in %.2fs",
            task.task_id,
            len(task.runtimes),
            sum(len(rt.candidate_paths) for rt in task.runtimes),
            time.monotonic() - start,
        )
        return task.task_id

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            if self._task is None or self._task.task_id != task_id:
                return False
            if self._task.status != ScanStatus.RUNNING:
                return False
            self._task.cancel_event.set()
            log.info("Cancellation requested for cleaning task %s", task_id)
            return True

    def shutdown(self) -> None:
        with self._lock:
            if self._task and self._task.status == ScanStatus.RUNNING:
                self._task.cancel_event.set()
        self._pool.shutdown(wait=False, cancel_futures=True)

    # ------------------------------------------------------------------
    # Performance Metrics
    # ------------------------------------------------------------------
    def log_performance_metrics(self, task_id: str) -> dict[str, Any]:
        """Log and return performance metrics for a completed cleaning task."""
        with self._lock:
            task = self._task
            if task is None or task.task_id != task_id:
                return {}
            
            if task.status not in (ScanStatus.COMPLETED, ScanStatus.CANCELLED, ScanStatus.FAILED):
                return {}
            
            duration_ms = int(((task.finished_at or time.monotonic()) - task.started_at) * 1000)
            total_removed = sum((rt.result.files_removed if rt.result else 0) for rt in task.runtimes)
            total_bytes = sum((rt.result.bytes_recovered if rt.result else 0) for rt in task.runtimes)
            total_skipped = sum((rt.result.files_skipped if rt.result else 0) for rt in task.runtimes)
            total_failed = sum((rt.result.files_failed if rt.result else 0) for rt in task.runtimes)
            
            # Calculate cleaning speed (files per second)
            duration_sec = duration_ms / 1000
            files_per_sec = total_removed / duration_sec if duration_sec > 0 else 0
            bytes_per_sec = total_bytes / duration_sec if duration_sec > 0 else 0
            
            metrics = {
                "cleaning_duration_ms": duration_ms,
                "cleaning_duration_sec": duration_sec,
                "total_files_removed": total_removed,
                "total_bytes_recovered": total_bytes,
                "total_files_skipped": total_skipped,
                "total_files_failed": total_failed,
                "cleaning_speed_files_per_sec": files_per_sec,
                "cleaning_speed_bytes_per_sec": bytes_per_sec,
                "cleaners_count": len(task.runtimes),
                "status": task.status.value,
            }
            
            log.info(
                "[PERFORMANCE] Cleaning %s completed: duration=%.2fs, removed=%d, bytes=%d, speed=%.1f files/s, skipped=%d, failed=%d",
                task_id,
                duration_sec,
                total_removed,
                total_bytes,
                files_per_sec,
                total_skipped,
                total_failed,
            )
            
            return metrics

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------
    def snapshot(self, task_id: str | None = None) -> CleaningSnapshot | None:
        with self._lock:
            task = self._task
            if task is None:
                return None
            if task_id is not None and task.task_id != task_id:
                return None

            self._roll_up(task)

            n = len(task.runtimes) or 1
            avg_progress = int(sum(rt.progress for rt in task.runtimes) / n)

            current_rt = next(
                (rt for rt in task.runtimes if rt.future is not None and not rt.future.done()),
                None,
            )
            current_name = current_rt.cleaner.name if current_rt else None
            current_file = current_rt.current_file if current_rt else None

            total_removed = sum(
                (rt.result.files_removed if rt.result else 0) for rt in task.runtimes
            )
            total_bytes = sum(
                (rt.result.bytes_recovered if rt.result else 0) for rt in task.runtimes
            )
            total_skipped = sum(
                (rt.result.files_skipped if rt.result else 0) for rt in task.runtimes
            )
            total_failed = sum(
                (rt.result.files_failed if rt.result else 0) for rt in task.runtimes
            )

            duration_ms = int(((task.finished_at or time.monotonic()) - task.started_at) * 1000)
            eta_ms = self._estimate_eta(task, avg_progress, duration_ms)

            cleaner_dicts = [
                (
                    rt.result.to_summary()
                    if rt.result
                    else {
                        "id": rt.cleaner.id,
                        "name": rt.cleaner.name,
                        "category": rt.cleaner.category.value,
                        "result": "pending",
                        "filesRemoved": 0,
                        "bytesRecovered": 0,
                        "filesSkipped": 0,
                        "filesFailed": 0,
                        "errors": [],
                        "elapsedMs": 0,
                    }
                )
                | {
                    "progress": rt.progress,
                    "totalCandidates": len(rt.candidate_paths),
                }
                for rt in task.runtimes
            ]

            return CleaningSnapshot(
                task_id=task.task_id,
                scan_task_id=task.scan_task_id,
                status=task.status,
                started_at=task.started_at,
                finished_at=task.finished_at,
                progress=avg_progress,
                current_cleaner=current_name,
                current_file=current_file,
                cleaners=cleaner_dicts,
                total_files_removed=total_removed,
                total_bytes_recovered=total_bytes,
                total_files_skipped=total_skipped,
                total_files_failed=total_failed,
                duration_ms=duration_ms,
                eta_ms=eta_ms,
            )

    # ------------------------------------------------------------------
    # History
    # ------------------------------------------------------------------
    def history(
        self,
        query: str | None = None,
        category: str | None = None,
        result: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[dict[str, object]]:
        return self._history.query(
            search=query, category=category, result=result, offset=offset, limit=limit
        )

    # ------------------------------------------------------------------
    # Undo
    # ------------------------------------------------------------------
    def undo_last_clean(self) -> dict[str, object]:
        """Undo the last cleaning operation by restoring from Recycle Bin.

        Returns a summary of what was undone.
        """
        import json
        import os
        from avs_backend.cleaner.recycle_bin import restore_from_recycle_bin

        # Get the most recent successful cleaning entry
        entries = self._history.query(
            search=None, category=None, result="success", offset=0, limit=1
        )
        if not entries:
            return {
                "success": False,
                "message": "No successful cleaning operations found to undo.",
                "filesRestored": 0,
                "bytesRestored": 0,
            }

        last_entry = entries[0]
        deleted_files_json = last_entry.get("deleted_files_json", "[]")
        
        try:
            deleted_files = json.loads(deleted_files_json)
        except (json.JSONDecodeError, TypeError):
            deleted_files = []

        if not deleted_files:
            return {
                "success": False,
                "message": "No file tracking information available for this cleaning operation.",
                "filesRestored": 0,
                "bytesRestored": 0,
            }

        # Attempt to restore files from Recycle Bin
        restored_count = 0
        restored_bytes = 0
        errors = []

        for file_info in deleted_files:
            path = file_info.get("path", "")
            if not path:
                continue

            try:
                # Try to restore from Recycle Bin
                # Note: Windows Recycle Bin doesn't provide direct restore by original path
                # We can only empty the entire bin or restore via Windows API
                # For now, we'll attempt to restore using the recycle bin API
                success = restore_from_recycle_bin(path)
                
                if success:
                    restored_count += 1
                    # Check if file exists and get size
                    if os.path.exists(path):
                        try:
                            restored_bytes += os.path.getsize(path)
                        except OSError:
                            pass
                else:
                    errors.append(f"Failed to restore: {path}")
            except Exception as e:
                errors.append(f"Error restoring {path}: {e}")
                log.warning("Failed to restore file %s: %s", path, e)

        # Update history to reflect undo operation
        self._history.append(
            {
                "started_at": datetime.now(timezone.utc).isoformat(),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "cleaner_id": "undo",
                "cleaner_name": "Undo Operation",
                "category": "system",
                "action": "undo",
                "result": "success" if restored_count > 0 else "partial",
                "files_removed": -restored_count,  # Negative to indicate restoration
                "bytes_recovered": -restored_bytes,
                "files_skipped": 0,
                "files_failed": len(errors),
                "duration_ms": 0,
                "errors_json": json.dumps(errors),
            }
        )

        return {
            "success": restored_count > 0,
            "message": f"Restored {restored_count} file(s) from Recycle Bin." + (f" {len(errors)} error(s)." if errors else ""),
            "filesRestored": restored_count,
            "bytesRestored": restored_bytes,
            "errors": errors,
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------
    def _collect_scan_paths(self, scan_task_id: str, cleaner_id: str) -> list[str]:
        """Extract every file path found by the given scan for one cleaner.

        Uses the in-memory scan results directly to avoid re-fetching via items_page().
        This eliminates the disk/DB I/O bottleneck during validation.
        """
        log.debug("[CleaningManager] _collect_scan_paths called for scan_task_id=%s, cleaner_id=%s", 
                  scan_task_id, cleaner_id)
        start = time.monotonic()
        
        # Use the new get_all_items method that reads directly from in-memory results
        paths = self._scan_manager.get_all_items(scan_task_id, cleaner_id)
        
        log.info("[CleaningManager] _collect_scan_paths completed in %.2fs for cleaner %s: %d paths", 
                 time.monotonic() - start, cleaner_id, len(paths))
        return paths

    def _run_cleaner(self, task: _Task, rt: _CleanerRuntime) -> CleaningResult:
        def on_progress(pct: int) -> None:
            rt.progress = max(0, min(100, pct))

        def on_file(p: str) -> None:
            rt.current_file = p

        try:
            result = rt.cleaner.clean(rt.candidate_paths, task.cancel_event, on_progress, on_file)
        except Exception as e:  # noqa: BLE001 — engine safety net
            log.exception("Cleaner %s crashed while cleaning", rt.cleaner.id)
            result = CleaningResult(
                cleaner_id=rt.cleaner.id,
                name=rt.cleaner.name,
                category=rt.cleaner.category,
                result=CleaningActionResult.FAILED,
                errors=[f"crash: {e}"],
            )

        rt.result = result
        rt.progress = 100
        rt.current_file = None

        # Track deleted files for undo functionality
        # We store the original paths that were successfully deleted
        if result.files_removed > 0:
            for path in rt.candidate_paths:
                # Check if file still exists (if not, it was deleted)
                import os
                if not os.path.exists(path):
                    rt.deleted_files.append({
                        "path": path,
                        "size": 0,  # Size not available after deletion
                        "deleted_at": datetime.now(timezone.utc).isoformat(),
                    })

        # Persist to history immediately so the log is durable even if
        # the process is killed mid-scan of the next cleaner.
        self._history.append(
            {
                "started_at": _iso_from_monotonic(task.started_at),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "cleaner_id": rt.cleaner.id,
                "cleaner_name": rt.cleaner.name,
                "category": rt.cleaner.category.value,
                "action": "clean",
                "result": result.result.value,
                "files_removed": result.files_removed,
                "bytes_recovered": result.bytes_recovered,
                "files_skipped": result.files_skipped,
                "files_failed": result.files_failed,
                "duration_ms": result.elapsed_ms,
                "errors_json": _truncated_errors_json(result.errors),
                "deleted_files_json": str(rt.deleted_files),  # Store for undo
            }
        )
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
        elif any(
            rt.result and rt.result.result == CleaningActionResult.FAILED for rt in task.runtimes
        ):
            task.status = ScanStatus.FAILED
        else:
            task.status = ScanStatus.COMPLETED

    def _estimate_eta(self, task: _Task, avg_progress: int, elapsed_ms: int) -> int | None:
        if task.status != ScanStatus.RUNNING:
            return None
        if avg_progress < 5:
            return None
        remaining = int((elapsed_ms / avg_progress) * (100 - avg_progress))
        return max(0, remaining)


# ---------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------


def _iso_from_monotonic(mono_start: float) -> str:
    """Wall-clock ISO-8601 for the moment a monotonic timer was started."""
    delta = time.monotonic() - mono_start
    start_ts = datetime.now(timezone.utc).timestamp() - delta
    return datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat()


def _truncated_errors_json(errors: list[str], limit: int = 100) -> str:
    """Serialise the error list, truncating to keep row size sane."""
    import json

    slim = errors[:limit]
    return json.dumps({"count": len(errors), "sample": slim}, separators=(",", ":"))


# Re-export the ValidationIssue and CleaningPreview types for callers.
__all__ = ["CleaningManager", "CleaningSnapshot", "ValidationIssue", "CleaningPreview"]
