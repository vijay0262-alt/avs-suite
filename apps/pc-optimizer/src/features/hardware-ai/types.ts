/**
 * Hardware AI Engine — Type Definitions
 *
 * All types for the AI Hardware Health Engine. The engine consumes
 * HardwareSnapshot data and produces human-readable insights,
 * recommendations, risk assessments, and trend analysis.
 *
 * Core principle: Every insight must be traceable to sensor evidence.
 * No hallucinated information. No direct hardware modification.
 */

import type {
  HardwareCategory,
  HealthLevel,
  SensorReading,
  ProviderSource,
} from '../hardware-center/types';

// ── AI Insight ───────────────────────────────────────────────────────

export type AISeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AIRiskLevel = 'none' | 'low' | 'moderate' | 'high' | 'severe';
export type AIUrgency = 'immediate' | 'soon' | 'scheduled' | 'none';
export type AIConfidence = 'low' | 'medium' | 'high' | 'very_high';

export interface AIEvidence {
  source: ProviderSource;
  sensor: string;
  value: string;
  timestamp: number;
  unit: string;
}

export interface AIInsight {
  id: string;
  category: HardwareCategory;
  title: string;
  summary: string;
  explanation: string;
  evidence: AIEvidence[];
  confidence: number; // 0.0 – 1.0
  confidenceLabel: AIConfidence;
  severity: AISeverity;
  risk: AIRiskLevel;
  urgency: AIUrgency;
  expectedImpact: string;
  recommendedActions: string[];
  estimatedBenefit: string;
  timestamp: number;
}

// ── Component Analysis ───────────────────────────────────────────────

export type TrendDirection = 'improving' | 'stable' | 'degrading' | 'rapid_degradation' | 'unknown';

export interface ComponentAnalysis {
  category: HardwareCategory;
  health: HealthLevel;
  healthScore: number; // 0 – 100
  performance: 'optimal' | 'good' | 'fair' | 'poor' | 'unknown';
  efficiency: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  reliability: 'high' | 'medium' | 'low' | 'unknown';
  trend: TrendDirection;
  confidence: number;
  risk: AIRiskLevel;
  urgency: AIUrgency;
  issues: ComponentIssue[];
  strengths: string[];
  metrics: ComponentMetric[];
}

export interface ComponentIssue {
  id: string;
  title: string;
  description: string;
  severity: AISeverity;
  evidence: AIEvidence[];
  confidence: number;
}

export interface ComponentMetric {
  label: string;
  value: string;
  unit: string;
  normal: boolean;
  trend: TrendDirection;
  source: ProviderSource;
}

// ── Recommendation ───────────────────────────────────────────────────

export type RecommendationType =
  | 'maintenance'
  | 'cleaning'
  | 'replacement'
  | 'configuration'
  | 'software'
  | 'monitoring'
  | 'no_action';

export interface AIRecommendation {
  id: string;
  category: HardwareCategory;
  type: RecommendationType;
  title: string;
  reason: string;
  evidence: AIEvidence[];
  expectedImprovement: string;
  risk: string;
  estimatedTimeMinutes: number;
  requiresRestart: boolean;
  canAutomate: boolean;
  priority: AIUrgency;
  confidence: number;
}

// ── Risk Assessment ──────────────────────────────────────────────────

export interface HardwareRiskAssessment {
  overallRisk: AIRiskLevel;
  overallUrgency: AIUrgency;
  componentRisks: Record<string, ComponentRiskEntry>;
  systemRiskFactors: string[];
  mitigatingFactors: string[];
  estimatedTimeToAction: string;
}

export interface ComponentRiskEntry {
  category: HardwareCategory;
  risk: AIRiskLevel;
  urgency: AIUrgency;
  primaryConcern: string;
  timeToAction: string;
}

// ── Trend History ────────────────────────────────────────────────────

export interface TrendDataPoint {
  timestamp: number;
  value: number;
  unit: string;
  source: ProviderSource;
}

export interface TrendRecord {
  category: HardwareCategory;
  metric: string;
  direction: TrendDirection;
  changePercent: number;
  duration: number; // ms
  dataPoints: TrendDataPoint[];
  confidence: number;
}

export interface TrendSummary {
  category: HardwareCategory;
  overallTrend: TrendDirection;
  metrics: Record<string, TrendDirection>;
  notableChanges: string[];
}

// ── Thermal Analysis ─────────────────────────────────────────────────

export interface ThermalAnalysisResult {
  category: HardwareCategory;
  currentTempC: number | null;
  idleTempC: number | null;
  tempTrend: TrendDirection;
  throttling: boolean;
  coolingAdequate: boolean;
  anomalies: ThermalAnomaly[];
  confidence: number;
}

export interface ThermalAnomaly {
  type: 'high_temp' | 'rapid_increase' | 'throttling' | 'insufficient_cooling' | 'missing_sensors' | 'abnormal_idle';
  description: string;
  severity: AISeverity;
  evidence: AIEvidence[];
}

// ── Full AI Report ───────────────────────────────────────────────────

export interface HardwareAIReport {
  timestamp: number;
  snapshotId: string;
  overallHealth: HealthLevel;
  overallScore: number;
  overallConfidence: number;
  componentAnalyses: ComponentAnalysis[];
  insights: AIInsight[];
  recommendations: AIRecommendation[];
  riskAssessment: HardwareRiskAssessment;
  trendSummaries: TrendSummary[];
  thermalAnalyses: ThermalAnalysisResult[];
  systemSummary: string;
  systemExplanation: string;
}

