"""VirusTotal Detector — cloud reputation lookup via VirusTotal API v3.

Queries the VirusTotal API to get cloud-based verdicts on file hashes.
VirusTotal aggregates 70+ antivirus engines, providing comprehensive
detection coverage.

Free tier: 4 requests/minute, 500 requests/day.
Paid tier: higher limits.

The detector caches results locally to minimize API calls.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.threat_engine.virustotal")

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_CACHE_PATH = _DATA_DIR / "virustotal_cache.json"

# Rate limiting: 4 requests per minute for free tier
_MIN_REQUEST_INTERVAL = 15.0  # seconds between requests
_last_request_time = 0.0


def _compute_sha256(file_path: str) -> str | None:
    try:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def _load_cache() -> dict[str, Any]:
    """Load the VirusTotal result cache."""
    if _CACHE_PATH.exists():
        try:
            with open(_CACHE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"entries": {}, "updated_at": datetime.now(timezone.utc).isoformat()}


def _save_cache(cache: dict[str, Any]) -> None:
    try:
        with open(_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        log.error("Failed to save VT cache: %s", e)


class VirusTotalDetector:
    """VirusTotal cloud reputation detector."""

    name = "virustotal"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.cache = _load_cache()
        log.info("VirusTotalDetector initialized (API key: %s...)", api_key[:8] if api_key else "none")

    def _rate_limit(self) -> None:
        """Enforce rate limiting between API calls."""
        global _last_request_time
        elapsed = time.time() - _last_request_time
        if elapsed < _MIN_REQUEST_INTERVAL:
            time.sleep(_MIN_REQUEST_INTERVAL - elapsed)
        _last_request_time = time.time()

    def _lookup_hash(self, sha256: str) -> dict[str, Any] | None:
        """Look up a file hash on VirusTotal."""
        # Check cache first (cache valid for 24 hours)
        cache_key = sha256.lower()
        cached = self.cache["entries"].get(cache_key)
        if cached:
            cached_time = cached.get("cached_at", "")
            try:
                cached_dt = datetime.fromisoformat(cached_time)
                if (datetime.now(timezone.utc) - cached_dt).total_seconds() < 86400:  # 24 hours
                    return cached
            except Exception:
                pass

        # Rate limit
        self._rate_limit()

        # Query VirusTotal API v3
        url = f"https://www.virustotal.com/api/v3/files/{sha256}"
        req = urllib.request.Request(url, headers={"x-apikey": self.api_key})

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            attributes = data.get("data", {}).get("attributes", {})
            last_analysis = attributes.get("last_analysis_stats", {})
            malicious = last_analysis.get("malicious", 0)
            suspicious = last_analysis.get("suspicious", 0)
            total = sum(last_analysis.values())

            # Get detection names from engines
            analysis_results = attributes.get("last_analysis_results", {})
            detections = []
            for engine, result in analysis_results.items():
                if result.get("category") in ("malicious", "suspicious"):
                    detections.append({
                        "engine": engine,
                        "result": result.get("result", ""),
                        "category": result.get("category"),
                    })

            result = {
                "sha256": sha256,
                "malicious_count": malicious,
                "suspicious_count": suspicious,
                "total_engines": total,
                "detections": detections[:20],  # Limit to top 20
                "cached_at": datetime.now(timezone.utc).isoformat(),
                "threat_name": detections[0]["result"] if detections else "Unknown",
            }

            # Cache the result
            self.cache["entries"][cache_key] = result
            _save_cache(self.cache)

            return result

        except urllib.error.HTTPError as e:
            if e.code == 404:
                # File not in VirusTotal database — not necessarily clean
                result = {
                    "sha256": sha256,
                    "malicious_count": 0,
                    "suspicious_count": 0,
                    "total_engines": 0,
                    "detections": [],
                    "cached_at": datetime.now(timezone.utc).isoformat(),
                    "not_found": True,
                }
                self.cache["entries"][cache_key] = result
                _save_cache(self.cache)
                return result
            log.warning("VirusTotal API error: %s", e)
            return None
        except Exception as e:
            log.warning("VirusTotal lookup failed: %s", e)
            return None

    def scan_file(self, file_path: str) -> dict[str, Any] | None:
        """Scan a file by looking up its hash on VirusTotal."""
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            return None

        sha256 = _compute_sha256(file_path)
        if not sha256:
            return None

        vt_result = self._lookup_hash(sha256)
        if not vt_result:
            return {"detected": False, "sha256": sha256}

        malicious = vt_result.get("malicious_count", 0)
        suspicious = vt_result.get("suspicious_count", 0)

        if malicious > 0:
            # Determine severity based on detection ratio
            total = vt_result.get("total_engines", 1)
            ratio = malicious / max(total, 1)
            if ratio > 0.5:
                severity = "critical"
            elif ratio > 0.2:
                severity = "high"
            else:
                severity = "medium"

            return {
                "detected": True,
                "threat_name": vt_result.get("threat_name", f"Detected by {malicious} engines"),
                "threat_type": "malware",
                "severity": severity,
                "confidence": min(ratio + 0.1, 0.99),
                "sha256": sha256,
                "details": {
                    "malicious_count": malicious,
                    "suspicious_count": suspicious,
                    "total_engines": total,
                    "detections": vt_result.get("detections", []),
                    "source": "virustotal",
                },
            }

        if suspicious > 0:
            return {
                "detected": True,
                "threat_name": f"Suspicious — flagged by {suspicious} engines",
                "threat_type": "suspicious",
                "severity": "low",
                "confidence": 0.3,
                "sha256": sha256,
                "details": {
                    "malicious_count": malicious,
                    "suspicious_count": suspicious,
                    "total_engines": vt_result.get("total_engines", 0),
                    "source": "virustotal",
                },
            }

        return {"detected": False, "sha256": sha256}
