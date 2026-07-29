/**
 * Smart Optimize 2.0 — Adaptive Optimization Engine
 *
 * EPIC 4 PHASE A PART 3 — Barrel Export
 *
 * Dynamically adapts optimization plans based on real-time system conditions.
 * Makes optimization context-aware without changing the optimization modules.
 */
// Types
export type {
  ConditionType,
  ConditionSeverity,
  ConditionStatus,
  SystemState,
  Condition,
  ConditionRule,
  AdaptationAction,
  AdaptationDecision,
  AdaptationResult,
  AdaptivePolicyType,
  AdaptivePolicy,
  AdaptationRule,
  EvaluationContext,
  AdaptiveUserPreferences,
  AdaptationValidationResult,
  AdaptationValidationError,
  AdaptationValidationWarning,
  AdaptiveStatistics,
  AdaptiveHistoryEntry,
  AdaptiveEventType,
  AdaptiveEvent,
  AdaptiveEventListener,
  AdaptiveConfiguration,
  AdaptiveThresholds,
  AdaptivePriorities,
  AdaptiveFeatureFlags,
  ConditionProviderPlugin,
  PolicyProviderPlugin,
} from './types';

// Helpers
export {
  createDefaultAdaptiveConfiguration,
  generateAdaptationId,
  generateDecisionId,
  generateConditionId,
  generateAdaptiveHistoryId,
  severityToScore,
  createDefaultSystemState,
} from './types';

// Configuration
export {
  DEFAULT_ADAPTIVE_CONFIGURATION,
  createAdaptiveConfiguration,
} from './adaptiveConfiguration';
export type { DeepPartial as AdaptiveDeepPartial } from './adaptiveConfiguration';

// Events
export { AdaptiveEvents } from './adaptiveEvents';

// Condition Registry
export { AdaptiveConditionRegistry } from './adaptiveConditionRegistry';

// Condition Evaluator
export { AdaptiveConditionEvaluator } from './adaptiveConditionEvaluator';

// Policy Engine
export { AdaptivePolicyEngine } from './adaptivePolicyEngine';
export type { PolicyEvaluationResult } from './adaptivePolicyEngine';

// Decision Engine
export { AdaptiveDecisionEngine } from './adaptiveDecisionEngine';

// Plan Modifier
export { AdaptivePlanModifier } from './adaptivePlanModifier';

// State Monitor
export { AdaptiveStateMonitor } from './adaptiveStateMonitor';

// Validator
export { AdaptiveValidator } from './adaptiveValidator';

// History
export { AdaptiveHistory } from './adaptiveHistory';

// Planner
export { AdaptivePlanner } from './adaptivePlanner';

// Manager
export { AdaptiveOptimizationManager } from './adaptiveOptimizationManager';
