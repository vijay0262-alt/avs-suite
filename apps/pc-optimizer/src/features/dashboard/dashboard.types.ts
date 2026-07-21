/**
 * Dashboard types and interfaces for System Health Dashboard.
 */

export interface CPUMetrics {
  usage: number;
  frequency: number;
  logicalProcessors: number;
  physicalProcessors: number;
  processes: number;
  threads: number;
  temperature: number | null;
}

export interface MemoryMetrics {
  total: number;
  used: number;
  available: number;
  usage: number;
  cached: number;
  swapTotal: number;
  swapUsed: number;
  swapUsage: number;
}

export interface StorageDrive {
  mount: string;
  name: string;
  total: number;
  used: number;
  free: number;
  usage: number;
  isSSD: boolean;
  fileSystem: string;
}

export interface WindowsInfo {
  version: string;
  build: string;
  uptime: number;
  isAdministrator: boolean;
  powerMode: string;
  battery: {
    percent: number;
    powerPlugged: boolean;
  } | null;
  secureBoot: boolean;
  tpmStatus: boolean;
}

export interface SecurityMetrics {
  defender: {
    enabled: boolean;
    realTimeProtection: boolean;
  };
  firewall: {
    enabled: boolean;
  };
  updates: {
    pendingUpdates: number;
    lastUpdateDate: string | null;
  };
  realTimeProtection: boolean;
  smartScreen: boolean;
}

export interface PerformanceMetrics {
  startupApps: number;
  backgroundProcesses: number;
  temporaryFilesSize: number;
  recycleBinSize: number;
  browserCacheSize: number;
  potentialRecoverable: number;
}

export interface NetworkMetrics {
  uploadSpeed: number;
  downloadSpeed: number;
  totalBytesSent: number;
  totalBytesReceived: number;
}

export interface LiveMetrics {
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  storage: StorageDrive[];
  network?: NetworkMetrics;
  capturedAt: string;
}

export interface DashboardMetrics extends LiveMetrics {
  windows: WindowsInfo;
  security: SecurityMetrics;
  performance: PerformanceMetrics;
}

export type HealthCategory = 'storage' | 'startup' | 'privacy' | 'performance' | 'security' | 'windows';

export interface CategoryScores {
  storage: number;
  startup: number;
  privacy: number;
  performance: number;
  security: number;
  windows: number;
}

export interface HealthSummaryItem {
  text: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
}

export interface HealthCategoryDetail {
  id: HealthCategory;
  name: string;
  score: number;
  detail: string;
  actionLabel: string;
  path: string;
  severity: 'success' | 'warning' | 'danger';
}

export interface HealthIssue {
  id: string;
  category: HealthCategory;
  title: string;
  detail: string;
  severity: 'low' | 'medium' | 'high';
  measurableValue: number;
  measurableUnit: 'bytes' | 'count' | 'percent' | 'none';
  actionPath: string;
  canAutoFix: boolean;
}

export interface HealthSnapshot {
  timestamp: string;
  overallScore: number;
  categoryScores: CategoryScores;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  issues: HealthIssue[];
  summary: HealthSummaryItem[];
  categoryDetails: HealthCategoryDetail[];
  measuredRecoverableSpace: number;
  startupAppsEnabled: number;
  tempFilesSize: number;
  browserCacheSize: number;
  recycleBinSize: number;
}

export type HealthScore = HealthSnapshot;

export interface OptimizeAction {
  name: string;
  size: number;
  description: string;
}

export interface OptimizePreview {
  totalRecoverable: number;
  actions: OptimizeAction[];
  estimatedTime: number;
}

export interface OptimizeResult {
  cleaned: boolean;
  size: number;
  error: string | null;
}

export interface OptimizeResults {
  temporaryFiles: OptimizeResult;
  recycleBin: OptimizeResult;
  browserCache: OptimizeResult;
  thumbnailCache: OptimizeResult;
  prefetchFiles: OptimizeResult;
  windowsUpdateCache: OptimizeResult;
  flushDNS: OptimizeResult;
  refreshExplorer: OptimizeResult;
  memoryTrim: OptimizeResult;
}

