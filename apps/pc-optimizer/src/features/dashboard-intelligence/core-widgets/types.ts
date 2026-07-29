/**
 * Core AI Dashboard Widgets — Type Definitions.
 *
 * These widgets consume the AI Intelligence Platform outputs.
 * Every widget is a micro-application built on the Widget Framework (Part 2).
 *
 * Pipeline:
 *   AI Engines → Dashboard Data Bundle → Widget Providers →
 *   Core Widgets → Dashboard Coordinator → UI
 */
import type { AIContext } from '../../ai-intelligence/context/types';
import type { KnowledgeObject } from '../../ai-intelligence/knowledge/types';
import type { RecommendationList, Recommendation } from '../../ai-intelligence/recommendations/types';
import type { InsightList } from '../../ai-intelligence/insights/types';
import type { PredictionList, Prediction } from '../../ai-intelligence/predictions/types';
import type { DeviceProfile } from '../../ai-intelligence/device-profile/types';
import type { WidgetProviderContext } from '../widgets/types';

// Re-export for convenience
export type { AIContext, KnowledgeObject, RecommendationList, Recommendation, InsightList, PredictionList, Prediction, DeviceProfile };

// ── Dashboard Data Bundle (re-export from Part 1) ─────────────

export interface CoreWidgetDataBundle {
  aiContext: AIContext | null;
  knowledge: KnowledgeObject | null;
  recommendations: RecommendationList | null;
  insights: InsightList | null;
  predictions: PredictionList | null;
  deviceProfile: DeviceProfile | null;
}

// ── Widget Data Models ───────────────────────────────────────

export interface HealthOverviewData {
  overallScore: number;
  cpuScore: number;
  ramScore: number;
  diskScore: number;
  stabilityScore: number;
  securityScore: number;
  healthTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  healthConfidence: number;
  lastScanAt: string | null;
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'unknown';
  recentChanges: string[];
  healthSummary: string;
  categoryBreakdown: HealthCategoryEntry[];
}

export interface HealthCategoryEntry {
  category: string;
  label: string;
  score: number;
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'unknown';
}

export interface RecommendationData {
  recommendations: RecommendationDisplayItem[];
  totalCount: number;
  criticalCount: number;
}

export interface RecommendationDisplayItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  priority: string;
  estimatedBenefit: string;
  estimatedTime: number;
  safetyScore: number;
  riskLevel: string;
  confidence: number;
  requiresPro: boolean;
}

export interface QuickWinsData {
  quickWins: QuickWinItem[];
  totalCount: number;
  totalEstimatedImprovement: number;
  totalStorageRecovery: number;
  totalPerformanceGain: number;
  smartOptimizeCompatible: boolean;
}

export interface QuickWinItem {
  id: string;
  title: string;
  category: string;
  executionTime: number;
  expectedImprovement: number;
  storageRecovery: number;
  performanceGain: number;
  safetyScore: number;
  smartOptimizeCompatible: boolean;
}

export interface PredictionData {
  predictions: PredictionDisplayItem[];
  healthTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  storagePrediction: string | null;
  startupPrediction: string | null;
  maintenanceForecast: string | null;
  upcomingConcerns: string[];
  predictionConfidence: number;
}

export interface PredictionDisplayItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  predictionType: string;
  currentValue: string;
  predictedValue: string;
  unit: string | null;
  confidenceScore: number;
  trend: string;
  riskLevel: string;
  timeHorizon: string;
}

export interface AchievementData {
  achievements: AchievementItem[];
  milestones: MilestoneItem[];
  optimizationStreak: number;
  healthMilestones: HealthMilestone[];
  totalStorageRecovered: number;
  historicalImprovements: HistoricalImprovement[];
}

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
  achievedAt: string;
  category: string;
}

export interface MilestoneItem {
  id: string;
  title: string;
  description: string;
  achievedAt: string;
  type: string;
}

export interface HealthMilestone {
  id: string;
  title: string;
  description: string;
  achievedAt: string;
  scoreThreshold: number;
}

export interface HistoricalImprovement {
  id: string;
  title: string;
  description: string;
  achievedAt: string;
  improvementType: string;
  value: number;
  unit: string;
}

export interface OptimizationActivityData {
  recentOptimizations: OptimizationEntry[];
  totalOptimizations: number;
  totalCleanedMB: number;
  totalIssuesFixed: number;
  rollbackAvailable: boolean;
  totalTimeSavedSec: number;
  healthImprovements: number;
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
}

export interface OptimizationEntry {
  timestamp: string;
  type: string;
  itemsProcessed: number;
  spaceFreedMB: number;
  durationSec: number;
  rollbackAvailable: boolean;
}

export interface DeviceProfileData {
  deviceName: string;
  platform: string;
  primaryProfile: string;
  secondaryProfiles: { profile: string; score: number }[];
  hardwareTier: string;
  usageSummary: string;
  confidenceScore: number;
  recentChanges: string[];
  cpuModel: string;
  cpuCores: number;
  totalMemoryMB: number;
  gpuModel: string | null;
  storageType: string;
  storageCapacityMB: number;
}

// ── Dashboard Summary ────────────────────────────────────────

