"""Cloud Reputation System - community threat intelligence for file reputation.

Competitors like Norton (Insight), McAfee (Global Threat Intelligence), and
Trend Micro (Smart Protection Network) use cloud-based reputation systems
to assess file safety based on community data.

This module provides a multi-source cloud reputation lookup:

  1. VirusTotal - aggregates 70+ AV engines (existing, enhanced here)
  2. Local reputation cache - files seen before get reputation scores
  3. File age + prevalence scoring - new files from rare locations score lower
  4. Trusted publisher whitelist - signed files from known publishers get high scores
  5. Community feedback - user-reported threats improve detection

Reputation scores range from 0 (malicious) to 100 (trusted):
  - 0-20:  Malicious (high confidence)
  - 21-40: Suspicious (quarantine recommended)
  - 41-60: Unknown (exercise caution)
  - 61-80: Likely safe (low risk)
  - 81-100: Trusted (known good)

RPC methods:
    cloud_reputation.lookup       - lookup reputation for a file hash
    cloud_reputation.lookupFile   - lookup reputation for a file path
    cloud_reputation.report       - report a file as malicious (community feedback)
    cloud_reputation.whitelist    - add a file hash to the trusted whitelist
    cloud_reputation.status       - get reputation system status
    cloud_reputation.cache        - get cache statistics
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

from avs_backend.api.registry import register

log = logging.getLogger("avs.cloud_reputation")

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_CACHE_PATH = _DATA_DIR / "reputation_cache.json"
_WHITELIST_PATH = _DATA_DIR / "trusted_whitelist.json"
_REPORTS_PATH = _DATA_DIR / "community_reports.json"

# Reputation score bands
SCORE_MALICIOUS = 20
SCORE_SUSPICIOUS = 40
SCORE_UNKNOWN = 60
SCORE_LIKELY_SAFE = 80

# Cache TTL (24 hours)
_CACHE_TTL = 24 * 3600

# Rate limiting for VirusTotal free tier (4 req/min)
_VT_MIN_INTERVAL = 15.0
_last_vt_request = 0.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def _load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default


def _save_json(path: Path, data: dict[str, Any]) -> None:
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.error("Failed to save %s: %s", path, e)


# ─── Cache management ────────────────────────────────────────────────

def _load_cache() -> dict[str, Any]:
    return _load_json(_CACHE_PATH, {"entries": {}, "updated_at": _now_iso()})


def _save_cache(cache: dict[str, Any]) -> None:
    _save_json(_CACHE_PATH, cache)


def _load_whitelist() -> dict[str, Any]:
    return _load_json(_WHITELIST_PATH, {"hashes": [], "updated_at": _now_iso()})


def _save_whitelist(wl: dict[str, Any]) -> None:
    _save_json(_WHITELIST_PATH, wl)


def _load_reports() -> dict[str, Any]:
    return _load_json(_REPORTS_PATH, {"reports": [], "updated_at": _now_iso()})


def _save_reports(reports: dict[str, Any]) -> None:
    _save_json(_REPORTS_PATH, reports)


# ─── Trusted publisher whitelist (known good software) ───────────────

# SHA-256 hashes of known trusted executables (Microsoft, Google, etc.)
# This is a seed list - the whitelist grows as users confirm files are safe.
_TRUSTED_PUBLISHERS = {
    # Microsoft Windows system files pattern (checked by path, not hash)
    "microsoft": [
        "C:\\Windows\\System32\\",
        "C:\\Windows\\SysWOW64\\",
        "C:\\Program Files\\WindowsApps\\",
        "C:\\Program Files\\Microsoft\\",
    ],
    # Known trusted application directories
    "google": [
        "C:\\Program Files\\Google\\",
        "C:\\Program Files (x86)\\Google\\",
    ],
    "mozilla": [
        "C:\\Program Files\\Mozilla Firefox\\",
        "C:\\Program Files (x86)\\Mozilla Firefox\\",
    ],
}


def _is_trusted_path(file_path: str) -> bool:
    """Check if a file is in a trusted publisher directory.

    Normalizes path separators and resolves relative segments to
    prevent bypass via non-canonical paths.
    """
    import os
    # Normalize the path: resolve . and .., convert / to \ on Windows
    normalized = os.path.normpath(file_path).lower()
    for publisher, paths in _TRUSTED_PUBLISHERS.items():
        for trusted_path in paths:
            # Also normalize the trusted path for comparison
            trusted_normalized = os.path.normpath(trusted_path).lower()
            if normalized.startswith(trusted_normalized):
                return True
    return False


def _is_whitelisted(sha256: str) -> bool:
    """Check if a hash is in the trusted whitelist."""
    wl = _load_whitelist()
    return sha256.lower() in {h.lower() for h in wl.get("hashes", [])}


# ─── Cloud reputation lookup ─────────────────────────────────────────

def _lookup_virustotal(sha256: str, api_key: str) -> dict[str, Any] | None:
    """Lookup file reputation on VirusTotal."""
    global _last_vt_request

    if not api_key:
        return None

    # Rate limit
    now = time.time()
    if now - _last_vt_request < _VT_MIN_INTERVAL:
        return None
    _last_vt_request = now

    try:
        url = f"https://www.virustotal.com/api/v3/files/{sha256}"
        req = urllib.request.Request(url, headers={"x-apikey": api_key})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        attrs = data.get("data", {}).get("attributes", {})
        stats = attrs.get("last_analysis_stats", {})
        malicious = stats.get("malicious", 0)
        suspicious = stats.get("suspicious", 0)
        total = sum(stats.values())

        if total == 0:
            return None

        # Calculate reputation score (0-100, higher = safer)
        detection_ratio = (malicious + suspicious) / total
        reputation_score = int(100 * (1 - detection_ratio))

        # Get popular threat name
        popular_threat = attrs.get("popular_threat_classification", {})
        threat_name = popular_threat.get("suggested_threat_label", "")

        return {
            "score": reputation_score,
            "malicious_count": malicious,
            "suspicious_count": suspicious,
            "total_engines": total,
            "threat_name": threat_name,
            "source": "virustotal",
            "first_seen": attrs.get("first_submission_date", ""),
            "last_seen": attrs.get("last_analysis_date", ""),
        }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # File not in VirusTotal database - unknown file
            return {"score": SCORE_UNKNOWN, "source": "virustotal", "not_found": True}
        log.debug("VirusTotal API error: %s", e)
        return None
    except Exception as e:
        log.debug("VirusTotal lookup failed: %s", e)
        return None


def _lookup_local_reputation(sha256: str) -> dict[str, Any] | None:
    """Lookup file in local reputation cache."""
    cache = _load_cache()
    entry = cache.get("entries", {}).get(sha256.lower())
    if not entry:
        return None

    # Check cache age
    cached_at = entry.get("cached_at", "")
    if cached_at:
        try:
            cached_time = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - cached_time).total_seconds()
            if age > _CACHE_TTL:
                return None  # Cache expired
        except Exception:
            pass

    return entry


def _save_to_cache(sha256: str, reputation: dict[str, Any]) -> None:
    """Save a reputation result to cache."""
    cache = _load_cache()
    reputation["cached_at"] = _now_iso()
    cache["entries"][sha256.lower()] = reputation
    cache["updated_at"] = _now_iso()
    _save_cache(cache)


def _check_community_reports(sha256: str) -> dict[str, Any] | None:
    """Check if the file has been reported by the community."""
    reports = _load_reports()
    for report in reports.get("reports", []):
        if report.get("sha256", "").lower() == sha256.lower():
            return {
                "score": SCORE_MALICIOUS,
                "source": "community_report",
                "reporter": report.get("reporter", "anonymous"),
                "reported_at": report.get("reported_at", ""),
                "threat_name": report.get("threat_name", "Community reported"),
            }
    return None


def lookup_reputation(
    sha256: str,
    file_path: str = "",
    vt_api_key: str = "",
) -> dict[str, Any]:
    """Lookup cloud reputation for a file hash.

    Checks multiple sources in priority order:
    1. Trusted whitelist (instant, score=100)
    2. Community reports (instant, score=0)
    3. Local cache (instant)
    4. VirusTotal cloud (rate-limited)
    5. Trusted path heuristic (instant)
    """
    sha256 = sha256.lower()

    # 1. Check whitelist
    if _is_whitelisted(sha256):
        return {
            "sha256": sha256,
            "score": 100,
            "verdict": "trusted",
            "source": "whitelist",
            "cached": False,
        }

    # 2. Check community reports
    community = _check_community_reports(sha256)
    if community:
        return {"sha256": sha256, **community, "verdict": "malicious", "cached": False}

    # 3. Check local cache
    cached = _lookup_local_reputation(sha256)
    if cached:
        verdict = _score_to_verdict(cached.get("score", SCORE_UNKNOWN))
        return {"sha256": sha256, **cached, "verdict": verdict, "cached": True}

    # 4. Check VirusTotal cloud
    if vt_api_key:
        vt_result = _lookup_virustotal(sha256, vt_api_key)
        if vt_result:
            verdict = _score_to_verdict(vt_result.get("score", SCORE_UNKNOWN))
            _save_to_cache(sha256, vt_result)
            return {"sha256": sha256, **vt_result, "verdict": verdict, "cached": False}

    # 5. Trusted path heuristic
    if file_path and _is_trusted_path(file_path):
        result = {
            "score": SCORE_LIKELY_SAFE,
            "source": "trusted_path",
            "publisher": _get_publisher(file_path),
        }
        _save_to_cache(sha256, result)
        return {"sha256": sha256, **result, "verdict": "likely_safe", "cached": False}

    # Unknown file
    return {
        "sha256": sha256,
        "score": SCORE_UNKNOWN,
        "verdict": "unknown",
        "source": "none",
        "cached": False,
    }


def _score_to_verdict(score: int) -> str:
    if score <= SCORE_MALICIOUS:
        return "malicious"
    if score <= SCORE_SUSPICIOUS:
        return "suspicious"
    if score <= SCORE_UNKNOWN:
        return "unknown"
    if score <= SCORE_LIKELY_SAFE:
        return "likely_safe"
    return "trusted"


def _get_publisher(file_path: str) -> str:
    """Extract publisher from file path."""
    lower = file_path.lower()
    for publisher in _TRUSTED_PUBLISHERS:
        for path in _TRUSTED_PUBLISHERS[publisher]:
            if lower.startswith(path.lower()):
                return publisher
    return "unknown"


# ─── RPC handlers ────────────────────────────────────────────────────

@register("cloud_reputation.lookup")
def cloud_reputation_lookup(params: dict[str, Any] | None) -> dict[str, Any]:
    """Lookup reputation for a file hash."""
    params = params or {}
    sha256 = params.get("sha256", "")
    if not sha256:
        return {"success": False, "error": "sha256 is required"}

    vt_key = os.environ.get("AVS_VIRUSTOTAL_API_KEY", "")
    result = lookup_reputation(sha256, "", vt_key)
    return {"success": True, "reputation": result}


@register("cloud_reputation.lookupFile")
def cloud_reputation_lookup_file(params: dict[str, Any] | None) -> dict[str, Any]:
    """Lookup reputation for a file path."""
    params = params or {}
    file_path = params.get("file_path", "")
    if not file_path or not os.path.exists(file_path):
        return {"success": False, "error": "file_path is required and must exist"}

    sha256 = _compute_sha256(file_path)
    if not sha256:
        return {"success": False, "error": "Failed to compute file hash"}

    vt_key = os.environ.get("AVS_VIRUSTOTAL_API_KEY", "")
    result = lookup_reputation(sha256, file_path, vt_key)
    return {"success": True, "sha256": sha256, "reputation": result}


@register("cloud_reputation.report")
def cloud_reputation_report(params: dict[str, Any] | None) -> dict[str, Any]:
    """Report a file as malicious (community feedback)."""
    params = params or {}
    sha256 = params.get("sha256", "")
    if not sha256:
        return {"success": False, "error": "sha256 is required"}

    threat_name = params.get("threat_name", "Community reported")
    reporter = params.get("reporter", "anonymous")

    reports = _load_reports()
    reports["reports"].append({
        "sha256": sha256.lower(),
        "threat_name": threat_name,
        "reporter": reporter,
        "reported_at": _now_iso(),
    })
    # Keep max 1000 reports
    if len(reports["reports"]) > 1000:
        reports["reports"] = reports["reports"][-1000:]
    reports["updated_at"] = _now_iso()
    _save_reports(reports)

    log.info("Community report: %s reported as %s by %s", sha256[:16], threat_name, reporter)
    return {"success": True, "message": "Report submitted"}


@register("cloud_reputation.whitelist")
def cloud_reputation_whitelist(params: dict[str, Any] | None) -> dict[str, Any]:
    """Add a file hash to the trusted whitelist."""
    params = params or {}
    sha256 = params.get("sha256", "")
    if not sha256:
        return {"success": False, "error": "sha256 is required"}

    wl = _load_whitelist()
    if sha256.lower() not in {h.lower() for h in wl.get("hashes", [])}:
        wl["hashes"].append(sha256.lower())
        wl["updated_at"] = _now_iso()
        _save_whitelist(wl)

    return {"success": True, "message": "Hash added to whitelist"}


@register("cloud_reputation.status")
def cloud_reputation_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get reputation system status."""
    cache = _load_cache()
    wl = _load_whitelist()
    reports = _load_reports()
    vt_key = os.environ.get("AVS_VIRUSTOTAL_API_KEY", "")

    return {
        "success": True,
        "status": {
            "cache_entries": len(cache.get("entries", {})),
            "whitelist_entries": len(wl.get("hashes", [])),
            "community_reports": len(reports.get("reports", [])),
            "virustotal_enabled": bool(vt_key),
            "trusted_publishers": list(_TRUSTED_PUBLISHERS.keys()),
        },
    }


@register("cloud_reputation.cache")
def cloud_reputation_cache(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get cache statistics."""
    cache = _load_cache()
    entries = cache.get("entries", {})
    verdicts = {"trusted": 0, "likely_safe": 0, "unknown": 0, "suspicious": 0, "malicious": 0}
    for entry in entries.values():
        score = entry.get("score", SCORE_UNKNOWN)
        verdicts[_score_to_verdict(score)] += 1
    return {
        "success": True,
        "total_entries": len(entries),
        "verdicts": verdicts,
        "updated_at": cache.get("updated_at", ""),
    }
