"""Quarantine Manager — secure isolation of detected threats.

Moves malicious files into a secure quarantine directory, computes a
SHA-256 fingerprint of the original content, and securely overwrites
the original file with zeros before deleting it. Metadata for every
quarantined file is persisted in a JSON index so that files can be
listed, restored, or permanently deleted.

Quarantine layout::

    %LOCALAPPDATA%\\AVS AI Shield\\ThreatQuarantine\\
        index.json
        <uuid>.bin        # quarantined file payload
        <uuid>.meta.json  # per-file metadata snapshot
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("avs.threat_engine.quarantine_manager")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_QUARANTINE_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "ThreatQuarantine"
_QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)

_INDEX_FILE = _QUARANTINE_DIR / "index.json"

# Size of chunks used when hashing / overwriting files.
_CHUNK_SIZE = 1024 * 1024  # 1 MiB


# ---------------------------------------------------------------------------
# Index helpers
# ---------------------------------------------------------------------------
def _load_index() -> dict[str, dict]:
    """Load the quarantine index, returning an empty mapping if missing."""
    try:
        if _INDEX_FILE.exists():
            with _INDEX_FILE.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
                if isinstance(data, dict):
                    return data
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("Failed to read quarantine index: %s", exc)
    return {}


def _save_index(index: dict[str, dict]) -> None:
    """Atomically persist the quarantine index."""
    tmp = _INDEX_FILE.with_suffix(".json.tmp")
    try:
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(index, fh, indent=2, default=str)
        tmp.replace(_INDEX_FILE)
    except OSError as exc:
        log.error("Failed to save quarantine index: %s", exc)
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def _compute_sha256(file_path: Path) -> str:
    """Compute the SHA-256 hex digest of *file_path*."""
    hasher = hashlib.sha256()
    try:
        with file_path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(_CHUNK_SIZE), b""):
                hasher.update(chunk)
    except OSError as exc:
        log.error("Failed to hash %s: %s", file_path, exc)
        raise
    return hasher.hexdigest()


def _secure_overwrite_and_delete(file_path: Path) -> None:
    """Overwrite *file_path* with zeros then delete it."""
    try:
        size = file_path.stat().st_size
    except OSError as exc:
        log.warning("Cannot stat %s for secure wipe: %s", file_path, exc)
        try:
            file_path.unlink()
        except OSError:
            pass
        return

    try:
        with file_path.open("r+b") as fh:
            remaining = size
            while remaining > 0:
                chunk = b"\x00" * min(_CHUNK_SIZE, remaining)
                fh.write(chunk)
                remaining -= len(chunk)
            fh.flush()
            os.fsync(fh.fileno())
    except OSError as exc:
        log.warning("Secure overwrite failed for %s: %s", file_path, exc)
    finally:
        try:
            file_path.unlink()
        except OSError as exc:
            log.error("Failed to delete original file %s: %s", file_path, exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def quarantine_file(file_path: str, threat_info: dict) -> dict:
    """Quarantine a malicious file.

    Moves *file_path* into the secure quarantine directory using a
    UUID-based name, computes a SHA-256 of the original content,
    securely overwrites the original with zeros, then deletes it.
    Metadata is recorded in the quarantine index.

    Returns a dict with ``quarantine_id``, ``original_path``,
    ``quarantine_path`` and ``sha256``.
    """
    src = Path(file_path)
    result = {
        "quarantine_id": "",
        "original_path": str(src.resolve() if src.exists() else src),
        "quarantine_path": "",
        "sha256": "",
    }

    if not src.exists() or not src.is_file():
        log.error("Quarantine failed — file not found: %s", src)
        return result

    quarantine_id = str(uuid.uuid4())
    dest = _QUARANTINE_DIR / f"{quarantine_id}.bin"
    meta_path = _QUARANTINE_DIR / f"{quarantine_id}.meta.json"

    # 1. Compute SHA-256 of the original file.
    try:
        sha256 = _compute_sha256(src)
    except OSError:
        return result
    result["sha256"] = sha256

    # 2. Copy the file into quarantine (atomic-ish: copy then verify).
    try:
        shutil.copy2(src, dest)
    except OSError as exc:
        log.error("Failed to copy %s to quarantine: %s", src, exc)
        return result

    # Verify the copy by re-hashing.
    try:
        if _compute_sha256(dest) != sha256:
            log.error("Quarantine copy verification failed for %s", src)
            try:
                dest.unlink()
            except OSError:
                pass
            return result
    except OSError:
        try:
            dest.unlink()
        except OSError:
            pass
        return result

    result["quarantine_path"] = str(dest)
    result["quarantine_id"] = quarantine_id

    # 3. Build metadata record.
    threat_name = ""
    if isinstance(threat_info, dict):
        threat_name = (
            threat_info.get("name")
            or threat_info.get("threat_name")
            or threat_info.get("signature")
            or ""
        )

    record = {
        "quarantine_id": quarantine_id,
        "original_path": str(src.resolve()),
        "quarantine_path": str(dest),
        "sha256": sha256,
        "threat_name": threat_name,
        "threat_info": threat_info if isinstance(threat_info, dict) else {},
        "quarantine_date": datetime.now(timezone.utc).isoformat(),
        "file_size": src.stat().st_size,
    }

    # 4. Persist per-file metadata snapshot.
    try:
        with meta_path.open("w", encoding="utf-8") as fh:
            json.dump(record, fh, indent=2, default=str)
    except OSError as exc:
        log.warning("Failed to write metadata snapshot: %s", exc)

    # 5. Update the index.
    index = _load_index()
    index[quarantine_id] = record
    _save_index(index)

    # 6. Securely wipe the original file.
    _secure_overwrite_and_delete(src)

    log.info(
        "Quarantined file %s (id=%s, threat=%r, sha256=%s)",
        src,
        quarantine_id,
        threat_name,
        sha256,
    )
    return result


def restore_file(quarantine_id: str) -> dict:
    """Restore a quarantined file to its original location.

    Copies the quarantined payload back to the original path, removes
    it from quarantine, and updates the index.

    Returns ``{"restored": True, "original_path": "..."}`` on success
    or ``{"restored": False, "error": "..."}`` on failure.
    """
    index = _load_index()
    record = index.get(quarantine_id)
    if not record:
        log.error("Restore failed — unknown quarantine id: %s", quarantine_id)
        return {"restored": False, "error": "quarantine id not found"}

    dest = Path(record["quarantine_path"])
    original = Path(record["original_path"])

    if not dest.exists():
        log.error("Restore failed — payload missing: %s", dest)
        return {"restored": False, "error": "quarantine payload missing"}

    try:
        original.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(dest, original)
    except OSError as exc:
        log.error("Failed to restore %s to %s: %s", dest, original, exc)
        return {"restored": False, "error": str(exc)}

    # Remove from quarantine.
    try:
        dest.unlink()
    except OSError as exc:
        log.warning("Failed to delete quarantine payload %s: %s", dest, exc)

    meta_path = _QUARANTINE_DIR / f"{quarantine_id}.meta.json"
    try:
        meta_path.unlink()
    except OSError:
        pass

    del index[quarantine_id]
    _save_index(index)

    log.info("Restored file %s (id=%s)", original, quarantine_id)
    return {"restored": True, "original_path": str(original)}


def list_quarantined() -> list[dict]:
    """Return metadata for every quarantined file."""
    index = _load_index()
    return list(index.values())


def delete_quarantined(quarantine_id: str) -> dict:
    """Permanently delete a quarantined file and remove it from the index."""
    index = _load_index()
    record = index.get(quarantine_id)
    if not record:
        log.error("Delete failed — unknown quarantine id: %s", quarantine_id)
        return {"deleted": False, "error": "quarantine id not found"}

    dest = Path(record["quarantine_path"])
    if dest.exists():
        try:
            _secure_overwrite_and_delete(dest)
        except OSError as exc:
            log.warning("Secure wipe of %s failed: %s", dest, exc)
            try:
                dest.unlink()
            except OSError:
                pass

    meta_path = _QUARANTINE_DIR / f"{quarantine_id}.meta.json"
    try:
        meta_path.unlink()
    except OSError:
        pass

    del index[quarantine_id]
    _save_index(index)

    log.info("Permanently deleted quarantined file %s (id=%s)", dest, quarantine_id)
    return {"deleted": True, "quarantine_id": quarantine_id}


def clear_quarantine() -> dict:
    """Delete every quarantined file and reset the index."""
    index = _load_index()
    cleared = 0
    failed = 0

    for quarantine_id, record in list(index.items()):
        dest = Path(record.get("quarantine_path", ""))
        if dest.exists():
            try:
                _secure_overwrite_and_delete(dest)
                cleared += 1
            except OSError as exc:
                log.warning("Failed to wipe %s: %s", dest, exc)
                failed += 1

        meta_path = _QUARANTINE_DIR / f"{quarantine_id}.meta.json"
        try:
            meta_path.unlink()
        except OSError:
            pass

    _save_index({})

    log.info("Cleared quarantine (%d deleted, %d failed)", cleared, failed)
    return {"cleared": True, "deleted_count": cleared, "failed_count": failed}


# ---------------------------------------------------------------------------
# Extended quarantine management
# ---------------------------------------------------------------------------

# Default quarantine expiry: 30 days
_DEFAULT_EXPIRY_DAYS = 30


def get_quarantine_stats() -> dict:
    """Get statistics about the quarantine."""
    index = _load_index()
    total_size = 0
    by_threat_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    by_source: dict[str, int] = {}
    oldest = None
    newest = None

    for record in index.values():
        total_size += record.get("file_size", 0)
        t_type = record.get("threat_type", "unknown")
        by_threat_type[t_type] = by_threat_type.get(t_type, 0) + 1
        severity = record.get("severity", "medium")
        by_severity[severity] = by_severity.get(severity, 0) + 1
        source = record.get("detection_source", "unknown")
        by_source[source] = by_source.get(source, 0) + 1

        quarantined_at = record.get("quarantined_at", "")
        if quarantined_at:
            if oldest is None or quarantined_at < oldest:
                oldest = quarantined_at
            if newest is None or quarantined_at > newest:
                newest = quarantined_at

    return {
        "total_files": len(index),
        "total_size": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "by_threat_type": by_threat_type,
        "by_severity": by_severity,
        "by_source": by_source,
        "oldest_quarantine": oldest,
        "newest_quarantine": newest,
        "quarantine_dir": str(_QUARANTINE_DIR),
    }


def search_quarantine(
    threat_type: str | None = None,
    severity: str | None = None,
    source: str | None = None,
    file_name_contains: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict]:
    """Search quarantined files with filters."""
    items = list_quarantined()
    results = []

    for item in items:
        if threat_type and item.get("threat_type", "").lower() != threat_type.lower():
            continue
        if severity and item.get("severity", "").lower() != severity.lower():
            continue
        if source and item.get("detection_source", "").lower() != source.lower():
            continue
        if file_name_contains and file_name_contains.lower() not in item.get("file_name", "").lower():
            continue
        if date_from and item.get("quarantined_at", "") < date_from:
            continue
        if date_to and item.get("quarantined_at", "") > date_to:
            continue
        results.append(item)

    return results


def cleanup_expired_quarantine(expiry_days: int = _DEFAULT_EXPIRY_DAYS) -> dict:
    """Delete quarantined files older than the specified number of days.

    This helps prevent the quarantine from growing indefinitely with
    old threats that the user is unlikely to restore.
    """
    from datetime import datetime, timedelta

    index = _load_index()
    cutoff = datetime.now(timezone.utc) - timedelta(days=expiry_days)
    cutoff_str = cutoff.isoformat()

    expired_ids = []
    for qid, record in list(index.items()):
        quarantined_at = record.get("quarantined_at", "")
        if quarantined_at and quarantined_at < cutoff_str:
            try:
                delete_quarantined(qid)
                expired_ids.append(qid)
            except Exception as e:
                log.warning("Failed to delete expired quarantine %s: %s", qid, e)

    if expired_ids:
        log.info("Cleaned up %d expired quarantine entries (older than %d days)",
                 len(expired_ids), expiry_days)

    return {
        "expired_count": len(expired_ids),
        "expired_ids": expired_ids,
        "expiry_days": expiry_days,
    }


def export_quarantine_list() -> dict:
    """Export the quarantine list as a structured report.

    Useful for compliance, audit, or sharing with security teams.
    """
    items = list_quarantined()
    stats = get_quarantine_stats()

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "items": items,
        "total_items": len(items),
    }
