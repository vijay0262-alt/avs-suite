/**
 * AI Predictive Health Engine — Type Definitions
 *
 * EPIC 5 — AI Predictive Health
 *
 * All types for the AI Predictive Health Engine. The engine consumes
 * historical trend data from existing modules (HardwareTrendHistory,
 * ProcessHistory, OptimizationHistory, etc.) and produces evidence-based
 * forecasts of future system health.
 *
 * Core principle: Every prediction must be supported by measurable
 * historical evidence. Never invent predictions. Never hallucinate.
 *
 * The engine never queries hardware directly — it only consumes data
 * already collected by existing modules.
 */

// ── Forecast Target & Domain ─────────────────────────────────────────

export type ForecastDomain =
  | 'cpu'
  | 'gpu'
  | 'ram'
  | 'storage'
  | 'battery'
  | 'cooling'
  | 'system_health'
  | 'startup_performance'
  | 'memory_pressure'
  | 'thermal'
  | 'optimization_effectiveness'
  | 'reliability';

export type TrendBehavior =
  | 'gradual_degradation'
  | 'rapid_degradation'
  | 'improving'
  | 'stable'
  | 'abnormal'
  | 'repeated_failures'
  | 'resource_exhaustion'
  | 'storage_growth'
  | 'battery_wear'
  | 'temperature_increase'
  | 'unknown';

export type PredictionRisk = 'none' | 'low' | 'moderate' | 'high' | 'severe';

export type PredictionUrgency = 'immediate' | 'soon' | 'scheduled' | 'monitoring' | 'none';

export type ConfidenceLabel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

export type ActionabilityLevel = 'actionable' | 'informational' | 'monitoring_only';

// ── Historical Data Input ────────────────────────────────────────────

/**
 * A single historical data point consumed by the predictive engine.
 * Unified format from all source modules.
 */
export interface HistoricalDataPoint {
  timestamp: number;
  domain: ForecastDomain;
  metric: string;
  value: number;
  unit: string;
  source: string;
  metadata?: Record<string, unknown>;
}

/**
 * A collection of historical data points for a single domain/metric.
 */
export interface HistoricalSeries {
  domain: ForecastDomain;
  metric: string;
  unit: string;
  source: string;
  dataPoints: HistoricalDataPoint[];
  firstTimestamp: number;
  lastTimestamp: number;
  duration: number;
  pointCount: number;
}

/**
 * Input bundle from all source modules.
 * The predictive engine consumes this — it never queries hardware directly.
 */
export interface PredictionInput {
  hardwareTrends: HistoricalSeries[];
  processTrends: HistoricalSeries[];
  optimizationHistory: OptimizationHistoryEntry[];
  healthScores: HealthScorePoint[];
  storageData: StorageDataPoint[];
  startupData: StartupDataPoint[];
  timestamp: number;
}

export interface OptimizationHistoryEntry {
  timestamp: number;
  actionsPerformed: number;
  healthScoreBefore: number;
  healthScoreAfter: number;
  storageRecoveredMB: number;
  ramRecoveredMB: number;
}

export interface HealthScorePoint {
  timestamp: number;
  healthScore: number;
  source: string;
}

export interface StorageDataPoint {
  timestamp: number;
  totalCapacityMB: number;
  usedSpaceMB: number;
  freeSpaceMB: number;
  healthPercent: number;
  drive: string;
}

export interface StartupDataPoint {
  timestamp: number;
  startupTimeSeconds: number;
  startupItemCount: number;
}

// ── Trend Analysis ───────────────────────────────────────────────────

export interface TrendAnalysis {
  domain: ForecastDomain;
  metric: string;
  behavior: TrendBehavior;
  slope: number;
  slopeUnit: string;
  rSquared: number;
  changePercent: number;
  duration: number;
  dataPointCount: number;
  firstValue: number;
  lastValue: number;
  projectedValue: number | null;
  projectionTimestamp: number | null;
  isStatisticallySignificant: boolean;
}

// ── Prediction ───────────────────────────────────────────────────────

export interface Prediction {
  id: string;
  domain: ForecastDomain;
  title: string;
  summary: string;
  description: string;
  behavior: TrendBehavior;
  currentValue: number;
  currentValueUnit: string;
  projectedValue: number;
  projectedValueUnit: string;
  projectionTimestamp: number;
  projectionHorizonDays: number;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  risk: PredictionRisk;
  urgency: PredictionUrgency;
  actionability: ActionabilityLevel;
  evidence: PredictionEvidence[];
  historicalSamples: number;
  trendStrength: number;
  uncertainty: number;
  recommendation: PredictionRecommendation | null;
  explanation: PredictionExplanation | null;
  createdAt: number;
  expiresAt: number;
}

