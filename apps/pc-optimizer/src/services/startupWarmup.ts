/**
 * startupWarmup — makes the app feel instant after launch.
 *
 * The Python backend imports ~60 feature modules on a background thread
 * (first request to an unloaded module previously stalled on a cold
 * import + PowerShell probes). This service:
 *
 *   1. Polls `system.modules` so StartupGate can show honest
 *      "Configuring <feature>…" progress.
 *   2. Preloads every lazy page chunk so route navigation is instant.
 *   3. Warms rpcCache/service caches for the status calls pages make
 *      on mount, so pages render immediately and revalidate silently.
 *
 * Everything here is best-effort: failures never block the UI.
 */
import { rpc } from './rpc';
import { RPC_METHODS } from '@avs/shared/rpc';

// ── Friendly feature names for backend modules ──────────────────

const MODULE_LABELS: Record<string, string> = {
  avs_backend_dashboard: 'Dashboard',
  avs_backend_cleaner: 'Junk Cleaner',
  avs_backend_threat_engine: 'Threat Engine',
  avs_backend_security: 'Smart Shield',
  avs_backend_security_investigation: 'Smart Shield',
  avs_backend_security_remediation: 'Smart Shield',
  avs_backend_realtime_protection: 'Real-Time Protection',
  avs_backend_realtime_threat: 'Real-Time Guard',
  avs_backend_advanced_security: 'AI Scam Detection',
  avs_backend_scam_detector: 'AI Scam Detection',
  avs_backend_scam_guards: 'Scam Protection Guards',
  avs_backend_quarantine: 'Quarantine',
  avs_backend_safe_folder: 'Safe Folder',
  avs_backend_safe_banking: 'Safe Banking',
  avs_backend_full_system_scan: 'Full System Scan',
  avs_backend_scan_core_rpc: 'Scan Engine',
  avs_backend_predictive_health: 'Predictive Health',
  avs_backend_performance: 'Performance Monitor',
  avs_backend_startup: 'Startup Manager',
  avs_backend_registry_cleaner: 'Registry Cleaner',
  avs_backend_duplicate_finder: 'Duplicate Finder',
  avs_backend_disk_analyzer: 'Disk Analyzer',
  avs_backend_software_updater: 'Software Updater',
  avs_backend_uninstaller: 'Uninstaller',
  avs_backend_backup_restore: 'Backup & Restore',
  avs_backend_system_restore: 'System Restore',
  avs_backend_drivers: 'Driver Updater',
  avs_backend_network_optimizer: 'Network Optimizer',
  avs_backend_privacy: 'Privacy Cleaner',
  avs_backend_history: 'History',
  avs_backend_settings: 'Settings',
  avs_backend_licensing: 'License',
  avs_backend_notifications: 'Notifications',
  avs_backend_orchestrator: 'Scan Orchestrator',
  avs_backend_scheduler: 'Scheduler',
  avs_backend_ai_integration: 'AI Integration',
  avs_backend_ai_features: 'AI Features',
  avs_backend_one_click: 'One-Click Care',
  avs_backend_auto_care: 'AI Auto-Care',
  avs_backend_cloud_drive_cleaner: 'Cloud Drive Cleaner',
  avs_backend_file_recovery: 'File Recovery',
  avs_backend_process_intelligence: 'Process Intelligence',
  avs_backend_hardware_monitor: 'Hardware Monitor',
  avs_backend_network_info: 'Network Information',
  avs_backend_system_information: 'System Information',
  avs_backend_junk_monitor: 'Junk Monitor',
  avs_backend_disk_optimizer: 'Disk Optimizer',
  avs_backend_pup_scanner: 'PUP Scanner',
  avs_backend_browser_extensions: 'Browser Extensions',
  avs_backend_context_menu: 'Context Menu',
  avs_backend_workload: 'Workload Detection',
  avs_backend_predictive: 'Predictive Maintenance',
  avs_backend_smart_notifications: 'Smart Notifications',
  avs_backend_app_freezer: 'App Freeze',
  avs_backend_self_learning: 'Self-Learning',
  avs_backend_anomaly: 'Anomaly Detection',
  avs_backend_duplicate_intel: 'Duplicate Intelligence',
  avs_backend_process_priority: 'Process Prioritization',
  avs_backend_auto_browser_clean: 'Browser Cleaner',
  avs_backend_reporting: 'Reports',
  avs_backend_undo: 'Undo',
};

