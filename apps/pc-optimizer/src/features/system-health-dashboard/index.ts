/**
 * System Health Dashboard — Barrel Export
 *
 * Real-time System Health Dashboard module that continuously displays
 * the health of the PC using existing AI Health Engine data plus
 * lightweight live system metrics.
 *
 * Components:
 *   • HealthDashboardService — main orchestrator
 *   • SystemMonitor — live metrics polling
 *   • DashboardStateManager — state management with throttling
 *   • HealthTimeline — score history, maintenance, optimization sessions
 *   • HealthWidgetRegistry — pluggable widget system
 *
 * This module does NOT modify:
 *   • Authentication, licensing, subscriptions, payment
 *   • Configuration synchronization
 *   • AI Health Engine architecture
 *   • Execution Engine, Startup Optimizer, Optimization Planner
 *   • Maintenance History
 */
// Types
export type {
  SystemLiveMetrics,
  HealthScorePanel,
  CategoryCard,
  CategoryCardIssue,
  RealTimeStatus,
  RecentMaintenanceSummary,
  OptimizationSessionSummary,
  TimelineRange,
  TimelineEntryType,
  TimelineEntry,
  AlertSeverity,
  AlertType,
  DashboardAlert,
  WidgetCategory,
  WidgetDefinition,
  QuickActionType,
  QuickAction,
  DashboardState,
  DashboardEventType,
  DashboardEventPayloads,
  DashboardEventListener,
} from './types';
export {
  DEFAULT_QUICK_ACTIONS,
  extractLiveMetrics,
  buildCategoryCards,
  buildHealthScorePanel,
} from './types';

// System Monitor
export { SystemMonitor, systemMonitor } from './systemMonitor';

// Timeline
export { HealthTimeline, healthTimeline } from './healthTimeline';

// Widget Registry
export { HealthWidgetRegistry, healthWidgetRegistry } from './healthWidgetRegistry';

// State Manager
export { DashboardStateManager, dashboardStateManager } from './dashboardStateManager';

// Dashboard Service
export { HealthDashboardService, healthDashboardService } from './healthDashboardService';
