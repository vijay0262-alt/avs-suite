export type { HealthContribution, HealthContributionProvider, ModuleId } from './HealthContribution';
export { clampHealth } from './HealthContribution';
export type { AggregatedHealthScore } from './HealthScoreService';
export { healthScoreService, HealthScoreService, subscribeToOptimizations } from './HealthScoreService';
export type { OptimizationEvent, OptimizationEventTypeName } from './OptimizationEventBus';
export { optimizationEventBus, OptimizationEventType } from './OptimizationEventBus';
export {
  JunkHealthProvider,
  RegistryHealthProvider,
  StartupHealthProvider,
  PrivacyHealthProvider,
  PerformanceHealthProvider,
  DiskHealthProvider,
  SecurityHealthProvider,
  SystemHealthProvider,
  registerAllHealthProviders,
  invalidateMetricsCache,
} from './healthProviders';
export { dashboardRefreshManager } from './DashboardRefreshManager';

// Part 17 — Future Module Registration
export type { FutureModuleConfig } from './FutureModules';
export { FUTURE_MODULE_CONFIGS, isFutureModule, getFutureModuleConfig } from './FutureModules';

// Part 8 — Optimization History
export type {
  OptimizationHistoryEntry,
  OptimizationHistoryStore,
} from './OptimizationHistoryService';
export {
  optimizationHistoryService,
  OptimizationHistoryService,
  InMemoryOptimizationHistoryStore,
} from './OptimizationHistoryService';

// Part 9 — Health Timeline
export type {
  HealthTimelineEntry,
  HealthTimelineStore,
} from './HealthTimelineService';
export {
  healthTimelineService,
  HealthTimelineService,
  InMemoryHealthTimelineStore,
} from './HealthTimelineService';

// Part 10 — Health Notifications
export type {
  HealthNotification,
  NotificationSeverity,
  NotificationListener,
} from './HealthNotificationService';
export { healthNotificationService, HealthNotificationService } from './HealthNotificationService';

// Part 12 — Health Engine Configuration
export type {
  HealthEngineConfig,
  ScoreZoneThresholds,
  StorageThresholds,
  StartupThresholds,
  PrivacyThresholds,
  PerformanceThresholds,
  SecurityThresholds,
  WindowsThresholds,
  NotificationThresholds,
} from './HealthEngineConfig';
export {
  DEFAULT_HEALTH_ENGINE_CONFIG,
  DEFAULT_SCORE_ZONE_THRESHOLDS,
  DEFAULT_STORAGE_THRESHOLDS,
  DEFAULT_STARTUP_THRESHOLDS,
  DEFAULT_PRIVACY_THRESHOLDS,
  DEFAULT_PERFORMANCE_THRESHOLDS,
  DEFAULT_SECURITY_THRESHOLDS,
  DEFAULT_WINDOWS_THRESHOLDS,
  DEFAULT_NOTIFICATION_THRESHOLDS,
  getHealthEngineConfig,
  setHealthEngineConfig,
  resetHealthEngineConfig,
} from './HealthEngineConfig';