export interface DashboardSummary {
  healthScore: number;
  healthStatus: string;
  healthTrend: string;
  totalRecommendations: number;
  criticalRecommendations: number;
  quickWinsAvailable: number;
  predictionCount: number;
  upcomingConcerns: string[];
  totalOptimizations: number;
  totalStorageRecovered: number;
  deviceProfile: string;
  lastUpdated: string;
}

// ── Coordinator Types ────────────────────────────────────────

export type CoreWidgetId =
  | 'health_overview'
  | 'recommendations'
  | 'quick_wins'
  | 'predictions'
  | 'achievements'
  | 'optimization_activity'
  | 'device_profile';

export type CoreWidgetEvent =
  | 'dashboard_ready'
  | 'widget_loaded'
  | 'widget_updated'
  | 'widget_selected'
  | 'dashboard_refreshed'
  | 'dashboard_error';

export type CoreWidgetEventListener = (payload: CoreWidgetEventPayload) => void;

export interface CoreWidgetEventPayload {
  eventType: CoreWidgetEvent;
  widgetId?: CoreWidgetId;
  data?: unknown;
  timestamp: string;
}

export type WidgetLoadState = 'loading' | 'ready' | 'refreshing' | 'empty' | 'permission_denied' | 'unavailable' | 'error';

export interface CoreWidgetState {
  id: CoreWidgetId;
  state: WidgetLoadState;
  lastUpdated: string | null;
  error: string | null;
}

export interface InterWidgetMessage {
  from: CoreWidgetId;
  to: CoreWidgetId | 'all';
  type: 'refresh' | 'selection' | 'filter' | 'state_update' | 'future';
  data: unknown;
  timestamp: string;
}

export interface SharedFilter {
  key: string;
  value: unknown;
  appliedBy: CoreWidgetId;
}

// ── Configuration ────────────────────────────────────────────

export interface CoreWidgetConfig {
  widgetOrder: CoreWidgetId[];
  widgetVisibility: Record<CoreWidgetId, boolean>;
  refreshIntervalsMs: Record<CoreWidgetId, number>;
  priorityRules: Record<CoreWidgetId, 'critical' | 'high' | 'medium' | 'low'>;
  featureFlags: {
    enableHealthOverview: boolean;
    enableRecommendations: boolean;
    enableQuickWins: boolean;
    enablePredictions: boolean;
    enableAchievements: boolean;
    enableOptimizationActivity: boolean;
    enableDeviceProfile: boolean;
    futureFlags: Record<string, boolean>;
  };
  defaultLayout: CoreWidgetId[];
  lazyLoadThreshold: number;
  parallelLoading: boolean;
  enableEvents: boolean;
}

// ── Accessibility ────────────────────────────────────────────

export interface AccessibilityConfig {
  keyboardNavigation: boolean;
  screenReaderCompatibility: boolean;
  responsiveLayouts: boolean;
  highContrastCompatibility: boolean;
  reducedMotionSupport: boolean;
}

// ── Provider Context for Core Widgets ────────────────────────

export interface CoreWidgetProviderContext extends WidgetProviderContext {
  dataBundle: CoreWidgetDataBundle;
}

// ── Helper Functions ─────────────────────────────────────────

export function getHealthStatus(score: number): HealthOverviewData['healthStatus'] {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  if (score > 0) return 'critical';
  return 'unknown';
}

export function getHealthTrend(trend: string | null | undefined): HealthOverviewData['healthTrend'] {
  if (trend === 'improving' || trend === 'increasing') return 'improving';
  if (trend === 'stable') return 'stable';
  if (trend === 'declining' || trend === 'decreasing') return 'declining';
  return 'unknown';
}

export function createDefaultCoreWidgetConfig(): CoreWidgetConfig {
  return {
    widgetOrder: ['health_overview', 'recommendations', 'quick_wins', 'predictions', 'achievements', 'optimization_activity', 'device_profile'],
    widgetVisibility: {
      health_overview: true,
      recommendations: true,
      quick_wins: true,
      predictions: true,
      achievements: true,
      optimization_activity: true,
      device_profile: true,
    },
    refreshIntervalsMs: {
      health_overview: 30000,
      recommendations: 60000,
      quick_wins: 60000,
      predictions: 120000,
      achievements: 300000,
      optimization_activity: 60000,
      device_profile: 600000,
    },
    priorityRules: {
      health_overview: 'critical',
      recommendations: 'high',
      quick_wins: 'high',
      predictions: 'medium',
      achievements: 'low',
      optimization_activity: 'medium',
      device_profile: 'low',
    },
    featureFlags: {
      enableHealthOverview: true,
      enableRecommendations: true,
      enableQuickWins: true,
      enablePredictions: true,
      enableAchievements: true,
      enableOptimizationActivity: true,
      enableDeviceProfile: true,
      futureFlags: {},
    },
    defaultLayout: ['health_overview', 'recommendations', 'quick_wins', 'predictions', 'achievements', 'optimization_activity', 'device_profile'],
    lazyLoadThreshold: 4,
    parallelLoading: true,
    enableEvents: true,
  };
}

export function createDefaultAccessibilityConfig(): AccessibilityConfig {
  return {
    keyboardNavigation: true,
    screenReaderCompatibility: true,
    responsiveLayouts: true,
    highContrastCompatibility: true,
    reducedMotionSupport: true,
  };
}
