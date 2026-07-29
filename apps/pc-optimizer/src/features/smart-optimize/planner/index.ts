/**
 * Smart Optimize 2.0 — Personalized Optimization Planner
 *
 * EPIC 4 PHASE A PART 1 — Barrel Export
 *
 * Transforms AI recommendations into device-specific optimization plans.
 * Plans adapt to: Device Profile, Current System State, Predictions,
 * Optimization History, User Preferences, Safety Policies.
 *
 * The planner NEVER executes optimizations.
 * Execution remains delegated to the Execution Pipeline.
 */
// Types
export type {
  OptimizationGoal,
  OptimizationStrategy,
  SmartPlan,
  DeviceProfileSnapshot,
  SmartPlanBenefits,
  SmartPlanAction,
  ExcludedAction,
  SafetyAssessment,
  EligibilityResult,
  EligibilityIssue,
  ConflictResolutionResult,
  Conflict,
  ResolvedConflict,
  SmartPlanComparison,
  PlannerStatistics,
  PlannerHistoryEntry,
  PlannerEventType,
  PlannerEvent,
  PlannerEventListener,
  StrategyRule,
  StrategyRules,
  PlanningRules,
  PriorityWeights,
  RiskThresholds,
  EligibilityRules,
  PlannerFeatureFlags,
  PlannerConfiguration,
  PlanningContext,
  OptimizationHistoryEntry,
  SystemLoad,
  UserPreferences,
  PlanValidationResult,
  PlanValidationError,
  PlanValidationWarning,
  OptimizationProviderPlugin,
} from './types';

// Helpers
export {
  createDefaultPlannerConfiguration,
  generateSmartPlanId,
  generateComparisonId,
  generatePlannerHistoryId,
  riskToScore,
  priorityToScore,
} from './types';

// Configuration
export {
  DEFAULT_PLANNER_CONFIGURATION,
  createPlannerConfiguration,
  getStrategyRule,
} from './optimizationPlannerConfiguration';
export type { DeepPartial as PlannerDeepPartial } from './optimizationPlannerConfiguration';

// Events
export { OptimizationPlannerEvents } from './optimizationPlannerEvents';

// Strategy Engine
export { OptimizationStrategyEngine } from './optimizationStrategyEngine';

// Profile Resolver
export { OptimizationProfileResolver } from './optimizationProfileResolver';
export type { ProfileAdjustments } from './optimizationProfileResolver';

// Priority Engine
export { OptimizationPriorityEngine } from './optimizationPriorityEngine';

// Sequence Builder
export { OptimizationSequenceBuilder } from './optimizationSequenceBuilder';

// Conflict Resolver
export { OptimizationConflictResolver } from './optimizationConflictResolver';

// Safety Analyzer
export { OptimizationSafetyAnalyzer } from './optimizationSafetyAnalyzer';

// Eligibility Validator
export { OptimizationEligibilityValidator } from './optimizationEligibilityValidator';

// History Analyzer
export { OptimizationHistoryAnalyzer } from './optimizationHistoryAnalyzer';
export type { HistoryAnalysis } from './optimizationHistoryAnalyzer';

// Plan Generator
export { OptimizationPlanGenerator } from './optimizationPlanGenerator';

// Planner
export { OptimizationPlanner } from './optimizationPlanner';

// Manager
export { SmartOptimizeManager } from './smartOptimizeManager';
