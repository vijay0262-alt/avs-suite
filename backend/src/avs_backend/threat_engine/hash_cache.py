"""File hash cache for incremental scanning.

Caches file hashes (SHA-256 + mtime + size) so that unchanged files
can be skipped on subsequent scans. This dramatically reduces scan
time for large file sets.

Cache entry:
    {
        "path": "C:\\path\\to\\file.exe",
        "sha256": "abc123...",
        "size": 12345,
        "mtime": 1234567890.0,
        "scanned_at": "2024-01-01T00:00:00Z",
        "result": "clean"  # or "threat"
    }

A file is considered "unchanged" if:
    - The path exists
    - The size matches the cached size
    - The mtime matches the cached mtime

If a file is unchanged and the cached result was "clean", it is
skipped. If the cached result was "threat", it is re-scanned to
confirm the threat is still present (the file may have been
quarantined or removed by another scanner).

Cache is persisted to:
    %LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\hash_cache.json
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.threat_engine.hash_cache")

_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_CACHE_PATH = _DATA_DIR / "hash_cache.json"

# Maximum cache entries (to prevent unbounded growth)
_MAX_ENTRIES = 100_000


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_cache() -> dict[str, Any]:
    """Load the hash cache from disk."""
    if _CACHE_PATH.exists():
        try:
            with open(_CACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("Failed to load hash cache: %s", e)
    return {"entries": {}, "updated_at": _now_iso()}


def _save_cache(cache: dict[str, Any]) -> None:
    """Save the hash cache to disk atomically.

    Writes to a temporary file first, then renames to the target path
    to prevent corruption from concurrent writes or crashes.
    """
    import os
    import tempfile
    try:
        # Write to a temp file in the same directory, then atomically rename
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=str(_CACHE_PATH.parent), suffix=".tmp", prefix="hash_cache_")
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                json.dump(cache, f)
            # On Windows, need to remove target before rename
            if _CACHE_PATH.exists():
                _CACHE_PATH.unlink()
            os.rename(tmp_path, str(_CACHE_PATH))
        except Exception:
            # Clean up temp file on error
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
    except Exception as e:
        log.error("Failed to save hash cache: %s", e)


class HashCache:
    """File hash cache for incremental scanning."""

    def __init__(self) -> None:
        self._cache = _load_cache()
        self._hits = 0
        self._misses = 0
        self._dirty = False
        self._lock = __import__("threading").Lock()

    def _get_file_metadata(self, file_path: str) -> tuple[int, float] | None:
        """Get file size and modification time."""
        try:
            stat = os.stat(file_path)
            return stat.st_size, stat.st_mtime
        except Exception:
            return None

    def is_unchanged(self, file_path: str) -> bool:
        """Check if a file has changed since it was last scanned.

        Returns True if the file size and mtime match the cached
        values (i.e., the file hasn't been modified).
        """
        entry = self._cache.get("entries", {}).get(file_path)
        if not entry:
            return False

        meta = self._get_file_metadata(file_path)
        if meta is None:
            return False

        size, mtime = meta
        # Allow small mtime differences (filesystem precision)
        return entry.get("size") == size and abs(entry.get("mtime", 0) - mtime) < 1.0

    def should_skip(self, file_path: str) -> bool:
        """Check if a file can be skipped during scanning.

        A file can be skipped if:
        - It exists in the cache
        - Its size and mtime haven't changed
        - The last scan result was "clean"
        """
        if not self.is_unchanged(file_path):
            self._misses += 1
            return False

        entry = self._cache["entries"][file_path]
        if entry.get("result") == "clean":
            self._hits += 1
            return True

        self._misses += 1
        return False

    def record_result(self, file_path: str, result: str, sha256: str = "") -> None:
        """Record a scan result for a file.

        Args:
            file_path: Path to the file
            result: "clean" or "threat"
            sha256: SHA-256 hash of the file (optional)
        """
        meta = self._get_file_metadata(file_path)
        if meta is None:
            return

        size, mtime = meta
        self._cache["entries"][file_path] = {
            "path": file_path,
            "sha256": sha256,
            "size": size,
            "mtime": mtime,
            "scanned_at": _now_iso(),
            "result": result,
        }
        self._dirty = True

    def invalidate(self, file_path: str) -> None:
        """Remove a file from the cache."""
        with self._lock:
            if file_path in self._cache.get("entries", {}):
                del self._cache["entries"][file_path]
                self._dirty = True

    def clear(self) -> None:
        """Clear the entire cache."""
        with self._lock:
            self._cache = {"entries": {}, "updated_at": _now_iso()}
            self._dirty = True
            self._hits = 0
            self._misses = 0

    def save(self) -> None:
        """Save the cache to disk if there are changes."""
        with self._lock:
            if not self._dirty:
                return

            # Trim cache if it's too large (remove oldest entries)
            entries = self._cache.get("entries", {})
            if len(entries) > _MAX_ENTRIES:
                sorted_entries = sorted(
                    entries.items(),
                    key=lambda x: x[1].get("scanned_at", ""),
                )
                # Keep the most recent entries
                entries = dict(sorted_entries[-_MAX_ENTRIES:])
                self._cache["entries"] = entries

            self._cache["updated_at"] = _now_iso()
            _save_cache(self._cache)
            self._dirty = False

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        return {
            "total_entries": len(self._cache.get("entries", {})),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": self._hits / max(self._hits + self._misses, 1),
            "cache_path": str(_CACHE_PATH),
        }

    def get_cached_hash(self, file_path: str) -> str | None:
        """Get the cached SHA-256 hash for a file if unchanged."""
        if not self.is_unchanged(file_path):
            return None
        return self._cache["entries"].get(file_path, {}).get("sha256", "") or None
