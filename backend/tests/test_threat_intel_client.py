"""Tests for the threat-intel client package + rewritten WebShield.

The canonicalisation vectors are identical to the license-server suite
(``tests/test_threat_intel.py``) — both sides must produce byte-identical
canonical forms or bundle hashes won't match.
"""

from __future__ import annotations

import gzip
import io
import json
import urllib.error
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from avs_backend.threat_intel.allowlist import is_popular, popular_count
from avs_backend.threat_intel.domains import (
    HASH_BYTES,
    canonical_url,
    host_digest,
    host_key,
    host_key_from_url,
    is_ip,
    registrable_domain,
    url_digest,
)
from avs_backend.threat_intel.lookalike import check_domain, check_url_brands
from avs_backend.threat_intel.store import ThreatIntelStore


# ── Canonicalisation vectors — MUST match license-server test file ────

CANON_VECTORS = [
    ("example.com", "http://example.com/", "http://example.com/", "example.com"),
    ("HTTP://Example.COM/Path", "http://example.com/Path", "http://example.com/Path", "example.com"),
    ("https://example.com:443/x", "https://example.com/x", "https://example.com/x", "example.com"),
    ("http://example.com:8080/x", "http://example.com:8080/x", "http://example.com:8080/x", "example.com"),
    ("https://user:pass@example.com/x", "https://example.com/x", "https://example.com/x", "example.com"),
    ("example.com/x#frag", "http://example.com/x", "http://example.com/x", "example.com"),
    ("example.com./x", "http://example.com/x", "http://example.com/x", "example.com"),
    ("https://example.com/x?a=1&b=2", "https://example.com/x?a=1&b=2", "https://example.com/x", "example.com"),
    ("bücher.de/x", "http://xn--bcher-kva.de/x", "http://xn--bcher-kva.de/x", "xn--bcher-kva.de"),
    ("http://xn--bcher-kva.de/", "http://xn--bcher-kva.de/", "http://xn--bcher-kva.de/", "xn--bcher-kva.de"),
    ("//evil.com/path", "http://evil.com/path", "http://evil.com/path", "evil.com"),
]


class TestCanonicalisation:
    @pytest.mark.parametrize("raw,full,bare,host", CANON_VECTORS)
    def test_full(self, raw, full, bare, host):
        assert canonical_url(raw) == full

    @pytest.mark.parametrize("raw,full,bare,host", CANON_VECTORS)
    def test_no_query(self, raw, full, bare, host):
        assert canonical_url(raw, include_query=False) == bare

    @pytest.mark.parametrize("raw,full,bare,host", CANON_VECTORS)
    def test_host(self, raw, full, bare, host):
        assert host_key_from_url(raw) == host


class TestRegistrableDomain:
    @pytest.mark.parametrize("host,expected", [
        ("example.com", "example.com"),
        ("www.example.com", "example.com"),
        ("a.b.example.co.uk", "example.co.uk"),
        ("co.uk", "co.uk"),
        ("x.github.io", "x.github.io"),        # private suffix
        ("a.x.github.io", "x.github.io"),
        ("evil.com", "evil.com"),
        ("8.8.8.8", "8.8.8.8"),
    ])
    def test_registrable(self, host, expected):
        assert registrable_domain(host) == expected

    def test_ip_detection(self):
        assert is_ip("8.8.8.8")
        assert is_ip("::1")
        assert not is_ip("example.com")
        assert not is_ip("")


class TestLookalike:
    """The false-positive/false-negative matrix the old code got wrong."""

    @pytest.mark.parametrize("host", [
        "apple.com", "support.apple.com", "appleid.apple.com",
        "paypal.com", "www.paypal.com", "amazon.co.uk", "google.de",
        "outlook.com", "github.io", "user.github.io",
        "pineapple.com", "pineapple-supplies.com",   # contains 'apple' as substring only
        "appstore-reviews.net",                       # 'app'+'store' ≠ 'apple'
    ])
    def test_legitimate_and_unrelated_safe(self, host):
        result = check_domain(host)
        assert not result.hit, f"{host} falsely flagged as {result.signal}:{result.brand}"

    @pytest.mark.parametrize("host,brand", [
        ("paypal-login.com", "paypal"),
        ("secure-paypal.net", "paypal"),
        ("paypalsupport.com", "paypal"),
        ("paypall.com", "paypal"),          # typo
        ("paypa1.com", "paypal"),           # homoglyph + typo
        ("microsft.com", "microsoft"),
        ("arnazon.com", "amazon"),
        ("paypal.evil-host.com", "paypal"),  # subdomain abuse
        ("login.microsoft.suspicious-site.net", "microsoft"),
        ("apple-verify.top", "apple"),
        ("notpaypal.com", "paypal"),         # 'paypal' suffix — hmm: 'notpaypal' sld
    ])
    def test_lookalikes_flagged(self, host, brand):
        result = check_domain(host)
        assert result.hit, f"{host} should flag {brand}"
        assert result.brand == brand

    def test_brand_on_foreign_tld(self):
        result = check_domain("paypal.xyz")
        assert result.hit and result.brand == "paypal"

    def test_path_brand(self):
        result = check_url_brands("totally-unrelated-host.com", "/paypal/signin")
        assert result.hit and result.brand == "paypal"
        assert not check_url_brands("paypal.com", "/paypal/signin").hit


