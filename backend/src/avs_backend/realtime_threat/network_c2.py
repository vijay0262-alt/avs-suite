"""Network C2 (Command & Control) detection module — AVS AI Shield.

Monitors active network connections and checks remote IP addresses against
multiple threat intelligence feeds to detect possible C2 beaconing:

  - Abuse.ch ThreatFox IOCs (IP addresses)
  - Spamhaus DROP / EDROP lists
  - AlienVault OTX (optional, requires API key)
  - Local blocklist of known C2 IPs

Feeds are cached locally under
``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\c2_feeds.json`` and refreshed at
most once every 6 hours.  Monitoring runs in a background daemon thread that
polls ``psutil.net_connections()`` every 5 seconds.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import threading
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psutil

log = logging.getLogger("avs.realtime_threat.network_c2")

IS_WINDOWS = platform.system() == "Windows"

# =====================================================================
# Constants
# =====================================================================

_FEED_CACHE_PATH = Path(
    os.path.expandvars(r"%LOCALAPPDATA%\AVS AI Shield\threat_engine\c2_feeds.json")
)

_SPAMHAUS_DROP_URL = "https://www.spamhaus.org/drop/drop.txt"
_SPAMHAUS_EDROP_URL = "https://www.spamhaus.org/drop/edrop.txt"
_THREATFOX_URL = "https://threatfox-api.abuse.ch/api/v1/"

_FEED_REFRESH_INTERVAL = 6 * 60 * 60  # 6 hours
_POLL_INTERVAL = 5  # seconds
_MAX_ALERTS = 500
_HTTP_TIMEOUT = 15  # seconds

# Default local blocklist — well-known C2 infrastructure placeholders.
# Operators can extend this via config["local_blocklist"].
_DEFAULT_LOCAL_BLOCKLIST: list[str] = []

# Private / reserved IP ranges that should never be flagged as C2.
_PRIVATE_PREFIXES = (
    "10.",
    "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.",
    "172.24.", "172.25.", "172.26.", "172.27.",
    "172.28.", "172.29.", "172.30.", "172.31.",
    "192.168.",
    "127.", "0.", "169.254.",
    "::1", "fe80", "fc", "fd",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_private_ip(ip: str) -> bool:
    """Return True for loopback / private / link-local addresses."""
    if not ip:
        return True
    ip_stripped = ip.lstrip("[").rstrip("]")
    # Strip IPv6 zone id
    if "%" in ip_stripped:
        ip_stripped = ip_stripped.split("%", 1)[0]
    return ip_stripped.lower().startswith(_PRIVATE_PREFIXES)


# =====================================================================
# NetworkC2Detector
# =====================================================================


class NetworkC2Detector:
    """Detect outbound connections to known C2 infrastructure.

    The detector is thread-safe — alerts and status counters are guarded by
    an internal lock.  Monitoring is performed by a daemon thread that polls
    active connections every ``_POLL_INTERVAL`` seconds.
    """

    name = "network_c2"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}
        self._lock = threading.Lock()

        # Monitoring state
        self._running = False
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

        # Counters
        self._connections_checked = 0
        self._threats_found = 0

        # Alert ring buffer
        self._alerts: list[dict[str, Any]] = []

        # Feed cache
        self._feeds: dict[str, Any] = {}
        self._feeds_loaded = 0
        self._last_feed_update = 0.0

        # Optional AlienVault OTX API key
        self._otx_api_key: str | None = self._config.get("otx_api_key")

        # Local blocklist (config override + defaults)
        self._local_blocklist: set[str] = set(
            self._config.get("local_blocklist", _DEFAULT_LOCAL_BLOCKLIST)
        )

        # Already-alerted (ip, pid) pairs to avoid duplicate spam within a scan
        self._alerted: set[tuple[str, int]] = set()

        # Try to load cached feeds immediately
        try:
            self._feeds = self._load_feeds()
            self._feeds_loaded = sum(
                1 for v in self._feeds.values() if isinstance(v, dict) and v.get("ips")
            )
            log.info("Loaded %d cached C2 feeds", self._feeds_loaded)
        except Exception as e:
            log.debug("Could not load cached feeds: %s", e)
            self._feeds = {}

    # -----------------------------------------------------------------
    # Feed management
    # -----------------------------------------------------------------

    def _load_feeds(self) -> dict[str, Any]:
        """Load feeds from the local JSON cache."""
        try:
            if _FEED_CACHE_PATH.exists():
                with open(_FEED_CACHE_PATH, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    if isinstance(data, dict):
                        self._last_feed_update = float(data.get("updated_at", 0.0))
                        return data.get("feeds", {})
        except Exception as e:
            log.debug("Failed to load feed cache: %s", e)
        return {}

    def _save_feeds(self, feeds: dict[str, Any]) -> None:
        """Save feeds to the local JSON cache."""
        try:
            _FEED_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "updated_at": time.time(),
                "feeds": feeds,
            }
            with open(_FEED_CACHE_PATH, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            log.info("Saved C2 feed cache to %s", _FEED_CACHE_PATH)
        except Exception as e:
            log.warning("Failed to save feed cache: %s", e)

    def _http_get(self, url: str, headers: dict[str, str] | None = None,
                  data: bytes | None = None) -> str | None:
        """Perform an HTTP GET/POST and return the response body as text."""
        try:
            req = urllib.request.Request(url, headers=headers or {}, data=data)
            if data is not None:
                req.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            log.debug("HTTP fetch failed for %s: %s", url, e)
            return None

    def _fetch_spamhaus(self, url: str, feed_name: str) -> dict[str, Any]:
        """Fetch and parse a Spamhaus DROP/EDROP list."""
        body = self._http_get(url)
        ips: set[str] = set()
        if not body:
            return {"ips": [], "updated": _now_iso(), "source": url}

        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith(";") or line.startswith("#"):
                continue
            # Format: "1.2.3.0/24 ; S12345 ; description"
            first = line.split(";")[0].strip()
            cidr = first.split()[0] if first else ""
            if "/" in cidr:
                # Expand CIDR to its network address for simple matching
                base = cidr.split("/")[0]
                if base:
                    ips.add(base)
            elif cidr:
                ips.add(cidr)

        log.info("Spamhaus %s: %d entries", feed_name, len(ips))
        return {
            "ips": sorted(ips),
            "updated": _now_iso(),
            "source": url,
            "description": f"Spamhaus {feed_name} blocklist",
        }

    def _fetch_threatfox(self) -> dict[str, Any]:
        """Fetch Abuse.ch ThreatFox IOCs (IP-type)."""
        payload = json.dumps({"query": "get_iocs", "days": 7}).encode("utf-8")
        body = self._http_get(_THREATFOX_URL, data=payload)
        ips: set[str] = set()
        descriptions: dict[str, str] = {}

        if body:
            try:
                data = json.loads(body)
                for entry in data.get("data", []) or []:
                    ioc_type = entry.get("ioc_type", "")
                    ioc_value = entry.get("ioc", "")
                    malware = entry.get("malware_printable", "") or "unknown"
                    if ioc_type.lower() in ("ip", "ip:port") and ioc_value:
                        ip = ioc_value.split(":")[0]
                        ips.add(ip)
                        descriptions[ip] = malware
            except Exception as e:
                log.debug("ThreatFox parse error: %s", e)

        log.info("ThreatFox: %d IP IOCs", len(ips))
        return {
            "ips": sorted(ips),
            "descriptions": descriptions,
            "updated": _now_iso(),
            "source": _THREATFOX_URL,
            "description": "Abuse.ch ThreatFox IOCs (7 days)",
        }

    def _fetch_otx(self) -> dict[str, Any] | None:
        """Fetch AlienVault OTX pulses (optional, requires API key)."""
        if not self._otx_api_key:
            return None
        # OTX has a complex API; we only fetch a small subset of subscribed
        # pulses and extract IPv4 indicators.  This is intentionally lightweight.
        url = "https://otx.alienvault.com/api/v1/indicators/IPv4/__generic__/general"
        headers = {"X-OTX-API-KEY": self._otx_api_key}
        body = self._http_get(url, headers=headers)
        if not body:
            return None
        ips: set[str] = set()
        try:
            data = json.loads(body)
            for section in data.get("sections", []) or []:
                for ind in section.get("indicators", []) or []:
                    if ind.get("type") == "IPv4":
                        ips.add(ind.get("indicator", ""))
        except Exception as e:
            log.debug("OTX parse error: %s", e)
        log.info("OTX: %d IP IOCs", len(ips))
        return {
            "ips": sorted(ips),
            "updated": _now_iso(),
            "source": url,
            "description": "AlienVault OTX pulses",
        }

    def update_feeds(self, force: bool = False) -> dict[str, Any]:
        """Download / refresh threat feeds. Rate-limited to 6 hours."""
        now = time.time()
        if not force and (now - self._last_feed_update) < _FEED_REFRESH_INTERVAL:
            log.debug("Feed update skipped (rate-limited)")
            return {
                "updated": False,
                "reason": "rate_limited",
                "last_update": self._last_feed_update,
                "feeds_loaded": self._feeds_loaded,
            }

        feeds: dict[str, Any] = {}

        # Spamhaus DROP
        try:
            feeds["spamhaus_drop"] = self._fetch_spamhaus(_SPAMHAUS_DROP_URL, "DROP")
        except Exception as e:
            log.warning("Spamhaus DROP fetch failed: %s", e)

        # Spamhaus EDROP
        try:
            feeds["spamhaus_edrop"] = self._fetch_spamhaus(_SPAMHAUS_EDROP_URL, "EDROP")
        except Exception as e:
            log.warning("Spamhaus EDROP fetch failed: %s", e)

        # Abuse.ch ThreatFox
        try:
            feeds["threatfox"] = self._fetch_threatfox()
        except Exception as e:
            log.warning("ThreatFox fetch failed: %s", e)

        # AlienVault OTX (optional)
        try:
            otx = self._fetch_otx()
            if otx is not None:
                feeds["otx"] = otx
        except Exception as e:
            log.warning("OTX fetch failed: %s", e)

        # Local blocklist (always present)
        feeds["local_blocklist"] = {
            "ips": sorted(self._local_blocklist),
            "updated": _now_iso(),
            "source": "local",
            "description": "Local C2 blocklist",
        }

        with self._lock:
            self._feeds = feeds
            self._feeds_loaded = sum(
                1 for v in feeds.values() if isinstance(v, dict) and v.get("ips")
            )
            self._last_feed_update = now

        self._save_feeds(feeds)

        return {
            "updated": True,
            "feeds_loaded": self._feeds_loaded,
            "feed_names": list(feeds.keys()),
            "updated_at": _now_iso(),
        }

    # -----------------------------------------------------------------
    # IP checking
    # -----------------------------------------------------------------

    def check_ip(self, ip: str) -> dict[str, Any] | None:
        """Check a single IP against all loaded feeds.

        Returns a dict describing the first matching feed, or ``None`` if the
        IP is not present in any feed.
        """
        if not ip or _is_private_ip(ip):
            return None

        with self._lock:
            feeds = self._feeds

        for feed_name, feed in feeds.items():
            if not isinstance(feed, dict):
                continue
            ips = feed.get("ips") or []
            if ip in ips:
                descriptions = feed.get("descriptions") or {}
                return {
                    "feed_name": feed_name,
                    "threat_description": descriptions.get(
                        ip, feed.get("description", "Known C2 infrastructure")
                    ),
                    "severity": "high" if feed_name == "local_blocklist" else "critical",
                    "source": feed.get("source", feed_name),
                }
        return None

    # -----------------------------------------------------------------
    # Connection scanning
    # -----------------------------------------------------------------

    def _process_info(self, pid: int | None) -> tuple[str, int]:
        """Return (process_name, pid) safely."""
        if not pid:
            return ("unknown", 0)
        try:
            proc = psutil.Process(pid)
            return (proc.name(), pid)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return ("unknown", pid)
        except Exception:
            return ("unknown", pid)

    def scan_connections(self) -> list[dict[str, Any]]:
        """Scan all current inet connections and return alerts for matches."""
        alerts: list[dict[str, Any]] = []

        try:
            connections = psutil.net_connections(kind="inet")
        except psutil.AccessDenied:
            log.warning("Access denied when reading net connections")
            return alerts
        except Exception as e:
            log.warning("Failed to read net connections: %s", e)
            return alerts

        seen: set[tuple[str, int]] = set()

        for conn in connections:
            try:
                raddr = conn.raddr
                if not raddr:
                    continue
                remote_ip = raddr.ip
                remote_port = raddr.port
                laddr = conn.laddr
                local_address = f"{laddr.ip}:{laddr.port}" if laddr else ""

                with self._lock:
                    self._connections_checked += 1

                key = (remote_ip, conn.pid or 0)
                if key in seen:
                    continue
                seen.add(key)

                match = self.check_ip(remote_ip)
                if not match:
                    continue

                proc_name, proc_pid = self._process_info(conn.pid)

                alert = {
                    "timestamp": _now_iso(),
                    "local_address": local_address,
                    "remote_ip": remote_ip,
                    "remote_port": remote_port,
                    "process_name": proc_name,
                    "process_pid": proc_pid,
                    "feed_name": match["feed_name"],
                    "threat_description": match["threat_description"],
                    "severity": match["severity"],
                    "status": conn.status,
                }
                alerts.append(alert)
                self._add_alert(alert)

            except Exception as e:
                log.debug("Connection scan error: %s", e)
                continue

        return alerts

    # -----------------------------------------------------------------
    # Alert buffer
    # -----------------------------------------------------------------

    def _add_alert(self, alert: dict[str, Any]) -> None:
        with self._lock:
            self._alerts.append(alert)
            if len(self._alerts) > _MAX_ALERTS:
                self._alerts.pop(0)
            self._threats_found += 1

    def get_alerts(self) -> list[dict[str, Any]]:
        """Return a copy of all C2 detection alerts (most recent last)."""
        with self._lock:
            return list(self._alerts)

    def get_status(self) -> dict[str, Any]:
        """Return the current detector status."""
        with self._lock:
            return {
                "running": self._running,
                "connections_checked": self._connections_checked,
                "threats_found": self._threats_found,
                "feeds_loaded": self._feeds_loaded,
                "feed_names": list(self._feeds.keys()),
                "last_feed_update": (
                    datetime.fromtimestamp(
                        self._last_feed_update, tz=timezone.utc
                    ).isoformat()
                    if self._last_feed_update
                    else None
                ),
                "alerts_buffered": len(self._alerts),
                "captured_at": _now_iso(),
            }

    # -----------------------------------------------------------------
    # Monitoring lifecycle
    # -----------------------------------------------------------------

    def _monitor_loop(self) -> None:
        log.info("Network C2 detector monitoring started")
        while not self._stop_event.is_set():
            try:
                self.scan_connections()
            except Exception as e:
                log.debug("C2 monitor loop error: %s", e)
            self._stop_event.wait(_POLL_INTERVAL)
        log.info("Network C2 detector monitoring stopped")

    def start(self) -> dict[str, Any]:
        """Start monitoring in a background daemon thread."""
        with self._lock:
            if self._running:
                return {"started": False, "reason": "already_running"}
            self._running = True

        # Ensure feeds are available — attempt an update if cache is empty
        if not self._feeds:
            try:
                self.update_feeds()
            except Exception as e:
                log.warning("Initial feed update failed: %s", e)

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._monitor_loop, daemon=True, name="c2-monitor"
        )
        self._thread.start()
        return {"started": True, "started_at": _now_iso()}

    def stop(self) -> dict[str, Any]:
        """Stop the monitoring thread."""
        with self._lock:
            if not self._running:
                return {"stopped": False, "reason": "not_running"}
            self._running = False

        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=10.0)
        self._thread = None
        return {"stopped": True, "stopped_at": _now_iso()}
