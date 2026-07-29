/**
 * AI Prediction Engine — Type Definitions.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every prediction must be
 *    evidence-based, traceable back to historical data and trend analysis,
 *    with a confidence score."
 *
 * The Prediction Engine forecasts future system behavior using historical
 * context and trend analysis. It NEVER executes optimizations. It NEVER
 * modifies the system. It ONLY predicts future trends.
 *
 * Pipeline:
 *   History → Knowledge → Trend Analysis → Prediction Engine →
 *   Predictions → Future Consumers (Dashboard, AI Assistant, Automation,
 *   Reports, Notifications)
 *
 * It does NOT perform AI learning.
 * It does NOT execute optimizations.
 * It ONLY predicts future trends using historical data.
 */
import type {
  KnowledgeObject,
  KnowledgeFact,
  KnowledgeEvidence,
  KnowledgeTrend,
  TrendDataPoint,
  EvidenceDataPoint,
  ContextSnapshot,
} from '../knowledge/types';

// Re-export for convenience
export type {
  KnowledgeObject,
  KnowledgeFact,
  KnowledgeEvidence,
  KnowledgeTrend,
  TrendDataPoint,
  EvidenceDataPoint,
  ContextSnapshot,
} from '../knowledge/types';

// ── Prediction Types ─────────────────────────────────────────

export type PredictionType =
  | 'storage_capacity'
  | 'health_score_trend'
  | 'startup_growth'
  | 'browser_cache_growth'
  | 'temp_file_growth'
  | 'duplicate_file_growth'
  | 'disk_consumption'
  | 'optimization_frequency'
  | 'maintenance_requirement'
  | 'privacy_degradation'
  | 'windows_maintenance'
  | 'custom';

// ── Prediction Category ──────────────────────────────────────

export type PredictionCategory =
  | 'system'
  | 'health'
  | 'performance'
  | 'storage'
  | 'browser'
  | 'privacy'
  | 'startup'
  | 'windows'
  | 'duplicates'
  | 'security'
  | 'maintenance'
  | 'automation'
  | 'custom';

// ── Time Horizon ─────────────────────────────────────────────

export type TimeHorizon =
  | '24h'
  | '7d'
  | '30d'
  | '90d'
  | '180d'
  | '365d'
  | 'custom';

export interface TimeHorizonConfig {
  horizon: TimeHorizon;
  hours: number;
  label: string;
}

// ── Trend Type ───────────────────────────────────────────────

export type PredictionTrendType =
  | 'increasing'
  | 'decreasing'
  | 'stable'
  | 'seasonal'
  | 'unknown';

// ── Risk Level ───────────────────────────────────────────────

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

// ── Impact Level ─────────────────────────────────────────────

export type ImpactLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

// ── Prediction Status ────────────────────────────────────────

export type PredictionStatus = 'active' | 'expired' | 'fulfilled' | 'invalidated' | 'dismissed';

// ── Prediction Evidence ──────────────────────────────────────

/**
 * Every prediction MUST include evidence.
 * No prediction without evidence. The AI must never invent information.
 */
export interface PredictionEvidence {
  relatedFacts: string[];
  relatedTrends: string[];
  relatedKnowledge: string[];
  historicalDataPoints: TrendDataPoint[];
  evidence: KnowledgeEvidence;
  evidenceCount: number;
  sourceProviders: string[];
  confidence: number;
  historicalSamples: number;
  dataFreshness: number;
  modelVersion: string;
  assumptions: string[];
}

// ── Prediction ───────────────────────────────────────────────

/**
 * A structured, evidence-based prediction.
 * Never executes. Never modifies the system. Only forecasts what may happen.
 */
export interface Prediction {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: PredictionCategory;
  predictionType: PredictionType;
  currentValue: number | string;
  predictedValue: number | string;
  unit: string | null;
  predictionDate: string;
  timeHorizon: TimeHorizon;
  confidenceScore: number;
  trend: PredictionTrendType;
  trendSlope: number | null;
  riskLevel: RiskLevel;
  impactLevel: ImpactLevel;
  evidence: PredictionEvidence;
  relatedKnowledge: string[];
  relatedInsights: string[];
  generatedAt: string;
  expiresAt: string | null;
  status: PredictionStatus;
  futureMetadata: Record<string, unknown>;
}