// ── Configuration ────────────────────────────────────────────────────

export interface HardwareAIConfiguration {
  enabled: boolean;
  minConfidence: number; // 0.0 – 1.0, insights below this are filtered
  maxInsights: number;
  maxRecommendations: number;
  enableThermalAnalysis: boolean;
  enableTrendAnalysis: boolean;
  enableRecommendations: boolean;
  enableRiskAssessment: boolean;
  trendHistorySize: number;
  trendMinDataPoints: number;
  thermalThresholds: ThermalThresholds;
  utilizationThresholds: UtilizationThresholds;
  storageThresholds: StorageThresholds;
  batteryThresholds: BatteryThresholds;
}

export interface ThermalThresholds {
  cpuWarningC: number;
  cpuCriticalC: number;
  gpuWarningC: number;
  gpuCriticalC: number;
  storageWarningC: number;
  storageCriticalC: number;
  rapidIncreaseRateCPerMin: number;
  abnormalIdleC: number;
}

export interface UtilizationThresholds {
  cpuHighPercent: number;
  cpuBackgroundPercent: number;
  gpuHighPercent: number;
  ramHighPercent: number;
  ramPressurePercent: number;
  networkHighPercent: number;
}

export interface StorageThresholds {
  lowFreeSpacePercent: number;
  smartWarningPercent: number;
  smartCriticalPercent: number;
  highWriteActivityMBps: number;
}

export interface BatteryThresholds {
  wearWarningPercent: number;
  wearCriticalPercent: number;
  lowChargePercent: number;
  expectedLifespanCycles: number;
}

export const DEFAULT_AI_CONFIG: HardwareAIConfiguration = {
  enabled: true,
  minConfidence: 0.3,
  maxInsights: 20,
  maxRecommendations: 10,
  enableThermalAnalysis: true,
  enableTrendAnalysis: true,
  enableRecommendations: true,
  enableRiskAssessment: true,
  trendHistorySize: 100,
  trendMinDataPoints: 3,
  thermalThresholds: {
    cpuWarningC: 75,
    cpuCriticalC: 90,
    gpuWarningC: 70,
    gpuCriticalC: 85,
    storageWarningC: 50,
    storageCriticalC: 60,
    rapidIncreaseRateCPerMin: 10,
    abnormalIdleC: 60,
  },
  utilizationThresholds: {
    cpuHighPercent: 85,
    cpuBackgroundPercent: 35,
    gpuHighPercent: 90,
    ramHighPercent: 85,
    ramPressurePercent: 90,
    networkHighPercent: 80,
  },
  storageThresholds: {
    lowFreeSpacePercent: 15,
    smartWarningPercent: 50,
    smartCriticalPercent: 20,
    highWriteActivityMBps: 500,
  },
  batteryThresholds: {
    wearWarningPercent: 15,
    wearCriticalPercent: 30,
    lowChargePercent: 20,
    expectedLifespanCycles: 1000,
  },
};

// ── AI Events ────────────────────────────────────────────────────────

export const HardwareAIEventType = {
  AnalysisStarted: 'ai_analysis_started',
  AnalysisCompleted: 'ai_analysis_completed',
  InsightGenerated: 'ai_insight_generated',
  RecommendationGenerated: 'ai_recommendation_generated',
  RiskDetected: 'ai_risk_detected',
  TrendChanged: 'ai_trend_changed',
} as const;

export type HardwareAIEventTypeName =
  (typeof HardwareAIEventType)[keyof typeof HardwareAIEventType];

export interface HardwareAIEvent {
  type: HardwareAIEventTypeName;
  timestamp: number;
  category?: HardwareCategory;
  data?: HardwareAIEventData;
}

export interface HardwareAIEventData {
  reportId?: string;
  snapshotId?: string;
  insightId?: string;
  recommendationId?: string;
  riskLevel?: AIRiskLevel;
  trend?: TrendDirection;
  message?: string;
}

// ── Helper Functions ─────────────────────────────────────────────────

export function confidenceToLabel(confidence: number): AIConfidence {
  if (confidence >= 0.9) return 'very_high';
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

export function severityToRisk(severity: AISeverity): AIRiskLevel {
  switch (severity) {
    case 'critical': return 'severe';
    case 'high': return 'high';
    case 'medium': return 'moderate';
    case 'low': return 'low';
    default: return 'none';
  }
}

export function severityToUrgency(severity: AISeverity): AIUrgency {
  switch (severity) {
    case 'critical': return 'immediate';
    case 'high': return 'soon';
    case 'medium': return 'scheduled';
    case 'low': return 'none';
    default: return 'none';
  }
}

export function riskToScore(risk: AIRiskLevel): number {
  switch (risk) {
    case 'none': return 0;
    case 'low': return 20;
    case 'moderate': return 40;
    case 'high': return 70;
    case 'severe': return 90;
    default: return 0;
  }
}

export function makeEvidence(
  source: ProviderSource,
  sensor: string,
  reading: SensorReading<unknown>,
): AIEvidence {
  return {
    source,
    sensor,
    value: String(reading.value),
    timestamp: reading.timestamp,
    unit: reading.unit,
  };
}

export function makeEvidenceFromValue(
  source: ProviderSource,
  sensor: string,
  value: string,
  unit: string,
  timestamp: number = Date.now(),
): AIEvidence {
  return { source, sensor, value, timestamp, unit };
}
