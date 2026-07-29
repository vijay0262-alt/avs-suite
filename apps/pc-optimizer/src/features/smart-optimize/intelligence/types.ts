/**
 * Smart Optimize 2.0 — Automation Intelligence Engine Type Definitions
 *
 * EPIC 4 PHASE A PART 6 — Automation Intelligence Engine.
 *
 * Analyzes historical automation outcomes, user decisions, and optimization
 * results to continuously improve future automation recommendations.
 * Every recommendation is deterministic and fully explainable.
 * Does NOT use machine learning. Does NOT execute optimizations.
 *
 * Architecture:
 *   Automation History → Pattern Analysis → Outcome Analysis →
 *   Decision Analysis → Success Prediction → Recommendation Ranking →
 *   Updated Automation Plan
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every insight, recommendation,
 *    and prediction must be traceable back to historical evidence, with
 *    supporting evidence and a confidence score."
 */
import type { RiskLevel, RecommendationPriority } from '../planner/types';
import type { SystemState } from '../adaptive/types';
import type {
  AutomationHistoryEntry,
  AutomationTriggerType,
  AutomationActionType,
} from '../automation/types';
import type { MaintenanceHistoryEntry, MaintenanceType } from '../maintenance/types';
import type { AdaptiveHistoryEntry } from '../adaptive/types';

// Re-export for convenience
export type { RiskLevel, RecommendationPriority } from '../planner/types';
export type { SystemState } from '../adaptive/types';
export type {
  AutomationHistoryEntry,
  AutomationTriggerType,
  AutomationActionType,
} from '../automation/types';
export type { MaintenanceHistoryEntry, MaintenanceType } from '../maintenance/types';
export type { AdaptiveHistoryEntry } from '../adaptive/types';

// ── Intelligence Input ───────────────────────────────────────

export interface IntelligenceInput {
  automationHistory: AutomationHistoryEntry[];
  maintenanceHistory: MaintenanceHistoryEntry[];
  adaptiveHistory: AdaptiveHistoryEntry[];
  systemState: SystemState;
  deviceProfileType: string;
  healthScore: number;
  futureMetadata: Record<string, unknown>;
}

// ── Pattern Detection ────────────────────────────────────────

export type PatternType =
  | 'frequently_accepted'
  | 'frequently_rejected'
  | 'best_maintenance_windows'
  | 'most_effective_profiles'
  | 'most_successful_strategies'
  | 'most_beneficial_recommendations'
  | 'recurring_problems'
  | 'recurring_improvements'
  | 'frequently_deferred'
  | 'frequently_cancelled'
  | 'future_pattern';

