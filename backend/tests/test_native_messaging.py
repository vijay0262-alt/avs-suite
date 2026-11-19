"""Native messaging host tests — Chrome/Edge extension bridge.

Covers the wire protocol (4-byte LE length + JSON), message dispatch, and
the WebShield-backed check_url path with a stubbed shield.
"""

from __future__ import annotations

import io
import json
import struct

import pytest

from avs_backend.native_messaging.host import (
    NativeMessagingHost,
    _read_message,
    _write_message,
    serve,
)


def _frame(obj) -> bytes:
    body = json.dumps(obj).encode()
    return struct.pack("<I", len(body)) + body


class FakeWebShield:
    def __init__(self):
        self.reports: list[dict] = []

    def check_url(self, url):
        if "evil" in url:
            return {
                "safe": False, "risk_level": "high",
                "reasons": ["host_indicator"], "categories": ["phishing"],
                "score": 80, "registrable_domain": "evil.com",
                "intel_source": "feed",
            }
        return {
            "safe": True, "risk_level": "safe", "reasons": [],
            "categories": [], "score": 0,
            "registrable_domain": "example.com", "intel_source": None,
        }

    def get_status(self):
        return {"urls_checked": 42, "intel": {"bundle_version": 7}}

    def record_user_report(self, url, verdict, note):
        self.reports.append({"url": url, "verdict": verdict, "note": note})


@pytest.fixture
def host():
    return NativeMessagingHost(web_shield=FakeWebShield())


# ----------------------------------------------------------------------
# Wire protocol
# ----------------------------------------------------------------------

class TestFraming:
    def test_roundtrip(self):
        buf = io.BytesIO()
        _write_message(buf, {"type": "pong", "version": "2.0.0"})
        buf.seek(0)
        assert _read_message(buf) == {"type": "pong", "version": "2.0.0"}

    def test_empty_stream_returns_none(self):
        assert _read_message(io.BytesIO(b"")) is None

    def test_truncated_header(self):
        assert _read_message(io.BytesIO(b"\x10\x00")) is None

    def test_oversized_length_rejected(self):
        assert _read_message(io.BytesIO(struct.pack("<I", 2 * 1024 * 1024))) is None

    def test_truncated_body(self):
        assert _read_message(io.BytesIO(struct.pack("<I", 100) + b"{}")) is None

    def test_malformed_json_returns_error(self):
        bad = struct.pack("<I", 5) + b"{oops"
        result = _read_message(io.BytesIO(bad))
        assert result["type"] == "error"

    def test_multiple_messages_sequential(self):
        buf = io.BytesIO(_frame({"a": 1}) + _frame({"b": 2}))
        assert _read_message(buf) == {"a": 1}
        assert _read_message(buf) == {"b": 2}
        assert _read_message(buf) is None


# ----------------------------------------------------------------------
# Message dispatch
# ----------------------------------------------------------------------

class TestDispatch:
    def test_ping(self, host):
        reply = host.handle_message({"type": "ping"})
        assert reply["type"] == "pong"
        assert "version" in reply

    def test_status(self, host):
        reply = host.handle_message({"type": "status"})
        assert reply["urls_checked"] == 42
        assert reply["intel"]["bundle_version"] == 7

    def test_check_url_safe(self, host):
        reply = host.handle_message({"type": "check_url", "url": "https://example.com"})
        assert reply["type"] == "check_result"
        assert reply["safe"] is True

    def test_check_url_blocked(self, host):
        reply = host.handle_message({"type": "check_url", "url": "https://evil.com/x"})
        assert reply["safe"] is False
        assert reply["risk_level"] == "high"

    def test_check_url_missing_url(self, host):
        reply = host.handle_message({"type": "check_url"})
        assert reply["type"] == "error"

    def test_report(self, host):
        reply = host.handle_message({
            "type": "report", "url": "https://evil.com",
            "verdict": "scam", "note": "fake bank",
        })
        assert reply["type"] == "report_ack"
        assert host._web_shield.reports[0]["verdict"] == "scam"

    def test_report_bad_verdict(self, host):
        reply = host.handle_message({
            "type": "report", "url": "https://x.com", "verdict": "maybe",
        })
        assert reply["type"] == "error"

    def test_allow_url(self, host):
        reply = host.handle_message({"type": "allow_url", "url": "https://x.com"})
        assert reply["type"] == "allow_ack"

    def test_unknown_type(self, host):
        reply = host.handle_message({"type": "teleport"})
        assert reply["type"] == "error"

    def test_non_dict_message(self, host):
        assert host.handle_message("nope")["type"] == "error"

    def test_handler_exception_returns_error(self):
        class Broken:
            def check_url(self, url):
                raise RuntimeError("kaboom")
        h = NativeMessagingHost(web_shield=Broken())
        reply = h.handle_message({"type": "check_url", "url": "https://x.com"})
        assert reply["type"] == "error"
        assert "kaboom" in reply["message"]


# ----------------------------------------------------------------------
# serve() loop
# ----------------------------------------------------------------------

class TestServe:
    def test_full_request_cycle(self, host):
        stdin = io.BytesIO(
            _frame({"type": "ping"})
            + _frame({"type": "check_url", "url": "https://evil.com/"})
        )
        stdout = io.BytesIO()
        serve(stdin, stdout, host)

        stdout.seek(0)
        pong = _read_message(stdout)
        check = _read_message(stdout)
        assert pong["type"] == "pong"
        assert check["safe"] is False
        assert _read_message(stdout) is None

class TestCheckText:
    def test_check_text_flags_scam(self, host):
        reply = host.handle_message({
            "type": "check_text",
            "text": "This is IRS. Buy Google Play gift cards and send the codes now.",
        })
        assert reply["type"] == "text_result"
        assert reply["verdict"] in ("scam", "suspicious")
        assert reply["score"] > 0
        assert reply["tactics"]

    def test_check_text_clean(self, host):
        reply = host.handle_message({
            "type": "check_text",
            "text": "Hey, are we still on for lunch tomorrow at noon?",
        })
        assert reply["type"] == "text_result"
        assert reply["verdict"] == "likely_legitimate"

    def test_check_text_requires_text(self, host):
        reply = host.handle_message({"type": "check_text"})
        assert reply["type"] == "error"
