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

  // Dashboard
  DASHBOARD_METRICS: 'dashboard.metrics',
  DASHBOARD_LIVE: 'dashboard.live',
  DASHBOARD_HEALTH: 'dashboard.health',
  DASHBOARD_REFRESH_CACHE: 'dashboard.refreshCache',
  DASHBOARD_OPTIMIZE_PREVIEW: 'dashboard.optimize.preview',
  DASHBOARD_OPTIMIZE_EXECUTE: 'dashboard.optimize.execute',

  // Feature modules — Junk Cleaner scan lifecycle
  CLEANER_LIST: 'cleaner.list',
  CLEANER_SCAN_START: 'cleaner.scan.start',
  CLEANER_SCAN_STATUS: 'cleaner.scan.status',
  CLEANER_SCAN_CANCEL: 'cleaner.scan.cancel',
  CLEANER_SCAN_RESULTS: 'cleaner.scan.results',
  // Junk Cleaner — safe-clean lifecycle
  CLEANER_CLEAN_PREVIEW: 'cleaner.clean.preview',
  CLEANER_CLEAN_EXECUTE: 'cleaner.clean.execute',
  CLEANER_CLEAN_STATUS: 'cleaner.clean.status',
  CLEANER_CLEAN_CANCEL: 'cleaner.clean.cancel',
  CLEANER_CLEAN_LOGS: 'cleaner.clean.logs',
  CLEANER_CLEAN_UNDO: 'cleaner.clean.undo',
  // Startup Manager
  STARTUP_LIST: 'startup.list',
  STARTUP_DISABLE: 'startup.disable',
  STARTUP_ENABLE: 'startup.enable',
  STARTUP_BACKUPS: 'startup.backups',
  STARTUP_RESTORE: 'startup.restore',
  STARTUP_REFRESH_CACHE: 'startup.refreshCache',

  // Privacy Cleaner
  PRIVACY_SCAN: 'privacy.scan',
  PRIVACY_CLEAN: 'privacy.clean',
  PRIVACY_DETECT_BROWSERS: 'privacy.detectBrowsers',

  // Duplicate Finder
  DUPLICATE_SCAN: 'duplicate.scan',
  DUPLICATE_DELETE: 'duplicate.delete',
  DUPLICATE_LIST_DRIVES: 'duplicate.listDrives',

  // Disk Analyzer
  DISK_ANALYZE: 'disk.analyze',
  DISK_LIST_DRIVES: 'disk.listDrives',

  // Performance Monitor + Memory Optimizer
  PERFORMANCE_MONITOR_METRICS: 'performance.monitor.getMetrics',
  PERFORMANCE_MONITOR_GRAPH_HISTORY: 'performance.monitor.getGraphHistory',
  PERFORMANCE_MONITOR_CLEAR_GRAPH: 'performance.monitor.clearGraphHistory',
  PERFORMANCE_MONITOR_TOP_PROCESSES: 'performance.monitor.getTopProcesses',
  PERFORMANCE_MONITOR_ALERTS: 'performance.monitor.getAlerts',
  PERFORMANCE_MEMORY_INFO: 'performance.memory.getInfo',
  PERFORMANCE_MEMORY_OPTIMIZE: 'performance.memory.optimize',
  PERFORMANCE_MEMORY_PROCESSES: 'performance.memory.getProcesses',
  PERFORMANCE_MEMORY_CHECK_PERMISSIONS: 'performance.memory.checkPermissions',

  // System Information
  SYSTEM_COMPREHENSIVE: 'system.comprehensive',
  SYSTEM_STATIC: 'system.static',
  SYSTEM_DYNAMIC: 'system.dynamic',
  SYSTEM_REFRESH_CACHE: 'system.refreshCache',

  // Undo & Restore
  UNDO_BACKUP_FILE: 'undo.backup.file',
  UNDO_BACKUP_DIRECTORY: 'undo.backup.directory',
  UNDO_BACKUP_REGISTRY: 'undo.backup.registry',
  UNDO_BACKUP_RESTORE_POINT: 'undo.backup.restorePoint',
  UNDO_RESTORE: 'undo.restore',
  UNDO_CHECK: 'undo.check',
  UNDO_LIST: 'undo.list',
  UNDO_DELETE: 'undo.delete',

  // Security Center — scanning and data collection
  SECURITY_SCAN: 'security.scan',
  SECURITY_SCAN_STATUS: 'security.scan.status',
  SECURITY_SCAN_CANCEL: 'security.scan.cancel',
  SECURITY_PROCESSES: 'security.processes',
  SECURITY_STARTUP_ANALYSIS: 'security.startupAnalysis',
  SECURITY_SCHEDULED_TASKS: 'security.scheduledTasks',
  SECURITY_SERVICES: 'security.services',
  SECURITY_BROWSER_EXTENSIONS: 'security.browserExtensions',
  SECURITY_UNSIGNED_EXECUTABLES: 'security.unsignedExecutables',
  SECURITY_NETWORK_CONNECTIONS: 'security.networkConnections',
  SECURITY_SNAPSHOT: 'security.snapshot',
  SECURITY_FULL_SYSTEM_SCAN: 'security.fullSystemScan',

  // Security Investigation
  SECURITY_INVESTIGATE: 'security.investigate',
  SECURITY_INVESTIGATION_TIMELINE: 'security.investigation.timeline',
  SECURITY_INVESTIGATION_EVIDENCE: 'security.investigation.evidence',
  SECURITY_INVESTIGATION_CORRELATION: 'security.investigation.correlation',

  // Security Remediation
  SECURITY_QUARANTINE: 'security.quarantine',
  SECURITY_QUARANTINE_RESTORE: 'security.quarantine.restore',
  SECURITY_QUARANTINE_LIST: 'security.quarantine.list',
  SECURITY_QUARANTINE_DELETE: 'security.quarantine.delete',
  SECURITY_REMEDIATION_PLAN: 'security.remediation.plan',
  SECURITY_REMEDIATION_EXECUTE: 'security.remediation.execute',
  SECURITY_REMEDIATION_ROLLBACK: 'security.remediation.rollback',

  // Predictive Health
  PREDICTIVE_HEALTH_SNAPSHOT: 'predictive.snapshot',
  PREDICTIVE_HEALTH_TRENDS: 'predictive.trends',
  PREDICTIVE_HEALTH_FORECAST: 'predictive.forecast',
  PREDICTIVE_HEALTH_HISTORY: 'predictive.history',

  // Real-Time Protection
  REALTIME_PROTECTION_STATUS: 'realtime.status',
  REALTIME_PROTECTION_START: 'realtime.start',
  REALTIME_PROTECTION_STOP: 'realtime.stop',
  REALTIME_PROTECTION_EVENTS: 'realtime.events',
  REALTIME_PROTECTION_ALERTS: 'realtime.alerts',

  // Hardware Monitoring
  HARDWARE_SENSORS: 'hardware.sensors',
  HARDWARE_TEMPERATURE: 'hardware.temperature',
  HARDWARE_FANS: 'hardware.fans',
  HARDWARE_BATTERY: 'hardware.battery',
  HARDWARE_POWER: 'hardware.power',

  // Scheduled Maintenance
  SCHEDULER_LIST: 'scheduler.list',
  SCHEDULER_CREATE: 'scheduler.create',
  SCHEDULER_UPDATE: 'scheduler.update',
  SCHEDULER_DELETE: 'scheduler.delete',
  SCHEDULER_RUN_NOW: 'scheduler.runNow',
  SCHEDULER_STATUS: 'scheduler.status',
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
