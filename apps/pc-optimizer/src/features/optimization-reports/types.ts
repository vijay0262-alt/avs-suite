/**
 * Optimization Intelligence Report Engine — Type Definitions
 *
 * EPIC 3 PHASE A PART 7 — Optimization Intelligence Report Engine.
 *
 * Converts execution results into explainable, measurable reports.
 * Every optimization ends with a complete AI-generated report.
 *
 * Does NOT execute optimizations.
 * Does NOT modify existing modules.
 */
import type { PipelineExecution } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';

// ── Report Model ─────────────────────────────────────────────

export type ReportStatus = 'generated' | 'viewed' | 'archived' | 'regenerated';
export type OverallResult = 'success' | 'partial' | 'failed' | 'rolled_back';
export type ReportFormat = 'dashboard' | 'full' | 'printable' | 'pdf_ready' | 'markdown' | 'json' | 'mobile' | 'email';
export type ExportFormat = 'pdf' | 'html' | 'markdown' | 'json' | 'csv';

export interface OptimizationReport {
  id: string;
  executionId: string;
  planId: string;
  generatedAt: string;
  title: string;
  summary: string;
  overallResult: OverallResult;
  duration: number;
  status: ReportStatus;
  healthBefore: number | null;
  healthAfter: number | null;
  healthDelta: number | null;
  storageRecovered: number;
  startupImprovement: number;
  privacyImprovement: number;
  performanceImprovement: number;
  recommendationsResolved: number;
  recommendationsRemaining: number;
  predictionsUpdated: number;
  rollbackAvailable: boolean;
  confidence: number;
  sections: ReportSection[];
  visualMetrics: VisualMetrics;
  nextBestActions: NextBestAction[];
  evidence: ReportEvidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Report Sections ──────────────────────────────────────────

export type SectionType =
  | 'execution_summary'
  | 'health_delta'
  | 'benefits'
  | 'completed_actions'
  | 'skipped_actions'
  | 'updated_predictions'
  | 'updated_recommendations'
  | 'next_best_actions';

export interface ReportSection {
  type: SectionType;
  title: string;
  visible: boolean;
  data: Record<string, unknown>;
}

// ── Execution Summary ────────────────────────────────────────

export interface ExecutionSummary {
  status: string;
  duration: number;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  warnings: string[];
  errors: string[];
}

// ── Health Delta ─────────────────────────────────────────────

export interface HealthDeltaAnalysis {
  before: number | null;
  after: number | null;
  delta: number | null;
  confidence: number;
  reasonForChange: string;
  trend: 'improved' | 'declined' | 'unchanged' | 'unknown';
  contributingFactors: string[];
}

// ── Benefits ─────────────────────────────────────────────────

export interface BenefitAnalysis {
  storageRecovered: number;
  memoryOptimized: number;
  startupImprovement: number;
  performanceImprovement: number;
  privacyImprovement: number;
  maintenanceReduction: number;
  timeSaved: number;
  formatted: FormattedBenefits;
}

export interface FormattedBenefits {
  storage: string;
  memory: string;
  startup: string;
  performance: string;
  privacy: string;
  maintenance: string;
  timeSaved: string;
}

// ── Completed Actions ────────────────────────────────────────

export interface CompletedAction {
  stepId: string;
  title: string;
  description: string;
  benefit: string;
  durationMs: number;
  rollback: boolean;
  confidence: number;
  category: string;
}

// ── Skipped Actions ──────────────────────────────────────────

export interface SkippedAction {
  stepId: string;
  title: string;
  reason: string;
  risk: string;
  userCancelled: boolean;
  permissionRequired: boolean;
  futureRecommendation: string;
}

// ── Updated Predictions ──────────────────────────────────────

export interface PredictionDelta {
  prediction: string;
  status: 'improved' | 'updated' | 'refreshed' | 'stabilized' | 'unchanged';
  detail: string;
  before: string | number | null;
  after: string | number | null;
}

// ── Updated Recommendations ──────────────────────────────────

export interface RecommendationDelta {
  resolved: ResolvedRecommendation[];
  remaining: RemainingRecommendation[];
  newRecommendations: NewRecommendation[];
}

export interface ResolvedRecommendation {
  id: string;
  title: string;
  priority: string;
}

export interface RemainingRecommendation {
  id: string;
  title: string;
  priority: string;
  estimatedImpact: string;
}

export interface NewRecommendation {
  id: string;
  title: string;
  priority: string;
  reason: string;
}

// ── Next Best Actions ────────────────────────────────────────

export interface NextBestAction {
  id: string;
  title: string;
  estimatedImpact: string;
  estimatedTime: number;
  safety: string;
  confidence: number;
}

// ── Visual Metrics ───────────────────────────────────────────

export interface VisualMetrics {
  healthDelta: DeltaMetric;
  storageDelta: DeltaMetric;
  performanceDelta: DeltaMetric;
  privacyDelta: DeltaMetric;
  startupDelta: DeltaMetric;
  executionTimeline: TimelineEntry[];
  progressTimeline: TimelineEntry[];
}

export interface DeltaMetric {
  before: number | null;
  after: number | null;
  delta: number | null;
  formatted: string;
  trend: 'improved' | 'declined' | 'unchanged' | 'unknown';
}

export interface TimelineEntry {
  label: string;
  timestamp: string;
  progress: number;
}

// ── Report Evidence ──────────────────────────────────────────

export interface ReportEvidence {
  source: string;
  metric: string;
  value: string | number | boolean;
  timestamp: string;
  description: string;
}

// ── Report Comparison ────────────────────────────────────────

export interface ReportComparison {
  id: string;
  reportAId: string;
  reportBId: string;
  generatedAt: string;
  healthDelta: number | null;
  storageDelta: number;
  performanceDelta: number;
  privacyDelta: number;
  startupDelta: number;
  durationDelta: number;
  summary: string;
  winner: 'a' | 'b' | 'tie';
}

// ── Report Statistics ────────────────────────────────────────

export interface ReportStatistics {
  totalReports: number;
  byResult: Record<string, number>;
  averageHealthDelta: number;
  totalStorageRecovered: number;
  totalStartupSaved: number;
  averageDuration: number;
  averageConfidence: number;
  totalRecommendationsResolved: number;
}

// ── Report History ───────────────────────────────────────────

export interface ReportHistoryEntry {
  id: string;
  reportId: string;
  action: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Validation ───────────────────────────────────────────────

export interface ReportValidationResult {
  valid: boolean;
  errors: ReportValidationError[];
  warnings: ReportValidationWarning[];
}

export interface ReportValidationError {
  code: string;
  message: string;
  section?: SectionType;
}

export interface ReportValidationWarning {
  code: string;
  message: string;
  section?: SectionType;
}

// ── Events ───────────────────────────────────────────────────

export type ReportEventType =
  | 'report_generated'
  | 'report_updated'
  | 'report_exported'
  | 'comparison_generated'
  | 'report_viewed';

export interface ReportEvent {
  type: ReportEventType;
  reportId: string;
  timestamp: string;
  data: unknown;
}

export type ReportEventListener = (event: ReportEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface ReportSectionConfig {
  enabled: boolean;
  visible: boolean;
}

export interface ReportTemplate {
  name: string;
  sections: SectionType[];
  format: ReportFormat;
}

export interface ExportOptions {
  format: ExportFormat;
  includeEvidence: boolean;
  includeVisualMetrics: boolean;
  template: string;
}

export interface ComparisonRules {
  compareHealthDelta: boolean;
  compareStorage: boolean;
  comparePerformance: boolean;
  comparePrivacy: boolean;
  compareStartup: boolean;
  compareDuration: boolean;
}

export interface ReportFeatureFlags {
  enableHealthDelta: boolean;
  enableBenefitAnalysis: boolean;
  enablePredictions: boolean;
  enableRecommendations: boolean;
  enableNextBestActions: boolean;
  enableVisualMetrics: boolean;
  enableExport: boolean;
  enableComparison: boolean;
  enableValidation: boolean;
  enableEvidence: boolean;
  futureFlags: Record<string, boolean>;
}

export interface ReportConfiguration {
  configVersion: string;
  templates: Record<string, ReportTemplate>;
  sections: Record<SectionType, ReportSectionConfig>;
  exportOptions: ExportOptions;
  comparisonRules: ComparisonRules;
  featureFlags: ReportFeatureFlags;
  enableEvents: boolean;
  rollbackDurationHours: number;
}

// ── Export Result ────────────────────────────────────────────

export interface ExportResult {
  format: ExportFormat;
  content: string;
  mimeType: string;
  filename: string;
  generatedAt: string;
}

// ── Delta Analyzer Provider Interface ────────────────────────

export interface DeltaAnalyzerProvider {
  type: string;
  analyze(before: number | null, after: number | null, context: DeltaContext): DeltaMetric;
}

export interface DeltaContext {
  execution: PipelineExecution;
  plan: OptimizationPlanV2;
  config: ReportConfiguration;
}

// ── Helper Functions ─────────────────────────────────────────

export function createDefaultReportConfiguration(): ReportConfiguration {
  return {
    configVersion: '1.0.0',
    templates: {
      dashboard: {
        name: 'Dashboard',
        sections: ['execution_summary', 'health_delta', 'benefits', 'completed_actions'],
        format: 'dashboard',
      },
      full: {
        name: 'Full Report',
        sections: [
          'execution_summary', 'health_delta', 'benefits', 'completed_actions',
          'skipped_actions', 'updated_predictions', 'updated_recommendations', 'next_best_actions',
        ],
        format: 'full',
      },
      printable: {
        name: 'Printable',
        sections: [
          'execution_summary', 'health_delta', 'benefits', 'completed_actions',
          'skipped_actions', 'updated_predictions', 'updated_recommendations',
        ],
        format: 'printable',
      },
    },
    sections: {
      execution_summary: { enabled: true, visible: true },
      health_delta: { enabled: true, visible: true },
      benefits: { enabled: true, visible: true },
      completed_actions: { enabled: true, visible: true },
      skipped_actions: { enabled: true, visible: true },
      updated_predictions: { enabled: true, visible: true },
      updated_recommendations: { enabled: true, visible: true },
      next_best_actions: { enabled: true, visible: true },
    },
    exportOptions: {
      format: 'json',
      includeEvidence: true,
      includeVisualMetrics: true,
      template: 'full',
    },
    comparisonRules: {
      compareHealthDelta: true,
      compareStorage: true,
      comparePerformance: true,
      comparePrivacy: true,
      compareStartup: true,
      compareDuration: true,
    },
    featureFlags: {
      enableHealthDelta: true,
      enableBenefitAnalysis: true,
      enablePredictions: true,
      enableRecommendations: true,
      enableNextBestActions: true,
      enableVisualMetrics: true,
      enableExport: true,
      enableComparison: true,
      enableValidation: true,
      enableEvidence: true,
      futureFlags: {},
    },
    enableEvents: true,
    rollbackDurationHours: 24,
  };
}

export function generateReportId(): string {
  return `rpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateComparisonId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateHistoryId(): string {
  return `rph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, unitIndex);
  if (value >= 100) return `${Math.round(value)} ${units[unitIndex]}`;
  if (value >= 10) return `${value.toFixed(1)} ${units[unitIndex]}`;
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

export function formatDelta(before: number | null, after: number | null): string {
  if (before === null || after === null) return 'N/A';
  const delta = after - before;
  const sign = delta >= 0 ? '+' : '';
  return `${before} → ${after} (${sign}${delta})`;
}

export function determineTrend(before: number | null, after: number | null): 'improved' | 'declined' | 'unchanged' | 'unknown' {
  if (before === null || after === null) return 'unknown';
  if (after > before) return 'improved';
  if (after < before) return 'declined';
  return 'unchanged';
}
