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
  DISK_DELETE_FILES: 'disk.deleteFiles',

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
  PREDICTIVE_HEALTH_SNAPSHOT: 'health.snapshot',
  PREDICTIVE_HEALTH_TRENDS: 'health.trends',
  PREDICTIVE_HEALTH_FORECAST: 'health.forecast',
  PREDICTIVE_HEALTH_HISTORY: 'health.history',

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

  // Secure File Shredder
  WIPER_DRIVES: 'wiper.drives',
  WIPER_SHRED: 'wiper.shred',
  WIPER_WIPE_FREE_SPACE: 'wiper.wipeFreeSpace',

  // Driver Updater
  DRIVERS_LIST: 'drivers.list',
  DRIVERS_SUMMARY: 'drivers.summary',
  DRIVERS_SCAN_OUTDATED: 'drivers.scanOutdated',
  DRIVERS_UPDATE: 'drivers.update',
  DRIVERS_MANUFACTURERS: 'drivers.manufacturers',
  DRIVERS_DOWNLOAD_LINKS: 'drivers.downloadLinks',

  // Disk Optimizer (Defrag + TRIM)
  DISK_OPTIMIZER_LIST_DRIVES: 'disk_optimizer.listDrives',
  DISK_OPTIMIZER_ANALYZE: 'disk_optimizer.analyze',
  DISK_OPTIMIZER_OPTIMIZE: 'disk_optimizer.optimize',
  DISK_OPTIMIZER_STATUS: 'disk_optimizer.status',

  // PUP Scanner (Potentially Unwanted Programs)
  PUP_SCAN: 'pup.scan',
  PUP_SUMMARY: 'pup.summary',
  PUP_IGNORE: 'pup.ignore',
  PUP_UNIGNORE: 'pup.unignore',

  // Browser Extension Manager
  BROWSER_EXT_LIST: 'browser_ext.list',
  BROWSER_EXT_SUMMARY: 'browser_ext.summary',
  BROWSER_EXT_REMOVE: 'browser_ext.remove',
  BROWSER_EXT_DISABLE: 'browser_ext.disable',
  BROWSER_EXT_ENABLE: 'browser_ext.enable',

  // Network Optimizer (NetBooster)
  NETWORK_OPT_ANALYZE: 'network_opt.analyze',
  NETWORK_OPT_OPTIMIZE: 'network_opt.optimize',
  NETWORK_OPT_REVERT: 'network_opt.revert',
  NETWORK_OPT_STATUS: 'network_opt.status',
  NETWORK_OPT_BOOST: 'network_opt.boost',
  NETWORK_OPT_BOOST_STATUS: 'network_opt.boost_status',

  // Context Menu Manager
  CONTEXT_MENU_LIST: 'context_menu.list',
  CONTEXT_MENU_SUMMARY: 'context_menu.summary',
  CONTEXT_MENU_DISABLE: 'context_menu.disable',
  CONTEXT_MENU_ENABLE: 'context_menu.enable',
  CONTEXT_MENU_REMOVE: 'context_menu.remove',

  // Quarantine System
  QUARANTINE_LIST: 'quarantine.list',
  QUARANTINE_SUMMARY: 'quarantine.summary',
  QUARANTINE_ADD: 'quarantine.add',
  QUARANTINE_RESTORE: 'quarantine.restore',
  QUARANTINE_DELETE: 'quarantine.delete',
  QUARANTINE_CLEAR: 'quarantine.clear',

  // AI Auto-Care (Idle Maintenance)
  AUTO_CARE_STATUS: 'auto_care.status',
  AUTO_CARE_CONFIGURE: 'auto_care.configure',
  AUTO_CARE_GET_LOG: 'auto_care.getActivityLog',
  AUTO_CARE_RUN_NOW: 'auto_care.runNow',
  AUTO_CARE_CLEAR_LOG: 'auto_care.clearLog',

  // AI Workload Detection + Game Mode
  WORKLOAD_DETECT: 'workload.detect',
  WORKLOAD_STATUS: 'workload.status',
  WORKLOAD_CONFIGURE: 'workload.configure',
  WORKLOAD_SET_MODE: 'workload.setMode',
  WORKLOAD_HISTORY: 'workload.history',

  // AI Predictive Maintenance
  PREDICTIVE_SAMPLE: 'predictive.sample',
  PREDICTIVE_STATUS: 'predictive.status',
  PREDICTIVE_HISTORY: 'predictive.history',
  PREDICTIVE_CONFIGURE: 'predictive.configure',
  PREDICTIVE_CLEAR_DATA: 'predictive.clearData',

  // AI Smart Notifications
  SMART_NOTIF_GENERATE: 'smart_notifications.generate',
  SMART_NOTIF_LIST: 'smart_notifications.list',
  SMART_NOTIF_DISMISS: 'smart_notifications.dismiss',
  SMART_NOTIF_ACTION: 'smart_notifications.action',
  SMART_NOTIF_CLEAR_ALL: 'smart_notifications.clearAll',
  SMART_NOTIF_STATS: 'smart_notifications.stats',
  SMART_NOTIF_CONFIGURE: 'smart_notifications.configure',

  // AI App Freeze/Sleep
  APP_FREEZER_LIST_CANDIDATES: 'app_freezer.listCandidates',
  APP_FREEZER_LIST_FROZEN: 'app_freezer.listFrozen',
  APP_FREEZER_FREEZE: 'app_freezer.freeze',
  APP_FREEZER_UNFREEZE: 'app_freezer.unfreeze',
  APP_FREEZER_FREEZE_ALL: 'app_freezer.freezeAll',
  APP_FREEZER_UNFREEZE_ALL: 'app_freezer.unfreezeAll',
  APP_FREEZER_STATUS: 'app_freezer.status',
  APP_FREEZER_CONFIGURE: 'app_freezer.configure',

  // AI Self-Learning Cleanup
  SELF_LEARNING_RECORD_CLEANUP: 'self_learning.recordCleanup',
  SELF_LEARNING_RECORD_SELECTION: 'self_learning.recordSelection',
  SELF_LEARNING_RECORD_EXCLUSION: 'self_learning.recordExclusion',
  SELF_LEARNING_GET_HABITS: 'self_learning.getHabits',
  SELF_LEARNING_GET_RECOMMENDATIONS: 'self_learning.getRecommendations',
  SELF_LEARNING_STATUS: 'self_learning.status',
  SELF_LEARNING_RESET: 'self_learning.reset',
  SELF_LEARNING_CONFIGURE: 'self_learning.configure',

  // AI Anomaly Detection
  ANOMALY_SCAN: 'anomaly.scan',
  ANOMALY_STATUS: 'anomaly.status',
  ANOMALY_LIST: 'anomaly.listAnomalies',
  ANOMALY_DISMISS: 'anomaly.dismiss',
  ANOMALY_CLEAR_ALL: 'anomaly.clearAll',
  ANOMALY_HISTORY: 'anomaly.history',
  ANOMALY_CONFIGURE: 'anomaly.configure',
  ANOMALY_GET_BASELINE: 'anomaly.getBaseline',

  // AI Duplicate Intelligence
  DUP_INTEL_SCAN: 'duplicate_intel.scan',
  DUP_INTEL_STATUS: 'duplicate_intel.status',
  DUP_INTEL_LIST_GROUPS: 'duplicate_intel.listGroups',
  DUP_INTEL_DISMISS_GROUP: 'duplicate_intel.dismissGroup',
  DUP_INTEL_DELETE_FILE: 'duplicate_intel.deleteFile',
  DUP_INTEL_DELETE_RECOMMENDED: 'duplicate_intel.deleteRecommended',
  DUP_INTEL_CLEAR_ALL: 'duplicate_intel.clearAll',
  DUP_INTEL_CONFIGURE: 'duplicate_intel.configure',

  // AI Process Prioritization
  PROC_PRIORITY_GET_STATUS: 'process_priority.getStatus',
  PROC_PRIORITY_LIST_PROCESSES: 'process_priority.listProcesses',
  PROC_PRIORITY_SET_MODE: 'process_priority.setMode',
  PROC_PRIORITY_APPLY_MODE: 'process_priority.applyMode',
  PROC_PRIORITY_SET_PRIORITY: 'process_priority.setPriority',
  PROC_PRIORITY_SET_AFFINITY: 'process_priority.setAffinity',
  PROC_PRIORITY_RESET_ALL: 'process_priority.resetAll',
  PROC_PRIORITY_CONFIGURE: 'process_priority.configure',

  // AI Integration Hub
  AI_INTEGRATION_GET_RECOMMENDED_CLEANERS: 'ai_integration.getRecommendedCleaners',
  AI_INTEGRATION_APPLY_WORKLOAD_PRIORITY: 'ai_integration.applyWorkloadPriority',
  AI_INTEGRATION_GET_AUTOCARE_SUGGESTIONS: 'ai_integration.getAutoCareSuggestions',
  AI_INTEGRATION_GET_STATUS: 'ai_integration.getStatus',

  // Auto Browser Clean on Close
  AUTO_BROWSER_CLEAN_STATUS: 'auto_browser_clean.status',
  AUTO_BROWSER_CLEAN_START: 'auto_browser_clean.start',
  AUTO_BROWSER_CLEAN_STOP: 'auto_browser_clean.stop',
  AUTO_BROWSER_CLEAN_UPDATE_CATEGORIES: 'auto_browser_clean.updateCategories',

  // Cloud Drive Cleaner
  CLOUD_DRIVE_DETECT: 'cloud_drive.detect',
  CLOUD_DRIVE_SCAN: 'cloud_drive.scan',
  CLOUD_DRIVE_STATUS: 'cloud_drive.status',
  CLOUD_DRIVE_CLEAN: 'cloud_drive.clean',

  // Safe Folder (Ransomware Protection)
  SAFE_FOLDER_LIST: 'safe_folder.list',
  SAFE_FOLDER_ADD: 'safe_folder.add',
  SAFE_FOLDER_REMOVE: 'safe_folder.remove',
  SAFE_FOLDER_STATUS: 'safe_folder.status',
  SAFE_FOLDER_START: 'safe_folder.start',
  SAFE_FOLDER_STOP: 'safe_folder.stop',
  SAFE_FOLDER_ALERTS: 'safe_folder.alerts',
  SAFE_FOLDER_CLEAR_ALERTS: 'safe_folder.clear_alerts',
  SAFE_FOLDER_CONFIGURE: 'safe_folder.configure',
  SAFE_FOLDER_SNAPSHOT: 'safe_folder.snapshot',
  SAFE_FOLDER_SNAPSHOTS: 'safe_folder.snapshots',
  SAFE_FOLDER_RESTORE: 'safe_folder.restore',

  // File Recovery
  FILE_RECOVERY_RECYCLABLE: 'file_recovery.recyclable',
  FILE_RECOVERY_RESTORE: 'file_recovery.restore',
  FILE_RECOVERY_SHADOW_COPIES: 'file_recovery.shadow_copies',
  FILE_RECOVERY_SHADOW_RECOVER: 'file_recovery.shadow_recover',
  FILE_RECOVERY_SEARCH: 'file_recovery.search',

  // Threat Engine — unified antivirus/anti-malware scanning
  THREAT_SCAN: 'threat.scan',
  THREAT_QUICK_SCAN: 'threat.quickScan',
  THREAT_FULL_SCAN: 'threat.fullScan',
  THREAT_SCAN_STATUS: 'threat.scanStatus',
  THREAT_SCAN_RESULT: 'threat.scanResult',
  THREAT_SCAN_CANCEL: 'threat.scanCancel',
  THREAT_STATUS: 'threat.status',
  THREAT_CONFIGURE: 'threat.configure',
  THREAT_DEFINITIONS: 'threat.definitions',
  THREAT_UPDATE_DEFS: 'threat.updateDefs',
  THREAT_CLAMAV_STATUS: 'threat.clamavStatus',
  THREAT_CLAMAV_UPDATE: 'threat.clamavUpdate',
  THREAT_CLAMAV_DETECT: 'threat.clamavDetect',
  THREAT_CLAMAV_SETUP: 'threat.clamavSetup',
  THREAT_CLAMAV_SETUP_STATUS: 'threat.clamavSetupStatus',
  THREAT_CLAMAV_START: 'threat.clamavStart',
  THREAT_CLAMAV_UNINSTALL: 'threat.clamavUninstall',
  THREAT_CLAMAV_AUTO_UPDATE_START: 'threat.clamavAutoUpdateStart',
  THREAT_CLAMAV_AUTO_UPDATE_STOP: 'threat.clamavAutoUpdateStop',
  THREAT_CLAMAV_AUTO_UPDATE_STATUS: 'threat.clamavAutoUpdateStatus',
  THREAT_LIST_THREATS: 'threat.listThreats',
  THREAT_QUARANTINE: 'threat.quarantine',
  THREAT_RESTORE: 'threat.restore',
  THREAT_REMOVE: 'threat.remove',
  THREAT_HISTORY: 'threat.history',

  // Real-Time Threat Protection (Tier 2)
  REALTIME_THREAT_STATUS: 'realtime_threat.status',
  REALTIME_THREAT_START: 'realtime_threat.start',
  REALTIME_THREAT_STOP: 'realtime_threat.stop',
  REALTIME_THREAT_EVENTS: 'realtime_threat.events',
  REALTIME_THREAT_ALERTS: 'realtime_threat.alerts',
  REALTIME_THREAT_CONFIGURE: 'realtime_threat.configure',
  REALTIME_THREAT_USB_DEVICES: 'realtime_threat.usbDevices',
  REALTIME_THREAT_USB_SCAN: 'realtime_threat.usbScan',
  REALTIME_THREAT_NETWORK_SCAN: 'realtime_threat.networkScan',
  REALTIME_THREAT_UPDATE_FEEDS: 'realtime_threat.updateFeeds',
  REALTIME_THREAT_FEED_STATUS: 'realtime_threat.feedStatus',

  // Advanced Security (Tier 3)
  ADV_SECURITY_STATUS: 'advanced_security.status',
  ADV_SECURITY_SANDBOX_ANALYZE: 'advanced_security.sandbox.analyze',
  ADV_SECURITY_SANDBOX_STATUS: 'advanced_security.sandbox.status',
  ADV_SECURITY_ML_START: 'advanced_security.ml.start',
  ADV_SECURITY_ML_STOP: 'advanced_security.ml.stop',
  ADV_SECURITY_ML_STATUS: 'advanced_security.ml.status',
  ADV_SECURITY_ML_ANOMALIES: 'advanced_security.ml.anomalies',
  ADV_SECURITY_ML_TRAIN: 'advanced_security.ml.train',
  ADV_SECURITY_WEB_CHECK: 'advanced_security.web.check',
  ADV_SECURITY_WEB_STATUS: 'advanced_security.web.status',
  ADV_SECURITY_WEB_UPDATE_FEEDS: 'advanced_security.web.updateFeeds',
  ADV_SECURITY_WEB_BLOCKED: 'advanced_security.web.blocked',
  ADV_SECURITY_WEB_ADD_BLOCK: 'advanced_security.web.addBlock',
  ADV_SECURITY_WEB_REMOVE_BLOCK: 'advanced_security.web.removeBlock',
  ADV_SECURITY_RANSOMWARE_START: 'advanced_security.ransomware.start',
  ADV_SECURITY_RANSOMWARE_STOP: 'advanced_security.ransomware.stop',
  ADV_SECURITY_RANSOMWARE_STATUS: 'advanced_security.ransomware.status',
  ADV_SECURITY_RANSOMWARE_ALERTS: 'advanced_security.ransomware.alerts',
  ADV_SECURITY_RANSOMWARE_CONFIGURE: 'advanced_security.ransomware.configure',
  ADV_SECURITY_RANSOMWARE_DEPLOY: 'advanced_security.ransomware.deploy',
  ADV_SECURITY_RANSOMWARE_REMOVE: 'advanced_security.ransomware.remove',
  ADV_SECURITY_EMAIL_SCAN: 'advanced_security.email.scan',
  ADV_SECURITY_EMAIL_SCAN_DIR: 'advanced_security.email.scanDir',
  ADV_SECURITY_EMAIL_STATUS: 'advanced_security.email.status',
  ADV_SECURITY_EMAIL_HISTORY: 'advanced_security.email.history',
  ADV_SECURITY_BOOT_SCAN: 'advanced_security.boot.scan',
  ADV_SECURITY_BOOT_SCAN_DRIVE: 'advanced_security.boot.scanDrive',
  ADV_SECURITY_BOOT_STATUS: 'advanced_security.boot.status',
  ADV_SECURITY_BOOT_BACKUP: 'advanced_security.boot.backup',
  ADV_SECURITY_BOOT_VERIFY: 'advanced_security.boot.verify',
  ADV_SECURITY_BOOT_HISTORY: 'advanced_security.boot.history',

  // AI Features (Tier 4)
  AI_FEATURES_STATUS: 'ai_features.status',
  AI_THREAT_EXPLAIN: 'ai_features.threat.explain',
  AI_THREAT_EXPLAIN_BATCH: 'ai_features.threat.explainBatch',
  AI_OPTIMIZATION_ANALYZE: 'ai_features.optimization.analyze',
  AI_OPTIMIZATION_RECOMMENDATIONS: 'ai_features.optimization.recommendations',
  AI_OPTIMIZATION_STATUS: 'ai_features.optimization.status',
  AI_SECURITY_AUDIT: 'ai_features.security.audit',
  AI_SECURITY_STATUS: 'ai_features.security.status',
  AI_SECURITY_HISTORY: 'ai_features.security.history',
  AI_TIMELINE_RECORD: 'ai_features.timeline.record',
  AI_TIMELINE_GET: 'ai_features.timeline.get',
  AI_TIMELINE_SUMMARY: 'ai_features.timeline.summary',
  AI_TIMELINE_STATUS: 'ai_features.timeline.status',
  AI_TIMELINE_CLEAR: 'ai_features.timeline.clear',
  AI_TIMELINE_EXPORT: 'ai_features.timeline.export',
  AI_COMMUNITY_SUBMIT: 'ai_features.community.submit',
  AI_COMMUNITY_SUBMISSIONS: 'ai_features.community.submissions',
  AI_COMMUNITY_STATUS: 'ai_features.community.status',
  AI_COMMUNITY_CONFIGURE: 'ai_features.community.configure',
  AI_COMMUNITY_PREVIEW: 'ai_features.community.preview',
  AI_COMMUNITY_SYNC: 'ai_features.community.sync',
  AI_COMMUNITY_STATS: 'ai_features.community.stats',
  AI_PRIVACY_CALCULATE: 'ai_features.privacy.calculate',
  AI_PRIVACY_STATUS: 'ai_features.privacy.status',
  AI_PRIVACY_HISTORY: 'ai_features.privacy.history',
  AI_GAME_MODE_ACTIVATE: 'ai_features.gameMode.activate',
  AI_GAME_MODE_DEACTIVATE: 'ai_features.gameMode.deactivate',
  AI_GAME_MODE_TOGGLE: 'ai_features.gameMode.toggle',
  AI_GAME_MODE_STATUS: 'ai_features.gameMode.status',
  AI_GAME_MODE_CONFIGURE: 'ai_features.gameMode.configure',
  AI_GAME_MODE_SESSIONS: 'ai_features.gameMode.sessions',

  // Multi-Device License Management
  LICENSE_LIST_DEVICES: 'license.list_devices',
  LICENSE_DEACTIVATE_DEVICE: 'license.deactivate_device',
  LICENSE_REMAINING_DEVICES: 'license.remaining_devices',
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
