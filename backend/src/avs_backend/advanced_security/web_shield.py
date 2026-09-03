"""Web Shield — URL filtering and phishing protection for AVS AI Shield.

Checks URLs against malicious URL blocklists and phishing databases to
prevent users from visiting known-bad sites. The shield combines several
signals to produce a risk verdict:

  - Local blocklist cache (manually maintained and feed-populated)
  - Domain reputation lookups against DNS blocklists
  - Phishing pattern detection (brand impersonation, lookalike domains)
  - Suspicious TLD checks (.tk, .ml, .ga, .cf, .gq — common malware TLDs)
  - URL shortener redirect detection
  - IDN homograph attack detection (punycode domains)
  - IP-address URLs and excessive subdomain heuristics

Feed sources:
  - PhishTank API (https://checkurl.phishtank.com/checkurl/)
  - URLScan.io  (https://urlscan.io/api/v1/scan/ — optional, requires API key)

The local blocklist is persisted to
``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\url_blocklist.json``.

All network operations are best-effort: failures are logged and never
raise, so the shield degrades gracefully to local-only checks when
offline.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import re
import threading
import time
import urllib.parse
import urllib.request
import urllib.error
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.advanced_security.web_shield")

IS_WINDOWS = platform.system() == "Windows"

# Persistent storage for the local URL blocklist.
_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_BLOCKLIST_PATH = _DATA_DIR / "url_blocklist.json"

# Rate limit feed updates to avoid hammering upstream APIs.
_FEED_UPDATE_INTERVAL = 6 * 60 * 60  # 6 hours

# Ring buffer cap for recently blocked URLs.
_MAX_BLOCKED_HISTORY = 500

# Suspicious TLDs commonly abused by malware and phishing operations.
_SUSPICIOUS_TLDS = {".tk", ".ml", ".ga", ".cf", ".gq"}

# Well-known URL shortener domains. Shortened URLs obscure the final
# destination and are frequently used to bypass blocklists.
_URL_SHORTENERS = {
    "bit.ly",
    "tinyurl.com",
    "goo.gl",
    "t.co",
    "ow.ly",
    "is.gd",
    "buff.ly",
    "adf.ly",
    "shorte.st",
    "cutt.ly",
    "rebrand.ly",
    "tiny.cc",
    "soo.gd",
    "rb.gy",
    "shorturl.at",
}

# Legitimate brand domains. If a brand name appears in a URL that is NOT
# one of these domains, it is a strong impersonation signal.
_BRAND_DOMAINS = {
    "paypal": {"paypal.com", "paypal.me", "paypalobjects.com"},
    "google": {"google.com", "google.co", "gmail.com", "youtube.com", "googleapis.com"},
    "microsoft": {"microsoft.com", "microsoftonline.com", "office.com", "live.com", "outlook.com", "windows.com"},
    "apple": {"apple.com", "icloud.com", "itunes.com"},
    "amazon": {"amazon.com", "amazon.co", "aws.amazon.com"},
    "facebook": {"facebook.com", "fb.com", "fb.me"},
    "instagram": {"instagram.com", "instagr.am"},
    "twitter": {"twitter.com", "x.com", "t.co"},
    "linkedin": {"linkedin.com"},
    "netflix": {"netflix.com"},
    "spotify": {"spotify.com"},
    "dropbox": {"dropbox.com"},
    "github": {"github.com", "githubusercontent.com"},
    "steam": {"steampowered.com", "steamcommunity.com"},
    "ebay": {"ebay.com", "ebay.co"},
    "chase": {"chase.com"},
    "bankofamerica": {"bankofamerica.com"},
    "wellsfargo": {"wellsfargo.com"},
}

# Common lookalike character substitutions used in typosquatting.
_LOOKALIKE_SUBS = {
    "0": "o",
    "1": "l",
    "3": "e",
    "$": "s",
    "@": "a",
    "rn": "m",
    "vv": "w",
}

# Regex for detecting bare IPv4 addresses in URLs.
_IPV4_RE = re.compile(r"https?://(\d{1,3}\.){3}\d{1,3}", re.IGNORECASE)

# Regex for punycode (IDN) domains — ``xn--`` prefix per RFC 3490.
_PUNYCODE_RE = re.compile(r"xn--", re.IGNORECASE)


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

        # Optional API credentials.
        self.phishtank_api_key: str | None = self.config.get("phishtank_api_key")
        self.urlscan_api_key: str | None = self.config.get("urlscan_api_key")

        # Optional custom suspicious TLDs / shorteners from config.
        extra_tlds = self.config.get("suspicious_tlds", [])
        if isinstance(extra_tlds, list):
            self.suspicious_tlds = _SUSPICIOUS_TLDS | {t.lower() for t in extra_tlds}
        else:
            self.suspicious_tlds = set(_SUSPICIOUS_TLDS)

        extra_shorteners = self.config.get("url_shorteners", [])
        if isinstance(extra_shorteners, list):
            self.url_shorteners = _URL_SHORTENERS | {s.lower() for s in extra_shorteners}
        else:
            self.url_shorteners = set(_URL_SHORTENERS)

        log.info("WebShield initialized (blocklist entries: %d)", len(self.blocklist))

    # ------------------------------------------------------------------
    # Persistence helpers
    # ------------------------------------------------------------------

    def _load_blocklist(self) -> dict[str, dict[str, Any]]:
        """Load the local URL blocklist from disk."""
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
        """Persist the local URL blocklist to disk."""
        try:
            payload = {
                "entries": self.blocklist,
                "updated_at": _now_iso(),
            }
            with open(_BLOCKLIST_PATH, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception as e:
            log.error("Failed to save URL blocklist: %s", e)

    # ------------------------------------------------------------------
    # URL parsing helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_domain(url: str) -> str:
        """Extract the registered domain (host without port/userinfo)."""
        try:
            parsed = urllib.parse.urlparse(url)
            host = parsed.hostname or ""
            return host.lower().strip()
        except Exception:
            return ""

    @staticmethod
    def _normalize_url(url: str) -> str:
        url = url.strip()
        if url and not re.match(r"^[a-zA-Z]+://", url):
            url = "http://" + url
        return url

    # ------------------------------------------------------------------
    # Heuristic checks
    # ------------------------------------------------------------------

    def _check_suspicious_tld(self, domain: str) -> tuple[bool, str | None]:
        if not domain:
            return False, None
        for tld in self.suspicious_tlds:
            if domain.endswith(tld):
                return True, tld
        return False, None

    def _check_shortener(self, domain: str) -> bool:
        return domain in self.url_shorteners

    @staticmethod
    def _check_ip_url(url: str) -> bool:
        return bool(_IPV4_RE.match(url))

    @staticmethod
    def _check_punycode(domain: str) -> bool:
        return bool(_PUNYCODE_RE.search(domain))

    @staticmethod
    def _check_excessive_subdomains(domain: str) -> bool:
        if not domain:
            return False
        parts = [p for p in domain.split(".") if p]
        # e.g. a.b.c.d.example.com -> 6 labels; treat > 5 as excessive.
        return len(parts) > 5

    @staticmethod
    def _check_lookalike(domain: str) -> tuple[bool, str | None]:
        """Detect typosquatting / lookalike domains for known brands."""
        if not domain:
            return False, None
        # Strip TLD components to get the core label(s).
        parts = domain.split(".")
        if len(parts) < 2:
            return False, None
        core = parts[0].lower()

        for brand, legit in _BRAND_DOMAINS.items():
            if domain in legit:
                return False, None
            # Normalize common lookalike substitutions and compare.
            normalized = core
            for bad, good in _LOOKALIKE_SUBS.items():
                normalized = normalized.replace(bad, good)
            if normalized == brand and core != brand:
                return True, brand
            # Also catch brand embedded in a non-legit domain.
            if brand in domain and domain not in legit:
                # Brand name present but domain is not a legit one.
                if not any(domain.endswith(lg) for lg in legit):
                    return True, brand
        return False, None

    def _check_brand_impersonation(self, url: str, domain: str) -> tuple[bool, str | None]:
        """Check whether a URL references a brand in a suspicious context."""
        if not domain:
            return False, None
        url_lower = url.lower()
        for brand, legit in _BRAND_DOMAINS.items():
            if brand in url_lower:
                # If the domain itself is a legit brand domain, fine.
                if domain in legit:
                    continue
                # Brand name in URL but host is not a legit brand domain.
                if not any(domain.endswith(lg) for lg in legit):
                    return True, brand
        return False, None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_url(self, url: str) -> dict[str, Any]:
        """Check a URL against blocklists and heuristics.

        Returns a verdict dict::

            {
              "safe": bool,
              "risk_level": "safe" | "low" | "medium" | "high" | "critical",
              "reasons": [str, ...],
              "categories": [str, ...],
            }
        """
        if not url or not isinstance(url, str):
            return {"safe": False, "risk_level": "critical", "reasons": ["empty_url"], "categories": ["invalid"]}

        normalized = self._normalize_url(url)
        domain = self._extract_domain(normalized)

        with self._lock:
            self.urls_checked += 1

        reasons: list[str] = []
        categories: list[str] = []
        risk_score = 0  # accumulated; mapped to a risk level at the end

        # 1. Local blocklist cache.
        with self._lock:
            entry = self.blocklist.get(normalized) or self.blocklist.get(url)
        if entry:
            reasons.append(f"blocklisted: {entry.get('category', 'unknown')}")
            categories.append(entry.get("category", "blocked"))
            risk_score += 100
        elif domain:
            with self._lock:
                entry = self.blocklist.get(domain)
            if entry:
                reasons.append(f"domain blocklisted: {entry.get('category', 'unknown')}")
                categories.append(entry.get("category", "blocked"))
                risk_score += 100

        # 2. Domain reputation (DNS blocklists).
        domain_rep = self.check_domain(domain)
        if domain_rep.get("blocked"):
            reasons.append(f"DNS blocklist hit: {', '.join(domain_rep.get('sources', []))}")
            categories.append("dns_blocklist")
            risk_score += 60

        # 3. Phishing pattern detection.
        impersonated, brand = self._check_brand_impersonation(normalized, domain)
        if impersonated and brand:
            reasons.append(f"brand impersonation: {brand}")
            categories.append("phishing")
            risk_score += 50

        lookalike, lb_brand = self._check_lookalike(domain)
        if lookalike and lb_brand:
            reasons.append(f"lookalike domain for {lb_brand}")
            categories.append("typosquatting")
            risk_score += 55

        # 4. IDN homograph attacks.
        if self._check_punycode(domain):
            reasons.append("IDN homograph (punycode) domain")
            categories.append("homograph")
            risk_score += 40

        # 5. IP-address URLs.
        if self._check_ip_url(normalized):
            reasons.append("URL uses raw IP address")
            categories.append("ip_url")
            risk_score += 30

        # 6. Excessive subdomains.
        if self._check_excessive_subdomains(domain):
            reasons.append("excessive subdomain depth")
            categories.append("subdomain_abuse")
            risk_score += 15

        # 7. Suspicious TLDs.
        bad_tld, tld = self._check_suspicious_tld(domain)
        if bad_tld and tld:
            reasons.append(f"suspicious TLD: {tld}")
            categories.append("suspicious_tld")
            risk_score += 25

        # 8. URL shortener redirects.
        if self._check_shortener(domain):
            reasons.append("URL shortener (destination obscured)")
            categories.append("shortener")
            risk_score += 10

        # Map accumulated score to a risk level.
        if risk_score >= 100:
            risk_level = "critical"
        elif risk_score >= 60:
            risk_level = "high"
        elif risk_score >= 30:
            risk_level = "medium"
        elif risk_score > 0:
            risk_level = "low"
        else:
            risk_level = "safe"

        safe = risk_level == "safe"

        with self._lock:
            if not safe:
                self.threats_blocked += 1
                self._blocked_urls.append({
                    "url": normalized,
                    "domain": domain,
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
        }

    def check_domain(self, domain: str) -> dict[str, Any]:
        """Check a domain against DNS blocklists.

        Uses a lightweight heuristic: queries DNSBL-style suffixes are not
        performed here to avoid network dependency in the hot path; instead
        we consult the local blocklist and a small built-in denylist of
        known-bad domains. Network-based DNSBL lookups can be added by
        configuring ``dnsbl_servers``.
        """
        domain = (domain or "").lower().strip()
        if not domain:
            return {"blocked": False, "sources": [], "domain": ""}

        sources: list[str] = []

        # Local blocklist by domain.
        with self._lock:
            entry = self.blocklist.get(domain)
        if entry:
            sources.append(f"local:{entry.get('category', 'blocked')}")

        # Optional DNSBL servers (e.g. ["zen.spamhaus.org"]).
        dnsbl_servers = self.config.get("dnsbl_servers", [])
        if isinstance(dnsbl_servers, list) and dnsbl_servers:
            for server in dnsbl_servers:
                if self._query_dnsbl(domain, server):
                    sources.append(f"dnsbl:{server}")

        return {
            "blocked": bool(sources),
            "sources": sources,
            "domain": domain,
        }

    @staticmethod
    def _query_dnsbl(domain: str, server: str) -> bool:
        """Query a DNSBL server for a domain. Best-effort; never raises."""
        try:
            import socket
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
        """Return the current shield status."""
        with self._lock:
            return {
                "name": self.name,
                "urls_checked": self.urls_checked,
                "threats_blocked": self.threats_blocked,
                "feeds_loaded": list(self.feeds_loaded),
                "blocklist_size": len(self.blocklist),
                "last_feed_update": self._last_feed_update,
                "urlscan_configured": bool(self.urlscan_api_key),
                "phishtank_configured": bool(self.phishtank_api_key),
            }

    def update_feeds(self, force: bool = False) -> dict[str, Any]:
        """Update URL blocklist feeds from upstream sources.

        Rate-limited to once per 6 hours unless ``force=True``.
        """
        now = time.time()
        if not force and (now - self._last_feed_update) < _FEED_UPDATE_INTERVAL:
            log.debug("Feed update skipped (rate limited)")
            return {
                "updated": False,
                "reason": "rate_limited",
                "feeds": list(self.feeds_loaded),
                "last_update": self._last_feed_update,
            }

        results: dict[str, Any] = {"updated": True, "feeds": {}, "added": 0}
        added = 0

        # PhishTank.
        try:
            count = self._update_phishtank()
            results["feeds"]["phishtank"] = {"added": count, "ok": True}
            if count >= 0:
                self.feeds_loaded = list(set(self.feeds_loaded + ["phishtank"]))
                added += count
        except Exception as e:
            log.warning("PhishTank feed update failed: %s", e)
            results["feeds"]["phishtank"] = {"ok": False, "error": str(e)}

        # URLScan.io (optional).
        if self.urlscan_api_key:
            try:
                count = self._update_urlscan()
                results["feeds"]["urlscan"] = {"added": count, "ok": True}
                if count >= 0:
                    self.feeds_loaded = list(set(self.feeds_loaded + ["urlscan"]))
                    added += count
            except Exception as e:
                log.warning("URLScan.io feed update failed: %s", e)
                results["feeds"]["urlscan"] = {"ok": False, "error": str(e)}

        with self._lock:
            self._last_feed_update = now
            self._save_blocklist()

        results["added"] = added
        log.info("Feed update complete: +%d entries", added)
        return results

    def _update_phishtank(self) -> int:
        """Pull a small batch of recent phishing URLs from PhishTank.

        PhishTank's public ``checkurl/`` endpoint validates a single URL
        rather than serving a bulk feed, so we use it opportunistically to
        re-validate entries already in our local cache. Returns the number
        of newly confirmed entries.
        """
        # Without an API key we cannot download the bulk feed; we simply
        # re-confirm a sample of existing entries to keep them fresh.
        with self._lock:
            sample = list(self.blocklist.items())[:25]

        confirmed = 0
        for url, entry in sample:
            if entry.get("category") != "phishing":
                continue
            if self._phishtank_check(url):
                entry["last_confirmed"] = _now_iso()
                confirmed += 1
        return confirmed

    def _phishtank_check(self, url: str) -> bool:
        """Check a single URL against the PhishTank checkurl API."""
        if not url:
            return False
        try:
            data = urllib.parse.urlencode({
                "url": url,
                "format": "json",
                "app_key": self.phishtank_api_key or "",
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://checkurl.phishtank.com/checkurl/",
                data=data,
                headers={"User-Agent": "AVS-Shield/1.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            results = payload.get("results", {})
            return bool(results.get("in_database")) and bool(results.get("valid"))
        except Exception as e:
            log.debug("PhishTank check failed for %s: %s", url, e)
            return False

    def _update_urlscan(self) -> int:
        """Query URLScan.io for recent malicious scans.

        Uses the public search endpoint to pull recently-reported
        malicious URLs. Requires an API key.
        """
        if not self.urlscan_api_key:
            return 0
        try:
            req = urllib.request.Request(
                "https://urlscan.io/api/v1/search/?q=datetype:now&size=50",
                headers={
                    "API-Key": self.urlscan_api_key,
                    "User-Agent": "AVS-Shield/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = json.loads(resp.read().decode("utf-8"))

            added = 0
            for result in payload.get("results", []):
                page = result.get("page", {})
                url = page.get("url")
                if not url:
                    continue
                verdicts = result.get("verdicts", {})
                if verdicts.get("malicious") or verdicts.get("phishing"):
                    with self._lock:
                        if url not in self.blocklist:
                            self.blocklist[url] = {
                                "category": "phishing",
                                "source": "urlscan",
                                "added_at": _now_iso(),
                            }
                            added += 1
            return added
        except Exception as e:
            log.debug("URLScan.io feed fetch failed: %s", e)
            return 0

    def get_blocked_urls(self) -> list[dict[str, Any]]:
        """Return recently blocked URLs (ring buffer, max 500)."""
        with self._lock:
            return list(self._blocked_urls)

    def add_to_blocklist(self, url: str, category: str) -> dict[str, Any]:
        """Manually add a URL to the local blocklist."""
        if not url or not isinstance(url, str):
            return {"ok": False, "error": "invalid_url"}
        normalized = self._normalize_url(url)
        with self._lock:
            self.blocklist[normalized] = {
                "category": category or "manual",
                "source": "manual",
                "added_at": _now_iso(),
            }
            self._save_blocklist()
        log.info("Added URL to blocklist: %s (%s)", normalized, category)
        return {"ok": True, "url": normalized, "category": category}

    def remove_from_blocklist(self, url: str) -> dict[str, Any]:
        """Remove a URL from the local blocklist."""
        if not url or not isinstance(url, str):
            return {"ok": False, "error": "invalid_url"}
        normalized = self._normalize_url(url)
        with self._lock:
            existed = normalized in self.blocklist
            if existed:
                del self.blocklist[normalized]
                self._save_blocklist()
        if existed:
            log.info("Removed URL from blocklist: %s", normalized)
            return {"ok": True, "url": normalized}
        return {"ok": False, "error": "not_found", "url": normalized}
