/**
 * Optimization Recovery & Rollback Center — Barrel Export
 *
 * EPIC 4 PHASE B PART 3 — Optimization Recovery & Rollback Center.
 *
 * Centralized recovery orchestration that leverages existing snapshot
 * and rollback capabilities. Does NOT implement new rollback mechanisms.
 * Does NOT modify optimizer modules or the execution pipeline.
 *
 * Architecture:
 *   Optimization History → Snapshot Catalog → Recovery Planner →
 *   Recovery Validator → Recovery Center → Execution Pipeline
 */

// Types
export type {
  RecoveryType,
  RecoveryStatus,
  RecoveryEligibilityState,
  SnapshotIntegrityStatus,
  RetentionPolicyAction,
  RecoveryRecord,
  RecoveryPlan,
  RecoveryStep,
  RecoveryAssumption,
  RecoveryExplainability,
  SnapshotCatalogEntry,
  RetentionPolicy,
  RecoveryComparison,
  HealthComparison,
  PerformanceComparison,
  StorageComparison,
  ConfigurationDifference,
  RecoveryValidationResult,
  RecoveryValidationError,
  RecoveryValidationWarning,
  RecoveryValidationCheck,
  ValidationCategory,
  RecoveryEligibilityResult,
  RecoveryHistoryEntry,
  RecoveryAnalytics,
  RecoveryEventType,
  RecoveryEvent,
  RecoveryEventListener,
  ExportFormat,
  RecoveryExport,
  RecoveryExportMetadata,
  RetentionRules,
  RecoveryPolicyRules,
  RecoveryValidationRules,
  RecoveryComparisonRules,
  RecoveryFeatureFlags,
  RecoveryConfiguration,
  RecoveryProviderPlugin,
  RecoveryComparisonPlugin,
  ExportPlugin,
  RecoveryPlanningInput,
  RecoveryExecutionResult,
} from './types';

// Re-exported types from other modules
export type { RiskLevel, RecommendationPriority, OptimizationHistoryEntry, SystemSnapshot, ExecutionStepResult, Evidence } from './types';

// Helpers
export {
  generateRecoveryId,
  generateRecoveryPlanId,
  generateRecoveryStepId,
  generateRecoveryHistoryId,
  generateComparisonId,
  generateCatalogEntryId,
  generateAssumptionId,
  generateExportId,
  riskToScore,
  scoreToRisk,
  priorityToScore,
  getRecoveryTypeLabel,
  getRecoveryTypeDescription,
  getRecoveryStatusLabel,
  getEligibilityStateLabel,
  getIntegrityStatusLabel,
  createDefaultRetentionPolicy,
} from './types';

// Configuration
export {
  DEFAULT_RECOVERY_CONFIGURATION,
  createRecoveryConfiguration,
} from './recoveryConfiguration';
export type { DeepPartial as RecoveryDeepPartial } from './recoveryConfiguration';

// Events
export { RecoveryEvents } from './recoveryEvents';

// History
export { RecoveryHistory } from './recoveryHistory';

// Eligibility Engine
export { RecoveryEligibilityEngine } from './recoveryEligibilityEngine';

// Snapshot Catalog
export { RecoverySnapshotCatalog } from './recoverySnapshotCatalog';

// Validator
export { RecoveryValidator } from './recoveryValidator';

// Comparison Engine
export { RecoveryComparisonEngine } from './recoveryComparisonEngine';

// Planner
export { RecoveryPlanner } from './recoveryPlanner';

// Analytics
export { RecoveryAnalyticsEngine } from './recoveryAnalytics';

// Formatter
export { RecoveryFormatter } from './recoveryFormatter';

// Exporter
export { RecoveryExporter } from './recoveryExporter';

// Coordinator
export { RecoveryCoordinator } from './recoveryCoordinator';

// Recovery Center
export { RecoveryCenter } from './recoveryCenter';

// Recovery Manager
export { RecoveryManager } from './recoveryManager';
