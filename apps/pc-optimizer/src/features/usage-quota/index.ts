/**
 * Usage Quota Engine — Barrel Export.
 *
 * Version 2.0 infrastructure for data-driven quota tracking and enforcement.
 *
 * Components:
 *   - QuotaRegistry       — central store for quota definitions
 *   - QuotaManager        — orchestrator for all quota operations
 *   - QuotaTracker        — records usage events
 *   - QuotaStorage        — storage abstraction (memory, local, future cloud)
 *   - QuotaResetService   — handles quota resets by policy
 *   - QuotaValidator      — validates definitions and configs
 *   - QuotaStatistics     — usage statistics and analytics
 *   - QuotaEvents         — typed event emitter
 *   - Default Definitions — built-in quota definitions
 *
 * This module does NOT modify any existing architecture.
 * It only creates the foundation that future prompts will use.
 */

// Types
export type {
  ResetPolicy,
  LimitType,
  UsageUnit,
  QuotaDefinition,
  QuotaState,
  UsageRecord,
  QuotaConfig,
  QuotaStorageData,
  QuotaStorageAdapter,
  QuotaEventType,
  QuotaConsumedEvent,
  QuotaRestoredEvent,
  QuotaResetEvent,
  QuotaExceededEvent,
  QuotaUpdatedEvent,
  QuotaInitializedEvent,
  StatisticsUpdatedEvent,
  QuotaEventListener,
  QuotaStatistics,
  QuotaSummary,
  QuotaValidationIssue,
  QuotaValidationResult,
} from './types';
export {
  RESET_POLICIES,
  LIMIT_TYPES,
  isValidResetPolicy,
  isValidLimitType,
  calculateNextReset,
  shouldReset,
} from './types';

// Events
export { QuotaEventEmitter, quotaEvents } from './quotaEvents';

// Storage
export { MemoryQuotaStorage, LocalQuotaStorage, createDefaultStorage } from './quotaStorage';

// Default Definitions
export { DEFAULT_QUOTAS, DEFAULT_QUOTA_CONFIG } from './defaultQuotaDefinitions';

// Registry
export { QuotaRegistry, quotaRegistry } from './quotaRegistry';

// Tracker
export { QuotaTracker } from './quotaTracker';

// Reset Service
export { QuotaResetService, quotaResetService } from './quotaResetService';

// Validator
export { QuotaValidator, quotaValidator } from './quotaValidator';

// Statistics
export { QuotaStatisticsService } from './quotaStatistics';

// Manager
export { QuotaManager, quotaManager } from './quotaManager';