// ── Prediction List ──────────────────────────────────────────

export interface PredictionList {
  predictions: Prediction[];
  metadata: PredictionListMetadata;
  statistics: PredictionStatistics;
}

export interface PredictionListMetadata {
  listId: string;
  knowledgeId: string;
  generatedAt: string;
  predictionVersion: string;
  generationTimeMs: number;
  totalPredictions: number;
  historicalSnapshots: number;
}

// ── Statistics ───────────────────────────────────────────────

export interface PredictionStatistics {
  totalPredictions: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  byRiskLevel: Record<string, number>;
  byTimeHorizon: Record<string, number>;
  byTrend: Record<string, number>;
  averageConfidence: number;
  criticalCount: number;
  highRiskCount: number;
  fulfilledCount: number;
  expiredCount: number;
}

// ── Validation ───────────────────────────────────────────────

export interface PredictionValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  predictionId?: string;
}

export interface PredictionValidationResult {
  valid: boolean;
  issues: PredictionValidationIssue[];
}

// ── Filters ──────────────────────────────────────────────────

export interface PredictionFilter {
  types?: PredictionType[];
  categories?: PredictionCategory[];
  riskLevels?: RiskLevel[];
  timeHorizons?: TimeHorizon[];
  minConfidence?: number;
  includeExpired?: boolean;
  custom?: (prediction: Prediction) => boolean;
}

// ── Timeline ─────────────────────────────────────────────────

export type PredictionTimelinePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface PredictionTimelineEntry {
  id: string;
  timestamp: string;
  type: 'prediction' | 'fulfillment' | 'expiration' | 'trend_change' | 'custom';
  title: string;
  description: string;
  category: PredictionCategory;
  confidence: number;
  riskLevel: RiskLevel;
  metadata: Record<string, unknown>;
}

export interface PredictionTimeline {
  entries: PredictionTimelineEntry[];
  period: PredictionTimelinePeriod;
  startDate: string;
  endDate: string;
  totalEntries: number;
}

// ── History ──────────────────────────────────────────────────

export interface PredictionHistoryEntry {
  id: string;
  predictionId: string;
  action: 'generated' | 'updated' | 'expired' | 'fulfilled' | 'invalidated' | 'dismissed';
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Accuracy Tracking ────────────────────────────────────────

export interface PredictionAccuracyRecord {
  predictionId: string;
  predictionType: PredictionType;
  predictedValue: number | string;
  actualValue: number | string;
  variance: number;
  accuracyScore: number;
  generatedAt: string;
  fulfilledAt: string;
}

// ── Configuration ────────────────────────────────────────────

export interface ConfidenceRules {
  minSamples: number;
  minDataFreshnessHours: number;
  highConfidenceThreshold: number;
  mediumConfidenceThreshold: number;
  lowConfidenceThreshold: number;
  insufficientDataThreshold: number;
}

export interface RiskRules {
  noneThreshold: number;
  lowThreshold: number;
  mediumThreshold: number;
  highThreshold: number;
  criticalThreshold: number;
}

export interface ExpirationConfig {
  defaultExpirationHours: number;
  shortTermExpirationHours: number;
  longTermExpirationHours: number;
}

export interface ModelSettings {
  modelVersion: string;
  minHistoricalSnapshots: number;
  maxExtrapolationDays: number;
  seasonalDetectionEnabled: boolean;
  outlierRemovalEnabled: boolean;
}

export interface PredictionConfiguration {
  predictionVersion: string;
  enabledTypes: PredictionType[];
  timeHorizons: TimeHorizonConfig[];
  confidenceRules: ConfidenceRules;
  riskRules: RiskRules;
  expirationConfig: ExpirationConfig;
  modelSettings: ModelSettings;
  maxPredictions: number;
  enableHistory: boolean;
  maxHistoryEntries: number;
  enableTimeline: boolean;
  maxTimelineEntries: number;
  enableAccuracyTracking: boolean;
  maxAccuracyRecords: number;
  minConfidenceThreshold: number;
}

// ── Events ───────────────────────────────────────────────────

export type PredictionEventType =
  | 'prediction_generated'
  | 'prediction_updated'
  | 'prediction_expired'
  | 'prediction_failed'
  | 'timeline_updated';

export type PredictionEventListener = (payload: unknown) => void;

// ── Prediction Provider Plugin (Extensibility) ───────────────

/**
 * Future prediction providers register without modifying existing code.
 * No hardcoded module logic. Only registration.
 */
export interface PredictionProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  generatePredictions(
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    config: PredictionConfiguration,
  ): Prediction[];
}

