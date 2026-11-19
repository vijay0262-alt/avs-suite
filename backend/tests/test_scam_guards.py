"""Scam guards tests — RAT detection, clipboard swap, report upload."""

from __future__ import annotations

import json
import time
from unittest.mock import patch

import pytest

from avs_backend.scam_guards.guards import (
    RAT_PROCESSES,
    ScamGuardMonitor,
    _crypto_addresses,
)


BTC_A = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
BTC_B = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"
ETH = "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe"


@pytest.fixture
def monitor():
    return ScamGuardMonitor(
        process_names_fn=lambda: set(),
        clipboard_fn=lambda: "",
        threat_context_fn=lambda: 0.0,
        poll_seconds=999,
    )


class TestCryptoExtract:
    def test_finds_addresses(self):
        assert BTC_A in _crypto_addresses(f"send to {BTC_A} now")
        assert ETH in _crypto_addresses(f"pay {ETH}")
        assert not _crypto_addresses("no addresses here")


class TestRemoteAccessGuard:
    def test_baseline_no_alert(self):
        # AnyDesk already running at first poll → baseline, no alert.
        procs = iter([{"anydesk", "chrome"}, {"anydesk", "chrome"}])
        m = ScamGuardMonitor(process_names_fn=lambda: next(procs),
                             clipboard_fn=lambda: "")
        m.tick()
        assert m.get_alerts() == []

    def test_new_rat_alerts(self, monitor):
        monitor.tick()  # baseline (empty)
        monitor._proc_fn = lambda: {"anydesk"}
        monitor.tick()
        alerts = monitor.get_alerts()
        assert len(alerts) == 1
        assert alerts[0]["type"] == "remote_access_tool"
        assert alerts[0]["severity"] == "medium"
        assert "anydesk" in alerts[0]["message"]

    def test_rat_after_block_is_critical(self):
        recent = time.time() - 60  # blocked a URL a minute ago
        m = ScamGuardMonitor(
            process_names_fn=lambda: set(),
            clipboard_fn=lambda: "",
            threat_context_fn=lambda: recent)
        m.tick()  # baseline
        m._proc_fn = lambda: {"quickassist"}
        m.tick()
        alert = m.get_alerts()[0]
        assert alert["severity"] == "critical"
        assert "tech-support-scam" in alert["message"]

    def test_stale_context_stays_medium(self):
        old = time.time() - 3600  # blocked an hour ago → out of window
        m = ScamGuardMonitor(
            process_names_fn=lambda: set(),
            clipboard_fn=lambda: "",
            threat_context_fn=lambda: old)
        m.tick()
        m._proc_fn = lambda: {"teamviewer"}
        m.tick()
        assert m.get_alerts()[0]["severity"] == "medium"

    def test_all_rat_names_normalized(self):
        # Ensure process list entries match the watchlist without .exe.
        assert "anydesk" in RAT_PROCESSES and "quickassist" in RAT_PROCESSES


class TestClipboardGuard:
    def test_no_alert_same_address(self, monitor):
        texts = iter([f"{BTC_A}", f"{BTC_A}"])
        monitor._clip_fn = lambda: next(texts)
        monitor.tick(); monitor.tick()
        assert not any(a["type"] == "clipboard_swap" for a in monitor.get_alerts())

    def test_swap_alerts_critical(self, monitor):
        texts = iter([f"send to {BTC_A}", f"send to {BTC_B}"])
        monitor._clip_fn = lambda: next(texts)
        monitor.tick(); monitor.tick()
        alerts = [a for a in monitor.get_alerts() if a["type"] == "clipboard_swap"]
        assert len(alerts) == 1
        assert alerts[0]["severity"] == "critical"
        assert alerts[0]["new_address"] == BTC_B

    def test_non_crypto_text_ignored(self, monitor):
        monitor._clip_fn = lambda: "just some copied text"
        monitor.tick()
        assert monitor.get_alerts() == []

    def test_mixed_crypto_swap(self, monitor):
        # BTC then ETH — still a swap between different addresses.
        texts = iter([BTC_A, ETH])
        monitor._clip_fn = lambda: next(texts)
        monitor.tick(); monitor.tick()
        assert any(a["type"] == "clipboard_swap" for a in monitor.get_alerts())


class TestLifecycle:
    def test_start_stop(self, monitor):
        monitor.start()
        assert monitor.running
        monitor.stop()
        assert not monitor.running

    def test_status(self, monitor):
        s = monitor.status()
        assert s["rat_tools_watched"] > 20
        assert "running" in s


class TestReporter:
    def test_upload_no_queue(self, tmp_path):
        import avs_backend.scam_guards.reporter as rep
        with patch.object(rep, "_REPORTS_PATH", tmp_path / "none.jsonl"):
            assert rep.upload_reports() == {"uploaded": 0, "queued": 0}

    def test_upload_builds_host_only_payload(self, tmp_path):
        import avs_backend.scam_guards.reporter as rep
        q = tmp_path / "r.jsonl"
        q.write_text(
            json.dumps({"url": "https://evil.com/deep/path?token=secret",
                        "verdict": "scam", "note": "phish",
                        "reported_at": "2026-11-19T00:00:00Z"}) + "\n")
        sent = {}

        class FakeResp:
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self): return json.dumps({"accepted": 1}).encode()

        def fake_urlopen(req, timeout=None):
            sent["body"] = json.loads(req.data)
            return FakeResp()

        with patch.object(rep, "_REPORTS_PATH", q), \
             patch("urllib.request.urlopen", fake_urlopen):
            r = rep.upload_reports("fp1")

        assert r["uploaded"] == 1
        payload = sent["body"]["reports"][0]
        assert payload["host"] == "evil.com"       # registrable only
        assert "token=secret" not in json.dumps(sent["body"])  # no URL leakage
        assert q.read_text().strip() == ""          # queue cleared

    def test_failed_upload_keeps_queue(self, tmp_path):
        import avs_backend.scam_guards.reporter as rep
        q = tmp_path / "r.jsonl"
        q.write_text(json.dumps({"url": "https://evil.com", "verdict": "scam",
                                 "reported_at": "2026-11-19T00:00:00Z"}) + "\n")

        def boom(req, timeout=None):
            raise OSError("offline")

        with patch.object(rep, "_REPORTS_PATH", q), \
             patch("urllib.request.urlopen", boom):
            r = rep.upload_reports()
        assert r["uploaded"] == 0 and r["queued"] == 1
        assert "evil.com" in q.read_text()
