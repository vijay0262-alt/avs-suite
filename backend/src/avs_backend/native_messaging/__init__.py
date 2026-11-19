"""AVS Web Shield native messaging host.

Implements the Chrome/Edge native-messaging protocol (4-byte little-endian
length prefix + UTF-8 JSON) so the browser extension can ask the AVS
backend to check URLs against the signed threat-intel bundle and local
heuristics.

Protocol messages (extension -> host):
    {"type": "ping"}
    {"type": "status"}
    {"type": "check_url", "url": "https://..."}
    {"type": "report", "url": "...", "verdict": "scam"|"not_scam", "note": "..."}

Responses (host -> extension):
    {"type": "pong", "version": "..."}
    {"type": "status", ...}
    {"type": "check_result", "url": "...", "safe": true, ...}
    {"type": "error", "message": "..."}

All log output goes to stderr — stdout is the protocol channel and must
never receive anything else.
"""

from avs_backend.native_messaging.host import main, NativeMessagingHost

__all__ = ["main", "NativeMessagingHost"]
