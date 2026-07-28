/**
 * AI Health Engine — Type Definitions
 *
 * Data model for the intelligent analysis engine that evaluates
 * overall PC health. The engine NEVER changes the system — it only
 * analyzes and produces scores, insights, and recommendations.
 *
 * This module is read-only with respect to all other systems.
 * It reads system metrics and execution history but never modifies
 * any service, engine, or configuration.
 */
import type { DashboardMetrics } from '../dashboard/dashboard.types';
import type { ExecutionRecord, ExecutionStatistics } from '../maintenance-history/types';

// ── Health Categories ─────────────────────────────────────────

/**
 * All health categories the engine can analyze.
 * Future modules add their category here — no architecture changes required.
 */
export type HealthCategoryId =
  | 'storage'
  | 'performance'
  | 'memory'
  | 'startup'
  | 'browser'
  | 'privacy'
  | 'temp_files'
  | 'recycle_bin'
  // Placeholders for future analyzers
  | 'system_updates'
  | 'drivers'
  | 'security';

/**
 * Severity levels for issues and insights.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Confidence level for analysis results (0–1).
 * Lower confidence means the analyzer had limited data.
 */
export type Confidence = number;

/**
 * Result of analyzing a single health category.
 */
export interface CategoryResult {
  /** Category identifier. */
  categoryId: HealthCategoryId;
  /** Human-readable category name. */
  categoryName: string;
  /** Score from 0–100 (100 = perfect health). */
  score: number;
  /** Severity of the worst issue in this category. */
  severity: Severity;
  /** Issues found in this category. */
  issues: CategoryIssue[];
  /** Recommendations specific to this category. */
  recommendations: string[];
  /** Confidence in the analysis (0–1). */
  confidence: Confidence;
  /** When this result was computed. */
  analyzedAt: string;
}

/**
 * A single issue found within a health category.
 */
export interface CategoryIssue {
  /** Short issue title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Severity of this issue. */
  severity: Severity;
  /** Estimated impact on the category score (0–100). */
  impact: number;
  /** Whether this issue can be auto-fixed. */
  autoFixable: boolean;
}

// ── Overall Health Score ──────────────────────────────────────

/**
 * Health level classification.
 */
export type HealthLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

/**
 * Letter grade for health score.
 */
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Overall health score combining all categories.
 */
export interface OverallHealthScore {
  /** Weighted score from 0–100. */
  score: number;
  /** Letter grade (A–F). */
  letterGrade: LetterGrade;
  /** Health level classification. */
  level: HealthLevel;
  /** Per-category scores. */
  categoryScores: CategoryScoreEntry[];
  /** Timestamp of computation. */
  computedAt: string;
}

/**
 * A single category's contribution to the overall score.
 */
export interface CategoryScoreEntry {
  categoryId: HealthCategoryId;
  categoryName: string;
  score: number;
  /** Weight used in the overall calculation (0–1). */
  weight: number;
  /** Contribution to the overall score (score * weight). */
  contribution: number;
}

// ── Health Insights ───────────────────────────────────────────

/**
 * An intelligent insight generated from analysis.
 */
export interface HealthInsight {
  /** Unique insight ID. */
  id: string;
  /** Insight title. */
  title: string;
  /** Severity of the insight. */
  severity: Severity;
  /** Confidence in the insight (0–1). */
  confidence: Confidence;
  /** Detailed explanation. */
  explanation: string;
  /** Suggested action to address the insight. */
  suggestedAction: string;
  /** Category this insight belongs to. */
  category: HealthCategoryId;
}

// ── Recommendations ───────────────────────────────────────────

/**
 * Priority levels for recommendations.
 */
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Risk level for performing a recommendation.
 */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

/**
 * A prioritized, data-driven recommendation.
 */
export interface HealthRecommendation {
  /** Unique recommendation ID. */
  id: string;
  /** Recommendation title. */
  title: string;
  /** Priority level. */
  priority: RecommendationPriority;
  /** Estimated benefit (0–100 scale, how much it improves the score). */
  estimatedBenefit: number;
  /** Estimated time to perform (seconds). */
  estimatedTimeSeconds: number;
  /** Risk level of performing this action. */
  riskLevel: RiskLevel;
  /** Reason why this recommendation was generated. */
  reason: string;
  /** Modules affected by this recommendation. */
  affectedModules: string[];
  /** Required capability/feature key (for licensing gates). */
  requiredCapability: string | null;
  /** Category this recommendation targets. */
  category: HealthCategoryId;
}

// ── Trend Analysis ────────────────────────────────────────────

/**
 * Trend direction.
 */
export type TrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

