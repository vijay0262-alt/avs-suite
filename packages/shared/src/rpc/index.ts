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
  // SC-8C13 Phase 5: DASHBOARD_OPTIMIZE_EXECUTE removed — Dashboard uses
  // scan_core.dashboard_optimization.plan → scan_core.remediation.execute.

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

  // Performance Optimization — detect and kill high resource processes
  PERFORMANCE_OPTIMIZE_PROCESSES: 'performance.optimizeProcesses',

  // Process Intelligence — read-only process enumeration for AI analysis
  PROCESS_INTELLIGENCE_SCAN: 'process_intelligence.scan',

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
  // (SC-8C14 Phase 3: transitional SECURITY_QUARANTINE_LIST removed;
  //  use SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST instead)

  // Scan Core Remediation (SC-8C8 Part 2A)
  SCAN_CORE_REMEDIATION_PREPARE: 'scan_core.remediation.prepare',
  SCAN_CORE_REMEDIATION_VALIDATE: 'scan_core.remediation.validate',
  SCAN_CORE_REMEDIATION_EXECUTE: 'scan_core.remediation.execute',
  SCAN_CORE_REMEDIATION_CANCEL: 'scan_core.remediation.cancel',
  SCAN_CORE_REMEDIATION_STATUS: 'scan_core.remediation.status',
  SCAN_CORE_REMEDIATION_ROLLBACK: 'scan_core.remediation.rollback',

  // Scan Core Scan lifecycle (SC-8C8 Part 2B)
  SCAN_CORE_SCAN_QUICK: 'scan_core.scan.quick',
  SCAN_CORE_SCAN_FULL: 'scan_core.scan.full',
  SCAN_CORE_SCAN_CANCEL: 'scan_core.scan.cancel',
  SCAN_CORE_SCAN_STATUS: 'scan_core.scan.status',
  SCAN_CORE_SCAN_RESULT: 'scan_core.scan.result',
  SCAN_CORE_SCAN_LATEST: 'scan_core.scan.latest',
  SCAN_CORE_SCAN_HISTORY: 'scan_core.scan.history',
  SCAN_CORE_SCAN_PLAN_DETAILS: 'scan_core.scan.plan_details',

  // Smart Optimization Plan Creation (SC-8C11 Phase 2)
  SCAN_CORE_SMART_OPTIMIZATION_PLAN: 'scan_core.smart_optimization.plan',

  // Security Remediation Plan Creation (SC-8C12 Phase 3)
  SCAN_CORE_SECURITY_REMEDIATION_PLAN: 'scan_core.security_remediation.plan',

  // Security Remediation Quarantine Listing (SC-8C14 Phase 3) — read-only
  SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST: 'scan_core.security_remediation.quarantine_list',

  // V1.0 AI Security Center — Real Defender-backed security score
  SCAN_CORE_SECURITY_SCORE: 'scan_core.security.score',
  SCAN_CORE_DEFENDER_STATUS: 'scan_core.defender.status',

  // Dashboard Optimization Plan Creation (SC-8C13 Phase 2)
  SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN: 'scan_core.dashboard_optimization.plan',

  // Dashboard Auto-Optimization (V1.0 one-click workflow)
  SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE: 'scan_core.dashboard.auto_optimize',
  SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE_STATUS: 'scan_core.dashboard.auto_optimize_status',
  SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE_CANCEL: 'scan_core.dashboard.auto_optimize_cancel',

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

  // Security Remediation — enable protection features
  SECURITY_ENABLE_SMARTSCREEN: 'security.enableSmartScreen',
  SECURITY_ENABLE_DEFENDER: 'security.enableDefender',
  SECURITY_ENABLE_FIREWALL: 'security.enableFirewall',

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
  SCHEDULER_CONFIGURE: 'scheduler.configureFromSettings',

  // Junk Monitor
  JUNK_MONITOR_STATUS: 'junk_monitor.status',
  JUNK_MONITOR_SCAN: 'junk_monitor.scanNow',
  JUNK_MONITOR_HISTORY: 'junk_monitor.history',

  // Optimization Orchestrator — unified pipeline
  ORCHESTRATOR_START: 'orchestrator.start',
  ORCHESTRATOR_SCAN: 'orchestrator.scan',
  ORCHESTRATOR_OPTIMIZE: 'orchestrator.optimize',
  ORCHESTRATOR_STATUS: 'orchestrator.status',
  ORCHESTRATOR_RESULT: 'orchestrator.result',
  ORCHESTRATOR_CANCEL: 'orchestrator.cancel',
  ORCHESTRATOR_FULL: 'orchestrator.full',
  ORCHESTRATOR_FULL_ASYNC: 'orchestrator.fullAsync',

  // Licensing — edition sync from frontend
  LICENSING_SET_EDITION: 'licensing.set_edition',
  LICENSING_GET_EDITION: 'licensing.get_edition',

  // Settings
  SETTINGS_GET: 'settings.get',
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_RESET: 'settings.reset',
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
