"""Signed threat-intel bundle store — download, verify, cache, lookup.

The bundle is produced by the AVS License Server
(``/api/threat-intel/bundle``), gzip-compressed canonical JSON signed with
Ed25519. Trust rules, enforced in order:

  1. Signature must verify against the embedded public key.
  2. ``format``/``format_version`` must match.
  3. ``version`` must be ≥ the cached version (anti-rollback).
  4. On ANY failure the last-known-good bundle stays active — a bad sync
     can never strip protection.

The cache lives next to the URL blocklist under
``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\intel_bundle.json`` and is
re-verified on every load so on-disk tampering is caught.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from avs_backend.threat_intel.domains import (
    HASH_BYTES,
    canonical_url,
    host_digest,
    host_key_from_url,
    url_lookup_digests,
)

log = logging.getLogger("avs.threat_intel.store")

# Ed25519 public key for AVS threat-intel bundles (private key lives only
# on the license server as THREAT_INTEL_PRIVATE_KEY).
_PUBLIC_KEY_PEM = b"""-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAmISFzqnEiswecZyciZl4HW4y0CTnESgfARuPv6u4tig=
-----END PUBLIC KEY-----
"""

_BUNDLE_URL_ENV = "AVS_THREAT_INTEL_URL"
_DEFAULT_BUNDLE_URL = "https://api.avsshield.com/api/threat-intel/bundle"

_FETCH_TIMEOUT = 30
_MIN_SYNC_INTERVAL = 300  # seconds between network syncs unless forced


def _data_dir() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")))
    d = base / "AVS AI Shield" / "threat_engine"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _parse_iso(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _decode_blob(b64: str) -> bytes:
    """Decode the base64 digest blob; raise on malformed input."""
    if not b64:
        return b""
    import base64
    blob = base64.b64decode(b64)
    if len(blob) % HASH_BYTES != 0:
        raise ValueError("malformed digest blob")
    return blob


def _blob_contains(blob: bytes, digest: bytes) -> bool:
    """Membership check on a sorted flat digest blob via bisect."""
    n = len(blob) // HASH_BYTES
    # Treat the blob as a virtual array of HASH_BYTES records.
    lo, hi = 0, n
    while lo < hi:
        mid = (lo + hi) // 2
        rec = blob[mid * HASH_BYTES:(mid + 1) * HASH_BYTES]
        if rec < digest:
            lo = mid + 1
        elif rec > digest:
            hi = mid
        else:
            return True
    return False


class ThreatIntelStore:
    """Verified local view of the signed threat-intel bundle."""

    def __init__(
        self,
        bundle_url: str | None = None,
        cache_path: Path | None = None,
        public_key_pem: bytes = _PUBLIC_KEY_PEM,
    ) -> None:
        self._url = (
            bundle_url
            or os.environ.get(_BUNDLE_URL_ENV)
            or _DEFAULT_BUNDLE_URL
        )
        self._cache_path = cache_path or (_data_dir() / "intel_bundle.json")
        self._public_key = serialization.load_pem_public_key(public_key_pem)
        if not isinstance(self._public_key, Ed25519PublicKey):
            raise ValueError("threat-intel public key must be Ed25519")

        self._lock = threading.RLock()
        # Sorted binary blobs of HASH_BYTES digests — bisect lookup keeps
        # ~1M indicators in ~6 MB instead of ~60 MB of Python strings.
        self._url_blob: bytes = b""
        self._host_blob: bytes = b""
        self._version = 0
        self._issued_at: datetime | None = None
        self._expires_at: datetime | None = None
        self._etag: str | None = None
        self._sources: dict[str, Any] = {}
        self._last_sync_at = 0.0
        self._last_error: str | None = None
        self._load_cache()

    # ── Cache persistence ────────────────────────────────────────────

    def _load_cache(self) -> None:
        """Load and verify the on-disk bundle (signature re-checked)."""
        try:
            with open(self._cache_path, "rb") as f:
                record = json.load(f)
            canonical = gzip.decompress(bytes.fromhex(record["payload_gz_hex"]))
            self._public_key.verify(bytes.fromhex(record["signature_hex"]), canonical)
            bundle = json.loads(canonical)
            self._apply(bundle, etag=record.get("etag"), signature_hex=record["signature_hex"])
            log.info("threat-intel cache loaded: v%d (%d urls, %d hosts)",
                     self._version,
                     len(self._url_blob) // HASH_BYTES,
                     len(self._host_blob) // HASH_BYTES)
        except FileNotFoundError:
            pass
        except Exception as exc:
            log.warning("threat-intel cache rejected (%s) — will re-sync", exc)

    def _save_cache(self, canonical: bytes, signature_hex: str) -> None:
        """Atomically persist the verified bundle."""
        try:
            tmp = self._cache_path.with_suffix(".tmp")
            record = {
                "payload_gz_hex": gzip.compress(canonical, compresslevel=6).hex(),
                "signature_hex": signature_hex,
                "etag": self._etag,
                "saved_at": datetime.now(timezone.utc).isoformat(),
            }
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(record, f)
            os.replace(tmp, self._cache_path)
        except OSError as exc:
            log.warning("failed to persist threat-intel cache: %s", exc)

    def _apply(self, bundle: dict, *, etag: str | None, signature_hex: str) -> None:
        if bundle.get("format") != "avs-threat-intel":
            raise ValueError("unrecognised bundle format")
        if bundle.get("format_version") != 1:
            raise ValueError("unsupported format_version")
        version = int(bundle.get("version", 0))
        url_blob = _decode_blob(bundle.get("url_hashes_b64", ""))
        host_blob = _decode_blob(bundle.get("host_hashes_b64", ""))
        with self._lock:
            if version < self._version:
                raise ValueError(f"rollback rejected: v{version} < v{self._version}")
            self._url_blob = url_blob
            self._host_blob = host_blob
            self._version = version
            self._issued_at = _parse_iso(bundle.get("issued_at", ""))
            self._expires_at = _parse_iso(bundle.get("expires_at", ""))
            self._sources = dict(bundle.get("sources") or {})
            if etag:
                self._etag = etag

    # ── Sync ─────────────────────────────────────────────────────────

    def sync(self, force: bool = False) -> dict:
        """Fetch the newest bundle if changed. Never raises."""
        now = time.monotonic()
        if not force and (now - self._last_sync_at) < _MIN_SYNC_INTERVAL:
            return {"ok": True, "reason": "rate_limited", "version": self._version}

        headers = {"User-Agent": "AVS-Shield/1.0", "Accept": "application/gzip"}
        if self._etag:
            headers["If-None-Match"] = self._etag
        req = urllib.request.Request(self._url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=_FETCH_TIMEOUT) as resp:
                body = resp.read()
                signature_hex = resp.headers.get("X-AVS-Signature", "")
                etag = resp.headers.get("ETag")
        except urllib.error.HTTPError as exc:
            if exc.code == 304:
                return {"ok": True, "reason": "not_modified", "version": self._version}
            self._last_error = f"http_{exc.code}"
            return {"ok": False, "reason": self._last_error, "version": self._version}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            self._last_error = f"network:{exc.__class__.__name__}"
            return {"ok": False, "reason": self._last_error, "version": self._version}

        if not signature_hex:
            self._last_error = "missing_signature"
            return {"ok": False, "reason": self._last_error, "version": self._version}

        try:
            canonical = gzip.decompress(body)
            self._public_key.verify(bytes.fromhex(signature_hex), canonical)
            bundle = json.loads(canonical)
            if not isinstance(bundle, dict):
                raise ValueError("bundle payload is not a JSON object")
            self._apply(bundle, etag=etag, signature_hex=signature_hex)
            self._save_cache(canonical, signature_hex)
            self._last_error = None
        except InvalidSignature:
            self._last_error = "bad_signature"
            return {"ok": False, "reason": self._last_error, "version": self._version}
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            self._last_error = f"invalid_bundle:{exc}"
            return {"ok": False, "reason": self._last_error, "version": self._version}

        self._last_sync_at = now  # stamp on success — a failed sync must
        # not suppress retries for the next rate-limit window
        log.info("threat-intel synced: v%d (%d urls, %d hosts)",
                 self._version,
                 len(self._url_blob) // HASH_BYTES,
                 len(self._host_blob) // HASH_BYTES)
        return {"ok": True, "reason": "updated", "version": self._version}

    # ── Lookup ───────────────────────────────────────────────────────

    def lookup(self, url: str) -> str | None:
        """Return 'url' | 'host' | None for a user-supplied URL."""
        if not self._url_blob and not self._host_blob:
            return None
        canon = canonical_url(url)
        if not canon:
            return None
        for digest in url_lookup_digests(url):
            if _blob_contains(self._url_blob, digest):
                return "url"
        host = host_key_from_url(url)
        if host and _blob_contains(self._host_blob, host_digest(host)):
            return "host"
        return None

    def is_stale(self) -> bool:
        """True if the bundle passed its expiry timestamp."""
        if self._expires_at is None:
            return self._version == 0  # nothing loaded = treat as stale
        return datetime.now(timezone.utc) > self._expires_at

    def stats(self) -> dict:
        """Status snapshot for RPC/UI surfaces."""
        with self._lock:
            age = None
            if self._issued_at:
                age = (datetime.now(timezone.utc) - self._issued_at).total_seconds()
            return {
                "version": self._version,
                "issued_at": self._issued_at.isoformat() if self._issued_at else None,
                "expires_at": self._expires_at.isoformat() if self._expires_at else None,
                "age_seconds": round(age) if age is not None else None,
                "url_count": len(self._url_blob) // HASH_BYTES,
                "host_count": len(self._host_blob) // HASH_BYTES,
                "sources": list(self._sources.keys()),
                "stale": self.is_stale(),
                "configured": True,
                "bundle_url": self._url,
                "last_error": self._last_error,
            }
