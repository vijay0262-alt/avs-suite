"""Phase 5 tests — Safe Banking + family alerts."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

import avs_backend.safe_banking as sb
from avs_backend.scam_guards import family


# ----------------------------------------------------------------------
# Safe Banking
# ----------------------------------------------------------------------

@pytest.fixture(autouse=True)
def tmp_sites(tmp_path, monkeypatch):
    p = tmp_path / "sites.json"
    monkeypatch.setattr(sb, "_SITES_PATH", p)
    return p


class TestDomains:
    def test_normalize(self):
        assert sb._normalize_domain("https://www.Chase.com/login?x=1") == "chase.com"
        assert sb._normalize_domain("bankofamerica.com:443") == "bankofamerica.com"
        assert sb._normalize_domain("www.wellsfargo.com/") == "wellsfargo.com"

    def test_add_site(self):
        r = sb.add_site({"domain": "https://chase.com"})
        assert r["success"] and "chase.com" in r["result"]

    def test_add_bad_domain(self):
        assert sb.add_site({"domain": "not a domain"})["error_code"] == "INVALID_PARAMS"

    def test_remove_site(self):
        sb.add_site({"domain": "chase.com"})
        r = sb.remove_site({"domain": "chase.com"})
        assert r["result"] == []

    def test_launch_untrusted_rejected(self):
        r = sb.launch({"domain": "evil-bank.com"})
        assert r["error_code"] == "NOT_TRUSTED"

    def test_launch_http_rejected(self):
        sb.add_site({"domain": "chase.com"})
        r = sb.launch({"url": "http://chase.com"})
        assert r["error_code"] == "HTTPS_ONLY"

    def test_launch_no_browser(self, monkeypatch):
        monkeypatch.setattr(sb, "_find_browsers", lambda: {})
        sb.add_site({"domain": "chase.com"})
        assert sb.launch({"domain": "chase.com"})["error_code"] == "NO_BROWSER"

    def test_launch_happy_path(self, monkeypatch):
        monkeypatch.setattr(sb, "_find_browsers",
                            lambda: {"chrome": r"C:\fake\chrome.exe"})
        sb.add_site({"domain": "chase.com"})
        launched = {}
        monkeypatch.setattr(sb.subprocess, "Popen",
                            lambda args, **kw: launched.setdefault("args", args))
        r = sb.launch({"domain": "chase.com"})
        assert r["success"] and r["result"]["url"] == "https://chase.com"
        args = launched["args"]
        assert "--disable-extensions" in args
        assert any("user-data-dir" in a for a in args)

    def test_launch_subdomain_of_trusted(self, monkeypatch):
        monkeypatch.setattr(sb, "_find_browsers",
                            lambda: {"edge": r"C:\fake\msedge.exe"})
        sb.add_site({"domain": "chase.com"})
        monkeypatch.setattr(sb.subprocess, "Popen", lambda *a, **k: None)
        r = sb.launch({"domain": "secure.chase.com"})
        assert r["success"]

    def test_status(self):
        r = sb.status(None)
        assert r["success"] and "browsers" in r["result"]


# ----------------------------------------------------------------------
# Family alerts
# ----------------------------------------------------------------------

@pytest.fixture(autouse=True)
def tmp_family(tmp_path, monkeypatch):
    p = tmp_path / "family.json"
    monkeypatch.setattr(family, "_CONFIG_PATH", p)
    return p


class TestFamilyAlerts:
    def test_disabled_by_default(self):
        r = family.send_alert({"severity": "critical", "message": "x", "type": "t"})
        assert r["skipped"] == "disabled"

    def test_severity_gate(self):
        family.configure(enabled=True, ntfy_topic="t1", min_severity="critical")
        r = family.send_alert({"severity": "medium", "message": "x", "type": "t"})
        assert r["skipped"] == "below_min_severity"

    def test_sends_to_ntfy(self):
        family.configure(enabled=True, ntfy_topic="avs-test", contact_name="Mom")
        sent = []

        class R:
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def fake(req, timeout=None):
            sent.append(req)
            return R()

        with patch("urllib.request.urlopen", fake):
            r = family.send_alert({"severity": "critical", "type": "clipboard_swap",
                                   "message": "clipboard replaced"})
        assert r["sent"] == 1
        assert sent[0].full_url == "https://ntfy.sh/avs-test"
        assert sent[0].headers["Priority"] == "urgent"

    def test_webhook_payload(self):
        family.configure(enabled=True, webhook_url="https://hook.example/x")
        sent = []

        class R:
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def fake(req, timeout=None):
            sent.append(json.loads(req.data))
            return R()

        with patch("urllib.request.urlopen", fake):
            r = family.send_alert({"severity": "critical", "type": "remote_access_tool",
                                   "message": "anydesk started"})
        assert r["sent"] == 1
        assert "anydesk started" in sent[0]["content"]

    def test_failure_does_not_raise(self):
        family.configure(enabled=True, ntfy_topic="x")
        with patch("urllib.request.urlopen", side_effect=OSError("down")):
            r = family.send_alert({"severity": "critical", "type": "t", "message": "m"})
        assert r["sent"] == 0 and "errors" in r

    def test_rpc_config(self):
        import avs_backend.scam_guards as sg
        r = sg.family_config({"enabled": True, "ntfy_topic": "t"})
        assert r["result"]["enabled"] and r["result"]["ntfy_topic"] == "t"
        r = sg.family_config(None)
        assert r["result"]["enabled"]

    def test_on_alert_callback_fires(self):
        got = []
        from avs_backend.scam_guards.guards import ScamGuardMonitor
        m = ScamGuardMonitor(process_names_fn=lambda: set(),
                             clipboard_fn=lambda: "",
                             on_alert=got.append)
        m.tick()
        m._proc_fn = lambda: {"anydesk"}
        m.tick()
        assert len(got) == 1 and got[0]["type"] == "remote_access_tool"
