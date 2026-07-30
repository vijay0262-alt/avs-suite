/**
 * AI Command Center — Barrel Export
 *
 * EPIC 5 PHASE A PART 3
 *
 * The AI Command Center is the primary AI workspace for the application.
 * It is widget-driven and configurable, consuming existing AI modules
 * without duplicating business logic.
 *
 * Architecture:
 *   AI Modules → Data Aggregator → View Models → Widget Registry →
 *   Layout Engine → Command Center
 */

// Manager
export { CommandCenterManager, commandCenterEvents } from './commandCenterManager';

// Configuration
export {
  DEFAULT_COMMAND_CENTER_CONFIGURATION,
  createCommandCenterConfiguration,
  validateCommandCenterConfiguration,
} from './commandCenterConfiguration';
export type { DeepPartial as CommandCenterDeepPartial } from './commandCenterConfiguration';

// Events
export { CommandCenterEvents } from './commandCenterEvents';

// Core components
export { CommandCenterWidgetRegistry } from './commandCenterWidgetRegistry';
export { CommandCenterWidgetManager } from './commandCenterWidgetManager';
export { CommandCenterDataAggregator } from './commandCenterDataAggregator';
export { CommandCenterViewModelEngine } from './commandCenterViewModel';
export { CommandCenterLayoutEngine } from './commandCenterLayoutEngine';
export { CommandCenterRefreshEngine } from './commandCenterRefreshEngine';
export { CommandCenterStateManager } from './commandCenterStateManager';
export { CommandCenterAnalytics } from './commandCenterAnalytics';

// Types
export type {
  WidgetCategory,
  WidgetPriority,
  WidgetStatus,
  LayoutType,
  RefreshPolicyType,
  RefreshPolicy,
  WidgetDefinition,
  WidgetLayoutConfig,
  WidgetAction,
  QuickActionType,
  WidgetInstance,
  WidgetData,
  WidgetDataProvider,
  CommandCenterViewModel,
  HealthViewModel,
  GoalsViewModel,
  GoalItem,
  RecommendationsViewModel,
  RecommendationItem,
  PredictionsViewModel,
  PredictionItem,
  MaintenanceViewModel,
  AutomationViewModel,
  TimelineViewModel,
  TimelineEventItem,
  RecoveryViewModel,
  DeviceProfileViewModel,
  CopilotViewModel,
  OptimizationViewModel,
  DashboardLayout,
  LayoutWidgetEntry,
  DashboardState,
  SearchQuery,
  SearchResult,
  CommandCenterAnalytics as CommandCenterAnalyticsData,
  CommandCenterEventType,
  CommandCenterEvent,
  CommandCenterEventListener,
  CommandCenterConfiguration,
  CommandCenterFeatureFlags,
  CommandCenterPerformanceTargets,
  WidgetPlugin,
} from './types';

export {
  generateWidgetId,
  generateLayoutId,
  generateDashboardId,
  getWidgetCategoryLabel,
  getWidgetPriorityLabel,
  getWidgetStatusLabel,
  getLayoutTypeLabel,
  getRefreshPolicyLabel,
  getQuickActionLabel,
  createDefaultRefreshPolicy,
  createDefaultWidgetLayoutConfig,
  createDefaultWidgetDefinitions,
  createDefaultDashboardLayout,
  createDefaultCommandCenterFeatureFlags,
  createDefaultCommandCenterPerformanceTargets,
  createDefaultCommandCenterConfiguration,
} from './types';
