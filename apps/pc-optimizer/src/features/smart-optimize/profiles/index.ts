/**
 * Smart Optimize 2.0 — Optimization Profile Engine
 *
 * EPIC 4 PHASE A PART 2 — Barrel Export
 *
 * Creates configurable optimization profiles that the Smart Planner consumes.
 * Profiles describe optimization intent, constraints, priorities, and execution policies.
 * Profiles are configurable and extensible — no hardcoded profile logic.
 */
// Types
export type {
  ProfileCategory,
  ProfilePriority,
  RiskTolerance,
  ConfirmationPolicyType,
  RollbackPolicyType,
  SchedulingPolicyType,
  NotificationPolicyType,
  BackgroundMode,
  OptimizationPriorityWeights,
  ExecutionPolicy,
  SafetyPolicy,
  ConfirmationPolicy,
  SchedulingPolicy,
  RiskPolicy,
  RollbackPolicy,
  NotificationPolicy,
  EnterprisePolicy,
  ProfilePolicies,
  ProfileConstraints,
  OptimizationProfile,
  ProfileResolutionContext,
  ProfileUserPreferences,
  ProfileResolutionResult,
  ProfileScoreEntry,
  ProfileComparison,
  ProfileStatistics,
  ProfileHistoryEntry,
  ProfileHistoryAction,
  ProfileEventType,
  ProfileEvent,
  ProfileEventListener,
  ProfileValidationResult,
  ProfileValidationError,
  ProfileValidationWarning,
  ProfileConfiguration,
  ResolutionRules,
  ProfileFeatureFlags,
  ProfileProviderPlugin,
} from './types';

// Helpers
export {
  createDefaultPriorityWeights,
  createDefaultPolicies,
  createDefaultConstraints,
  createDefaultProfileConfiguration,
  generateProfileId,
  generateProfileComparisonId,
  generateProfileHistoryId,
  riskToleranceToScore,
  profilePriorityToScore,
} from './types';

// Configuration
export {
  DEFAULT_PROFILE_CONFIGURATION,
  createProfileConfiguration,
} from './optimizationProfileConfiguration';
export type { DeepPartial as ProfileDeepPartial } from './optimizationProfileConfiguration';

// Events
export { OptimizationProfileEvents } from './optimizationProfileEvents';

// Registry
export { OptimizationProfileRegistry } from './optimizationProfileRegistry';

// Policy Engine
export { OptimizationPolicyEngine } from './optimizationPolicyEngine';

// Constraint Engine
export { OptimizationConstraintEngine } from './optimizationConstraintEngine';

// Preference Resolver
export { OptimizationPreferenceResolver } from './optimizationPreferenceResolver';
export type { ResolvedPreferences } from './optimizationPreferenceResolver';

// Profile Resolver
export { OptimizationProfileResolver } from './optimizationProfileResolver';

// Validator
export { OptimizationProfileValidator } from './optimizationProfileValidator';

// Builder
export { OptimizationProfileBuilder } from './optimizationProfileBuilder';
export type { CustomProfileInput } from './optimizationProfileBuilder';

// History
export { OptimizationProfileHistory } from './optimizationProfileHistory';

// Manager
export { OptimizationProfileManager } from './optimizationProfileManager';
