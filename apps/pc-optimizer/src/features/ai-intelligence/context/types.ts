/**
 * AI Context Engine — Type Definitions.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every insight, recommendation,
 *    or answer must be traceable back to one or more context providers,
 *    with supporting evidence and a confidence score."
 *
 * This principle is embedded in the ContextProvenance type — every
 * context section carries its source, evidence, and confidence.
 */
// ── Traceability ─────────────────────────────────────────────

/**
 * Provenance tracking for every piece of context data.
 * This is the foundation of the "never invent" principle.
 */
export interface ContextProvenance {
  providerName: string;
  providerVersion: string;
  collectedAt: string;
  confidence: number; // 0.0 to 1.0
  evidence: ContextEvidence[];
}

/**
 * Evidence supporting a piece of context data.
 */
export interface ContextEvidence {
  source: string;
  metric: string;
  value: string | number | boolean;
  timestamp: string;
}

// ── Context Sections (all optional) ──────────────────────────

export interface SystemContext {
  osVersion: string;
  osBuild: string;
  architecture: string;
  hostname: string;
  uptime: number;
  cpuModel: string;
  cpuCores: number;
  totalMemoryMB: number;
  gpuModel: string | null;
  provenance: ContextProvenance;
}

export interface HealthContext {
  overallScore: number;
  cpuScore: number;
  ramScore: number;
  diskScore: number;
  stabilityScore: number;
  securityScore: number;
  issues: HealthIssue[];
  provenance: ContextProvenance;
}

export interface HealthIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
  affectedComponent: string;
}

export interface PerformanceContext {
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  diskReadSpeedMBps: number | null;
  diskWriteSpeedMBps: number | null;
  networkLatencyMs: number | null;
  activeProcesses: number;
  provenance: ContextProvenance;
}

export interface StorageContext {
  totalCapacityMB: number;
  usedMB: number;
  freeMB: number;
  driveType: string;
  driveHealth: 'good' | 'fair' | 'poor' | 'unknown';
  fragmentationPercent: number | null;
  largeFiles: LargeFileInfo[];
  provenance: ContextProvenance;
}

export interface LargeFileInfo {
  path: string;
  sizeMB: number;
  category: string;
}

export interface BrowserContext {
  installedBrowsers: BrowserInfo[];
  totalCacheMB: number;
  totalCookiesMB: number;
  totalHistoryMB: number;
  extensions: BrowserExtensionInfo[];
  provenance: ContextProvenance;
}

export interface BrowserInfo {
  name: string;
  version: string;
  profileCount: number;
  cacheMB: number;
}

export interface BrowserExtensionInfo {
  browser: string;
  name: string;
  enabled: boolean;
}

export interface PrivacyContext {
  trackingCookies: number;
  historyEntries: number;
  tempFilesMB: number;
  recycleBinMB: number;
  recentItems: number;
  provenance: ContextProvenance;
}

export interface StartupContext {
  totalStartupItems: number;
  enabledItems: number;
  disabledItems: number;
  estimatedBootTimeSec: number;
  highImpactItems: StartupItemInfo[];
  provenance: ContextProvenance;
}

export interface StartupItemInfo {
  name: string;
  command: string;
  impact: 'low' | 'medium' | 'high';
  enabled: boolean;
  publisher: string;
}

export interface WindowsContext {
  windowsVersion: string;
  buildNumber: string;
  lastUpdate: string | null;
  pendingUpdates: number;
  services: WindowsServiceInfo[];
  provenance: ContextProvenance;
}

export interface WindowsServiceInfo {
  name: string;
  displayName: string;
  status: 'running' | 'stopped' | 'paused';
  startType: 'auto' | 'manual' | 'disabled';
}

export interface DuplicatesContext {
  totalDuplicateGroups: number;
  totalDuplicateFiles: number;
  wastedSpaceMB: number;
  scanStatus: 'idle' | 'scanning' | 'completed' | 'failed';
  topDuplicateGroups: DuplicateGroupInfo[];
  provenance: ContextProvenance;
}

export interface DuplicateGroupInfo {
  hash: string;
  fileCount: number;
  totalSizeMB: number;
  filePaths: string[];
}

export interface SchedulerContext {
  enabled: boolean;
  scheduledTasks: ScheduledTaskInfo[];
  lastRunAt: string | null;
  nextRunAt: string | null;
  provenance: ContextProvenance;
}