export interface OptimizeExecuteResponse {
  success: boolean;
  totalRecovered: number;
  results: OptimizeResults;
  elapsedMs: number;
  completedAt: string;
}

export type HealthStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export const HEALTH_STATUS_CONFIG: Record<
  HealthStatus,
  { color: string; label: string; icon: string }
> = {
  excellent: { color: 'text-semantic-success', label: 'Excellent', icon: 'check-circle' },
  good: { color: 'text-semantic-success', label: 'Good', icon: 'check-circle' },
  fair: { color: 'text-semantic-warning', label: 'Fair', icon: 'exclamation-triangle' },
  poor: { color: 'text-semantic-danger', label: 'Poor', icon: 'x-circle' },
  critical: { color: 'text-semantic-danger', label: 'Critical', icon: 'alert-triangle' },
};

// Health Scan workflow
export type HealthScanStep =
  | 'idle'
  | 'scanning'
  | 'report'
  | 'optimizing'
  | 'verifying'
  | 'complete';

export interface OptimizationDetailItem {
  name: string;
  size?: number;
  age?: string;
  safeToRemove?: boolean;
}

export interface OptimizationDetailGroup {
  title: string;
  items: OptimizationDetailItem[];
  totalSize?: number;
  safeToRemove: boolean;
  why: string;
}

export interface OptimizationDetails {
  summary: string;
  impact: 'low' | 'medium' | 'high';
  safeToRemove: boolean;
  groups: OptimizationDetailGroup[];
  notChanged: string[];
  why: string;
}

export interface HealthScanModuleActual {
  success: boolean;
  filesDeleted?: number;
  bytesRecovered?: number;
  itemsRemoved?: number;
  entriesDisabled?: number;
  issuesFixed?: number;
  errors: string[];
  reason?: string;
}

export interface HealthScanModuleResult {
  moduleId: string;
  moduleName: string;
  status: 'pending' | 'scanning' | 'complete' | 'error' | 'skipped';
  score: number;
  issuesFound: number;
  recoverableSpace: number;
  severity: 'low' | 'medium' | 'high';
  measuredDetail: string;
  details: OptimizationDetails;
  error?: string;
  /** Whether the issues in this module can be auto-fixed by the app. */
  canAutoFix: boolean;
  /** Raw backend scan data needed to execute the optimization for this module. */
  rawContext?: Record<string, unknown>;
  /** Actual results measured during/after optimization for this module. */
  actual?: HealthScanModuleActual;
  /** Verification snapshot captured before and after the optimization. */
  verification?: {
    beforeScore: number;
    beforeIssues: number;
    beforeRecoverable: number;
    afterScore: number;
    afterIssues: number;
    afterRecoverable: number;
  };
}

export interface HealthScanReport {
  overallScore: number;
  issuesFound: number;
  recoverableSpace: number;
  modules: HealthScanModuleResult[];
  startedAt: number;
  finishedAt: number;
}

export interface OptimizationSelectionItem {
  moduleId: string;
  moduleName: string;
  selected: boolean;
  recoverableSpace: number;
}

export interface OptimizationExecutionProgress {
  currentModule: string | null;
  progress: number;
  itemsProcessed: number;
  spaceRecovered: number;
  elapsedMs: number;
}

export interface HealthScanHistoryEntry {
  id: string;
  date: string;
  healthBefore: number;
  healthAfter: number;
  recoveredSpace: number;
  modulesUsed: string[];
  durationMs: number;
  result: 'success' | 'partial' | 'cancelled';
}

export interface VerificationLog {
  id: string;
  timestamp: number;
  moduleId: string;
  action: string;
  rpcMethod: string;
  before?: number;
  after?: number;
  durationMs: number;
  success: boolean;
  message?: string;
}
