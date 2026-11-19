"""Community report upload + Scam Wave fetch.

Uploads the local scam_reports.jsonl queue (written by WebShield) to the
license server, then pulls the aggregated scam-wave list. Reports carry
only the registrable host — the server never sees full URLs.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import urllib.request
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.scam_guards.reporter")

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_REPORTS_PATH = _DATA_DIR / "scam_reports.jsonl"
_WAVES_CACHE = _DATA_DIR / "scam_waves.json"

_API_BASE = os.environ.get("AVS_API_BASE", "https://api.avsshield.com")
_TIMEOUT = 20
_MAX_BATCH = 50


def _host_of(url: str) -> str:
    try:
        from avs_backend.threat_intel.domains import registrable_domain
        host = url.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0].lower()
        return registrable_domain(host) or host
    except Exception:
        return ""


def upload_reports(device_fingerprint: str | None = None) -> dict[str, Any]:
    """POST queued reports to the license server; clears sent lines."""
    if not _REPORTS_PATH.exists():
        return {"uploaded": 0, "queued": 0}
    try:
        lines = [l for l in _REPORTS_PATH.read_text("utf-8").splitlines() if l.strip()]
    except Exception as e:
        return {"uploaded": 0, "queued": 0, "error": str(e)}
    if not lines:
        return {"uploaded": 0, "queued": 0}

    reports: list[dict[str, Any]] = []
    keep: list[str] = []
    for line in lines:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        host = _host_of(entry.get("url", ""))
        if host and entry.get("verdict") in ("scam", "not_scam"):
            reports.append({
                "host": host,
                "verdict": entry["verdict"],
                "category": entry.get("category"),
                "note": (entry.get("note") or "")[:500] or None,
                "reported_at": entry.get("reported_at"),
            })
        else:
            keep.append(line)  # unparseable — retain rather than lose

    uploaded = 0
    errors: list[str] = []
    for i in range(0, len(reports), _MAX_BATCH):
        chunk = reports[i:i + _MAX_BATCH]
        body = json.dumps({
            "device_fingerprint": device_fingerprint,
            "reports": chunk,
        }).encode()
        req = urllib.request.Request(
            f"{_API_BASE}/api/scam-reports", data=body,
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                data = json.loads(resp.read().decode())
                uploaded += int(data.get("accepted", 0))
        except Exception as e:
            errors.append(str(e))
            keep.extend(json.dumps(r) for r in chunk)  # retry later

    try:
        tmp = _REPORTS_PATH.with_suffix(".tmp")
        tmp.write_text("\n".join(keep) + ("\n" if keep else ""), "utf-8")
        os.replace(tmp, _REPORTS_PATH)
    except Exception as e:
        log.warning("Could not rewrite report queue: %s", e)

    result: dict[str, Any] = {"uploaded": uploaded, "queued": len(keep)}
    if errors:
        result["errors"] = errors[:3]
    return result


def fetch_waves(force: bool = False) -> dict[str, Any]:
    """GET /api/scam-waves with a small on-disk cache (5 min)."""
    try:
        if not force and _WAVES_CACHE.exists():
            cached = json.loads(_WAVES_CACHE.read_text("utf-8"))
            if cached.get("_fetched", 0) > __import__("time").time() - 300:
                return cached
    except Exception:
        pass

    req = urllib.request.Request(f"{_API_BASE}/api/scam-waves")
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            raw = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
            data = json.loads(raw.decode())
            data["_fetched"] = __import__("time").time()
            tmp = _WAVES_CACHE.with_suffix(".tmp")
            tmp.write_text(json.dumps(data), "utf-8")
            os.replace(tmp, _WAVES_CACHE)
            return data
    except Exception as e:
        log.warning("Scam wave fetch failed: %s", e)
        if _WAVES_CACHE.exists():
            try:
                cached = json.loads(_WAVES_CACHE.read_text("utf-8"))
                cached["stale"] = True
                return cached
            except Exception:
                pass
        return {"waves": [], "error": str(e)}