class TestAllowlist:
    def test_popular_domains_loaded(self):
        assert popular_count() > 10000
        assert is_popular("google.com")
        assert is_popular("www.youtube.com")   # resolves via registrable
        assert not is_popular("definitely-not-popular-xyz123.com")


# ── Store (signed bundle client) ──────────────────────────────────────


def _make_keypair():
    key = Ed25519PrivateKey.generate()
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return key, pem


def _pack(digests) -> str:
    import base64
    return base64.b64encode(b"".join(sorted(digests))).decode("ascii")


def _bundle_bytes(key: Ed25519PrivateKey, version: int, urls=(), hosts=()):
    url_ds = sorted({url_digest(canonical_url(u)) for u in urls})
    host_ds = sorted({host_digest(h) for h in hosts})
    bundle = {
        "format": "avs-threat-intel",
        "format_version": 1,
        "version": version,
        "issued_at": "2026-11-19T00:00:00+00:00",
        "expires_at": "2099-01-01T00:00:00+00:00",
        "sources": {},
        "url_count": len(url_ds),
        "host_count": len(host_ds),
        "url_hashes_b64": _pack(url_ds),
        "host_hashes_b64": _pack(host_ds),
    }
    canonical = json.dumps(bundle, sort_keys=True, separators=(",", ":")).encode()
    return canonical, gzip.compress(canonical), key.sign(canonical).hex()


class _FakeResponse:
    def __init__(self, body=b"", headers=None, status=200):
        self._body = body
        self.headers = headers or {}
        self.status = status

    def read(self, n=-1):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class TestStore:
    def _store(self, tmp_path, pub_pem):
        return ThreatIntelStore(
            bundle_url="https://unit.test/bundle",
            cache_path=tmp_path / "intel_bundle.json",
            public_key_pem=pub_pem,
        )

    def test_sync_verify_lookup(self, tmp_path, monkeypatch):
        key, pub = _make_keypair()
        canonical, gz, sig = _bundle_bytes(key, 1, urls=["http://evil.com/x"], hosts=["phish-host.net"])

        def fake_urlopen(req, timeout=0):
            return _FakeResponse(gz, {"X-AVS-Signature": sig, "ETag": '"v1-abc"'})

        monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
        store = self._store(tmp_path, pub)
        result = store.sync(force=True)
        assert result["ok"] and result["version"] == 1

        assert store.lookup("http://evil.com/x") == "url"
        assert store.lookup("https://phish-host.net/anything") == "host"
        assert store.lookup("https://innocent.example") is None

    def test_bad_signature_rejected(self, tmp_path, monkeypatch):
        key, pub = _make_keypair()
        other_key, _ = _make_keypair()
        canonical, gz, _ = _bundle_bytes(key, 1, urls=["http://evil.com/x"])
        bad_sig = other_key.sign(canonical).hex()

        monkeypatch.setattr(
            "urllib.request.urlopen",
            lambda req, timeout=0: _FakeResponse(gz, {"X-AVS-Signature": bad_sig}),
        )
        store = self._store(tmp_path, pub)
        result = store.sync(force=True)
        assert not result["ok"] and result["reason"] == "bad_signature"
        assert store.lookup("http://evil.com/x") is None

    def test_rollback_rejected(self, tmp_path, monkeypatch):
        key, pub = _make_keypair()
        c1, gz1, s1 = _bundle_bytes(key, 2, urls=["http://evil.com/new"])
        c0, gz0, s0 = _bundle_bytes(key, 1, urls=["http://evil.com/old"])

        bodies = iter([
            _FakeResponse(gz1, {"X-AVS-Signature": s1}),
            _FakeResponse(gz0, {"X-AVS-Signature": s0}),
        ])
        monkeypatch.setattr("urllib.request.urlopen", lambda req, timeout=0: next(bodies))
        store = self._store(tmp_path, pub)
        assert store.sync(force=True)["ok"]
        assert store.sync(force=True)["ok"] is False  # v1 < v2 rejected
        assert store.lookup("http://evil.com/old") is None
        assert store.lookup("http://evil.com/new") == "url"

    def test_cache_persists_and_verifies(self, tmp_path, monkeypatch):
        key, pub = _make_keypair()
        canonical, gz, sig = _bundle_bytes(key, 5, hosts=["cached-bad.com"])
        monkeypatch.setattr(
            "urllib.request.urlopen",
            lambda req, timeout=0: _FakeResponse(gz, {"X-AVS-Signature": sig}),
        )
        store = self._store(tmp_path, pub)
        store.sync(force=True)

        # New instance loads from disk without network.
        monkeypatch.setattr(
            "urllib.request.urlopen",
            lambda *a, **k: (_ for _ in ()).throw(AssertionError("network not allowed")),
        )
        store2 = self._store(tmp_path, pub)
        assert store2.lookup("https://cached-bad.com/") == "host"

    def test_tampered_cache_rejected(self, tmp_path):
        key, pub = _make_keypair()
        cache = tmp_path / "intel_bundle.json"
        cache.write_text(json.dumps({"payload_gz_hex": "deadbeef", "signature_hex": "00"}))
        store = self._store(tmp_path, pub)
        assert store.lookup("https://cached-bad.com/") is None

    def test_network_failure_keeps_cache(self, tmp_path, monkeypatch):
        key, pub = _make_keypair()
        canonical, gz, sig = _bundle_bytes(key, 3, hosts=["still-bad.com"])
        monkeypatch.setattr(
            "urllib.request.urlopen",
            lambda req, timeout=0: _FakeResponse(gz, {"X-AVS-Signature": sig}),
        )
        store = self._store(tmp_path, pub)
        store.sync(force=True)

        def boom(req, timeout=0):
            raise urllib.error.URLError("offline")

        monkeypatch.setattr("urllib.request.urlopen", boom)
        result = store.sync(force=True)
        assert not result["ok"]
        assert store.lookup("https://still-bad.com/x") == "host"  # last-good intact