export interface ScheduledTaskInfo {
  id: string;
  name: string;
  frequency: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface HistoryContext {
  totalOptimizations: number;
  totalCleanedMB: number;
  totalIssuesFixed: number;
  lastOptimizationAt: string | null;
  optimizationHistory: OptimizationHistoryEntry[];
  provenance: ContextProvenance;
}

export interface OptimizationHistoryEntry {
  timestamp: string;
  type: string;
  itemsProcessed: number;
  spaceFreedMB: number;
  durationSec: number;
}

export interface ReportsContext {
  totalReports: number;
  lastReportAt: string | null;
  reportTypes: string[];
  scheduledReports: number;
  provenance: ContextProvenance;
}

export interface ExperienceContext {
  currentPlan: string;
  planLabel: string;
  trialStatus: string;
  unlockedFeatures: string[];
  limitedFeatures: string[];
  lockedFeatures: string[];
  provenance: ContextProvenance;
}

export interface CapabilitiesContext {
  totalCapabilities: number;
  enabledCapabilities: string[];
  disabledCapabilities: string[];
  provenance: ContextProvenance;
}

export interface QuotaContext {
  quotas: QuotaInfo[];
  provenance: ContextProvenance;
}

export interface QuotaInfo {
  quotaId: string;
  limit: number | null;
  used: number;
  remaining: number;
  isUnlimited: boolean;
  resetPolicy: string;
  nextResetAt: string | null;
}

export interface AnalyticsContext {
  mostUsedFeatures: { featureId: string; count: number }[];
  mostReachedQuotas: { quotaId: string; count: number }[];
  totalFeatureAccesses: number;
  totalDenials: number;
  provenance: ContextProvenance;
}

// ── Metadata ─────────────────────────────────────────────────

export interface ContextMetadata {
  contextId: string;
  timestamp: string;
  contextVersion: string;
  appVersion: string;
  platform: string;
  language: string;
  currentPlan: string;
  generationTimeMs: number;
}

// ── Full AI Context ──────────────────────────────────────────

export interface AIContext {
  metadata: ContextMetadata;
  system?: SystemContext;
  health?: HealthContext;
  performance?: PerformanceContext;
  storage?: StorageContext;
  browser?: BrowserContext;
  privacy?: PrivacyContext;
  startup?: StartupContext;
  windows?: WindowsContext;
  duplicates?: DuplicatesContext;
  scheduler?: SchedulerContext;
  history?: HistoryContext;
  reports?: ReportsContext;
  experience?: ExperienceContext;
  capabilities?: CapabilitiesContext;
  quota?: QuotaContext;
  analytics?: AnalyticsContext;
  futureExtensions?: Record<string, unknown>;
  provenance: ContextProvenance[];
}

// ── Provider Interface ───────────────────────────────────────

export type ContextSection =
  | 'system' | 'health' | 'performance' | 'storage' | 'browser'
  | 'privacy' | 'startup' | 'windows' | 'duplicates' | 'scheduler'
  | 'history' | 'reports' | 'experience' | 'capabilities' | 'quota'
  | 'analytics' | 'futureExtensions';

/**
 * Every module supplies its own context through an AIContextProvider.
 * Providers are independently testable and registered at runtime.
 */
export interface AIContextProvider {
  getProviderName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getContext(): Promise<Record<string, unknown>> | Record<string, unknown>;
  validate(): ContextProviderValidationResult;
}

export interface ContextProviderValidationResult {
  valid: boolean;
  issues: string[];
}

// ── Events ───────────────────────────────────────────────────

export type AIContextEventType =
  | 'context_build_started'
  | 'context_build_completed'
  | 'context_provider_loaded'
  | 'context_provider_failed'
  | 'context_cache_hit'
  | 'context_cache_miss'
  | 'context_refreshed';

export type AIContextEventListener = (payload: unknown) => void;

// ── Validation ───────────────────────────────────────────────

export interface ContextValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  providerName?: string;
  section?: string;
}

export interface ContextValidationResult {
  valid: boolean;
  issues: ContextValidationIssue[];
}

// ── Cache ────────────────────────────────────────────────────

export interface CacheEntry {
  context: AIContext;
  cachedAt: string;
  expiresAt: string;
  hitCount: number;
}

export interface CacheStatistics {
  totalHits: number;
  totalMisses: number;
  totalBuilds: number;
  totalRefreshes: number;
  hitRate: number;
  currentCacheSize: number;
  lastCachedAt: string | null;
  lastBuildTimeMs: number;
}

// ── Configuration ────────────────────────────────────────────

export interface AIContextConfiguration {
  cacheEnabled: boolean;
  cacheTtlMs: number;
  autoRefresh: boolean;
  autoRefreshIntervalMs: number;
  failOnProviderError: boolean;
  timeoutMs: number;
  enableTraceability: boolean;
  minConfidenceThreshold: number;
  metadata: {
    contextVersion: string;
    appVersion: string;
    platform: string;
    language: string;
  };
}

// ── Statistics ───────────────────────────────────────────────

export interface ContextStatistics {
  totalProviders: number;
  activeProviders: number;
  failedProviders: number;
  lastBuildContext: string | null;
  lastBuildTimeMs: number;
  cacheStatistics: CacheStatistics;
  sectionsPresent: string[];
  sectionsMissing: string[];
  averageConfidence: number;
  totalEvidencePieces: number;
}

// ── Helper Functions ─────────────────────────────────────────

export const CONTEXT_SECTIONS: ContextSection[] = [
  'system', 'health', 'performance', 'storage', 'browser',
  'privacy', 'startup', 'windows', 'duplicates', 'scheduler',
  'history', 'reports', 'experience', 'capabilities', 'quota',
  'analytics', 'futureExtensions',
];

export function isValidContextSection(section: string): section is ContextSection {
  return CONTEXT_SECTIONS.includes(section as ContextSection);
}

export function createProvenance(
  providerName: string,
  providerVersion: string,
  confidence: number = 1.0,
  evidence: ContextEvidence[] = [],
): ContextProvenance {
  return {
    providerName,
    providerVersion,
    collectedAt: new Date().toISOString(),
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence,
  };
}

export function generateContextId(): string {
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
