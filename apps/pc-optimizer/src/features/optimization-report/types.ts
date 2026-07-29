/**
 * Optimization Intelligence Report — Type Definitions
 *
 * EPIC 3 PHASE A PART 7 — Optimization Intelligence Report.
 *
 * Transforms execution results into explainable, user-facing reports.
 * Closes the loop between AI Recommendation Engine, Optimization Plan,
 * and Execution Pipeline.
 *
 * Instead of "Optimization Complete", users receive a clear, measurable
 * explanation of the outcome with health deltas, storage recovered,
 * startup improvement, actions completed/skipped, predictions updated,
 * recommendations remaining, and rollback availability.
 */

// ── Intelligence Report Model ────────────────────────────────

export interface IntelligenceReport {
  id: string;
  executionId: string;
  planId: string;
  planType: string;
  generatedAt: string;

  headline: string;
  subtitle: string;

  executionTime: ExecutionTimeDisplay;
  healthDelta: HealthDeltaDisplay;
  storageRecovered: StorageDisplay;
  startupImprovement: StartupDisplay;
  privacyImprovement: PrivacyDisplay;
  performanceImprovement: PerformanceDisplay;

  actionsCompleted: ActionDisplay[];
  actionsSkipped: ActionDisplay[];
  actionsFailed: ActionDisplay[];

  predictionsUpdated: PredictionUpdateDisplay[];
  recommendationsRemaining: RecommendationRemainingDisplay;
  rollbackInfo: RollbackDisplay;

  evidence: ReportEvidence[];
  story: OptimizationStory;
  metadata: ReportMetadata;
  futureMetadata: Record<string, unknown>;
}

// ── Display Components ───────────────────────────────────────

export interface ExecutionTimeDisplay {
  durationMs: number;
  formatted: string;
}

export interface HealthDeltaDisplay {
  before: number | null;
  after: number | null;
  delta: number | null;
  formatted: string;
  trend: 'improved' | 'declined' | 'unchanged' | 'unknown';
}

export interface StorageDisplay {
  bytes: number;
  formatted: string;
}

export interface StartupDisplay {
  secondsSaved: number;
  formatted: string;
}

export interface PrivacyDisplay {
  pointsImproved: number;
  formatted: string;
}

export interface PerformanceDisplay {
  pointsImproved: number;
  formatted: string;
}

export interface ActionDisplay {
  stepId: string;
  title: string;
  description: string;
  category: string;
  durationMs: number;
  icon: ActionIcon;
  evidence: ReportEvidence[];
}

export type ActionIcon =
  | 'check'
  | 'skip'
  | 'error'
  | 'warning'
  | 'rollback'
  | 'future';

export interface PredictionUpdateDisplay {
  prediction: string;
  status: 'improved' | 'updated' | 'refreshed' | 'stabilized' | 'unchanged';
  detail: string;
}

export interface RecommendationRemainingDisplay {
  count: number;
  priorityBreakdown: Record<string, number>;
  summary: string;
}

export interface RollbackDisplay {
  available: boolean;
  durationHours: number;
  formatted: string;
  stepsRollbackable: number;
}

export interface ReportEvidence {
  source: string;
  metric: string;
  value: string | number | boolean;
  timestamp: string;
  description: string;
}

// ── Optimization Story ───────────────────────────────────────

export interface OptimizationStory {
  title: string;
  narrative: string;
  highlights: string[];
  outcome: 'success' | 'partial' | 'failed' | 'rolled_back';
  confidenceScore: number;
}

// ── Report Metadata ──────────────────────────────────────────

export interface ReportMetadata {
  planTitle: string;
  planType: string;
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  confidenceScore: number;
  verificationStatus: string;
}

// ── Report Statistics ────────────────────────────────────────

export interface ReportStatistics {
  totalReports: number;
  byOutcome: Record<string, number>;
  averageHealthDelta: number;
  totalStorageRecovered: number;
  totalStartupSaved: number;
  averageExecutionTimeMs: number;
  averageConfidence: number;
}

// ── Report History ───────────────────────────────────────────

export interface ReportHistoryEntry {
  id: string;
  reportId: string;
  action: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Events ───────────────────────────────────────────────────

export type ReportEventType =
  | 'report_generated'
  | 'report_viewed'
  | 'report_shared'
  | 'report_archived'
  | 'report_regenerated';

export interface ReportEvent {
  type: ReportEventType;
  reportId: string;
  timestamp: string;
  data: unknown;
}

export type ReportEventListener = (event: ReportEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface ReportFormattingRules {
  timeFormat: 'short' | 'long' | 'compact';
  storageFormat: 'bytes' | 'kb' | 'mb' | 'gb' | 'auto';
  healthFormat: 'points' | 'percentage';
  showEvidence: boolean;
  showPredictions: boolean;
  showRecommendationsRemaining: boolean;
  showRollbackInfo: boolean;
  maxHighlights: number;
}

export interface ReportStoryRules {
  generateNarrative: boolean;
  includeHighlights: boolean;
  maxNarrativeLength: number;
  tone: 'professional' | 'friendly' | 'technical';
}

export interface ReportFeatureFlags {
  enableHealthDelta: boolean;
  enableStorageDisplay: boolean;
  enableStartupDisplay: boolean;
  enablePrivacyDisplay: boolean;
  enablePerformanceDisplay: boolean;
  enablePredictions: boolean;
  enableRecommendations: boolean;
  enableRollbackInfo: boolean;
  enableStories: boolean;
  enableEvidence: boolean;
  futureFlags: Record<string, boolean>;
}

export interface ReportConfiguration {
  configVersion: string;
  formattingRules: ReportFormattingRules;
  storyRules: ReportStoryRules;
  featureFlags: ReportFeatureFlags;
  rollbackDurationHours: number;
  enableEvents: boolean;
}

// ── Helper Functions ─────────────────────────────────────────

export function createDefaultReportConfiguration(): ReportConfiguration {
  return {
    configVersion: '1.0.0',
    formattingRules: {
      timeFormat: 'compact',
      storageFormat: 'auto',
      healthFormat: 'points',
      showEvidence: true,
      showPredictions: true,
      showRecommendationsRemaining: true,
      showRollbackInfo: true,
      maxHighlights: 5,
    },
    storyRules: {
      generateNarrative: true,
      includeHighlights: true,
      maxNarrativeLength: 500,
      tone: 'professional',
    },
    featureFlags: {
      enableHealthDelta: true,
      enableStorageDisplay: true,
      enableStartupDisplay: true,
      enablePrivacyDisplay: true,
      enablePerformanceDisplay: true,
      enablePredictions: true,
      enableRecommendations: true,
      enableRollbackInfo: true,
      enableStories: true,
      enableEvidence: true,
      futureFlags: {},
    },
    rollbackDurationHours: 24,
    enableEvents: true,
  };
}

export function generateReportId(): string {
  return `report_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateReportHistoryId(): string {
  return `rhist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export function formatStorage(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, unitIndex);
  if (value >= 100) return `${Math.round(value)} ${units[unitIndex]}`;
  if (value >= 10) return `${value.toFixed(1)} ${units[unitIndex]}`;
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

export function formatHealthDelta(before: number | null, after: number | null): string {
  if (before === null || after === null) return 'N/A';
  const delta = after - before;
  const sign = delta >= 0 ? '+' : '';
  return `${before} → ${after} (${sign}${delta})`;
}

export function determineHealthTrend(before: number | null, after: number | null): 'improved' | 'declined' | 'unchanged' | 'unknown' {
  if (before === null || after === null) return 'unknown';
  if (after > before) return 'improved';
  if (after < before) return 'declined';
  return 'unchanged';
}
