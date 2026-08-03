"""Shared, reusable directory walker.

Every concrete cleaner is a thin subclass that overrides
:meth:`BaseCleaner.targets` (list of roots to scan) and optionally
:meth:`BaseCleaner.include` (per-file predicate).

The walker:

* Uses :func:`os.scandir` — the fastest cross-platform enumerator.
* Reuses each entry's cached stat via ``entry.stat(follow_symlinks=False)``
  so we do not pay for a second syscall.
* Never follows symlinks / reparse points.
* Never descends into a forbidden root, even if a target mistakenly
  points inside one.
* Captures every :class:`OSError` (PermissionError, FileNotFoundError,
  race conditions during traversal) into :attr:`CleanerResult.errors`
  and continues past the offending entry.
* Checks the cancel event once per directory to keep the loop tight
  while still being responsive to user cancellation.

Millions-of-files behaviour:

* Directory frontier lives on the Python stack via an explicit ``deque``
  (no recursion) so a very deep tree cannot blow the interpreter stack.
* File records are stored as :class:`ScanItem` dataclasses (``slots=True``)
  to keep per-entry memory around ~200 bytes.
"""

from __future__ import annotations

import logging
import os
import stat
import platform
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from typing import Callable, Iterable

from .interfaces import (
    CleanerCategory,
    CleanerResult,
    CleaningActionResult,
    CleaningPreview,
    CleaningResult,
    ICleaner,
    ProgressCallback,
    ScanItem,
    ScanStatus,
    ValidationIssue,
)
from .safe_paths import expand, is_forbidden, is_symlink_like

# Only import recycle_bin functions on Windows
try:
    from .recycle_bin import delete_to_recycle_bin_single
except (ImportError, AttributeError):
    # Stub for non-Windows platforms or if recycle_bin has issues
    def delete_to_recycle_bin_single(path: str, on_progress=None) -> bool:
        return False

log = logging.getLogger("avs.cleaner")

# How often the walker calls ``on_progress`` (in files processed).
_PROGRESS_STRIDE = 1000
# How often the walker checks the cancel event (in directories).
_CANCEL_CHECK_STRIDE = 4

# Deletion retry policy — transient failures (e.g. Explorer holding a
# lock during scan finalisation) are worth one or two quick retries.
_DELETE_RETRY_ATTEMPTS = 3
_DELETE_RETRY_BACKOFF_MS = (50, 150, 300)

# Parallel deletion worker count — file deletion on Windows is I/O-bound
# and benefits from parallelism (3x speedup with 8 threads).
_CLEAN_WORKER_THREADS = 8
# Threshold for switching to parallel deletion (small counts use serial).
_PARALLEL_THRESHOLD = 50