/** "avs_backend.realtime_protection" → "Real-Time Protection" */
export function friendlyModuleName(module: string): string {
  const key = module.replace(/\./g, '_');
  if (MODULE_LABELS[key]) return MODULE_LABELS[key];
  const tail = module.split('.').pop() ?? module;
  return tail
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Module-progress polling ─────────────────────────────────────

export interface ModuleStatus {
  ok: boolean;
  total: number;
  loaded: number;
  pending: string[];
  failed: string[];
  ready: boolean;
}

export async function fetchModuleStatus(): Promise<ModuleStatus> {
  return rpc.raw<ModuleStatus>(RPC_METHODS.SYSTEM_MODULES);
}

// ── Page-chunk preloading ───────────────────────────────────────

/**
 * Kick off import() for every lazy page so React.lazy resolves
 * instantly on navigation. Failures are ignored — a chunk that fails
 * here simply loads on demand as before.
 */
export function preloadAllPages(): void {
  const specifiers = [
    () => import('../pages/DashboardPage'),
    () => import('../pages/ProtectionCenterPage'),
    () => import('../pages/SecurityCenterPage'),
    () => import('../pages/JunkCleanerPage'),
    () => import('../pages/RegistryCleanerPage'),
    () => import('../pages/StartupManagerPage'),
    () => import('../pages/PrivacyCleanerPage'),
    () => import('../pages/DuplicateFinderPage'),
    () => import('../pages/DiskAnalyzerPage'),
    () => import('../pages/CloudDriveCleanerPage'),
    () => import('../pages/SafeFolderPage'),
    () => import('../pages/ThreatEnginePage'),
    () => import('../pages/RealtimeThreatPage'),
    () => import('../pages/AdvancedSecurityPage'),
    () => import('../pages/AIFeaturesPage'),
    () => import('../pages/UninstallerPage'),
    () => import('../pages/UpdaterPage'),
    () => import('../pages/PerformancePage'),
    () => import('../pages/SystemInformationPage'),
    () => import('../pages/HardwareCenterPage'),
    () => import('../pages/SettingsPage'),
    () => import('../pages/AboutPage'),
    () => import('../features/diagnostics/DiagnosticsPage'),
    () => import('../pages/ProcessIntelligencePage'),
    () => import('../pages/PredictiveHealthPage'),
    () => import('../features/licensing/ActivationPage'),
    () => import('../pages/ReportsPage'),
    () => import('../pages/OptimizationReportsPage'),
    () => import('../pages/SmartOptimizationPage'),
    () => import('../features/ai-assistant/AIAssistantPage'),
    () => import('../features/ai-workspace/AIWorkspacePage'),
    () => import('../features/maintenance-ui/MaintenanceHistoryPage'),
    () => import('../features/export-center/ExportCenterPage'),
    () => import('../features/network-info/NetworkInformationPage'),
    () => import('../pages/FileRecoveryPage'),
    () => import('../pages/LargeFilesPage'),
    () => import('../pages/AnalyticsPage'),
    () => import('../pages/AntivirusSecurityPage'),
    // Inner lazy chunks of NewPageWrappers — the wrapper file itself is
    // statically imported, so these feature pages would otherwise stall
    // on first visit.
    () => import('../features/recovery/RecoveryCenterPage'),
    () => import('../features/system-health-dashboard/SystemHealthOverviewPage'),
    () => import('../features/performance/PerformanceAnalyticsPage'),
    () => import('../features/notifications/NotificationsPage'),
    () => import('../features/help-center/HelpCenterPage'),
    () => import('../features/licensing/UpgradePage'),
    () => import('../features/drivers/DriverInformationPage'),
    () => import('../features/drivers/DriverUpdaterPage'),
    () => import('../features/backup-restore/BackupRestorePage'),
    () => import('../features/security-history/SecurityHistoryPage'),
    () => import('../features/file-shredder/FileShredderPage'),
    () => import('../features/disk-optimizer/DiskOptimizerPage'),
    () => import('../features/pup-scanner/PUPScannerPage'),
    () => import('../features/browser-extensions/BrowserExtensionManagerPage'),
    () => import('../features/network-optimizer/NetworkOptimizerPage'),
    () => import('../features/context-menu/ContextMenuManagerPage'),
    () => import('../features/quarantine/QuarantinePage'),
    () => import('../features/auto-care/AutoCarePage'),
    () => import('../features/workload/WorkloadDetectionPage'),
    () => import('../features/predictive/PredictiveMaintenancePage'),
    () => import('../features/smart-notifications/SmartNotificationsPage'),
    () => import('../features/app-freezer/AppFreezerPage'),
    () => import('../features/self-learning/SelfLearningPage'),
    () => import('../features/anomaly/AnomalyDetectionPage'),
    () => import('../features/duplicate-intel/DuplicateIntelligencePage'),
    () => import('../features/process-priority/ProcessPriorityPage'),
    () => import('../features/ai-integration/AIIntegrationPage'),
  ];
  // Stagger imports so the burst doesn't contend with the backend's
  // own warm-up work during the first seconds.
  specifiers.forEach((load, i) => {
    setTimeout(() => { load().catch(() => {}); }, i * 60);
  });
}

// ── Cache warming ───────────────────────────────────────────────

const WARM_TTL_MS = 60_000;

/**
 * Pre-fetch the status calls that pages issue on mount. Each call goes
 * through the same cache/service path the page uses, so the first real
 * request is a cache hit. Runs silently — the user never sees loading.
 */
export function warmFeatureCaches(): void {
  const warm = (fn: () => Promise<unknown>) => { fn().catch(() => {}); };

  // Dashboard service already routes through rpcCache — the backend
  // warmed _collect_metrics, so these resolve quickly and populate the
  // frontend cache for Dashboard + Protection Center.
  import('../features/dashboard/dashboard.service')
    .then(({ dashboardService }) => {
      warm(dashboardService.getMetrics);
      warm(dashboardService.getHealthScore);
      warm(dashboardService.getHardwareSensors);
    })
    .catch(() => {});

  // AI Scam Detection status — writes into rpcCache so the page's
  // peek() hydrates instantly.
  import('../features/advanced-security/advancedSecurity.service')
    .then(({ advancedSecurityService }) => warm(advancedSecurityService.getStatus))
    .catch(() => {});

  // Antivirus Security mount-time posture reads (same keys as the
  // page's rpc.cached calls).
  warm(() => rpc.cached(RPC_METHODS.SYSTEM_AV_STATUS, undefined, WARM_TTL_MS));
  warm(() => rpc.cached(RPC_METHODS.DASHBOARD_SECURITY_SCORE, undefined, WARM_TTL_MS));
  warm(() => rpc.cached(RPC_METHODS.THREAT_STATISTICS, undefined, WARM_TTL_MS));
}

// ── Silent background refresh ───────────────────────────────────

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Refresh warm caches every few minutes so returning to a page still
 * hits near-fresh data. Invisible to the user — no loading UI.
 */
export function startSilentRefresh(intervalMs = 5 * 60_000): void {
  stopSilentRefresh();
  refreshTimer = setInterval(() => {
    if (document.hidden) return;
    warmFeatureCaches();
  }, intervalMs);
}

export function stopSilentRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
