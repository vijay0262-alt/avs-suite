export type { HealthContribution, HealthContributionProvider, ModuleId } from './HealthContribution';
export { clampHealth } from './HealthContribution';
export type { AggregatedHealthScore } from './HealthScoreService';
export { healthScoreService, HealthScoreService, subscribeToOptimizations } from './HealthScoreService';
export type { OptimizationEvent } from './OptimizationEventBus';
export { optimizationEventBus } from './OptimizationEventBus';
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