// ── Trend Analysis Result ────────────────────────────────────

export interface TrendAnalysisResult {
  factId: string;
  factName: string;
  direction: PredictionTrendType;
  slope: number | null;
  intercept: number | null;
  rSquared: number | null;
  variability: number | null;
  dataPoints: TrendDataPoint[];
  sampleCount: number;
  confidence: number;
  projectedValues: ProjectedValue[];
}

export interface ProjectedValue {
  timestamp: string;
  value: number;
  confidence: number;
}

// ── Personalization Placeholders ─────────────────────────────

/**
 * Placeholders for future personalization.
 * Do NOT implement learning yet. Only structure.
 */
export interface PersonalizationContext {
  deviceProfile: Record<string, unknown> | null;
  userBehavior: Record<string, unknown> | null;
  optimizationHabits: Record<string, unknown> | null;
  preferredModules: string[] | null;
  notificationPreferences: Record<string, unknown> | null;
}

// ── Helper Functions ─────────────────────────────────────────

export function generatePredictionId(type: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `pred_${type}_${slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generatePredictionListId(): string {
  return `predlist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generatePredictionTimelineEntryId(): string {
  return `predtl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generatePredictionHistoryId(): string {
  return `predhist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateAccuracyRecordId(predictionId: string): string {
  return `acc_${predictionId}_${Date.now().toString(36)}`;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createPredictionEvidence(
  facts: KnowledgeFact[],
  trends: KnowledgeTrend[],
  knowledgeIds: string[],
  historicalDataPoints: TrendDataPoint[],
  sourceProviders: string[],
  confidence: number,
  historicalSamples: number,
  dataFreshness: number,
  modelVersion: string,
  assumptions: string[],
): PredictionEvidence {
  const allEvidence: KnowledgeEvidence[] = [
    ...facts.map((f) => f.evidence),
    ...trends.map((t) => t.evidence),
  ];
  const evidenceDataPoints: EvidenceDataPoint[] = allEvidence.flatMap((e) => e.dataPoints);
  const providers = [...new Set([...sourceProviders, ...allEvidence.flatMap((e) => e.sourceProviders)])];
  const contextTimestamp = allEvidence.length > 0
    ? allEvidence[0]!.contextTimestamp
    : new Date().toISOString();

  return {
    relatedFacts: facts.map((f) => f.id),
    relatedTrends: trends.map((t) => t.id),
    relatedKnowledge: knowledgeIds,
    historicalDataPoints,
    evidence: {
      statement: `Based on ${historicalSamples} historical samples, ${facts.length} facts, ${trends.length} trends`,
      dataPoints: evidenceDataPoints,
      sourceProviders: providers,
      contextTimestamp,
      confidence: clampScore(confidence),
    },
    evidenceCount: evidenceDataPoints.length + historicalDataPoints.length,
    sourceProviders: providers,
    confidence: clampScore(confidence),
    historicalSamples,
    dataFreshness,
    modelVersion,
    assumptions,
  };
}

export function getTimeHorizonHours(horizon: TimeHorizon): number {
  const map: Record<TimeHorizon, number> = {
    '24h': 24,
    '7d': 24 * 7,
    '30d': 24 * 30,
    '90d': 24 * 90,
    '180d': 24 * 180,
    '365d': 24 * 365,
    custom: 0,
  };
  return map[horizon] ?? 0;
}

export function getTimeHorizonLabel(horizon: TimeHorizon): string {
  const map: Record<TimeHorizon, string> = {
    '24h': '24 Hours',
    '7d': '7 Days',
    '30d': '30 Days',
    '90d': '90 Days',
    '180d': '180 Days',
    '365d': '365 Days',
    custom: 'Custom',
  };
  return map[horizon] ?? 'Unknown';
}

export function formatDateForHorizon(horizon: TimeHorizon): string {
  const hours = getTimeHorizonHours(horizon);
  if (hours === 0) return new Date().toISOString();
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