export interface PredictionEvidence {
  source: string;
  metric: string;
  value: string;
  unit: string;
  timestamp: number;
  description: string;
}

// ── Forecast Result ──────────────────────────────────────────────────

export interface Forecast {
  id: string;
  domain: ForecastDomain;
  title: string;
  predictions: Prediction[];
  overallTrend: TrendBehavior;
  overallConfidence: number;
  overallRisk: PredictionRisk;
  generatedAt: number;
  validUntil: number;
  dataSources: string[];
}

export interface HealthForecast extends Forecast {
  domain: 'system_health';
  projectedHealthScore: number;
  healthScoreTrend: TrendBehavior;
  estimatedTimeToThreshold: number | null;
  thresholdValue: number;
}

export interface StorageForecast extends Forecast {
  domain: 'storage';
  projectedFreeSpaceMB: number;
  estimatedTimeToFull: number | null;
  growthRateMBPerDay: number;
  drivesAtRisk: string[];
}

export interface BatteryForecast extends Forecast {
  domain: 'battery';
  projectedHealthPercent: number;
  estimatedTimeToReplacement: number | null;
  wearRatePerMonth: number;
  currentCycleEstimate: number | null;
}

export interface ThermalForecast extends Forecast {
  domain: 'thermal';
  projectedIdleTempC: number;
  projectedLoadTempC: number;
  tempIncreaseRatePerMonth: number;
  throttlingRisk: PredictionRisk;
}

export interface MemoryForecast extends Forecast {
  domain: 'memory_pressure';
  projectedUsageMB: number;
  projectedPressurePercent: number;
  pressureIncreaseRatePerMonth: number;
  exhaustionRisk: PredictionRisk;
}

export interface PerformanceForecast extends Forecast {
  domain: 'startup_performance';
  projectedStartupTimeSeconds: number;
  startupTimeIncreasePerMonth: number;
  degradationRate: number;
}

export interface ReliabilityForecast extends Forecast {
  domain: 'reliability';
  projectedReliabilityScore: number;
  failureRiskAssessment: FailureRiskAssessment | null;
  predictedFailureComponents: string[];
}

export interface FailureRiskAssessment {
  overallRisk: PredictionRisk;
  componentRisks: ComponentFailureRisk[];
  systemRiskFactors: string[];
  mitigatingFactors: string[];
  estimatedTimeToFailure: string | null;
  recommendedPreventiveActions: string[];
}

export interface ComponentFailureRisk {
  component: string;
  domain: ForecastDomain;
  risk: PredictionRisk;
  failureProbability: number;
  estimatedTimeToFailure: string | null;
  primaryConcern: string;
}

// ── Prediction Explanation ───────────────────────────────────────────

export interface PredictionExplanation {
  predictionId: string;
  whatIsPredicted: string;
  why: string;
  supportingEvidence: string;
  howConfident: string;
  whatUserShouldDo: string;
  whatHappensIfIgnored: string;
  uncertaintyFactors: string[];
}

// ── Prediction Recommendation ────────────────────────────────────────

export interface PredictionRecommendation {
  predictionId: string;
  action: string;
  urgency: PredictionUrgency;
  estimatedBenefit: string;
  canAutomate: boolean;
  requiresUserAction: boolean;
  estimatedCompletionTimeMinutes: number;
  preventiveActions: string[];
}

// ── Dashboard ────────────────────────────────────────────────────────

export interface PredictionDashboardData {
  summary: PredictionDashboardSummary;
  upcomingRisks: PredictionDashboardEntry[];
  improvingTrends: PredictionDashboardEntry[];
  systemTrajectory: TrajectoryPoint[];
  healthForecast: HealthForecast | null;
  storageForecast: StorageForecast | null;
  batteryForecast: BatteryForecast | null;
  performanceForecast: PerformanceForecast | null;
  lastPredictionAt: number | null;
}

export interface PredictionDashboardSummary {
  totalPredictions: number;
  highRiskPredictions: number;
  improvingTrendCount: number;
  degradingTrendCount: number;
  averageConfidence: number;
  systemTrajectory: TrendBehavior;
  nextActionNeeded: string | null;
}

export interface PredictionDashboardEntry {
  id: string;
  title: string;
  domain: ForecastDomain;
  behavior: TrendBehavior;
  risk: PredictionRisk;
  confidence: number;
  summary: string;
  projectedValue: string;
  timeToEvent: string | null;
  urgency: PredictionUrgency;
}

export interface TrajectoryPoint {
  timestamp: number;
  healthScore: number;
  projected: boolean;
}

// ── Notification ─────────────────────────────────────────────────────

