"""JSON-RPC 2.0 server — reads line-delimited requests from stdin, writes
responses to stdout.

Handlers are registered via the ``register`` decorator in each feature
module. This entry point imports all modules eagerly so their
registrations execute before the read loop starts.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from avs_backend.api import registry
from avs_backend.common.errors import (
    INTERNAL_ERROR,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    PARSE_ERROR,
    RpcError,
)
from avs_backend.common.logging_setup import configure_logging

# Feature-module imports register their handlers at import time.
from avs_backend import cleaner as _cleaner  # noqa: F401
from avs_backend import dashboard as _dashboard  # noqa: F401
from avs_backend import disk_analyzer as _disk  # noqa: F401
from avs_backend import duplicate_finder as _dup  # noqa: F401
from avs_backend import performance as _perf  # noqa: F401
from avs_backend import privacy as _priv  # noqa: F401
from avs_backend import registry_cleaner as _registry  # noqa: F401
from avs_backend import startup as _startup  # noqa: F401
from avs_backend import system_information as _sysinfo  # noqa: F401
from avs_backend import uninstaller as _uninstaller  # noqa: F401
from avs_backend import history as _history  # noqa: F401
from avs_backend import notifications as _notifications  # noqa: F401
from avs_backend import reporting as _reporting  # noqa: F401
from avs_backend import settings as _settings  # noqa: F401
from avs_backend import undo as _undo  # noqa: F401

log = configure_logging()

JSON_RPC = "2.0"


def _write(payload: dict[str, Any]) -> None:
    line = json.dumps(payload, separators=(",", ":"))
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def _error(request_id: Any, code: int, message: str, data: Any = None) -> None:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    _write({"jsonrpc": JSON_RPC, "id": request_id, "error": err})


def _dispatch(request: dict[str, Any]) -> None:
    if request.get("jsonrpc") != JSON_RPC or "method" not in request or "id" not in request:
        _error(request.get("id"), INVALID_REQUEST, "Invalid JSON-RPC request")
        return

    method = request["method"]
    params = request.get("params")
    request_id = request["id"]

    handler = registry.get(method)
    if handler is None:
        _error(request_id, METHOD_NOT_FOUND, f"Unknown method: {method}")
        return

    try:
        result = handler(params if isinstance(params, dict) or params is None else None)
        _write({"jsonrpc": JSON_RPC, "id": request_id, "result": result})
    except RpcError as e:
        _error(request_id, e.code, e.message, e.data)
    except Exception as e:  # noqa: BLE001 — top-level safety net
        log.exception("Handler raised while processing %s", method)
        _error(request_id, INTERNAL_ERROR, str(e))


def main() -> None:
    log.info("avs-backend ready; %d method(s) registered", len(registry.all_methods()))
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            _error(None, PARSE_ERROR, f"Malformed JSON: {e}")
            continue
        _dispatch(request)


if __name__ == "__main__":  # pragma: no cover
    main()