export interface DetectedPattern {
  id: string;
  type: PatternType;
  name: string;
  description: string;
  confidence: number;
  frequency: number;
  supportingEvidence: Evidence[];
  affectedRules: string[];
  affectedTriggers: AutomationTriggerType[];
  affectedActions: AutomationActionType[];
  metadata: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface PatternAnalysisResult {
  patterns: DetectedPattern[];
  analyzedAt: string;
  totalEntriesAnalyzed: number;
  futureMetadata: Record<string, unknown>;
}

// ── Outcome Analysis ─────────────────────────────────────────

export interface OutcomeMetrics {
  acceptanceRate: number;
  completionRate: number;
  successRate: number;
  failureRate: number;
  rollbackFrequency: number;
  averageBenefit: number;
  averageConfidence: number;
  totalSuccessful: number;
  totalFailed: number;
  totalRolledBack: number;
  byOutcome: Record<string, number>;
  byTrigger: Record<string, number>;
  byAction: Record<string, number>;
  futureMetadata: Record<string, unknown>;
}

export interface OutcomeAnalysisResult {
  automationMetrics: OutcomeMetrics;
  maintenanceMetrics: OutcomeMetrics;
  adaptiveMetrics: OutcomeMetrics;
  overallSuccessRate: number;
  trends: OutcomeTrend[];
  analyzedAt: string;
  futureMetadata: Record<string, unknown>;
}

export type TrendDirection = 'improving' | 'declining' | 'stable' | 'unknown';

export interface OutcomeTrend {
  id: string;
  metric: string;
  direction: TrendDirection;
  changeRate: number;
  currentValue: number;
  previousValue: number;
  supportingEvidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Decision Analysis ────────────────────────────────────────

export interface DecisionMetrics {
  totalApprovals: number;
  totalRejections: number;
  totalIgnored: number;
  totalCancelled: number;
  approvalRate: number;
  rejectionRate: number;
  ignoreRate: number;
  cancelRate: number;
  byRule: Record<string, DecisionBreakdown>;
  byTrigger: Record<string, DecisionBreakdown>;
  byRiskLevel: Record<string, DecisionBreakdown>;
  futureMetadata: Record<string, unknown>;
}

export interface DecisionBreakdown {
  approved: number;
  rejected: number;
  ignored: number;
  cancelled: number;
  total: number;
  approvalRate: number;
}

export interface DecisionAnalysisResult {
  metrics: DecisionMetrics;
  insights: string[];
  analyzedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Success Prediction ───────────────────────────────────────

export interface SuccessPrediction {
  id: string;
  predictedSuccessRate: number;
  confidence: number;
  basedOnSamples: number;
  supportingEvidence: Evidence[];
  factors: PredictionFactor[];
  riskLevel: RiskLevel;
  futureMetadata: Record<string, unknown>;
}

export interface PredictionFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number;
  description: string;
}

export type PredictionContext = {
  ruleId?: string;
  triggerType?: AutomationTriggerType;
  actionType?: AutomationActionType;
  maintenanceType?: MaintenanceType;
  riskLevel?: RiskLevel;
  deviceProfileType?: string;
  healthScore?: number;
  timeOfDay?: number;
  futureMetadata: Record<string, unknown>;
};

// ── Recommendation ───────────────────────────────────────────

export interface IntelligenceRecommendation {
  id: string;
  reason: string;
  supportingEvidence: Evidence[];
  confidence: number;
  historicalSuccess: number;
  expectedBenefit: number;
  risk: RiskLevel;
  priority: RecommendationPriority;
  affectedProfiles: string[];
  affectedRules: string[];
  successPrediction: SuccessPrediction | null;
  alternativeRecommendation: IntelligenceRecommendation | null;
  rank: number;
  rankScore: number;
  futureMetadata: Record<string, unknown>;
}

export interface RecommendationResult {
  recommendations: IntelligenceRecommendation[];
  rankedAt: string;
  totalConsidered: number;
  futureMetadata: Record<string, unknown>;
}

// ── Ranking ──────────────────────────────────────────────────

export type RankingFactor =
  | 'historical_success'
  | 'benefit'
  | 'risk'
  | 'prediction_confidence'
  | 'health_score'
  | 'user_preference'
  | 'automation_history'
  | 'device_profile'
  | 'future_factor';

export interface RankingWeight {
  factor: RankingFactor;
  weight: number;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface RankingResult {
  ranked: IntelligenceRecommendation[];
  scores: Record<string, number>;
  rankedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Insights ─────────────────────────────────────────────────

export type InsightType =
  | 'most_valuable_rule'
  | 'least_useful_rule'
  | 'recommended_new_rule'
  | 'frequently_deferred_tasks'
  | 'optimization_opportunities'
  | 'automation_effectiveness'
  | 'future_improvements'
  | 'prediction_accuracy'
  | 'rule_effectiveness'
  | 'health_trend';

export interface IntelligenceInsight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  confidence: number;
  impact: number;
  supportingEvidence: Evidence[];
  actionable: boolean;
  suggestedActions: string[];
  futureMetadata: Record<string, unknown>;
}

export interface InsightResult {
  insights: IntelligenceInsight[];
  generatedAt: string;
  totalInsights: number;
  futureMetadata: Record<string, unknown>;
}

// ── Evidence ─────────────────────────────────────────────────

export interface Evidence {
  source: string;
  metric: string;
  value: number | string | boolean;
  timestamp: string;
  description: string;
  futureMetadata: Record<string, unknown>;
}

// ── Statistics ───────────────────────────────────────────────

export interface IntelligenceStatistics {
  totalHistoryEntries: number;
  totalAutomationEntries: number;
  totalMaintenanceEntries: number;
  totalAdaptiveEntries: number;
  overallSuccessRate: number;
  overallAcceptanceRate: number;
  averageConfidence: number;
  averageBenefit: number;
  patternsDetected: number;
  insightsGenerated: number;
  recommendationsGenerated: number;
  predictionsMade: number;
  byTriggerType: Record<string, number>;
  byOutcome: Record<string, number>;
  byActionType: Record<string, number>;
  byMaintenanceType: Record<string, number>;
  topRules: RuleStatistic[];
  lastAnalysisAt: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface RuleStatistic {
  ruleId: string;
  totalTriggers: number;
  successRate: number;
  approvalRate: number;
  averageConfidence: number;
  averageBenefit: number;
  futureMetadata: Record<string, unknown>;
}

// ── Learning Result ──────────────────────────────────────────

export interface LearningResult {
  patterns: DetectedPattern[];
  outcomes: OutcomeAnalysisResult;
  decisions: DecisionAnalysisResult;
  predictions: SuccessPrediction[];
  recommendations: RecommendationResult;
  insights: InsightResult;
  statistics: IntelligenceStatistics;
  analyzedAt: string;
  analysisDurationMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Validation ───────────────────────────────────────────────

export interface IntelligenceValidationResult {
  valid: boolean;
  errors: IntelligenceValidationError[];
  warnings: IntelligenceValidationWarning[];
}

export interface IntelligenceValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface IntelligenceValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Events ───────────────────────────────────────────────────

export type IntelligenceEventType =
  | 'history_analyzed'
  | 'patterns_detected'
  | 'insights_generated'
  | 'recommendations_ranked'
  | 'prediction_updated'
  | 'automation_intelligence_updated';

export interface IntelligenceEvent {
  type: IntelligenceEventType;
  timestamp: string;
  data: unknown;
}

export type IntelligenceEventListener = (event: IntelligenceEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface IntelligenceConfiguration {
  configVersion: string;
  rankingWeights: RankingWeight[];
  patternRules: PatternRule[];
  predictionRules: PredictionRule[];
  historyRetention: HistoryRetentionConfig;
  featureFlags: IntelligenceFeatureFlags;
  enableEvents: boolean;
  maxHistoryEntries: number;
  analysisIntervalMs: number;
  minSamplesForPrediction: number;
  minConfidenceThreshold: number;
  futureMetadata: Record<string, unknown>;
}

export interface PatternRule {
  id: string;
  type: PatternType;
  name: string;
  description: string;
  minFrequency: number;
  minConfidence: number;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface PredictionRule {
  id: string;
  name: string;
  description: string;
  factor: RankingFactor;
  weight: number;
  minSamples: number;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface HistoryRetentionConfig {
  maxAutomationEntries: number;
  maxMaintenanceEntries: number;
  maxAdaptiveEntries: number;
  maxAge: number;
  futureMetadata: Record<string, unknown>;
}

export interface IntelligenceFeatureFlags {
  enablePatternDetection: boolean;
  enableOutcomeAnalysis: boolean;
  enableDecisionAnalysis: boolean;
  enableSuccessPrediction: boolean;
  enableRanking: boolean;
  enableRecommendations: boolean;
  enableInsights: boolean;
  enableStatistics: boolean;
  enableHistoryAnalysis: boolean;
  enableIncrementalUpdates: boolean;
  futureFlags: Record<string, boolean>;
}

// ── Provider Plugin (Extensibility) ──────────────────────────

export interface PatternAnalyzerPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getPatternType(): PatternType;
  analyze(input: IntelligenceInput): DetectedPattern | null;
}

export interface OutcomeAnalyzerPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  analyze(input: IntelligenceInput): OutcomeMetrics | null;
}

export interface SuccessPredictorPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  predict(context: PredictionContext, input: IntelligenceInput): SuccessPrediction | null;
}

export interface RankingPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getFactor(): RankingFactor;
  score(recommendation: IntelligenceRecommendation, input: IntelligenceInput): number;
}

export interface RecommendationPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  generate(input: IntelligenceInput): IntelligenceRecommendation | null;
}

export interface InsightPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getInsightType(): InsightType;
  generate(input: IntelligenceInput): IntelligenceInsight | null;
}

// ── Helper Functions ─────────────────────────────────────────

export function createDefaultIntelligenceConfiguration(): IntelligenceConfiguration {
  return {
    configVersion: '1.0.0',
    rankingWeights: [
      { factor: 'historical_success', weight: 0.25, enabled: true, futureMetadata: {} },
      { factor: 'benefit', weight: 0.20, enabled: true, futureMetadata: {} },
      { factor: 'risk', weight: 0.15, enabled: true, futureMetadata: {} },
      { factor: 'prediction_confidence', weight: 0.15, enabled: true, futureMetadata: {} },
      { factor: 'health_score', weight: 0.10, enabled: true, futureMetadata: {} },
      { factor: 'user_preference', weight: 0.05, enabled: true, futureMetadata: {} },
      { factor: 'automation_history', weight: 0.05, enabled: true, futureMetadata: {} },
      { factor: 'device_profile', weight: 0.05, enabled: true, futureMetadata: {} },
    ],
    patternRules: [
      { id: 'pr_frequently_accepted', type: 'frequently_accepted', name: 'Frequently Accepted Plans', description: 'Rules frequently accepted by users', minFrequency: 3, minConfidence: 0.6, enabled: true, futureMetadata: {} },
      { id: 'pr_frequently_rejected', type: 'frequently_rejected', name: 'Frequently Rejected Plans', description: 'Rules frequently rejected by users', minFrequency: 3, minConfidence: 0.6, enabled: true, futureMetadata: {} },
      { id: 'pr_best_maintenance_windows', type: 'best_maintenance_windows', name: 'Best Maintenance Windows', description: 'Time windows with highest maintenance success', minFrequency: 2, minConfidence: 0.5, enabled: true, futureMetadata: {} },
      { id: 'pr_most_effective_profiles', type: 'most_effective_profiles', name: 'Most Effective Profiles', description: 'Device profiles with best outcomes', minFrequency: 2, minConfidence: 0.5, enabled: true, futureMetadata: {} },
      { id: 'pr_most_successful_strategies', type: 'most_successful_strategies', name: 'Most Successful Strategies', description: 'Optimization strategies with highest success', minFrequency: 2, minConfidence: 0.5, enabled: true, futureMetadata: {} },
      { id: 'pr_most_beneficial_recommendations', type: 'most_beneficial_recommendations', name: 'Most Beneficial Recommendations', description: 'Recommendations with highest measured benefit', minFrequency: 2, minConfidence: 0.5, enabled: true, futureMetadata: {} },
      { id: 'pr_recurring_problems', type: 'recurring_problems', name: 'Recurring Problems', description: 'Issues that recur despite optimization', minFrequency: 3, minConfidence: 0.5, enabled: true, futureMetadata: {} },
      { id: 'pr_recurring_improvements', type: 'recurring_improvements', name: 'Recurring Improvements', description: 'Improvements that consistently appear', minFrequency: 3, minConfidence: 0.5, enabled: true, futureMetadata: {} },
      { id: 'pr_frequently_deferred', type: 'frequently_deferred', name: 'Frequently Deferred Tasks', description: 'Tasks frequently deferred by automation', minFrequency: 3, minConfidence: 0.5, enabled: true, futureMetadata: {} },
      { id: 'pr_frequently_cancelled', type: 'frequently_cancelled', name: 'Frequently Cancelled Tasks', description: 'Tasks frequently cancelled', minFrequency: 3, minConfidence: 0.5, enabled: true, futureMetadata: {} },
    ],
    predictionRules: [
      { id: 'pred_success', name: 'Historical Success', description: 'Predict based on historical success rate', factor: 'historical_success', weight: 0.30, minSamples: 3, enabled: true, futureMetadata: {} },
      { id: 'pred_benefit', name: 'Expected Benefit', description: 'Predict based on expected benefit', factor: 'benefit', weight: 0.25, minSamples: 2, enabled: true, futureMetadata: {} },
      { id: 'pred_risk', name: 'Risk Factor', description: 'Predict based on risk level', factor: 'risk', weight: 0.20, minSamples: 2, enabled: true, futureMetadata: {} },
      { id: 'pred_confidence', name: 'Prediction Confidence', description: 'Predict based on prediction confidence', factor: 'prediction_confidence', weight: 0.15, minSamples: 2, enabled: true, futureMetadata: {} },
      { id: 'pred_health', name: 'Health Score', description: 'Predict based on health score', factor: 'health_score', weight: 0.10, minSamples: 1, enabled: true, futureMetadata: {} },
    ],
    historyRetention: {
      maxAutomationEntries: 500,
      maxMaintenanceEntries: 500,
      maxAdaptiveEntries: 500,
      maxAge: 30,
      futureMetadata: {},
    },
    featureFlags: {
      enablePatternDetection: true,
      enableOutcomeAnalysis: true,
      enableDecisionAnalysis: true,
      enableSuccessPrediction: true,
      enableRanking: true,
      enableRecommendations: true,
      enableInsights: true,
      enableStatistics: true,
      enableHistoryAnalysis: true,
      enableIncrementalUpdates: true,
      futureFlags: {},
    },
    enableEvents: true,
    maxHistoryEntries: 1000,
    analysisIntervalMs: 30000,
    minSamplesForPrediction: 3,
    minConfidenceThreshold: 0.3,
    futureMetadata: {},
  };
}

export function generateIntelligenceId(): string {
  return `intel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generatePatternId(): string {
  return `pattern_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generatePredictionId(): string {
  return `pred_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateRecommendationId(): string {
  return `recom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateInsightId(): string {
  return `insight_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateTrendId(): string {
  return `trend_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateRuleStatId(): string {
  return `rulestat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function riskToScore(risk: RiskLevel): number {
  const scores: Record<RiskLevel, number> = { none: 0, low: 0.2, medium: 0.5, high: 0.8, critical: 1.0 };
  return scores[risk] ?? 0;
}

export function priorityToScore(priority: RecommendationPriority): number {
  const scores: Record<RecommendationPriority, number> = { critical: 1.0, high: 0.8, medium: 0.5, low: 0.2, informational: 0.1 };
  return scores[priority] ?? 0.5;
}

export function scoreToRisk(score: number): RiskLevel {
  if (score >= 0.8) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.2) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

export function scoreToPriority(score: number): RecommendationPriority {
  if (score >= 0.9) return 'critical';
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  if (score >= 0.1) return 'low';
  return 'informational';
}

export function createDefaultIntelligenceInput(): IntelligenceInput {
  return {
    automationHistory: [],
    maintenanceHistory: [],
    adaptiveHistory: [],
    systemState: {
      cpuUsage: 0,
      memoryUsage: 0,
      diskActivity: 0,
      batteryLevel: null,
      powerSource: 'unknown',
      userActive: true,
      fullScreenApp: false,
      gamingMode: false,
      windowsUpdateActive: false,
      networkActivity: 0,
      thermalState: 'normal',
      storagePressure: 0,
      isIdle: false,
      timestamp: new Date().toISOString(),
    },
    deviceProfileType: 'general',
    healthScore: 50,
    futureMetadata: {},
  };
}
