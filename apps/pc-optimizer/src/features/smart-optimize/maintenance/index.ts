/**
 * Smart Optimize 2.0 — Intelligent Maintenance Engine
 *
 * EPIC 4 PHASE A PART 4 — Barrel Export
 *
 * Determines the optimal maintenance opportunity using system state,
 * user behavior, policies, and AI recommendations.
 * Coordinates with the existing scheduler rather than replacing it.
 */
// Types
export type {
  MaintenanceType,
  WindowSignal,
  MaintenanceWindow,
  WindowQuality,
  MaintenanceOpportunity,
  MaintenanceRequiredConditions,
  EligibilityStatus,
  MaintenanceEligibility,
  EligibilityCheck,
  EligibilityDimension,
  EligibilityRule,
  MaintenanceEligibilityContext,
  SubscriptionInfo,
  CapabilityInfo,
  QuotaInfo,
  PermissionInfo,
  EnterprisePolicyInfo,
  MaintenancePolicyType,
  MaintenancePolicy,
  MaintenancePolicyRule,
  MaintenancePolicyAction,
  PolicyEvaluationResult,
  PriorityFactors,
  PriorityResult,
  MaintenancePlan,
  MaintenanceValidationResult,
  MaintenanceValidationError,
  MaintenanceValidationWarning,
  MaintenanceOutcome,
  MaintenanceHistoryEntry,
  MaintenanceStatistics,
  MaintenanceEventType,
  MaintenanceEvent,
  MaintenanceEventListener,
  MaintenanceConfiguration,
  WindowRule,
  PriorityRule,
  MaintenanceThresholds,
  MaintenanceFeatureFlags,
  MaintenanceWindowProviderPlugin,
  MaintenanceTypeProviderPlugin,
  CoordinationResult,
} from './types';

// Re-export shared types from planner/adaptive
export type {
  SmartPlan,
  OptimizationGoal,
  RiskLevel,
  RecommendationPriority,
  SystemState,
} from './types';

// Helpers
export {
  createDefaultMaintenanceConfiguration,
  createDefaultRequiredConditions,
  createDefaultEligibility,
  generateMaintenanceId,
  generateWindowId,
  generateOpportunityId,
  generatePlanId,
  generateHistoryId,
  riskToScore,
  priorityToScore,
  windowQualityToScore,
} from './types';

// Configuration
export {
  DEFAULT_MAINTENANCE_CONFIGURATION,
  createMaintenanceConfiguration,
} from './maintenanceConfiguration';
export type { DeepPartial as MaintenanceDeepPartial } from './maintenanceConfiguration';

// Events
export { MaintenanceEvents } from './maintenanceEvents';

// Window Detector
export { MaintenanceWindowDetector } from './maintenanceWindowDetector';

// Eligibility Engine
export { MaintenanceEligibilityEngine } from './maintenanceEligibilityEngine';

// Policy Engine
export { MaintenancePolicyEngine } from './maintenancePolicyEngine';

// Priority Engine
export { MaintenancePriorityEngine } from './maintenancePriorityEngine';

// Coordinator
export { MaintenanceCoordinator, type SchedulerAdapter } from './maintenanceCoordinator';

// History
export { MaintenanceHistory } from './maintenanceHistory';

// Statistics
export { MaintenanceStatisticsCalculator } from './maintenanceStatistics';

// Validator
export { MaintenanceValidator } from './maintenanceValidator';

// Planner
export { MaintenancePlanner } from './maintenancePlanner';

// Engine
export { MaintenanceEngine, type MaintenanceEngineOptions } from './maintenanceEngine';

// Manager
export { MaintenanceManager } from './maintenanceManager';