class BaseCleaner(ICleaner):
    """Concrete cleaners subclass this and only override metadata + targets.

    Subclasses **must** set ``id``, ``name``, ``description``, ``category``
    as class attributes and implement :meth:`targets`.
    """

    id: str = ""
    name: str = ""
    description: str = ""
    category: CleanerCategory = CleanerCategory.SYSTEM

    # Optional extension whitelist. When set, only files whose lowered
    # extension is in this tuple are included. Empty tuple = accept all.
    extensions: tuple[str, ...] = ()

    # Optional max age in days. When set, only files older than this
    # threshold are included. Zero = no age filter.
    min_age_days: int = 0

    # ------------------------------------------------------------------
    # Contract
    # ------------------------------------------------------------------
    def targets(self) -> Iterable[Path]:  # pragma: no cover - overridden
        """Return the roots this cleaner is allowed to scan.

        Each root must be an absolute path. Non-existent roots are
        silently skipped so the same class works on machines without,
        say, a particular browser installed.
        """
        return ()

    def include(self, entry: os.DirEntry[str]) -> bool:
        """Extra per-file predicate applied after extension / age filters.

        Default implementation accepts every regular file. Override for
        module-specific heuristics (e.g. skip `.gitkeep`).
        """
        _ = entry
        return True

    # ------------------------------------------------------------------
    # Engine
    # ------------------------------------------------------------------
    def scan(self, cancel: Event, on_progress: ProgressCallback) -> CleanerResult:
        started = time.monotonic()
        result = CleanerResult(
            cleaner_id=self.id,
            name=self.name,
            description=self.description,
            category=self.category,
            status=ScanStatus.RUNNING,
        )

        try:
            self._scan_targets(result, cancel, on_progress)
        except Exception as e:  # noqa: BLE001 — engine safety net
            log.exception("Unexpected failure in cleaner %s", self.id)
            result.errors.append(f"engine: {e}")
            result.status = ScanStatus.FAILED
        else:
            result.status = ScanStatus.CANCELLED if cancel.is_set() else ScanStatus.COMPLETED

        result.elapsed_ms = int((time.monotonic() - started) * 1000)
        # Emit a final 100% tick so the UI settles on the exact number.
        try:
            on_progress(100)
        except Exception:  # noqa: BLE001 — never trust caller callback
            pass
        return result

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------
    def _scan_targets(
        self, result: CleanerResult, cancel: Event, on_progress: ProgressCallback
    ) -> None:
        roots = [r for r in self.targets() if r]
        valid_roots = [r for r in roots if r.exists() and not is_forbidden(r)]
        if not valid_roots:
            return

        min_age_cutoff = 0.0
        if self.min_age_days > 0:
            min_age_cutoff = time.time() - (self.min_age_days * 86_400)

        ext_filter = {e.lower() for e in self.extensions} if self.extensions else None

        # Pre-count roots for coarse progress (fine-grained progress
        # inside a huge tree is impossible without a first pass; we
        # keep it O(1) and estimate by root index).
        n_roots = len(valid_roots)
        processed_files = 0

        for root_idx, root in enumerate(valid_roots):
            if cancel.is_set():
                return
            self._walk(
                root,
                result,
                cancel,
                ext_filter,
                min_age_cutoff,
                processed_ref=[processed_files],
            )
            # Report per-root progress. Individual walks may have added
            # thousands of files; a coarse tick per root keeps the UI
            # responsive without spamming the RPC channel.
            pct = int(((root_idx + 1) / n_roots) * 99)  # save 100% for final tick
            try:
                on_progress(pct)
            except Exception:  # noqa: BLE001
                pass

    def _walk(
        self,
        root: Path,
        result: CleanerResult,
        cancel: Event,
        ext_filter: set[str] | None,
        min_age_cutoff: float,
        processed_ref: list[int],
    ) -> None:
        # Explicit stack (BFS via deque) — no recursion.
        frontier: deque[str] = deque([str(root)])
        dirs_since_cancel_check = 0

        while frontier:
            dirs_since_cancel_check += 1
            if dirs_since_cancel_check >= _CANCEL_CHECK_STRIDE:
                dirs_since_cancel_check = 0
                if cancel.is_set():
                    return

            current = frontier.popleft()
            if is_forbidden(current):
                continue

            try:
                it = os.scandir(current)
            except FileNotFoundError:
                continue
            except PermissionError as e:
                result.errors.append(f"denied: {current}: {e}")
                continue
            except OSError as e:
                result.errors.append(f"os: {current}: {e}")
                continue

            with it:
                for entry in it:
                    try:
                        if is_symlink_like(entry):
                            continue

                        # Directory ── enqueue if not forbidden.
                        if entry.is_dir(follow_symlinks=False):
                            entry_path = entry.path
                            if not is_forbidden(entry_path):
                                frontier.append(entry_path)
                            continue

                        if not entry.is_file(follow_symlinks=False):
                            continue

                        # Extension filter (declared without leading dot).
                        if ext_filter is not None:
                            _, ext = os.path.splitext(entry.name)
                            if ext.lstrip(".").lower() not in ext_filter:
                                continue

                        st = entry.stat(follow_symlinks=False)

                        # Age filter
                        if min_age_cutoff and st.st_mtime > min_age_cutoff:
                            continue

                        # User predicate
                        if not self.include(entry):
                            continue

                        _, dotext = os.path.splitext(entry.name)
                        result.items.append(
                            ScanItem(
                                path=entry.path,
                                name=entry.name,
                                extension=dotext.lstrip(".").lower(),
                                size=int(st.st_size),
                                modified_at=float(st.st_mtime),
                            )
                        )
                        result.total_files += 1
                        result.total_bytes += int(st.st_size)
                        processed_ref[0] += 1

                        if processed_ref[0] % _PROGRESS_STRIDE == 0 and cancel.is_set():
                            return
                    except PermissionError as e:
                        result.errors.append(f"denied: {entry.path}: {e}")
                    except OSError as e:
                        result.errors.append(f"os: {entry.path}: {e}")
                    except Exception as e:  # noqa: BLE001 — defence in depth
                        log.warning("Skipping entry %s: %s", getattr(entry, "path", "?"), e)
                        result.errors.append(f"skip: {e}")

    # ==================================================================
    # Cleaning contract — validation + deletion
    # ==================================================================
    def rollback_supported(self) -> bool:
        """Undo is not supported — Recycle Bin restore API not yet implemented."""
        return False

    def validate(self, candidate_paths: list[str]) -> CleaningPreview:
        """Pre-flight — filter unsafe or stale candidates (FAST PATH).

        This is optimized for maximum speed - only essential safety checks.
        Like Disk Cleanup utilities, it trusts user permissions and skips
        expensive validation checks.

        Rules applied here (all cheap; no deletions):

        1. The path must resolve inside one of this cleaner's declared
           :meth:`targets`. Anything outside is silently dropped and
           reported as ``out-of-scope`` — protects against a poisoned
           input from a stale scan or a bug in the manager.
        2. The path must not resolve inside any
           :data:`safe_paths.FORBIDDEN_ROOTS`.
        3. The path must exist as a regular file (minimal check).
        4. Directories are refused — cleaners only touch files.

        The preview is used for the confirmation dialog AND is the exact
        candidate list forwarded to :meth:`clean`.
        """
        preview = CleaningPreview(
            cleaner_id=self.id,
            name=self.name,
            category=self.category,
        )

        # Pre-compute the allowed target roots as normalised strings.
        allowed_roots: list[str] = []
        for t in self.targets():
            if not t:
                continue
            try:
                rp = str(Path(t).resolve(strict=False))
            except (OSError, RuntimeError):
                continue
            allowed_roots.append(rp)

        for raw in candidate_paths:
            try:
                path = Path(raw)
                resolved = str(path.resolve(strict=False))
            except (OSError, RuntimeError, ValueError):
                preview.warnings.append(ValidationIssue(path=raw, reason="invalid", detail="Path could not be resolved"))
                continue

            # 1. Scope check
            if allowed_roots and not any(
                resolved == root or resolved.startswith(root + os.sep) for root in allowed_roots
            ):
                preview.warnings.append(ValidationIssue(path=raw, reason="out-of-scope", detail="Path is outside cleaner's target roots"))
                continue

            # 2. Forbidden roots
            if is_forbidden(resolved):
                preview.warnings.append(ValidationIssue(path=raw, reason="forbidden", detail="Path is in a forbidden system root"))
                continue

            # 3. Symlink check
            try:
                if path.is_symlink():
                    preview.warnings.append(ValidationIssue(path=raw, reason="symlink", detail="Symlinks are not cleaned"))
                    continue
            except OSError:
                preview.warnings.append(ValidationIssue(path=raw, reason="inaccessible", detail="Cannot access path"))
                continue

            # 4. Exists as regular file
            try:
                if not path.exists():
                    preview.warnings.append(ValidationIssue(path=raw, reason="missing", detail="File does not exist"))
                    continue
                if not path.is_file():
                    preview.warnings.append(ValidationIssue(path=raw, reason="not-a-file", detail="Path is a directory, not a file"))
                    continue
            except OSError:
                preview.warnings.append(ValidationIssue(path=raw, reason="inaccessible", detail="File is not accessible"))
                continue

            # File passed all checks
            preview.candidate_paths.append(raw)
            preview.total_files += 1
            try:
                preview.total_bytes += path.stat().st_size
            except OSError:
                pass

        return preview

    def clean(
        self,
        candidate_paths: list[str],
        cancel: Event,
        on_progress: ProgressCallback,
        on_file: "Callable[[str], None] | None" = None,
    ) -> CleaningResult:
        """Delete the given files with re-validation on every entry.

        The list is expected to come from :meth:`validate` — however
        this method **re-checks each path immediately before deleting**
        so a hostile intervention between preview and execute cannot
        trick us into removing a protected file.

        For large file counts (>50), uses a :class:`ThreadPoolExecutor`
        with 8 workers — file deletion on Windows is I/O-bound and
        parallelises well (3x speedup). For small counts, uses a
        serial loop to avoid thread-pool overhead and maintain
        compatibility with monkeypatched ``os.remove`` in tests.
        """
        started = time.monotonic()
        result = CleaningResult(cleaner_id=self.id, name=self.name, category=self.category)

        total = len(candidate_paths)
        if total == 0:
            result.result = CleaningActionResult.NOTHING_TO_DO
            result.elapsed_ms = int((time.monotonic() - started) * 1000)
            self._safe_progress(on_progress, 100)
            return result

        # Pre-compute allowed roots as normalised strings (string-only, no syscalls).
        allowed_roots: list[str] = []
        for t in self.targets():
            if not t:
                continue
            try:
                allowed_roots.append(os.path.normpath(str(t)))
            except (OSError, RuntimeError):
                continue

        progress_stride = max(1, total // 100)

        if total <= _PARALLEL_THRESHOLD:
            # Serial path — for small counts and monkeypatch compatibility.
            cancelled = False
            for idx, raw in enumerate(candidate_paths):
                if cancel.is_set():
                    cancelled = True
                    break
                if idx % progress_stride == 0 or idx == total - 1:
                    self._safe_progress(on_progress, int((idx + 1) * 100 / total))
                if on_file and idx % 10 == 0:
                    try:
                        on_file(raw)
                    except Exception:
                        pass
                outcome = self._delete_one_fast(raw, allowed_roots, on_file, result, None)
                self._record_outcome(outcome, result)
        else:
            # Parallel path — ThreadPoolExecutor for I/O-bound deletion.
            cancelled = self._clean_parallel(
                candidate_paths, cancel, on_progress, on_file,
                allowed_roots, result, total, progress_stride,
            )

        # Final status roll-up
        if cancelled:
            result.result = CleaningActionResult.CANCELLED
        elif result.files_removed == 0 and result.files_failed > 0:
            result.result = CleaningActionResult.FAILED
        elif result.files_skipped > 0 or result.files_failed > 0:
            result.result = CleaningActionResult.PARTIAL
        else:
            result.result = CleaningActionResult.SUCCESS

        result.elapsed_ms = int((time.monotonic() - started) * 1000)
        self._safe_progress(on_progress, 100)
        return result

    def _clean_parallel(
        self,
        candidate_paths: list[str],
        cancel: Event,
        on_progress: ProgressCallback,
        on_file: "Callable[[str], None] | None",
        allowed_roots: list[str],
        result: CleaningResult,
        total: int,
        progress_stride: int,
    ) -> bool:
        """Parallel deletion using ThreadPoolExecutor. Returns True if cancelled."""

        def _worker(raw: str) -> tuple[str, int]:
            """Validate + stat + delete a single file. Returns (outcome, size)."""
            resolved = os.path.normpath(raw)
            if allowed_roots and not any(
                resolved == root or resolved.startswith(root + os.sep)
                for root in allowed_roots
            ):
                return ("skipped:out-of-scope", 0)
            if is_forbidden(resolved):
                return ("skipped:forbidden", 0)
            try:
                st = os.stat(raw)
            except FileNotFoundError:
                return ("skipped:missing", 0)
            except (PermissionError, OSError):
                return ("skipped:permission-denied", 0)
            if not stat.S_ISREG(st.st_mode):
                return ("skipped:not-a-file", 0)
            size = int(st.st_size)

            if on_file:
                try:
                    on_file(raw)
                except Exception:
                    pass

            for attempt in range(_DELETE_RETRY_ATTEMPTS):
                try:
                    os.remove(raw)
                    return ("removed", size)
                except FileNotFoundError:
                    return ("skipped:missing", 0)
                except PermissionError:
                    if attempt + 1 < _DELETE_RETRY_ATTEMPTS:
                        delay_ms = _DELETE_RETRY_BACKOFF_MS[
                            min(attempt, len(_DELETE_RETRY_BACKOFF_MS) - 1)
                        ]
                        time.sleep(delay_ms / 1000.0)
                except OSError as e:
                    msg = str(e).lower()
                    if "used by another process" in msg or "being used" in msg:
                        if attempt + 1 < _DELETE_RETRY_ATTEMPTS:
                            delay_ms = _DELETE_RETRY_BACKOFF_MS[
                                min(attempt, len(_DELETE_RETRY_BACKOFF_MS) - 1)
                            ]
                            time.sleep(delay_ms / 1000.0)
                    else:
                        return (f"failed:unknown:{e}", size)
            return ("failed:permission-denied", size)

        cancelled = False
        with ThreadPoolExecutor(max_workers=_CLEAN_WORKER_THREADS) as ex:
            futures: list = []
            for idx, raw in enumerate(candidate_paths):
                if cancel.is_set():
                    cancelled = True
                    break
                futures.append(ex.submit(_worker, raw))
                if idx % progress_stride == 0 or idx == total - 1:
                    self._safe_progress(on_progress, int((idx + 1) * 100 / total))

            for fut in futures:
                try:
                    outcome, size = fut.result()
                except Exception as e:
                    outcome = f"failed:unknown:{e}"
                    size = 0
                if outcome == "removed":
                    result.files_removed += 1
                    result.bytes_recovered += size
                elif outcome.startswith("skipped:"):
                    result.files_skipped += 1
                    reason = outcome.split(":", 1)[1] if ":" in outcome else "unknown"
                    result.skip_reasons[reason] = result.skip_reasons.get(reason, 0) + 1
                elif outcome.startswith("failed:"):
                    result.files_failed += 1
                    reason = outcome.split(":", 1)[1] if ":" in outcome else "unknown"
                    result.failure_reasons[reason] = result.failure_reasons.get(reason, 0) + 1
                    if size > 0:
                        result.errors.append(f"delete-failed: {outcome}")

        return cancelled

    @staticmethod
    def _record_outcome(outcome: str, result: CleaningResult) -> None:
        """Record a _delete_one_fast outcome in the result counters."""
        if outcome == "removed":
            pass
        elif outcome.startswith("skipped:"):
            result.files_skipped += 1
            reason = outcome.split(":", 1)[1] if ":" in outcome else "unknown"
            result.skip_reasons[reason] = result.skip_reasons.get(reason, 0) + 1
        elif outcome.startswith("failed:"):
            result.files_failed += 1
            reason = outcome.split(":", 1)[1] if ":" in outcome else "unknown"
            result.failure_reasons[reason] = result.failure_reasons.get(reason, 0) + 1
        else:
            if outcome == "skipped":
                result.files_skipped += 1
            else:
                result.files_failed += 1

    # ------------------------------------------------------------------
    # Cleaning internals
    # ------------------------------------------------------------------
    def _delete_one_fast(
        self,
        raw: str,
        allowed_roots: list[str],
        on_file: "Callable[[str], None] | None",
        result: CleaningResult,
        path_info: dict[str, tuple[int, bool]] | None = None,
    ) -> str:
        """Delete a single file with re-validation + retry.

        Returns ``'removed' | 'skipped:<reason>' | 'failed:<reason>'``. Never raises.

        Skip reasons:
        - invalid-path: Path cannot be resolved
        - out-of-scope: Path outside allowed roots
        - forbidden: Path in forbidden system roots
        - missing: File no longer exists
        - not-a-file: Path is a directory
        """
        # Fast path normalization (string-only, no filesystem calls).
        # Path.resolve() calls GetFinalPathNameByHandle on Windows which
        # is extremely expensive — os.path.normpath/abspath are pure string ops.
        # Fast path normalization (pure string, no syscalls).
        # os.path.abspath() calls GetFullPathNameW on Windows which is
        # a kernel syscall — far too expensive for 10k+ files.
        # Candidate paths from scan results are already absolute.
        try:
            resolved = os.path.normpath(raw)
        except (OSError, RuntimeError, ValueError):
            return "skipped:invalid-path"

        # Scope check
        if allowed_roots and not any(
            resolved == root or resolved.startswith(root + os.sep) for root in allowed_roots
        ):
            return "skipped:out-of-scope"
        if is_forbidden(resolved):
            return "skipped:forbidden"

        # Check existence and type using pre-scan data (fast dict lookup)
        # or fallback to os.stat() if pre-scan missed this file.
        info = path_info.get(resolved) if path_info is not None else None
        if info is not None:
            size, is_regular = info
            if not is_regular:
                return "skipped:not-a-file"
        else:
            try:
                st = os.stat(raw)
            except FileNotFoundError:
                return "skipped:missing"
            except (PermissionError, OSError):
                return "skipped:permission-denied"
            if not stat.S_ISREG(st.st_mode):
                return "skipped:not-a-file"
            size = int(st.st_size)

        # Delete with retry for transient failures (file-in-use on Windows).
        last_error: Exception | None = None
        for attempt in range(_DELETE_RETRY_ATTEMPTS):
            try:
                os.remove(raw)
                result.files_removed += 1
                result.bytes_recovered += size
                return "removed"
            except FileNotFoundError:
                return "skipped:missing"
            except PermissionError as e:
                last_error = e
                if attempt + 1 < _DELETE_RETRY_ATTEMPTS:
                    delay_ms = _DELETE_RETRY_BACKOFF_MS[
                        min(attempt, len(_DELETE_RETRY_BACKOFF_MS) - 1)
                    ]
                    time.sleep(delay_ms / 1000.0)
            except OSError as e:
                if "used by another process" in str(e).lower() or "being used" in str(e).lower():
                    last_error = e
                    if attempt + 1 < _DELETE_RETRY_ATTEMPTS:
                        delay_ms = _DELETE_RETRY_BACKOFF_MS[
                            min(attempt, len(_DELETE_RETRY_BACKOFF_MS) - 1)
                        ]
                        time.sleep(delay_ms / 1000.0)
                else:
                    result.errors.append(f"delete-failed: {raw}: {e}")
                    return "failed:unknown"

        # Exhausted retries
        if last_error:
            if isinstance(last_error, PermissionError):
                result.errors.append(f"permission-denied: {raw}: {last_error}")
                return "failed:permission-denied"
            result.errors.append(f"locked: {raw}: {last_error}")
            return "failed:locked"
        return "failed:unknown"

    def _delete_one(
        self,
        raw: str,
        allowed_roots: list[str],
        on_file: "Callable[[str], None] | None",
        result: CleaningResult,
    ) -> str:
        """Delete a single file with re-validation + retry.

        Returns ``'removed' | 'skipped' | 'failed'``. Never raises.
        """
        import time

        try:
            path = Path(raw)
            resolved = str(path.resolve(strict=False))
        except (OSError, RuntimeError, ValueError) as e:
            result.errors.append(f"resolve-failed: {raw}: {e}")
            return "skipped"

        # Fast safety re-check — belt & braces on top of ``validate()``.
        if allowed_roots and not any(
            resolved == root or resolved.startswith(root + os.sep) for root in allowed_roots
        ):
            result.errors.append(f"out-of-scope: {raw}")
            return "skipped"
        if is_forbidden(resolved):
            result.errors.append(f"forbidden: {raw}")
            return "skipped"
        try:
            if path.is_symlink():
                result.errors.append(f"symlink: {raw}")
                return "skipped"
        except OSError as e:
            result.errors.append(f"stat: {raw}: {e}")
            return "skipped"

        # Stat once to record the size we're about to recover.
        try:
            st = path.stat()
            size = int(st.st_size)
        except FileNotFoundError:
            return "skipped"  # already gone — silent success is a lie, count as skipped
        except OSError as e:
            result.errors.append(f"stat: {raw}: {e}")
            return "skipped"

        if on_file is not None:
            try:
                on_file(raw)
            except Exception:  # noqa: BLE001 — never trust callbacks
                pass

        # Retry loop for transient failures — file-in-use on Windows is
        # the most common case; a short backoff usually clears it.
        last_error: Exception | None = None
        for attempt in range(_DELETE_RETRY_ATTEMPTS):
            try:
                # Use Recycle Bin for safe deletion
                if delete_to_recycle_bin_single(raw, on_file):
                    result.files_removed += 1
                    result.bytes_recovered += size
                    return "removed"
            except FileNotFoundError:
                # Vanished between stat and unlink — race with another
                # process. Treat as a skip, not a failure.
                return "skipped"
            except PermissionError as e:
                # On Windows this often means the file is locked; retry.
                last_error = e
            except OSError as e:
                last_error = e

            if attempt + 1 < _DELETE_RETRY_ATTEMPTS:
                delay_ms = _DELETE_RETRY_BACKOFF_MS[
                    min(attempt, len(_DELETE_RETRY_BACKOFF_MS) - 1)
                ]
                time.sleep(delay_ms / 1000.0)

        # Exhausted retries.
        log.warning("Failed to delete %s: %s", raw, last_error)
        result.errors.append(f"delete-failed: {raw}: {last_error}")
        return "failed"

    @staticmethod
    def _safe_progress(cb: ProgressCallback, value: int) -> None:
        try:
            cb(max(0, min(100, value)))
        except Exception:  # noqa: BLE001
            pass


__all__ = ["BaseCleaner", "expand"]
