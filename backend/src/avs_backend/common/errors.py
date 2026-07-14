"""Backend-side JSON-RPC error codes. Kept in sync with
``packages/shared/src/rpc/index.ts``.
"""

from __future__ import annotations

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

# AVS-specific range: -32000 .. -32099
BACKEND_NOT_READY = -32000
PERMISSION_DENIED = -32001
NOT_SUPPORTED_ON_PLATFORM = -32002
FEATURE_LOCKED = -32003


class RpcError(Exception):
    """Structured RPC error. Caught by the dispatcher and serialised."""

    def __init__(self, code: int, message: str, data: object | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data
