/**
 * AI Context Engine — Barrel Export.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every insight, recommendation,
 *    or answer must be traceable back to one or more context providers,
 *    with supporting evidence and a confidence score."
 *
 * Components:
 *   - AIContextManager       — main orchestrator
 *   - AIContextBuilder       — discovers, validates, collects, merges
 *   - AIContextRegistry      — provider registration
 *   - AIContextAggregator    — collects and merges provider context
 *   - AIContextValidator     — validates providers and context
 *   - AIContextCache         — memory cache with expiration
 *   - AIContextEvents        — typed event emitter (7 events)
 *   - AIContextConfiguration — default config and factory
 */

// Types
export type {
  ContextProvenance,
  ContextEvidence,
  SystemContext,
  HealthContext,
  HealthIssue,
  PerformanceContext,
  StorageContext,
  LargeFileInfo,
  BrowserContext,
  BrowserInfo,
  BrowserExtensionInfo,
  PrivacyContext,
  StartupContext,
  StartupItemInfo,
  WindowsContext,
  WindowsServiceInfo,
  DuplicatesContext,
  DuplicateGroupInfo,
  SchedulerContext,
  ScheduledTaskInfo,
  HistoryContext,
  OptimizationHistoryEntry,
  ReportsContext,
  ExperienceContext,
  CapabilitiesContext,
  QuotaContext,
  QuotaInfo,
  AnalyticsContext,
  ContextMetadata,
  AIContext,
  ContextSection,
  AIContextProvider,
  ContextProviderValidationResult,
  AIContextEventType,
  AIContextEventListener,
  ContextValidationIssue,
  ContextValidationResult,
  CacheEntry,
  CacheStatistics,
  AIContextConfiguration,
  ContextStatistics,
} from './types';

export {
  CONTEXT_SECTIONS,
  isValidContextSection,
  createProvenance,
  generateContextId,
} from './types';

// Events
export { AIContextEventEmitter, aiContextEvents } from './aiContextEvents';

// Configuration
export { DEFAULT_CONTEXT_CONFIG, createConfig } from './aiContextConfiguration';

// Registry
export { AIContextRegistry } from './aiContextRegistry';

// Validator
export { AIContextValidator } from './aiContextValidator';

// Cache
export { AIContextCache } from './aiContextCache';

// Aggregator
export { AIContextAggregator } from './aiContextAggregator';

// Builder
export { AIContextBuilder } from './aiContextBuilder';

// Manager
export { AIContextManager, aiContextManager } from './aiContextManager';
