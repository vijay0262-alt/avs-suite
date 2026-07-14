/**
 * JSON-RPC 2.0 schema shared between Electron (client) and Python (server).
 *
 * Wire format is stdio-framed: each message is a single line of JSON
 * terminated by "\n". The Python child process writes responses to stdout
 * and reads requests from stdin. See `backend/src/avs_backend/api/rpc_server.py`.
 */

export const JSON_RPC_VERSION = '2.0' as const;

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: string | number;
  method: RpcMethod;
  params?: TParams;
}

export interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: string | number;
  result: TResult;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcError {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: string | number | null;
  error: JsonRpcErrorPayload;
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

/**
 * Registered method names. Every backend endpoint MUST appear here so both
 * sides share a single source of truth.
 */
export const RPC_METHODS = {
  // System / health
  SYSTEM_PING: 'system.ping',
  SYSTEM_INFO: 'system.info',
  SYSTEM_HEALTH_SCORE: 'system.healthScore',

  // Real-time metrics
  METRICS_CPU: 'metrics.cpu',
  METRICS_MEMORY: 'metrics.memory',
  METRICS_DISK: 'metrics.disk',

  // Feature modules (contracts; implementations deferred)
  CLEANER_SCAN: 'cleaner.scan',
  CLEANER_CLEAN: 'cleaner.clean',
  STARTUP_LIST: 'startup.list',
  STARTUP_TOGGLE: 'startup.toggle',
  PRIVACY_SCAN: 'privacy.scan',
  PRIVACY_CLEAN: 'privacy.clean',
  DUPLICATE_SCAN: 'duplicate.scan',
  DISK_ANALYZE: 'disk.analyze',
  PERFORMANCE_APPLY: 'performance.apply',
} as const;

export type RpcMethod = (typeof RPC_METHODS)[keyof typeof RPC_METHODS];

/**
 * Standard JSON-RPC error codes + AVS-specific extensions.
 */
export const RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // AVS-specific range: -32000 to -32099
  BACKEND_NOT_READY: -32000,
  PERMISSION_DENIED: -32001,
  NOT_SUPPORTED_ON_PLATFORM: -32002,
  FEATURE_LOCKED: -32003,
} as const;
