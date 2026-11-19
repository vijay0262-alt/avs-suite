"""App-managed trash store for cleaner undo.

Windows' Recycle Bin cannot be reliably targeted per-file from worker
threads, and ``os.remove`` deletes permanently — which made "Undo
Cleaning" a dead feature (it searched the Recycle Bin for files that
were never there). Instead, every file the cleaner "deletes" is first
moved into ``~/.avs/trash/`` and the manifest records its trash name.
Undo moves it back. Entries expire after ``TRASH_RETENTION_DAYS`` so
junk doesn't accumulate forever.

Cross-platform (pure filesystem ops) so undo works identically in tests.
"""
from __future__ import annotations

import logging
import os
import shutil
import time
import uuid

log = logging.getLogger("avs.cleaner.trash")

TRASH_RETENTION_DAYS = 7


def _trash_dir() -> str:
    return os.path.join(os.path.expanduser("~"), ".avs", "trash")


_dir_ready = False


def _ensure_dir() -> str:
    # makedirs() is a syscall — only pay it once per process.
    global _dir_ready
    d = _trash_dir()
    if not _dir_ready:
        os.makedirs(d, exist_ok=True)
        _dir_ready = True
    return d


def move_to_trash(path: str) -> str | None:
    """Move *path* into the trash store. Returns the trash name, or None
    on failure (caller should report the file as failed, not deleted)."""
    try:
        dest_dir = _ensure_dir()
    except OSError as e:
        log.warning("Cannot create trash dir: %s", e)
        return None
    name = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:12]}"
    dest = os.path.join(dest_dir, name)
    try:
        # os.replace is atomic but only within one filesystem; fall back
        # to shutil.move for cross-drive junk. PermissionError and
        # FileNotFoundError propagate so callers can retry/skip correctly.
        try:
            os.replace(path, dest)
        except OSError:
            shutil.move(path, dest)
        return name
    except (PermissionError, FileNotFoundError):
        raise
    except OSError:
        return None


def restore_from_trash(trash_name: str, original_path: str) -> bool:
    """Restore a trashed file to *original_path*.

    Returns False when the trash entry is gone (expired/purged) or the
    destination already exists — never overwrites a live file.
    """
    src = os.path.join(_trash_dir(), os.path.basename(trash_name))
    if not os.path.isfile(src):
        return False
    if os.path.exists(original_path):
        # Something already lives at the original path — do not clobber.
        return False
    try:
        os.makedirs(os.path.dirname(original_path) or ".", exist_ok=True)
        try:
            os.replace(src, original_path)
        except OSError:
            shutil.move(src, original_path)
        return True
    except OSError as e:
        log.warning("Restore failed %s -> %s: %s", src, original_path, e)
        return False


def purge_expired(max_age_days: int = TRASH_RETENTION_DAYS) -> int:
    """Delete trash entries older than the retention window."""
    d = _trash_dir()
    if not os.path.isdir(d):
        return 0
    cutoff = time.time() - max_age_days * 86400
    purged = 0
    try:
        for name in os.listdir(d):
            p = os.path.join(d, name)
            try:
                if os.path.isfile(p) and os.path.getmtime(p) < cutoff:
                    os.remove(p)
                    purged += 1
            except OSError:
                continue
    except OSError:
        pass
    if purged:
        log.info("Purged %d expired trash file(s)", purged)
    return purged


def trash_size_bytes() -> int:
    """Total bytes held in the trash store (for settings/status UI)."""
    d = _trash_dir()
    total = 0
    try:
        for name in os.listdir(d):
            p = os.path.join(d, name)
            if os.path.isfile(p):
                try:
                    total += os.path.getsize(p)
                except OSError:
                    continue
    except OSError:
        pass
    return total