/**
 * Trend analysis result.
 */
export interface TrendAnalysis {
  /** Overall trend direction. */
  direction: TrendDirection;
  /** Score today. */
  todayScore: number | null;
  /** Average score over the last 7 days. */
  last7DaysAvg: number | null;
  /** Average score over the last 30 days. */
  last30DaysAvg: number | null;
  /** Score change from 7 days ago to today. */
  change7Days: number | null;
  /** Score change from 30 days ago to today. */
  change30Days: number | null;
  /** Per-category trends. */
  categoryTrends: CategoryTrend[];
  /** Timestamp of analysis. */
  analyzedAt: string;
}

/**
 * Trend for a single category.
 */
export interface CategoryTrend {
  categoryId: HealthCategoryId;
  direction: TrendDirection;
  todayScore: number | null;
  previousScore: number | null;
  change: number | null;
}

// ── Health Report ─────────────────────────────────────────────

/**
 * Complete health report produced by the engine.
 */
export interface HealthReport {
  /** Report ID. */
  id: string;
  /** Timestamp of report generation. */
  generatedAt: string;
  /** Overall health score. */
  overall: OverallHealthScore;
  /** Per-category analysis results. */
  categories: CategoryResult[];
  /** Generated insights. */
  insights: HealthInsight[];
  /** Prioritized recommendations. */
  recommendations: HealthRecommendation[];
  /** Trend analysis. */
  trends: TrendAnalysis | null;
  /** Whether cached results were used. */
  fromCache: boolean;
}

// ── Analysis Input ────────────────────────────────────────────

/**
 * Input data for the health analysis.
 * The engine reads this but never modifies any source.
 */
export interface HealthAnalysisInput {
  /** Current system metrics from the dashboard service. */
  metrics: DashboardMetrics | null;
  /** Execution history records. */
  executionHistory: ExecutionRecord[];
  /** Execution statistics. */
  executionStatistics: ExecutionStatistics;
}

// ── Category Weights ──────────────────────────────────────────

/**
 * Weight configuration for each category in the overall score.
 * Weights must sum to 1.0.
 */
export type CategoryWeights = Record<HealthCategoryId, number>;

/**
 * Default category weights.
 *
 *   Storage:        20%
 *   Performance:    20%
 *   Memory:         15%
 *   Startup:        15%
 *   Browser:        10%
 *   Privacy:        10%
 *   System:         10%  (system_updates + drivers + security combined)
 *
 * Placeholder categories (system_updates, drivers, security) share
 * the system weight. When they produce results, they each get a
 * portion of the system allocation.
 */
export const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
  storage: 0.20,
  performance: 0.20,
  memory: 0.15,
  startup: 0.15,
  browser: 0.10,
  privacy: 0.10,
  temp_files: 0.05,
  recycle_bin: 0.03,
  system_updates: 0.02,
  drivers: 0.02,
  security: 0.03,
};

// ── Events ────────────────────────────────────────────────────

export type HealthEventType =
  | 'health_analysis_started'
  | 'category_completed'
  | 'health_score_updated'
  | 'recommendations_generated'
  | 'analysis_completed'
  | 'analysis_failed';

export interface HealthEventPayloads {
  health_analysis_started: { timestamp: string };
  category_completed: { categoryId: HealthCategoryId; result: CategoryResult };
  health_score_updated: { score: OverallHealthScore };
  recommendations_generated: { recommendations: HealthRecommendation[] };
  analysis_completed: { report: HealthReport };
  analysis_failed: { error: string; timestamp: string };
}

export type HealthEventListener = (payload: unknown) => void;

// ── Category Analyzer Interface ───────────────────────────────

/**
 * Interface for category analyzers.
 * Future modules implement this to plug into the engine.
 */
export interface CategoryAnalyzer {
  /** Category this analyzer handles. */
  readonly categoryId: HealthCategoryId;
  /** Human-readable name. */
  readonly categoryName: string;
  /** Analyze the category and return a result. */
  analyze(input: HealthAnalysisInput): CategoryResult;
}

// ── Helper Functions ──────────────────────────────────────────

/**
 * Map a numeric score to a health level.
 */
export function scoreToLevel(score: number): HealthLevel {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 25) return 'poor';
  return 'critical';
}

/**
 * Map a numeric score to a letter grade.
 */
export function scoreToLetter(score: number): LetterGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Map a severity string to a numeric priority for sorting.
 */
export function severityToPriority(severity: Severity): number {
  switch (severity) {
    case 'critical': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    case 'info': return 4;
  }
}

/**
 * Clamp a value to [0, 100].
 */
export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}