# ── WebShield integration ─────────────────────────────────────────────


class _StubIntel:
    """Faithful stand-in: 'url:' keys match the canonical URL, 'host:'
    keys match any URL on that host — same contract as ThreatIntelStore."""

    def __init__(self, urls=(), hosts=()):
        self._urls = {canonical_url(u) for u in urls}
        self._hosts = {host_key(h) for h in hosts}
        self.synced = 0

    def lookup(self, url):
        if canonical_url(url) in self._urls:
            return "url"
        if host_key_from_url(url) in self._hosts:
            return "host"
        return None

    def sync(self, force=False):
        self.synced += 1
        return {"ok": True, "reason": "updated", "version": 1}

    def stats(self):
        return {"configured": True, "version": 1,
                "url_count": len(self._urls), "host_count": len(self._hosts)}


@pytest.fixture()
def shield(tmp_path):
    from avs_backend.advanced_security.web_shield import WebShield
    intel = _StubIntel(
        urls=["http://known-phish.com/login"],
        hosts=["bad-host.net"],
    )
    ws = WebShield({
        "intel_store": intel,
        "intel_autosync": False,
    })
    ws._BLOCKLIST = ws.blocklist  # isolate: use empty dict
    ws.blocklist = {}
    return ws


class TestWebShield:
    def test_intel_url_hit_critical(self, shield):
        r = shield.check_url("http://known-phish.com/login")
        assert r["risk_level"] == "critical" and not r["safe"]
        assert "known_phishing_url" in r["reasons"]

    def test_intel_host_hit_high(self, shield):
        r = shield.check_url("https://bad-host.net/anything")
        assert r["risk_level"] == "high" and not r["safe"]

    def test_legit_sites_safe(self, shield):
        for u in ["https://www.paypal.com/signin", "https://support.apple.com/",
                  "https://amazon.co.uk/dp/B00", "https://github.io/",
                  "https://pineapple.com/", "https://youtube.com/watch?v=x"]:
            r = shield.check_url(u)
            assert r["safe"], f"{u} should be safe, got {r['risk_level']} {r['reasons']}"

    def test_lookalike_flagged(self, shield):
        for u, brand in [("https://paypal-login.com/", "paypal"),
                         ("https://paypall.com/", "paypal"),
                         ("https://microsft.com/", "microsoft")]:
            r = shield.check_url(u)
            assert not r["safe"], f"{u} should flag"
            assert any(brand in reason for reason in r["reasons"])

    def test_raw_ip(self, shield):
        r = shield.check_url("http://185.220.101.4/payload.exe")
        assert "raw_ip_host" in r["reasons"] and not r["safe"]

    def test_popular_domain_suppression(self, shield):
        # github.io subdomains are brand-lookalike-free here, but any
        # heuristic-only score on a popular domain caps at 'low'/safe.
        r = shield.check_url("https://gitlab.com/")
        assert r["safe"]

    def test_malformed(self, shield):
        assert not shield.check_url("")["safe"]
        assert not shield.check_url("::::")["safe"]

    def test_manual_blocklist_roundtrip(self, shield):
        assert shield.add_to_blocklist("evil-manual.com/x", "phishing")["ok"]
        r = shield.check_url("https://evil-manual.com/other")
        assert not r["safe"]
        assert shield.remove_from_blocklist("evil-manual.com")["ok"]

    def test_update_feeds_uses_store(self, shield):
        result = shield.update_feeds(force=True)
        assert result["updated"] and "avs_threat_intel" in result["feeds"]

    def test_status_includes_intel(self, shield):
        status = shield.get_status()
        assert status["intel"]["configured"] is True
