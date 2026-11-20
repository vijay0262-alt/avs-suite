"""Web Shield — URL filtering and phishing protection for AVS AI Shield.

Signals, evaluated in order of confidence:

  1. Signed threat-intel bundle (license server feeds — exact URL and
     host indicators, hashed; verified with Ed25519).
  2. Local manual blocklist (user-curated, persisted).
  3. Optional DNS blocklist lookups (config ``dnsbl_servers``).
  4. Brand-lookalike heuristics on the registrable domain — combosquat,
     typosquat, homoglyph, subdomain abuse (see
     ``threat_intel.lookalike``).
  5. Weak signals — punycode labels, raw-IP hosts, excessive subdomains,
     abused TLDs, URL shorteners.

False-positive control:
  * Brand matching is token/registrable-domain based — ``pineapple.com``
    cannot match ``apple`` anymore.
  * Domains on the top-20k popular-site allowlist have heuristic-only
    scores capped to "low" so a real site is never marked dangerous
    without an explicit intel/blocklist hit.

Verdict semantics:
  ``risk_level`` ∈ safe|low|medium|high|critical, ``safe`` is True for
  safe+low (weak signals don't block), ``reasons`` are machine-ish tokens,
  ``categories`` group them for UI badges.

All network operations are best-effort: failures are logged, never
raise, and the shield degrades gracefully to local-only checks offline.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from avs_backend.threat_intel.allowlist import is_popular
from avs_backend.threat_intel.domains import (
    canonical_url,
    host_key_from_url,
    is_ip,
    registrable_domain,
)
from avs_backend.threat_intel.lookalike import check_domain, check_url_brands
from avs_backend.threat_intel.store import ThreatIntelStore

log = logging.getLogger("avs.advanced_security.web_shield")

IS_WINDOWS = platform.system() == "Windows"

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_BLOCKLIST_PATH = _DATA_DIR / "url_blocklist.json"
_REPORTS_PATH = _DATA_DIR / "scam_reports.jsonl"
_MAX_REPORTS = 2000

_FEED_UPDATE_INTERVAL = 6 * 60 * 60  # 6 hours between non-forced syncs
_MAX_BLOCKED_HISTORY = 500

# TLDs with high observed abuse rates (Spamhaus/Interisle reporting).
# Weak signal alone — never enough to mark a URL unsafe.
_SUSPICIOUS_TLDS = {
    ".top", ".xyz", ".click", ".sbs", ".cfd", ".bond", ".icu",
    ".shop", ".lol", ".quest", ".rest", ".buzz", ".mom", ".cam",
    ".online", ".site", ".live", ".store", ".monster", ".lat",
}

_URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd",
    "buff.ly", "adf.ly", "shorte.st", "cutt.ly", "rebrand.ly",
    "tiny.cc", "soo.gd", "rb.gy", "shorturl.at", "s.id", "v.gd",
}

# Built-in test/validation entries — the AMTSO Security Features Check
# and EICAR ecosystem publish these hosts specifically so users can
# verify a security product is working. Industry convention (and AMTSO's
# own spec) is that legitimate AV SHOULD flag them. Host-exact entries —
# we deliberately do NOT block the whole eicar.org registrable domain.
_BUILTIN_BLOCKLIST: dict[str, dict[str, Any]] = {
    "phishing.amtso.eicar.org": {"category": "phishing", "source": "amtso-test"},
    "amtso.eicar.org":          {"category": "test",     "source": "amtso-test"},
    "www.amtso.eicar.org":      {"category": "test",     "source": "amtso-test"},
    "cloudcar.amtso.eicar.org": {"category": "test",     "source": "amtso-test"},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class WebShield:
    """URL filtering and phishing protection shield."""

    name = "web_shield"

    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config or {}
        self.urls_checked = 0
        self.threats_blocked = 0
        self.feeds_loaded: list[str] = []
        self._last_feed_update = 0.0
        self._lock = threading.RLock()
        self._blocked_urls: deque[dict[str, Any]] = deque(maxlen=_MAX_BLOCKED_HISTORY)
        self.blocklist: dict[str, dict[str, Any]] = self._load_blocklist()
        # Seed industry-standard test URLs (AMTSO/EICAR) unless the user
        # already overrode them — the Security Features Check expects a
        # working AV to flag these.
        for _k, _v in _BUILTIN_BLOCKLIST.items():
            self.blocklist.setdefault(_k, dict(_v))

        # Threat-intel bundle store (injectable for tests).
        self._intel: ThreatIntelStore | None = self.config.get("intel_store")
        if self._intel is None:
            try:
                self._intel = ThreatIntelStore(
                    bundle_url=self.config.get("threat_intel_url"),
                    cache_path=self.config.get("intel_cache_path"),
                )
            except Exception as e:
                log.warning("threat-intel store unavailable: %s", e)
                self._intel = None
        if self._intel is not None and self.config.get("intel_autosync", True):
            threading.Thread(
                target=self._intel.sync, name="web-shield-intel-sync", daemon=True,
            ).start()

        self.urlscan_api_key: str | None = self.config.get("urlscan_api_key")

        extra_tlds = self.config.get("suspicious_tlds", [])
        self.suspicious_tlds = (
            _SUSPICIOUS_TLDS | {t.lower() for t in extra_tlds}
            if isinstance(extra_tlds, list) else set(_SUSPICIOUS_TLDS)
        )
        extra_shorteners = self.config.get("url_shorteners", [])
        self.url_shorteners = (
            _URL_SHORTENERS | {s.lower() for s in extra_shorteners}
            if isinstance(extra_shorteners, list) else set(_URL_SHORTENERS)
        )

        log.info(
            "WebShield initialized (blocklist: %d, intel: %s)",
            len(self.blocklist),
            "ready" if self._intel else "unavailable",
        )

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _load_blocklist(self) -> dict[str, dict[str, Any]]:
        """Load the local (manual) URL blocklist from disk."""
        if _BLOCKLIST_PATH.exists():
            try:
                with open(_BLOCKLIST_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict) and isinstance(data.get("entries"), dict):
                    return data["entries"]
            except Exception as e:
                log.warning("Failed to load URL blocklist: %s", e)
        return {}

    def _save_blocklist(self) -> None:
        """Persist the local blocklist atomically."""
        try:
            payload = {"entries": self.blocklist, "updated_at": _now_iso()}
            tmp = _BLOCKLIST_PATH.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            os.replace(tmp, _BLOCKLIST_PATH)
        except Exception as e:
            log.error("Failed to save URL blocklist: %s", e)

    def record_user_report(self, url: str, verdict: str, note: str = "") -> None:
        """Queue a user scam/not-scam report locally (JSONL).

        Phase 4 uploads these to the license server for the community
        blocklist; for now they are retained on-device for diagnostics.
        """
        entry = {
            "url": url,
            "verdict": verdict,
            "note": str(note)[:500],
            "reported_at": _now_iso(),
        }
        try:
            with self._lock:
                lines: deque[str] = deque(maxlen=_MAX_REPORTS)
                if _REPORTS_PATH.exists():
                    with open(_REPORTS_PATH, "r", encoding="utf-8") as f:
                        lines.extend(f.readlines())
                lines.append(json.dumps(entry) + "\n")
                tmp = _REPORTS_PATH.with_suffix(".tmp")
                with open(tmp, "w", encoding="utf-8") as f:
                    f.writelines(lines)
                os.replace(tmp, _REPORTS_PATH)
        except Exception as e:
            log.error("Failed to record scam report: %s", e)

    # ------------------------------------------------------------------
    # Heuristic helpers
    # ------------------------------------------------------------------

    def _check_suspicious_tld(self, host: str) -> str | None:
        for tld in self.suspicious_tlds:
            if host.endswith(tld):
                return tld
        return None

    @staticmethod
    def _check_excessive_subdomains(host: str, registrable: str) -> bool:
        """Subdomain depth beyond the registrable domain > 3 labels."""
        if not host or not registrable or not host.endswith(registrable):
            return False
        sub = host[: -len(registrable)].rstrip(".")
        return len([p for p in sub.split(".") if p]) > 3

    @staticmethod
    def _has_punycode(host: str) -> bool:
        return "xn--" in host

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_url(self, url: str) -> dict[str, Any]:
        """Check a URL. Returns {safe, risk_level, reasons, categories,
        score, registrable_domain, intel_source}."""
        if not url or not isinstance(url, str):
            return {
                "safe": False, "risk_level": "critical",
                "reasons": ["empty_url"], "categories": ["invalid"],
                "score": 100, "registrable_domain": "", "intel_source": None,
            }

        canon = canonical_url(url)
        host = host_key_from_url(url)
        registrable = registrable_domain(host) if host else ""

        with self._lock:
            self.urls_checked += 1

        reasons: list[str] = []
        categories: list[str] = []
        score = 0
        intel_source: str | None = None
        explicit_hit = False  # blocklist/intel — allowlist can't soften these

        if not canon:
            reasons.append("malformed_url")
            categories.append("invalid")
            score += 40

        # 1. Threat-intel bundle (highest confidence).
        intel_hit = self._intel.lookup(url) if self._intel else None
        if intel_hit == "url":
            reasons.append("known_phishing_url")
            categories.append("phishing")
            score += 100
            explicit_hit = True
            intel_source = "threat_intel"
        elif intel_hit == "host":
            reasons.append("known_phishing_host")
            categories.append("phishing")
            score += 80
            explicit_hit = True
            intel_source = "threat_intel"

        # 2. Manual blocklist — full URL, host, or registrable domain.
        with self._lock:
            entry = (
                self.blocklist.get(canon)
                or self.blocklist.get(url.strip())
                or self.blocklist.get(host)
                or self.blocklist.get(registrable)
            )
        if entry:
            reasons.append(f"blocklisted:{entry.get('category', 'unknown')}")
            categories.append(entry.get("category", "blocked"))
            score += 100
            explicit_hit = True

        # 3. DNS blocklists (optional, config-driven).
        domain_rep = self.check_domain(host)
        if domain_rep.get("blocked"):
            reasons.append(f"dnsbl:{','.join(domain_rep.get('sources', []))}")
            categories.append("dns_blocklist")
            score += 60
            explicit_hit = True

        # 4. Brand lookalike on the registrable domain.
        look = check_domain(host) if host else None
        if look and look.hit:
            reasons.append(f"{look.signal}:{look.brand}")
            categories.append("brand_lookalike")
            score += {"combosquat": 50, "typosquat": 45,
                      "homoglyph": 50, "subdomain_abuse": 45}.get(look.signal, 40)

        path_look = check_url_brands(host, urlsplit(canon).path if canon else "")
        if path_look and path_look.hit:
            reasons.append(f"path_brand:{path_look.brand}")
            categories.append("brand_lookalike")
            score += 30

        # 5. Weak signals.
        if host and self._has_punycode(host):
            reasons.append("idn_punycode")
            categories.append("homograph")
            score += 25
        if host and is_ip(host):
            reasons.append("raw_ip_host")
            categories.append("ip_url")
            score += 30
        if host and self._check_excessive_subdomains(host, registrable):
            reasons.append("excessive_subdomains")
            categories.append("subdomain_abuse")
            score += 15
        if host:
            bad_tld = self._check_suspicious_tld(host)
            if bad_tld:
                reasons.append(f"suspicious_tld:{bad_tld}")
                categories.append("suspicious_tld")
                score += 15
        if host and registrable in self.url_shorteners:
            reasons.append("url_shortener")
            categories.append("shortener")
            score += 10

        # False-positive control: popular domains can't be flagged by
        # heuristics alone — cap at "low" without an explicit hit.
        heuristic_only = not explicit_hit
        if heuristic_only and registrable and is_popular(registrable):
            if score > 10:
                reasons.append("popular_domain:heuristics_suppressed")
            score = min(score, 10)

        if score >= 100:
            risk_level = "critical"
        elif score >= 60:
            risk_level = "high"
        elif score >= 30:
            risk_level = "medium"
        elif score > 0:
            risk_level = "low"
        else:
            risk_level = "safe"
        safe = score < 30  # weak signals inform but don't block

        with self._lock:
            if not safe:
                self.threats_blocked += 1
                self._blocked_urls.append({
                    "url": canon or url,
                    "domain": host,
                    "risk_level": risk_level,
                    "reasons": list(reasons),
                    "categories": list(categories),
                    "blocked_at": _now_iso(),
                })

        return {
            "safe": safe,
            "risk_level": risk_level,
            "reasons": reasons,
            "categories": categories,
            "score": score,
            "registrable_domain": registrable,
            "intel_source": intel_source,
        }

    def check_domain(self, domain: str) -> dict[str, Any]:
        """Check a domain against the local blocklist + optional DNSBLs."""
        domain = (domain or "").lower().strip()
        if not domain:
            return {"blocked": False, "sources": [], "domain": ""}

        sources: list[str] = []
        with self._lock:
            entry = self.blocklist.get(domain)
        if entry:
            sources.append(f"local:{entry.get('category', 'blocked')}")

        dnsbl_servers = self.config.get("dnsbl_servers", [])
        if isinstance(dnsbl_servers, list) and dnsbl_servers:
            for server in dnsbl_servers:
                if self._query_dnsbl(domain, server):
                    sources.append(f"dnsbl:{server}")

        return {"blocked": bool(sources), "sources": sources, "domain": domain}

    @staticmethod
    def _query_dnsbl(domain: str, server: str) -> bool:
        try:
            import socket
            socket.setdefaulttimeout(5)
            query = f"{'.'.join(reversed(domain.split('.')))}.{server}"
            try:
                socket.gethostbyname(query)
                return True
            except socket.gaierror:
                return False
        except Exception as e:
            log.debug("DNSBL query failed for %s on %s: %s", domain, server, e)
            return False

    def get_status(self) -> dict[str, Any]:
        """Current shield status including threat-intel health."""
        with self._lock:
            return {
                "name": self.name,
                "urls_checked": self.urls_checked,
                "threats_blocked": self.threats_blocked,
                "feeds_loaded": list(self.feeds_loaded),
                "blocklist_size": len(self.blocklist),
                "last_feed_update": self._last_feed_update,
                "urlscan_configured": bool(self.urlscan_api_key),
                "intel": self._intel.stats() if self._intel else {"configured": False},
            }

    def update_feeds(self, force: bool = False) -> dict[str, Any]:
        """Sync the signed threat-intel bundle from the license server."""
        now = time.time()
        if not force and (now - self._last_feed_update) < _FEED_UPDATE_INTERVAL:
            return {
                "updated": False,
                "reason": "rate_limited",
                "feeds": list(self.feeds_loaded),
                "last_update": self._last_feed_update,
            }

        if self._intel is None:
            return {"updated": False, "reason": "intel_unavailable",
                    "feeds": list(self.feeds_loaded)}

        result = self._intel.sync(force=True)
        with self._lock:
            self._last_feed_update = now
            if result.get("ok") and result.get("version"):
                self.feeds_loaded = sorted(set(
                    self.feeds_loaded + ["avs_threat_intel"]
                ))
        return {
            "updated": bool(result.get("ok") and result.get("reason") in
                            {"updated", "not_modified"}),
            "reason": result.get("reason"),
            "version": result.get("version"),
            "feeds": list(self.feeds_loaded),
            "last_update": self._last_feed_update,
        }

    def get_blocked_urls(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._blocked_urls)

    def add_to_blocklist(self, url: str, category: str) -> dict[str, Any]:
        if not url or not isinstance(url, str):
            return {"ok": False, "error": "invalid_url"}
        canon = canonical_url(url) or url.strip()
        host = host_key_from_url(url)
        with self._lock:
            # Index under the host so any path on it is caught.
            key = host or canon
            self.blocklist[key] = {
                "category": category or "manual",
                "source": "manual",
                "added_at": _now_iso(),
                "url": canon,
            }
            self._save_blocklist()
        log.info("Added to blocklist: %s (%s)", key, category)
        return {"ok": True, "url": canon, "category": category}

    def remove_from_blocklist(self, url: str) -> dict[str, Any]:
        if not url or not isinstance(url, str):
            return {"ok": False, "error": "invalid_url"}
        canon = canonical_url(url) or url.strip()
        host = host_key_from_url(url)
        with self._lock:
            removed = None
            for key in (host, canon, url.strip()):
                if key and key in self.blocklist:
                    removed = self.blocklist.pop(key)
            if removed is not None:
                self._save_blocklist()
        if removed is not None:
            log.info("Removed from blocklist: %s", canon)
            return {"ok": True, "url": canon}
        return {"ok": False, "error": "not_found", "url": canon}
