"""Community Threat Intelligence module for AVS Shield.

Collects and shares ANONYMIZED threat intelligence across the community.

PRIVACY IS PARAMOUNT:
- Only shares anonymized threat hashes and metadata — NEVER file contents,
  paths, or user info.
- All submissions are opt-in (default off).
- Users can preview what data would be shared before submitting.
- No personal data is ever transmitted.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.ai_features.community_intel")

IS_WINDOWS = platform.system() == "Windows"

# Fields that are safe to share (anonymized, no personal data).
SAFE_FIELDS: tuple[str, ...] = (
    "sha256",
    "md5",
    "threat_name",
    "threat_type",
    "severity",
    "detection_source",
    "timestamp",
)

# Fields that must NEVER be transmitted.
FORBIDDEN_FIELDS: tuple[str, ...] = (
    "file_path",
    "file_content",
    "username",
    "machine_name",
    "ip_address",
)

# Rate limiting: minimum seconds between submissions.
MIN_SUBMIT_INTERVAL_SECONDS: float = 5.0

# Default community server endpoint.
DEFAULT_SERVER_URL: str = "https://community.avs-shield.ai/api/v1"

# Network timeout for HTTP requests (seconds).
HTTP_TIMEOUT: float = 10.0


def _default_cache_path() -> Path:
    """Return the default cache file path under %LOCALAPPDATA%."""
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        # Fall back to a platform-appropriate default.
        if IS_WINDOWS:
            local_app_data = os.path.expanduser("~\\AppData\\Local")
        else:
            local_app_data = os.path.expanduser("~/.local/share")
    return Path(local_app_data) / "AVS Shield" / "threat_engine" / "community_intel.json"


def _utc_now_iso() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


class CommunityIntel:
    """Collects and shares anonymized community threat intelligence."""

    name = "community_intel"

    def __init__(self, config: dict[str, Any]) -> None:
        self._lock = threading.Lock()
        self._config: dict[str, Any] = {
            "opt_in": False,
            "server_url": DEFAULT_SERVER_URL,
            "cache": str(_default_cache_path()),
        }
        # Merge user-supplied config over defaults.
        if config:
            self._config.update(config)

        # In-memory state.
        self._submissions: deque[dict[str, Any]] = deque(maxlen=1000)
        self._last_submit_time: float = 0.0
        self._last_sync: str | None = None
        self._server_reachable: bool | None = None

        # Load any cached state from disk.
        self._load_cache()

        log.info(
            "CommunityIntel initialized (opt_in=%s, server=%s)",
            self._config.get("opt_in", False),
            self._config.get("server_url"),
        )

    # ------------------------------------------------------------------
    # Cache persistence
    # ------------------------------------------------------------------

    def _load_cache(self) -> None:
        """Load cached submissions and state from disk."""
        cache_path = Path(self._config.get("cache", ""))
        if not cache_path:
            return
        try:
            if cache_path.exists():
                with cache_path.open("r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, dict):
                    stored = data.get("submissions", [])
                    if isinstance(stored, list):
                        self._submissions.extend(stored)
                    self._last_sync = data.get("last_sync")
                    self._last_submit_time = float(data.get("last_submit_time", 0.0))
                    log.debug("Loaded %d cached submissions", len(self._submissions))
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to load community intel cache: %s", exc)

    def _save_cache(self) -> None:
        """Persist cached submissions and state to disk."""
        cache_path = Path(self._config.get("cache", ""))
        if not cache_path:
            return
        try:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "submissions": list(self._submissions),
                "last_sync": self._last_sync,
                "last_submit_time": self._last_submit_time,
            }
            with cache_path.open("w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=2)
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to save community intel cache: %s", exc)

    # ------------------------------------------------------------------
    # Privacy helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _sanitize(threat: dict[str, Any]) -> dict[str, Any]:
        """Extract only safe, anonymized fields from a threat dict.

        This is the core privacy guarantee: only fields in SAFE_FIELDS are
        ever included, and any forbidden fields are explicitly stripped.
        """
        sanitized: dict[str, Any] = {}
        for field in SAFE_FIELDS:
            if field in threat and threat[field] is not None:
                sanitized[field] = threat[field]
        # Belt-and-suspenders: ensure no forbidden fields slipped in.
        for field in FORBIDDEN_FIELDS:
            sanitized.pop(field, None)
        return sanitized

    def _is_rate_limited(self) -> bool:
        """Return True if a submission would violate the rate limit."""
        now = time.monotonic()
        return (now - self._last_submit_time) < MIN_SUBMIT_INTERVAL_SECONDS

    # ------------------------------------------------------------------
    # Network helpers
    # ------------------------------------------------------------------

    def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST JSON to the community server and return the parsed response."""
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:  # noqa: S310
            body = resp.read().decode("utf-8", errors="replace")
            if body:
                return json.loads(body)
            return {}

    def _get_json(self, url: str) -> dict[str, Any] | list[Any]:
        """GET JSON from the community server and return the parsed response."""
        req = urllib.request.Request(
            url,
            headers={"Accept": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:  # noqa: S310
            body = resp.read().decode("utf-8", errors="replace")
            if body:
                return json.loads(body)
            return {}

    def _check_server_reachable(self) -> bool:
        """Best-effort check whether the community server is reachable."""
        server_url = self._config.get("server_url", DEFAULT_SERVER_URL)
        health_url = urllib.parse.urljoin(server_url + "/", "health")
        try:
            self._get_json(health_url)
            self._server_reachable = True
            return True
        except Exception as exc:  # noqa: BLE001
            log.debug("Server reachability check failed: %s", exc)
            self._server_reachable = False
            return False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def submit_threat(self, threat: dict) -> dict:
        """Submit anonymized threat data to the community server.

        Only sends: sha256, md5, threat_name, threat_type, severity,
        detection_source, timestamp. NEVER sends file_path, file_content,
        username, machine_name, or ip_address.

        Returns a dict with: submitted, submission_id, error.
        """
        with self._lock:
            if not self._config.get("opt_in", False):
                return {
                    "submitted": False,
                    "submission_id": None,
                    "error": "Opt-in is disabled; community submissions are off.",
                }

            if self._is_rate_limited():
                wait = MIN_SUBMIT_INTERVAL_SECONDS - (
                    time.monotonic() - self._last_submit_time
                )
                return {
                    "submitted": False,
                    "submission_id": None,
                    "error": f"Rate limited; retry in {wait:.1f}s.",
                }

            sanitized = self._sanitize(threat)
            if not sanitized.get("sha256") and not sanitized.get("md5"):
                return {
                    "submitted": False,
                    "submission_id": None,
                    "error": "Threat must include at least a sha256 or md5 hash.",
                }

            server_url = self._config.get("server_url", DEFAULT_SERVER_URL)
            submit_url = urllib.parse.urljoin(server_url + "/", "submit")
            submission_id: str | None = None
            error: str | None = None
            submitted = False

            try:
                resp = self._post_json(submit_url, sanitized)
                if isinstance(resp, dict):
                    submission_id = resp.get("submission_id")
                    submitted = True
                else:
                    error = "Unexpected server response format."
            except urllib.error.URLError as exc:
                error = f"Server unreachable: {exc}"
                log.warning("Submission failed (server unreachable): %s", exc)
            except Exception as exc:  # noqa: BLE001
                error = f"Submission error: {exc}"
                log.warning("Submission failed: %s", exc)

            # Record locally regardless of server success (queue if needed).
            local_record = {
                **sanitized,
                "submitted_at": _utc_now_iso(),
                "submission_id": submission_id,
                "queued": not submitted,
            }
            self._submissions.append(local_record)
            self._last_submit_time = time.monotonic()
            if submitted:
                self._last_sync = _utc_now_iso()
            self._save_cache()

            return {
                "submitted": submitted,
                "submission_id": submission_id,
                "error": error,
            }

    def get_submissions(self, limit: int = 50) -> list[dict]:
        """Return recent community submissions from the local cache."""
        with self._lock:
            items = list(self._submissions)
        # Newest first.
        items.reverse()
        return items[:limit]

    def get_status(self) -> dict:
        """Return the current status of the community intel module."""
        with self._lock:
            return {
                "opt_in": bool(self._config.get("opt_in", False)),
                "submissions_count": len(self._submissions),
                "last_sync": self._last_sync,
                "server_reachable": self._server_reachable,
            }

    def configure(self, config: dict) -> dict:
        """Update configuration and persist the cache.

        Returns the updated configuration (with sensitive values omitted).
        """
        with self._lock:
            if config:
                self._config.update(config)
            self._save_cache()
            log.info("Configuration updated (opt_in=%s)", self._config.get("opt_in"))
            return {
                "opt_in": bool(self._config.get("opt_in", False)),
                "server_url": self._config.get("server_url", DEFAULT_SERVER_URL),
                "cache": self._config.get("cache", ""),
            }

    def preview_submission(self, threat: dict) -> dict:
        """Show what data would be submitted, without sending anything.

        This provides transparency so users can verify no personal data is
        included before opting in.
        """
        with self._lock:
            sanitized = self._sanitize(threat)
            # Explicitly list any forbidden fields found in the input.
            found_forbidden = [
                field for field in FORBIDDEN_FIELDS if field in threat
            ]
            return {
                "would_send": sanitized,
                "would_not_send": list(FORBIDDEN_FIELDS),
                "forbidden_fields_in_input": found_forbidden,
                "opt_in": bool(self._config.get("opt_in", False)),
                "note": (
                    "No data is transmitted in preview. This shows exactly what "
                    "would be shared if you submit."
                ),
            }

    def sync(self) -> dict:
        """Sync local submissions with the community server.

        Attempts to flush any queued (previously unsent) submissions and
        pulls recent community submissions. Returns a summary of the sync.
        """
        with self._lock:
            if not self._config.get("opt_in", False):
                return {
                    "synced": False,
                    "queued_flushed": 0,
                    "received": 0,
                    "error": "Opt-in is disabled; sync is not active.",
                }

            server_url = self._config.get("server_url", DEFAULT_SERVER_URL)
            reachable = self._check_server_reachable()
            if not reachable:
                return {
                    "synced": False,
                    "queued_flushed": 0,
                    "received": 0,
                    "error": "Community server is not reachable.",
                }

            # Flush queued submissions.
            queued = [s for s in self._submissions if s.get("queued")]
            flushed = 0
            for record in queued:
                payload = {
                    k: v
                    for k, v in record.items()
                    if k in SAFE_FIELDS
                }
                try:
                    submit_url = urllib.parse.urljoin(server_url + "/", "submit")
                    resp = self._post_json(submit_url, payload)
                    if isinstance(resp, dict) and resp.get("submission_id"):
                        record["submission_id"] = resp.get("submission_id")
                        record["queued"] = False
                        flushed += 1
                except Exception as exc:  # noqa: BLE001
                    log.debug("Failed to flush queued submission: %s", exc)
                    break  # Server likely still down; stop flushing.

            # Pull recent community submissions.
            received = 0
            try:
                recent_url = urllib.parse.urljoin(server_url + "/", "recent")
                resp = self._get_json(recent_url)
                if isinstance(resp, list):
                    for item in resp:
                        if isinstance(item, dict):
                            self._submissions.append(item)
                            received += 1
            except Exception as exc:  # noqa: BLE001
                log.debug("Failed to pull recent submissions: %s", exc)

            self._last_sync = _utc_now_iso()
            self._save_cache()

            return {
                "synced": True,
                "queued_flushed": flushed,
                "received": received,
                "error": None,
            }

    def get_community_stats(self) -> dict:
        """Get community-wide statistics from the server."""
        with self._lock:
            if not self._config.get("opt_in", False):
                return {
                    "available": False,
                    "error": "Opt-in is disabled; stats are not available.",
                    "stats": None,
                }

            server_url = self._config.get("server_url", DEFAULT_SERVER_URL)
            stats_url = urllib.parse.urljoin(server_url + "/", "stats")
            try:
                resp = self._get_json(stats_url)
                if isinstance(resp, dict):
                    self._server_reachable = True
                    return {
                        "available": True,
                        "error": None,
                        "stats": resp,
                    }
                return {
                    "available": False,
                    "error": "Unexpected stats response format.",
                    "stats": None,
                }
            except Exception as exc:  # noqa: BLE001
                self._server_reachable = False
                log.debug("Failed to fetch community stats: %s", exc)
                return {
                    "available": False,
                    "error": f"Server unreachable: {exc}",
                    "stats": None,
                }
