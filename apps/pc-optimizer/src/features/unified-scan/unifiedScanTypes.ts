/**
 * Unified Scan Types — shared types for the unified scanning framework.
 *
 * Every module in AVS Shield uses these types to define its scan phases,
 * live counters, result cards, and AI summary.  This ensures a consistent
 * scanning experience across the entire application.
 */

// ── Scan Lifecycle ──────────────────────────────────────────────

export type UnifiedScanStep =
  | 'idle'
  | 'preparing'
  | 'scanning'
  | 'paused'
  | 'complete'
  | 'error'
  | 'cancelled';

export type UnifiedScanPhaseStatus = 'pending' | 'scanning' | 'complete' | 'error' | 'skipped' | 'deferred';

// ── Scan Phase Definition ───────────────────────────────────────

export interface UnifiedScanPhase {
  id: string;
  label: string;
  description: string;
  startPercent: number;
  endPercent: number;
  /** Activity messages cycled through during this phase */
  activities: string[];
}

// ── Live Counter Definition ─────────────────────────────────────

export interface UnifiedScanCounterDef {
  id: string;
  label: string;
  icon: string; // heroicon name
  format: 'number' | 'bytes' | 'seconds' | 'percent' | 'plain';
}

export interface UnifiedScanCounterValue {
  id: string;
  value: number;
}

// ── Scan Tree Node ──────────────────────────────────────────────

export interface UnifiedScanTreeNode {
  id: string;
  label: string;
  status: UnifiedScanPhaseStatus;
  itemsScanned: number;
  issuesFound: number;
  children?: UnifiedScanTreeNode[];
  reason?: string;
}

// ── Result Card ─────────────────────────────────────────────────

export interface UnifiedResultCard {
  id: string;
  title: string;
  icon: string;
  currentValue: string;
  improvedValue: string;
  difference: string;
  positive: boolean;
}

// ── AI Summary ──────────────────────────────────────────────────

export interface UnifiedAISummary {
  overallScore: number;
  securityScore?: number;
  healthScore?: number;
  performanceScore?: number;
  modulesAnalyzed: number;
  issuesFound: number;
  threatsFound?: number;
  aiConfidence: number;
  estimatedImprovements: string[];
  verdict: string;
  reportId: string;
}

// ── Scan Report ─────────────────────────────────────────────────

export interface UnifiedScanReport {
  reportId: string;
  moduleName: string;
  moduleIcon: string;
  timestamp: number;
  durationMs: number;
  itemsAnalyzed: number;
  issuesFound: number;
  threatsFound?: number;
  planId?: string;
  results: UnifiedResultCard[];
  aiSummary: UnifiedAISummary;
  actions: UnifiedScanAction[];
}

// ── Scan Action ─────────────────────────────────────────────────

export interface UnifiedScanAction {
  id: string;
  label: string;
  icon: string;
  variant: 'primary' | 'secondary' | 'danger';
  action: () => void;
}

// ── Live Status ─────────────────────────────────────────────────

export interface UnifiedScanLiveStatus {
  currentPhase: string;
  currentActivity: string;
  currentFolder?: string;
  currentFile?: string;
  currentModule?: string;
  currentCategory?: string;
  overallProgress: number;
  subProgress?: number;
}

// ── Module Configuration ────────────────────────────────────────

export interface UnifiedScanModuleConfig {
  moduleId: string;
  moduleName: string;
  moduleIcon: string;
  phases: UnifiedScanPhase[];
  counters: UnifiedScanCounterDef[];
  supportsPause: boolean;
  supportsCancel: boolean;
  /**
   * Maps backend scan_core phase IDs to frontend phase IDs.
   * Backend phases: initializing, discovery, evaluating, aggregating, prioritizing, planning.
   * If not provided, the frontend will derive the phase from completion_percent.
   */
  backendPhaseMap?: Record<string, string>;
  /**
   * Maps frontend counter IDs to backend ScanProgress field names.
   * If not provided, counters will fall back to assets_evaluated.
   */
  backendCounterMap?: Record<string, string>;
}

// ── Scan State (used by the hook) ───────────────────────────────

export interface UnifiedScanState {
  step: UnifiedScanStep;
  liveStatus: UnifiedScanLiveStatus;
  counters: Record<string, number>;
  treeNodes: UnifiedScanTreeNode[];
  currentPhaseIndex: number;
  startTime: number | null;
  endTime: number | null;
  error: string | null;
  report: UnifiedScanReport | null;
}

// ── Helpers ─────────────────────────────────────────────────────

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

export function formatETA(elapsedMs: number, progress: number): string {
  if (progress <= 0 || progress >= 100) return '—';
  const totalEstimate = elapsedMs / (progress / 100);
  const remaining = totalEstimate - elapsedMs;
  if (remaining < 1000) return '< 1s';
  return formatDuration(remaining);
}

export function formatCounterValue(value: number, format: UnifiedScanCounterDef['format']): string {
  switch (format) {
    case 'number':
      return value.toLocaleString();
    case 'bytes':
      return formatBytes(value);
    case 'seconds':
      return `${value}s`;
    case 'percent':
      return `${value}%`;
    case 'plain':
      return String(value);
    default:
      return value.toLocaleString();
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Icon Mapping ────────────────────────────────────────────────

export const SCAN_ICON_MAP: Record<string, string> = {
  // Module icons
  optimize: 'SparklesIcon',
  security: 'ShieldCheckIcon',
  junk: 'TrashIcon',
  registry: 'ServerStackIcon',
  privacy: 'EyeSlashIcon',
  browser: 'GlobeAltIcon',
  duplicate: 'DocumentDuplicateIcon',
  disk: 'CircleStackIcon',
  hardware: 'CpuChipIcon',
  performance: 'RocketLaunchIcon',
  startup: 'ServerIcon',
  updater: 'ArrowPathIcon',
  uninstaller: 'ArchiveBoxXMarkIcon',
  // Counter icons
  files: 'DocumentTextIcon',
  registryEntries: 'ServerStackIcon',
  processes: 'CommandLineIcon',
  services: 'Cog6ToothIcon',
  browserObjects: 'GlobeAltIcon',
  privacyItems: 'EyeSlashIcon',
  junkFiles: 'TrashIcon',
  duplicateFiles: 'DocumentDuplicateIcon',
  applications: 'Squares2X2Icon',
  sensors: 'CpuChipIcon',
  threats: 'ExclamationTriangleIcon',
  recommendations: 'SparklesIcon',
  storageRecovery: 'CircleStackIcon',
  memoryRecovery: 'CpuChipIcon',
  startupImprovement: 'ClockIcon',
  riskLevel: 'ShieldExclamationIcon',
  scripts: 'CommandLineIcon',
  persistence: 'LinkIcon',
};
