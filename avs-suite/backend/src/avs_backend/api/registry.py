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
    """Decorator: register ``fn`` as the handler for ``method``."""

    def decorator(fn: Handler) -> Handler:
        if method in _HANDLERS:
            raise RuntimeError(f"RPC method already registered: {method}")
        _HANDLERS[method] = fn
        return fn

    return decorator


def get(method: str) -> Handler | None:
    return _HANDLERS.get(method)


def all_methods() -> list[str]:
    return sorted(_HANDLERS.keys())
