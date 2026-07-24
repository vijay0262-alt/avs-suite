// Module Registry — central registry for all optimizer modules.
export type {
  ModuleLifecycleState,
  ModuleLifecycleStateConfig,
  ModuleCategory,
  ModuleCapabilities,
  ModuleMetadata,
  ModuleStatistics,
  OptimizerModule,
  ModuleRegistryEntry,
} from './moduleRegistry.types';
export { MODULE_LIFECYCLE_CONFIG } from './moduleRegistry.types';
export { moduleRegistry, ModuleRegistryImpl } from './ModuleRegistry';
export { BaseModuleAdapter } from './BaseModuleAdapter';
export {
  registerAllModules,
  initializeAllModules,
  disposeAllModules,
  clearModuleRegistry,
} from './registerModules';
export {
  JUNK_CLEANER_MODULE,
  REGISTRY_CLEANER_MODULE,
  STARTUP_MANAGER_MODULE,
  PRIVACY_CLEANER_MODULE,
  DUPLICATE_FINDER_MODULE,
  DISK_ANALYZER_MODULE,
  PERFORMANCE_MODULE,
  SYSTEM_INFORMATION_MODULE,
  SECURITY_MODULE,
  DRIVER_UPDATER_MODULE,
  ANTIVIRUS_MODULE,
  VPN_MODULE,
  BACKUP_MODULE,
  FILE_RECOVERY_MODULE,
  ALL_MODULE_DEFINITIONS,
} from './moduleDefinitions';
export { useModuleRegistry, useAvailableModules, useModuleByPath } from './useModuleRegistry';
export { ModuleCards } from './components/ModuleCards';

// Part 7 — Module Event System
export type { ModuleEvent, ModuleEventTypeName, ModuleEventData } from './ModuleEventBus';
export { ModuleEventType, moduleEventBus, emitModuleEvent } from './ModuleEventBus';

// Part 8 — Recommendation Aggregator
export { recommendationAggregator } from './RecommendationAggregator';

// Part 9 — Module Optimization Summary
export type { ModuleOptimizationSummary, AggregatedOptimizationSummary } from './ModuleOptimizationSummary';
export { aggregateModuleSummaries } from './ModuleOptimizationSummary';

// Part 10 — Module Health History
export type { ModuleHistoryEntry } from './ModuleHistoryService';
export { moduleHistoryService } from './ModuleHistoryService';
