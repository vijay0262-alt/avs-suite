"""Web Shield URL-classification tests.

Covers the phishing/scam URL heuristics that back AI Scam Detection:
brand lookalikes, raw-IP hosts, punycode, the manual blocklist, and —
critically — the false-positive suppression that keeps heuristics from
blocking popular domains.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolated_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    yield


@pytest.fixture
def shield():
    from avs_backend.advanced_security.web_shield import WebShield
    return WebShield({})


class TestMaliciousUrls:
    def test_combosquat_flagged(self, shield):
        # Brand token embedded in a non-official registrable domain.
        r = shield.check_url("https://paypal-login-verify.com/signin")
        assert r["safe"] is False
        assert r["score"] >= 30
        assert "brand_lookalike" in r["categories"]

    def test_typosquat_flagged(self, shield):
        # SLD within edit distance 1 / homoglyph-skeleton of a brand.
        r = shield.check_url("https://paypa1.com/login")
        assert r["safe"] is False
        assert "brand_lookalike" in r["categories"]

    def test_raw_ip_host_flagged(self, shield):
        r = shield.check_url("http://192.168.99.77/download/invoice.exe")
        assert r["safe"] is False
        assert "raw_ip_host" in r["reasons"]

    def test_punycode_flagged(self, shield):
        r = shield.check_url("https://xn--pypal-4ve.com/login")
        assert r["safe"] is False or r["score"] > 0
        assert any("punycode" in reason for reason in r["reasons"])

    def test_malformed_url_not_safe(self, shield):
        r = shield.check_url("")
        assert r["safe"] is False
        assert r["risk_level"] == "critical"

    def test_suspicious_tld_flagged(self, shield):
        r = shield.check_url("https://free-gift-cards-now.top/claim")
        assert r["score"] > 0


class TestBlocklist:
    def test_manual_block_blocks_url(self, shield):
        shield.blocklist["evil-phish.example.com"] = {"category": "phishing"}
        r = shield.check_url("https://evil-phish.example.com/login")
        assert r["safe"] is False
        assert r["risk_level"] == "critical"

    def test_blocklist_hit_beats_popular_domain(self, shield):
        """Explicit blocklist entries are never softened by the
        popular-domain false-positive guard."""
        shield.blocklist["google.com"] = {"category": "phishing"}
        r = shield.check_url("https://google.com/")
        assert r["safe"] is False


class TestAmtsoSeedUrls:
    """AMTSO Security Features Check hosts are seeded so the free
    validation page actually passes — the AMTSO spec expects a working
    AV to flag these safe test pages."""

    def test_amtso_phishing_page_blocked(self, shield):
        r = shield.check_url("https://phishing.amtso.eicar.org/")
        assert r["safe"] is False
        assert "phishing" in r["categories"]

    def test_amtso_test_host_flagged(self, shield):
        r = shield.check_url("https://amtso.eicar.org/PotentiallyUnwanted.exe")
        assert r["safe"] is False

    def test_eicar_main_site_not_blocked(self, shield):
        """We block the test subdomains only — the legitimate eicar.org
        site must remain reachable."""
        r = shield.check_url("https://www.eicar.org/")
        assert r["safe"] is True


class TestFalsePositiveControl:
    def test_popular_domain_stays_safe(self, shield):
        r = shield.check_url("https://www.google.com/")
        assert r["safe"] is True
        assert r["risk_level"] in ("safe", "low")

    def test_popular_subdomain_heuristics_suppressed(self, shield):
        """Heuristic-only signals can't push a popular domain over the
        block threshold — this is what keeps us from blocking legit sites."""
        r = shield.check_url("https://mail.login.accounts.google.com/signin")
        assert r["safe"] is True

    def test_ordinary_unknown_domain_safe(self, shield):
        r = shield.check_url("https://www.anordinarycompany-example.com/about")
        assert r["risk_level"] in ("safe", "low", "medium")
