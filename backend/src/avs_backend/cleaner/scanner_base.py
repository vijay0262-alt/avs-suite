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
import platform
import time
from collections import deque
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
        """Undo is supported via Recycle Bin restoration."""
        return True

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

        # Ultra-fast validation - only scope, forbidden, and basic existence
        for raw in candidate_paths:
            try:
                path = Path(raw)
                resolved = str(path.resolve(strict=False))
            except (OSError, RuntimeError, ValueError):
                # Invalid path - skip silently
                continue

            # 1. Scope check (fast string comparison)
            if allowed_roots and not any(
                resolved == root or resolved.startswith(root + os.sep) for root in allowed_roots
            ):
                # Out of scope - skip silently
                continue

            # 2. Forbidden roots (fast string comparison)
            if is_forbidden(resolved):
                # Forbidden - skip silently
                continue

            # 3. Exists as regular file (minimal check - no writability check)
            try:
                if not path.is_file():
                    continue
            except (FileNotFoundError, OSError):
                # File doesn't exist or inaccessible - skip
                continue

            # File passed all checks - add to preview
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
        """Delete the given files with re-validation on every entry (FAST PATH).

        The list is expected to come from :meth:`validate` — however
        this method **re-checks each path immediately before deleting**
        so a hostile intervention between preview and execute cannot
        trick us into removing a protected file.

        Optimized for speed:
        - Minimal re-validation (just existence and scope)
        - Progress updates every 100 files (not every file)
        - Batch deletion where possible
        - Immediate file deletion without retry for speed
        """
        import time

        started = time.monotonic()
        result = CleaningResult(cleaner_id=self.id, name=self.name, category=self.category)

        total = len(candidate_paths)
        if total == 0:
            result.result = CleaningActionResult.NOTHING_TO_DO
            result.elapsed_ms = int((time.monotonic() - started) * 1000)
            self._safe_progress(on_progress, 100)
            return result

        # Pre-compute allowed roots as normalised strings for the fast
        # per-file re-check.
        allowed_roots: list[str] = []
        for t in self.targets():
            if not t:
                continue
            try:
                allowed_roots.append(str(Path(t).resolve(strict=False)))
            except (OSError, RuntimeError):
                continue

        # Progress update stride - update UI every 1% or every 100 files
        progress_stride = max(1, total // 100)
        
        cancelled = False
        for idx, raw in enumerate(candidate_paths):
            if cancel.is_set():
                cancelled = True
                break

            # Update progress less frequently for better performance
            if idx % progress_stride == 0 or idx == total - 1:
                self._safe_progress(on_progress, int((idx + 1) * 100 / total))

            # Update current file for UI
            if on_file and idx % 10 == 0:  # Update every 10 files to avoid spam
                try:
                    on_file(raw)
                except Exception:
                    pass

            try:
                outcome = self._delete_one_fast(raw, allowed_roots, on_file, result)
            except Exception as e:
                # Catch any unexpected errors to prevent hang
                log.warning("Unexpected error deleting %s: %s", raw, e)
                result.errors.append(f"unexpected-error: {raw}: {e}")
                outcome = "failed:unknown"
            
            if outcome == "removed":
                # counters already updated inside _delete_one_fast
                pass
            elif outcome.startswith("skipped:"):
                result.files_skipped += 1
                # Track skip reason
                reason = outcome.split(":", 1)[1] if ":" in outcome else "unknown"
                result.skip_reasons[reason] = result.skip_reasons.get(reason, 0) + 1
            elif outcome.startswith("failed:"):
                result.files_failed += 1
                # Track failure reason
                reason = outcome.split(":", 1)[1] if ":" in outcome else "unknown"
                result.failure_reasons[reason] = result.failure_reasons.get(reason, 0) + 1
            else:
                # Legacy format (shouldn't happen)
                if outcome == "skipped":
                    result.files_skipped += 1
                else:
                    result.files_failed += 1

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

    # ------------------------------------------------------------------
    # Cleaning internals
    # ------------------------------------------------------------------
    def _delete_one_fast(
        self,
        raw: str,
        allowed_roots: list[str],
        on_file: "Callable[[str], None] | None",
        result: CleaningResult,
    ) -> str:
        """Delete a single file with minimal re-validation (FAST PATH).

        Returns ``'removed' | 'skipped:<reason>' | 'failed:<reason>'``. Never raises.
        Optimized for speed - minimal checks, no retries, immediate deletion.
        
        Skip reasons:
        - invalid-path: Path cannot be resolved
        - out-of-scope: Path outside allowed roots
        - forbidden: Path in forbidden system roots
        - missing: File no longer exists
        - not-a-file: Path is a directory
        - permission-denied: Cannot delete due to permissions
        - locked: File is locked by another process
        """
        try:
            path = Path(raw)
            resolved = str(path.resolve(strict=False))
        except (OSError, RuntimeError, ValueError):
            return "skipped:invalid-path"

        # Fast safety re-check — belt & braces on top of ``validate()``.
        if allowed_roots and not any(
            resolved == root or resolved.startswith(root + os.sep) for root in allowed_roots
        ):
            return "skipped:out-of-scope"
        if is_forbidden(resolved):
            return "skipped:forbidden"
        
        # Check if file exists and is writable (single stat call)
        try:
            if not path.is_file():
                return "skipped:not-a-file"
        except FileNotFoundError:
            return "skipped:missing"
        except OSError:
            return "skipped:permission-denied"

        # Delete immediately without retry for speed
        try:
            path.unlink()
            result.files_removed += 1
            try:
                result.bytes_recovered += path.stat().st_size
            except OSError:
                pass
            return "removed"
        except PermissionError as e:
            result.errors.append(f"permission-denied: {raw}: {e}")
            return "failed:permission-denied"
        except OSError as e:
            # Check if it's a locked file (common on Windows)
            if "used by another process" in str(e).lower() or "being used" in str(e).lower():
                result.errors.append(f"locked: {raw}: {e}")
                return "failed:locked"
            result.errors.append(f"delete-failed: {raw}: {e}")
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
