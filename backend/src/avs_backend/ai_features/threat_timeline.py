"""Threat Timeline Visualization for AVS AI Shield.

Aggregates threat detection events into a chronological timeline so the
dashboard and other modules can render a unified view of security
activity over time.

Each recorded event captures:

  * ``timestamp``      — ISO-8601 UTC string of when the event occurred.
  * ``type``           — threat category (e.g. ``malware``, ``pup``).
  * ``severity``       — ``low`` | ``medium`` | ``high`` | ``critical``.
  * ``source``         — detecting module / engine name.
  * ``description``    — human-readable summary.
  * ``file_path``      — path of the affected file (if applicable).
  * ``action_taken``   — remediation action (e.g. ``quarantined``).

Events are persisted to a JSON file on disk and kept in an in-memory
ring buffer (max 10000 events). All public operations are thread-safe.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.ai_features.threat_timeline")

IS_WINDOWS = platform.system() == "Windows"

# Maximum number of events retained in the ring buffer / on disk.
_MAX_EVENTS = 10000

# Valid severity levels (used for normalisation / summary buckets).
_SEVERITIES = ("low", "medium", "high", "critical")


def _data_dir() -> Path:
    """Return the directory used to persist timeline data."""
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        base = Path(local_app_data)
    elif IS_WINDOWS:
        base = Path.home() / "AppData" / "Local"
    else:
        base = Path.home() / ".local" / "share"
    return base / "AVS AI Shield" / "threat_engine"


def _parse_timestamp(value: str | None) -> datetime | None:
    """Parse an ISO-8601 timestamp into an aware ``datetime``.

    Returns ``None`` when the value cannot be parsed.
    """
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class ThreatTimeline:
    """Thread-safe chronological store of threat detection events."""

    name = "threat_timeline"

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialise the timeline, loading any persisted data from disk.

        ``config`` may optionally override the storage path via the
        ``data_path`` key. Otherwise the default ``%LOCALAPPDATA%``
        location is used.
        """
        self._config = config or {}
        self._lock = threading.Lock()
        self._events: deque[dict[str, Any]] = deque(maxlen=_MAX_EVENTS)
        self._next_id = 1

        custom_path = self._config.get("data_path")
        if custom_path:
            self._data_path = Path(custom_path)
        else:
            self._data_path = _data_dir() / "threat_timeline.json"

        self._load_from_disk()

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------
    def _load_from_disk(self) -> None:
        """Load persisted timeline events from disk if available."""
        try:
            if not self._data_path.exists():
                return
            with self._data_path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            events = payload.get("events", [])
            with self._lock:
                self._events.clear()
                for evt in events[-_MAX_EVENTS:]:
                    self._events.append(evt)
                if self._events:
                    self._next_id = max(
                        int(e.get("id", 0)) for e in self._events
                    ) + 1
                else:
                    self._next_id = 1
            log.debug("Loaded %d timeline events from %s", len(self._events), self._data_path)
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to load timeline from disk: %s", exc)

    def _save_to_disk(self) -> None:
        """Persist the current timeline events to disk."""
        try:
            self._data_path.parent.mkdir(parents=True, exist_ok=True)
            with self._lock:
                events = list(self._events)
            payload = {"events": events, "saved_at": datetime.now(timezone.utc).isoformat()}
            tmp_path = self._data_path.with_suffix(".json.tmp")
            with tmp_path.open("w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            tmp_path.replace(self._data_path)
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to save timeline to disk: %s", exc)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def record_event(self, event: dict) -> dict:
        """Record a threat event in the timeline.

        Expected keys: ``timestamp``, ``type``, ``severity``, ``source``,
        ``description``, ``file_path``, ``action_taken``. Missing keys
        are filled with sensible defaults.
        """
        try:
            timestamp = event.get("timestamp") or datetime.now(timezone.utc).isoformat()
            severity = str(event.get("severity", "low")).lower()
            if severity not in _SEVERITIES:
                severity = "low"
            record = {
                "id": 0,  # assigned under lock below
                "timestamp": timestamp,
                "type": str(event.get("type", "unknown")),
                "severity": severity,
                "source": str(event.get("source", "unknown")),
                "description": str(event.get("description", "")),
                "file_path": str(event.get("file_path", "")),
                "action_taken": str(event.get("action_taken", "logged")),
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            }
            with self._lock:
                record["id"] = self._next_id
                self._next_id += 1
                self._events.append(record)
            self._save_to_disk()
            log.info("Recorded threat event #%s (%s/%s)", record["id"], record["type"], record["severity"])
            return {"status": "ok", "event": record}
        except Exception as exc:  # noqa: BLE001
            log.error("Failed to record threat event: %s", exc)
            return {"status": "error", "error": str(exc)}

    def get_timeline(
        self,
        start_time: str | None = None,
        end_time: str | None = None,
        limit: int = 100,
    ) -> dict:
        """Return timeline events filtered by an optional time range.

        Events are sorted newest-first and capped at ``limit``.
        """
        try:
            start_dt = _parse_timestamp(start_time)
            end_dt = _parse_timestamp(end_time)
            with self._lock:
                events = list(self._events)
            filtered = []
            for evt in events:
                evt_dt = _parse_timestamp(evt.get("timestamp"))
                if evt_dt is None:
                    continue
                if start_dt and evt_dt < start_dt:
                    continue
                if end_dt and evt_dt > end_dt:
                    continue
                filtered.append(evt)
            filtered.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
            total = len(filtered)
            limited = filtered[:limit] if limit > 0 else filtered
            summary = self._compute_summary(events)
            return {"events": limited, "total": total, "summary": summary}
        except Exception as exc:  # noqa: BLE001
            log.error("Failed to get timeline: %s", exc)
            return {"events": [], "total": 0, "summary": {}, "error": str(exc)}

    def get_summary(self) -> dict:
        """Return aggregate statistics about the timeline."""
        try:
            with self._lock:
                events = list(self._events)
            return self._compute_summary(events)
        except Exception as exc:  # noqa: BLE001
            log.error("Failed to get summary: %s", exc)
            return {"error": str(exc)}

    def get_status(self) -> dict:
        """Return the current status of the timeline store."""
        try:
            with self._lock:
                count = len(self._events)
                next_id = self._next_id
            return {
                "status": "ok",
                "name": self.name,
                "event_count": count,
                "next_id": next_id,
                "max_events": _MAX_EVENTS,
                "data_path": str(self._data_path),
                "persisted": self._data_path.exists(),
            }
        except Exception as exc:  # noqa: BLE001
            log.error("Failed to get status: %s", exc)
            return {"status": "error", "error": str(exc)}

    def clear_timeline(self) -> dict:
        """Remove all timeline events from memory and disk."""
        try:
            with self._lock:
                removed = len(self._events)
                self._events.clear()
                self._next_id = 1
            self._save_to_disk()
            log.info("Cleared timeline (%d events removed)", removed)
            return {"status": "ok", "removed": removed}
        except Exception as exc:  # noqa: BLE001
            log.error("Failed to clear timeline: %s", exc)
            return {"status": "error", "error": str(exc)}

    def export_timeline(self, format: str = "json") -> dict:
        """Export the full timeline in the requested format.

        Currently supports ``json`` (default) and ``csv``.
        """
        try:
            fmt = (format or "json").lower()
            with self._lock:
                events = list(self._events)
            if fmt == "json":
                return {
                    "status": "ok",
                    "format": "json",
                    "events": events,
                    "total": len(events),
                }
            if fmt == "csv":
                import csv
                import io

                output = io.StringIO()
                if events:
                    writer = csv.DictWriter(output, fieldnames=events[0].keys())
                    writer.writeheader()
                    writer.writerows(events)
                return {
                    "status": "ok",
                    "format": "csv",
                    "data": output.getvalue(),
                    "total": len(events),
                }
            return {"status": "error", "error": f"Unsupported format: {format}"}
        except Exception as exc:  # noqa: BLE001
            log.error("Failed to export timeline: %s", exc)
            return {"status": "error", "error": str(exc)}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _compute_summary(self, events: list[dict[str, Any]]) -> dict:
        """Compute aggregate statistics for the supplied events."""
        now = datetime.now(timezone.utc)
        by_type: dict[str, int] = {}
        by_severity: dict[str, int] = {s: 0 for s in _SEVERITIES}
        by_source: dict[str, int] = {}
        last_24h = 0
        last_7d = 0
        last_30d = 0

        for evt in events:
            etype = str(evt.get("type", "unknown"))
            by_type[etype] = by_type.get(etype, 0) + 1

            sev = str(evt.get("severity", "low")).lower()
            if sev in by_severity:
                by_severity[sev] += 1
            else:
                by_severity[sev] = by_severity.get(sev, 0) + 1

            source = str(evt.get("source", "unknown"))
            by_source[source] = by_source.get(source, 0) + 1

            evt_dt = _parse_timestamp(evt.get("timestamp"))
            if evt_dt is not None:
                age = now - evt_dt
                if age <= timedelta(hours=24):
                    last_24h += 1
                if age <= timedelta(days=7):
                    last_7d += 1
                if age <= timedelta(days=30):
                    last_30d += 1

        trend = self._compute_trend(events, now)
        return {
            "total_events": len(events),
            "by_type": by_type,
            "by_severity": by_severity,
            "by_source": by_source,
            "last_24h": last_24h,
            "last_7d": last_7d,
            "last_30d": last_30d,
            "trend": trend,
        }

    def _compute_trend(self, events: list[dict[str, Any]], now: datetime) -> str:
        """Compare the last 7 days against the previous 7 days.

        Returns ``"increasing"``, ``"decreasing"`` or ``"stable"``.
        """
        recent_start = now - timedelta(days=7)
        previous_start = now - timedelta(days=14)
        recent = 0
        previous = 0
        for evt in events:
            evt_dt = _parse_timestamp(evt.get("timestamp"))
            if evt_dt is None:
                continue
            if recent_start <= evt_dt <= now:
                recent += 1
            elif previous_start <= evt_dt < recent_start:
                previous += 1
        if recent > previous:
            return "increasing"
        if recent < previous:
            return "decreasing"
        return "stable"