export interface PredictionNotification {
  id: string;
  predictionId: string;
  title: string;
  message: string;
  risk: PredictionRisk;
  urgency: PredictionUrgency;
  confidence: number;
  actionability: ActionabilityLevel;
  createdAt: number;
  dismissed: boolean;
}

// ── Configuration ────────────────────────────────────────────────────

export interface PredictionConfiguration {
  enabled: boolean;
  minDataPoints: number;
  maxPredictionHorizonDays: number;
  minConfidence: number;
  notificationThreshold: number;
  notificationMinRisk: PredictionRisk;
  notificationMinConfidence: number;
  maxPredictions: number;
  enableHealthForecast: boolean;
  enableStorageForecast: boolean;
  enableBatteryForecast: boolean;
  enableThermalForecast: boolean;
  enableMemoryForecast: boolean;
  enablePerformanceForecast: boolean;
  enableReliabilityForecast: boolean;
  enableNotifications: boolean;
  enableLearning: boolean;
  trendAnalysisWindow: number;
  regressionThreshold: number;
  storageCriticalThresholdPercent: number;
  batteryReplacementThresholdPercent: number;
  thermalThrottlingThresholdC: number;
  memoryExhaustionThresholdPercent: number;
  startupDegradationThresholdSeconds: number;
  healthScoreWarningThreshold: number;
  healthScoreCriticalThreshold: number;
}

export const DEFAULT_PREDICTION_CONFIG: PredictionConfiguration = {
  enabled: true,
  minDataPoints: 5,
  maxPredictionHorizonDays: 365,
  minConfidence: 0.3,
  notificationThreshold: 0.7,
  notificationMinRisk: 'moderate',
  notificationMinConfidence: 0.6,
  maxPredictions: 50,
  enableHealthForecast: true,
  enableStorageForecast: true,
  enableBatteryForecast: true,
  enableThermalForecast: true,
  enableMemoryForecast: true,
  enablePerformanceForecast: true,
  enableReliabilityForecast: true,
  enableNotifications: true,
  enableLearning: true,
  trendAnalysisWindow: 90,
  regressionThreshold: 0.7,
  storageCriticalThresholdPercent: 10,
  batteryReplacementThresholdPercent: 80,
  thermalThrottlingThresholdC: 85,
  memoryExhaustionThresholdPercent: 90,
  startupDegradationThresholdSeconds: 30,
  healthScoreWarningThreshold: 70,
  healthScoreCriticalThreshold: 50,
};

// ── Events ───────────────────────────────────────────────────────────

export type PredictionEventType =
  | 'prediction_generated'
  | 'prediction_updated'
  | 'prediction_expired'
  | 'risk_detected'
  | 'trend_changed'
  | 'notification_sent'
  | 'notification_dismissed'
  | 'forecast_completed'
  | 'learning_updated';

export interface PredictionEvent {
  type: PredictionEventType;
  timestamp: number;
  predictionId?: string;
  domain?: ForecastDomain;
  risk?: PredictionRisk;
  message?: string;
}

// ── History ──────────────────────────────────────────────────────────

export interface PredictionHistoryEntry {
  id: string;
  predictionId: string;
  timestamp: number;
  domain: ForecastDomain;
  title: string;
  projectedValue: number;
  actualValue: number | null;
  accuracy: number | null;
  wasCorrect: boolean | null;
  confidence: number;
}

export interface PredictionHistoryData {
  entries: PredictionHistoryEntry[];
  totalPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
  pendingValidation: number;
  averageAccuracy: number;
  accuracyByDomain: Record<string, number>;
}

// ── Learning ─────────────────────────────────────────────────────────

export interface PredictionLearningData {
  accuracyHistory: { timestamp: number; accuracy: number }[];
  biasCorrection: Record<ForecastDomain, number>;
  weightAdjustments: Record<string, number>;
  lastUpdated: number;
  totalForecasts: number;
}

// ── Helper Functions ─────────────────────────────────────────────────

export function confidenceToLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.9) return 'very_high';
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  if (confidence >= 0.3) return 'low';
  return 'very_low';
}

export function riskToScore(risk: PredictionRisk): number {
  switch (risk) {
    case 'none': return 0;
    case 'low': return 20;
    case 'moderate': return 40;
    case 'high': return 70;
    case 'severe': return 90;
    default: return 0;
  }
}

export function scoreToRisk(score: number): PredictionRisk {
  if (score >= 80) return 'severe';
  if (score >= 60) return 'high';
  if (score >= 35) return 'moderate';
  if (score >= 15) return 'low';
  return 'none';
}

export function urgencyFromRisk(risk: PredictionRisk): PredictionUrgency {
  switch (risk) {
    case 'severe': return 'immediate';
    case 'high': return 'soon';
    case 'moderate': return 'scheduled';
    case 'low': return 'monitoring';
    default: return 'none';
  }
}
