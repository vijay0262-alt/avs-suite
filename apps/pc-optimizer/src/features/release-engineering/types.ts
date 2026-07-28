/**
 * Release Engineering Types — shared types for all
 * Phase 4.0 release engineering modules.
 *
 * This module does NOT modify any existing architecture.
 */

// ── Performance ───────────────────────────────────────────────

export type StartupType = 'cold' | 'warm';

export interface StartupMetric {
  type: StartupType;
  durationMs: number;
  timestamp: string;
  stages: { name: string; durationMs: number }[];
}

export interface ResourceSnapshot {
  timestamp: string;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  cpuCount: number;
}

export interface LatencyMetric {
  operation: string;
  durationMs: number;
  timestamp: string;
  success: boolean;
}

export interface PerformanceReport {
  startup: StartupMetric[];
  resourceSnapshots: ResourceSnapshot[];
  latencyMetrics: LatencyMetric[];
  bottlenecks: string[];
  summary: {
    avgColdStartupMs: number;
    avgWarmStartupMs: number;
    avgMemoryUsageMB: number;
    avgScanLatencyMs: number;
    avgOptimizationLatencyMs: number;
    avgDashboardRefreshMs: number;
    avgAssistantResponseMs: number;
  };
  generatedAt: string;
}

// ── Stability ─────────────────────────────────────────────────

export type StabilityTestType =
  | 'interrupted_optimization'
  | 'unexpected_shutdown'
  | 'rollback_reliability'
  | 'corrupted_cache'
  | 'offline_operation'
  | 'config_corruption'
  | 'history_corruption'
  | 'failed_rpc'
  | 'graceful_degradation';

export type StabilityTestStatus = 'pass' | 'fail' | 'warning';

export interface StabilityTestResult {
  test: StabilityTestType;
  status: StabilityTestStatus;
  durationMs: number;
  message: string;
  details: Record<string, unknown> | null;
  timestamp: string;
}

export interface StabilityReport {
  results: StabilityTestResult[];
  passed: number;
  failed: number;
  warnings: number;
  overallStatus: StabilityTestStatus;
  generatedAt: string;
}

// ── Installer ─────────────────────────────────────────────────

export type InstallMode = 'install' | 'repair' | 'modify' | 'uninstall' | 'portable' | 'silent';
export type InstallScope = 'per-user' | 'per-machine';

export interface InstallerConfig {
  mode: InstallMode;
  scope: InstallScope;
  silent: boolean;
  portable: boolean;
  preserveSettings: boolean;
  upgradeExisting: boolean;
  installPath: string | null;
  createDesktopShortcut: boolean;
  createStartMenuShortcut: boolean;
  associateFileTypes: boolean;
}

export const DEFAULT_INSTALLER_CONFIG: InstallerConfig = {
  mode: 'install',
  scope: 'per-user',
  silent: false,
  portable: false,
  preserveSettings: true,
  upgradeExisting: true,
  installPath: null,
  createDesktopShortcut: true,
  createStartMenuShortcut: true,
  associateFileTypes: false,
};

// ── Auto Update ───────────────────────────────────────────────

export type UpdateChannel = 'stable' | 'beta' | 'preview';

export interface UpdateInfo {
  version: string;
  channel: UpdateChannel;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  downloadSizeBytes: number;
  isDeltaUpdate: boolean;
  isSigned: boolean;
  signature: string | null;
  minimumVersion: string;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not_available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  progress: number;
  error: string | null;
  updateInfo: UpdateInfo | null;
  lastCheckedAt: string | null;
}

// ── Security ─────────────────────────────────────────────────

export type SecurityAuditCategory =
  | 'dependencies'
  | 'secrets'
  | 'logging'
  | 'permissions'
  | 'file_access'
  | 'temp_files'
  | 'update_verification'
  | 'code_signing';

export type SecurityAuditStatus = 'pass' | 'warning' | 'fail';

export interface SecurityAuditResult {
  category: SecurityAuditCategory;
  status: SecurityAuditStatus;
  message: string;
  details: string[];
  timestamp: string;
}

export interface SecurityAuditReport {
  results: SecurityAuditResult[];
  passed: number;
  warnings: number;
  failed: number;
  overallStatus: SecurityAuditStatus;
  generatedAt: string;
}

// ── Accessibility ────────────────────────────────────────────

export type AccessibilityFeature =
  | 'keyboard_navigation'
  | 'screen_reader_labels'
  | 'focus_management'
  | 'high_dpi'
  | 'high_contrast'
  | 'dark_mode'
  | 'responsive_layout';

export interface AccessibilityStatus {
  feature: AccessibilityFeature;
  enabled: boolean;
  notes: string;
}

export interface AccessibilityReport {
  statuses: AccessibilityStatus[];
  enabledCount: number;
  totalCount: number;
  generatedAt: string;
}

// ── Diagnostics ──────────────────────────────────────────────

export type DiagnosticExportType =
  | 'log_bundle'
  | 'health_report'
  | 'crash_report'
  | 'system_info'
  | 'privacy_safe_logs';

export interface DiagnosticExport {
  type: DiagnosticExportType;
  content: string;
  filename: string;
  mimeType: string;
  generatedAt: string;
  isPrivacySafe: boolean;
}

// ── Release Checklist ─────────────────────────────────────────

export type ChecklistStatus = 'done' | 'in_progress' | 'blocked' | 'not_started';

export interface ChecklistItem {
  id: string;
  category: string;
  description: string;
  status: ChecklistStatus;
  notes: string;
}

export interface FeatureChecklistItem {
  module: string;
  feature: string;
  implemented: boolean;
  tested: boolean;
  notes: string;
}

export interface KnownIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  workaround: string;
  status: 'open' | 'investigating' | 'fixed';
}

export interface CompatibilityEntry {
  os: string;
  version: string;
  supported: boolean;
  notes: string;
}

export interface MinimumRequirements {
  os: string;
  ram: string;
  disk: string;
  cpu: string;
  electron: string;
  node: string;
}

export interface ReleaseChecklist {
  checklistItems: ChecklistItem[];
  featureChecklist: FeatureChecklistItem[];
  knownIssues: KnownIssue[];
  compatibilityMatrix: CompatibilityEntry[];
  minimumRequirements: MinimumRequirements;
  telemetryPolicy: {
    optIn: boolean;
    dataCollected: string[];
    privacyPolicyUrl: string;
  };
  releaseReady: boolean;
  generatedAt: string;
}

// ── Events ────────────────────────────────────────────────────

export type ReleaseEventType =
  | 'performance_profiled'
  | 'stability_tested'
  | 'security_audited'
  | 'update_checked'
  | 'diagnostics_exported'
  | 'release_checklist_updated';

export type ReleaseEventListener = (payload: unknown) => void;

// ── Helpers ───────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
