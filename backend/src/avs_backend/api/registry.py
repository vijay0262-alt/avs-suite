"""Registry of RPC method handlers.

Feature modules import the ``register`` decorator and attach their
handlers at import time. The dispatcher then routes incoming JSON-RPC
requests via a single dictionary lookup.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

Handler = Callable[[dict[str, Any] | None], Any]

_HANDLERS: dict[str, Handler] = {}


def register(method: str) -> Callable[[Handler], Handler]:
    """Decorator: register ``fn`` as the handler for ``method``.

    If the method is already registered, the new handler silently replaces
    the old one. This allows a placeholder handler (e.g. system.ping in
    rpc_server.py) to be overridden by the real implementation when the
    feature module finishes importing.
    """

    def decorator(fn: Handler) -> Handler:
        _HANDLERS[method] = fn
        return fn

    return decorator


def get(method: str) -> Handler | None:
    return _HANDLERS.get(method)


def all_methods() -> list[str]:
    return sorted(_HANDLERS.keys())
