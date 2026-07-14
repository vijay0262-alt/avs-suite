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
import time
from collections import deque
from pathlib import Path
from threading import Event
from typing import Iterable

from .interfaces import (
    CleanerCategory,
    CleanerResult,
    ICleaner,
    ProgressCallback,
    ScanItem,
    ScanStatus,
)
from .safe_paths import expand, is_forbidden, is_symlink_like

log = logging.getLogger("avs.cleaner")

# How often the walker calls ``on_progress`` (in files processed).
_PROGRESS_STRIDE = 1000
# How often the walker checks the cancel event (in directories).
_CANCEL_CHECK_STRIDE = 4


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


__all__ = ["BaseCleaner", "expand"]
