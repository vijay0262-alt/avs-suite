/**
 * Core AI Dashboard Widgets — Barrel Export.
 *
 * These widgets consume the AI Intelligence Platform outputs.
 * Every widget is a micro-application built on the Widget Framework (Part 2).
 *
 * Components:
 *   - DashboardCoordinator    — top-level coordinator
 *   - WidgetCoordinator       — inter-widget communication
 *   - DashboardSummaryProvider — aggregates dashboard summary
 *   - HealthOverviewProvider  — health score widget provider
 *   - RecommendationProvider  — top recommendations widget provider
 *   - QuickWinsProvider       — quick wins widget provider
 *   - PredictionProvider      — prediction summary widget provider
 *   - AchievementProvider     — achievements widget provider
 *   - OptimizationHistoryProvider — optimization activity widget provider
 *   - DeviceProfileProvider   — device profile widget provider
 *   - WidgetConfiguration     — defaults and factory
 */

// Types
export type {
  CoreWidgetDataBundle,
  HealthOverviewData,
  HealthCategoryEntry,
  RecommendationData,
  RecommendationDisplayItem,
  QuickWinsData,
  QuickWinItem,
  PredictionData,
  PredictionDisplayItem,
  AchievementData,
  AchievementItem,
  MilestoneItem,
  HealthMilestone,
  HistoricalImprovement,
  OptimizationActivityData,
  OptimizationEntry,
  DeviceProfileData,
  DashboardSummary,
  CoreWidgetId,
  CoreWidgetEvent,
  CoreWidgetEventListener,
  CoreWidgetEventPayload,
  WidgetLoadState,
  CoreWidgetState,
  InterWidgetMessage,
  SharedFilter,
  CoreWidgetConfig,
  AccessibilityConfig,
  CoreWidgetProviderContext,
  AIContext,
  KnowledgeObject,
  RecommendationList,
  Recommendation,
  InsightList,
  PredictionList,
  Prediction,
  DeviceProfile,
} from './types';

export {
  getHealthStatus,
  getHealthTrend,
  createDefaultCoreWidgetConfig,
  createDefaultAccessibilityConfig,
} from './types';

export {
  DEFAULT_CORE_WIDGET_CONFIG,
  DEFAULT_ACCESSIBILITY_CONFIG,
  createCoreWidgetConfig,
  createAccessibilityConfig,
} from './widgetConfiguration';
export type { DeepPartial as CoreWidgetDeepPartial } from './widgetConfiguration';
export { DashboardSummaryProvider } from './dashboardSummaryProvider';
export { WidgetCoordinator } from './widgetCoordinator';
export { DashboardCoordinator } from './dashboardCoordinator';
export { HealthOverviewProvider } from './healthOverviewWidget';
export { RecommendationProvider } from './recommendationWidget';
export { QuickWinsProvider } from './quickWinsWidget';
export { PredictionProvider } from './predictionWidget';
export { AchievementProvider } from './achievementWidget';
export { OptimizationHistoryProvider } from './optimizationHistoryWidget';
export { DeviceProfileProvider } from './deviceProfileWidget';
