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

export interface CategoryScores {
  cpu: number;
  memory: number;
  storage: number;
  security: number;
  performance: number;
}

export interface HealthSummaryItem {
  text: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
}

export interface HealthCategoryDetail {
  id: string;
  name: string;
  score: number;
  detail: string;
  actionLabel: string;
  path: string;
  severity: 'success' | 'warning' | 'danger';
}

export interface HealthScore {
  overallScore: number;
  categoryScores: CategoryScores;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  suggestions: string[];
  capturedAt: string;
  // Dashboard 2.0 commercial health center additions
  issuesFound: number;
  recoverableSpace: number;
  memoryRecovery: number;
  bootImprovementSeconds: number;
  summary: HealthSummaryItem[];
  categoryDetails: HealthCategoryDetail[];
}

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
  | 'preview'
  | 'selection'
  | 'optimizing'
  | 'complete';

export interface HealthScanModuleResult {
  moduleId: string;
  moduleName: string;
  status: 'pending' | 'scanning' | 'complete' | 'error' | 'skipped';
  score: number;
  issuesFound: number;
  recoverableSpace: number;
  severity: 'low' | 'medium' | 'high';
  estimatedImprovement: string;
  error?: string;
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
