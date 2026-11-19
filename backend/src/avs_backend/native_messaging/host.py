"""Native messaging host — bridges the browser extension to WebShield.

Runs as a standalone process launched by Chrome/Edge when the extension
calls chrome.runtime.connectNative(). Communicates over stdin/stdout using
the native messaging wire format: 4-byte little-endian length + JSON.
"""

from __future__ import annotations

import json
import logging
import struct
import sys
from typing import IO, Any, Dict, Optional

log = logging.getLogger(__name__)

# Maximum native-messaging message size accepted (Chrome limit is 1MB,
# we only ever need a few KB).
_MAX_MESSAGE = 1 * 1024 * 1024

_HOST_VERSION = "2.0.0"


class NativeMessagingHost:
    """Handles extension requests against the local WebShield instance."""

    def __init__(self, web_shield: Any = None) -> None:
        self._web_shield = web_shield
        self._web_shield_loaded = web_shield is not None

    def _get_web_shield(self) -> Any:
        """Lazily create the WebShield instance (first check pays PSL load)."""
        if not self._web_shield_loaded:
            from avs_backend.advanced_security.web_shield import WebShield
            self._web_shield = WebShield({})
            self._web_shield_loaded = True
        return self._web_shield

    def handle_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch one extension message and return the response dict."""
        if not isinstance(message, dict):
            return {"type": "error", "message": "Message must be a JSON object"}

        msg_type = message.get("type")
        try:
            if msg_type == "ping":
                return {"type": "pong", "version": _HOST_VERSION}
            if msg_type == "status":
                return self._handle_status()
            if msg_type == "check_url":
                return self._handle_check_url(message)
            if msg_type == "report":
                return self._handle_report(message)
            if msg_type == "allow_url":
                return self._handle_allow_url(message)
            return {"type": "error", "message": f"Unknown message type: {msg_type}"}
        except Exception as e:  # defensive — never let a handler kill the port
            log.exception("Native messaging handler failed for %r", msg_type)
            return {"type": "error", "message": str(e)}

    # ------------------------------------------------------------------
    # Handlers
    # ------------------------------------------------------------------

    def _handle_status(self) -> Dict[str, Any]:
        status = self._get_web_shield().get_status()
        return {"type": "status", **status}

    def _handle_check_url(self, message: Dict[str, Any]) -> Dict[str, Any]:
        url = message.get("url")
        if not isinstance(url, str) or not url:
            return {"type": "error", "message": "check_url requires a 'url' string"}
        result = self._get_web_shield().check_url(url)
        return {"type": "check_result", **result}

    def _handle_report(self, message: Dict[str, Any]) -> Dict[str, Any]:
        url = message.get("url")
        verdict = message.get("verdict")
        if not isinstance(url, str) or not url:
            return {"type": "error", "message": "report requires a 'url' string"}
        if verdict not in ("scam", "not_scam"):
            return {"type": "error", "message": "verdict must be 'scam' or 'not_scam'"}
        self._get_web_shield().record_user_report(url, verdict, message.get("note", ""))
        return {"type": "report_ack", "url": url}

    def _handle_allow_url(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Session-scoped 'proceed anyway' — the extension tracks this in
        chrome.storage.session; the host only acknowledges so UX can log it."""
        url = message.get("url")
        if not isinstance(url, str) or not url:
            return {"type": "error", "message": "allow_url requires a 'url' string"}
        log.info("User bypassed block page for %s", url)
        return {"type": "allow_ack", "url": url}


# ----------------------------------------------------------------------
# Wire protocol
# ----------------------------------------------------------------------

def _read_message(stream: IO[bytes]) -> Optional[Dict[str, Any]]:
    """Read one length-prefixed message; returns None on clean EOF."""
    header = stream.read(4)
    if not header:
        return None
    if len(header) < 4:
        log.warning("Truncated length header (%d bytes)", len(header))
        return None
    (length,) = struct.unpack("<I", header)
    if length == 0 or length > _MAX_MESSAGE:
        log.warning("Invalid message length %d", length)
        return None
    body = stream.read(length)
    if len(body) < length:
        log.warning("Truncated message body")
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        log.warning("Malformed message JSON: %s", e)
        return {"type": "error", "message": f"Malformed request: {e}"}


def _write_message(stream: IO[bytes], message: Dict[str, Any]) -> None:
    body = json.dumps(message, separators=(",", ":")).encode("utf-8")
    stream.write(struct.pack("<I", len(body)))
    stream.write(body)
    stream.flush()


def serve(
    stdin: IO[bytes],
    stdout: IO[bytes],
    host: Optional[NativeMessagingHost] = None,
) -> None:
    """Run the request loop until stdin closes."""
    host = host or NativeMessagingHost()
    while True:
        message = _read_message(stdin)
        if message is None:
            break
        _write_message(stdout, host.handle_message(message))


def main() -> int:
    """Entry point for `avs-backend --native-messaging`."""
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    log.info("AVS native messaging host starting")
    serve(sys.stdin.buffer, sys.stdout.buffer)
    log.info("AVS native messaging host stopped")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
