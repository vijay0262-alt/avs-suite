"""JSON-RPC 2.0 server — reads line-delimited requests from stdin, writes
responses to stdout.

Handlers are registered via the ``register`` decorator in each feature
module. This entry point imports all modules eagerly so their
registrations execute before the read loop starts.

Concurrency model:
    The main thread reads requests from stdin in a tight loop and submits
    each to a ``ThreadPoolExecutor``.  This ensures that a slow handler
    (e.g. duplicate scan, system information) never blocks other modules
    from receiving responses.  stdout writes are serialized via a lock
    to prevent interleaved JSON lines.
"""

from __future__ import annotations

import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
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

log = configure_logging()

# Feature-module imports register their handlers at import time.
# Import them in background threads so the main read loop can start
# immediately and respond to system.ping without waiting 30-60s for
# all modules to finish their import-time work (PowerShell calls, etc.).
import importlib

_FEATURE_MODULES = [
    "avs_backend.common.job_rpc",
    "avs_backend.cleaner",
    "avs_backend.dashboard",
    "avs_backend.disk_analyzer",
    "avs_backend.drive_wiper",
    "avs_backend.duplicate_finder",
    "avs_backend.performance",
    "avs_backend.privacy",
    "avs_backend.registry_cleaner",
    "avs_backend.software_updater",
    "avs_backend.startup",
    "avs_backend.system_information",
    "avs_backend.uninstaller",
    "avs_backend.history",
    "avs_backend.notifications",
    "avs_backend.reporting",
    "avs_backend.settings",
    "avs_backend.undo",
]

# Track which modules have finished importing (success or failure)
_modules_loaded: set[str] = set()
_modules_failed: set[str] = set()
_modules_lock = threading.Lock()

# Map RPC method prefixes to feature module names so _dispatch knows which
# module should register a given method.
_METHOD_TO_MODULE: dict[str, str] = {}


def _build_method_to_module_map() -> None:
    """Build a prefix map from method names to feature modules."""
    for mod_name in _FEATURE_MODULES:
        # e.g. "avs_backend.dashboard" -> "dashboard"
        prefix = mod_name.rsplit(".", 1)[-1]
        # Map common method prefixes to module names
        _METHOD_TO_MODULE[prefix] = mod_name


_build_method_to_module_map()


def _module_for_method(method: str) -> str | None:
    """Return the feature module that should register *method*, or None."""
    # Try exact prefix matches: "dashboard.metrics" -> "dashboard"
    for prefix, mod_name in _METHOD_TO_MODULE.items():
        if method.startswith(prefix + ".") or method.startswith(prefix + "_"):
            return mod_name
    return None


def _import_module(name: str) -> None:
    try:
        importlib.import_module(name)
    except Exception:
        log.exception("Failed to import %s", name)
        with _modules_lock:
            _modules_failed.add(name)
    finally:
        with _modules_lock:
            _modules_loaded.add(name)


def _all_modules_loaded() -> bool:
    with _modules_lock:
        return len(_modules_loaded) >= len(_FEATURE_MODULES)


def _module_loaded(name: str) -> bool:
    """Check if a specific module has finished importing (success or failure)."""
    with _modules_lock:
        return name in _modules_loaded


def wait_for_modules(timeout: float = 120.0) -> bool:
    """Block until all feature modules have finished importing.

    Returns True if all modules loaded within *timeout*, False otherwise.
    Primarily intended for tests; the production read loop doesn't need to
    call this since ``_dispatch`` polls for handlers individually.
    """
    import time as _time
    deadline = _time.monotonic() + timeout
    while not _all_modules_loaded():
        if _time.monotonic() > deadline:
            return False
        _time.sleep(0.1)
    return True


# Start imports in a single background thread. Python's import lock
# serializes imports anyway, so parallel threads just add GIL contention.
# A single thread keeps the main read loop responsive while importing.
def _import_all_modules() -> None:
    for _mod in _FEATURE_MODULES:
        _import_module(_mod)


threading.Thread(target=_import_all_modules, daemon=True, name="module-loader").start()


# Register a simple ping handler immediately so the Electron bridge can
# health-check the backend without waiting for all modules to import.
@registry.register("system.ping")
def _system_ping(_params: dict[str, Any] | None) -> dict[str, bool]:
    return {"pong": True}


JSON_RPC = "2.0"

# Serialize stdout writes so concurrent worker threads don't interleave JSON lines.
_write_lock = threading.Lock()

# Thread pool for concurrent request dispatch.  8 workers is enough for
# parallel module loads (dashboard, performance, system info, etc.)
# while keeping thread overhead minimal.
_dispatch_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="rpc")


def _write(payload: dict[str, Any]) -> None:
    line = json.dumps(payload, separators=(",", ":"))
    with _write_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def _error(request_id: Any, code: int, message: str, data: Any = None) -> None:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    _write({"jsonrpc": JSON_RPC, "id": request_id, "error": err})


def _dispatch(request: dict[str, Any]) -> None:
    """Dispatch a single request to its handler and write the response.

    This runs in a worker thread so the main stdin loop stays responsive.
    """
    if request.get("jsonrpc") != JSON_RPC or "method" not in request or "id" not in request:
        _error(request.get("id"), INVALID_REQUEST, "Invalid JSON-RPC request")
        return

    method = request["method"]
    params = request.get("params")
    request_id = request["id"]

    handler = registry.get(method)
    if handler is None:
        # Module might still be importing in a background thread.
        # Wait for the specific module that should register this method.
        target_module = _module_for_method(method)
        deadline = 120.0
        import time as _time
        start_wait = _time.monotonic()
        while handler is None and (_time.monotonic() - start_wait) < deadline:
            if target_module is not None and _module_loaded(target_module):
                # The module that should register this method has finished
                # importing (success or failure). If the handler is still
                # missing, it won't appear — stop waiting.
                break
            if _all_modules_loaded():
                break
            _time.sleep(0.3)
            handler = registry.get(method)
        if handler is None:
            # Check if the module failed to import
            if target_module is not None:
                with _modules_lock:
                    failed = target_module in _modules_failed
                if failed:
                    _error(request_id, INTERNAL_ERROR,
                           f"Module {target_module} failed to load; method {method} unavailable")
                    return
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
    import atexit

    def _cleanup() -> None:
        _dispatch_pool.shutdown(wait=False, cancel_futures=True)
        try:
            from avs_backend.common.job_manager import get_job_manager
            get_job_manager().shutdown()
        except Exception:
            pass

    atexit.register(_cleanup)

    log.info("avs-backend ready; %d method(s) registered (%d modules still loading)",
             len(registry.all_methods()),
             len(_FEATURE_MODULES) - len(_modules_loaded))
    # Read from binary stdin buffer; this bypasses Python's default
    # block-buffered text I/O for pipes, which would wait for 8KB before
    # yielding lines and cause the Electron bridge to hang.
    stdin = sys.stdin.buffer
    for raw in stdin:
        line = raw.decode("utf-8").strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            _error(None, PARSE_ERROR, f"Malformed JSON: {e}")
            continue
        # Submit to thread pool so slow handlers don't block the read loop.
        _dispatch_pool.submit(_dispatch, request)


if __name__ == "__main__":  # pragma: no cover
    main()
