/**
 * Goals & Objectives Engine — Barrel Exports
 *
 * EPIC 4 PHASE B PART 5
 *
 * Enables users to define measurable PC objectives. Instead of selecting
 * optimization modes, users define outcomes. The AI continuously plans,
 * measures, and adapts optimization strategies until goals are achieved.
 */

// Manager
export { GoalsManager } from './goalsManager';

// Engine
export { GoalEngine } from './goalEngine';

// Components
export { GoalRegistry } from './goalRegistry';
export { GoalBuilder, type GoalBuildInput } from './goalBuilder';
export { GoalValidator } from './goalValidator';
export { GoalDependencyEngine } from './goalDependencyEngine';
export { GoalConflictResolver } from './goalConflictResolver';
export { GoalMeasurementEngine } from './goalMeasurementEngine';
export { GoalProgressEngine } from './goalProgressEngine';
export { GoalStrategyEngine } from './goalStrategyEngine';
export { GoalRecommendationEngine } from './goalRecommendationEngine';
export { GoalPlanner, type GoalPlanResult } from './goalPlanner';
export { GoalScheduler } from './goalScheduler';
export { GoalHistory } from './goalHistory';
export { GoalAnalyticsEngine } from './goalAnalytics';
export { GoalEvents } from './goalEvents';

// Configuration
export {
  DEFAULT_GOAL_CONFIGURATION,
  createGoalConfiguration,
  type DeepPartial,
} from './goalConfiguration';

// Types
export type {
  GoalType,
  GoalStatus,
  GoalPriority,
  TargetMetric,
  MeasurementDirection,
  GoalStrategyType,
  Goal,
  GoalStrategy,
  GoalStrategyStep,
  DependencyType,
  GoalDependency,
  ConstraintType,
  GoalConstraint,
  GoalRecommendationType,
  GoalRecommendation,
  GoalProgress,
  GoalMeasurementInput,
  TimelineEventSnapshot,
  RecommendationSnapshot,
  PredictionSnapshot,
  MaintenanceResultSnapshot,
  DeviceProfileSnapshot,
  SystemMetricsSnapshot,
  ConflictType,
  GoalConflict,
  ConflictResolution,
  ConflictAdjustment,
  GoalHistoryAction,
  GoalHistoryEntry,
  GoalAnalytics,
  GoalEffectiveness,
  GoalTrendPoint,
  GoalValidationResult,
  GoalValidationError,
  GoalValidationWarning,
  GoalProviderPlugin,
  GoalFeatureFlags,
  MeasurementRules,
  StrategyRules,
  ConflictRules,
  GoalConfiguration,
  GoalEventType,
  GoalEvent,
  GoalEventListener,
  GoalSchedule,
  RecommendationPriority,
  RiskLevel,
  Evidence,
  OptimizationHistoryEntry,
} from './types';

// Helpers
export {
  generateGoalId,
  generateStrategyStepId,
  generateRecommendationId,
  generateDependencyId,
  generateConstraintId,
  generateHistoryId,
  generateConflictId,
  generateScheduleId,
  priorityToScore,
  scoreToPriority,
  getGoalTypeLabel,
  getGoalStatusLabel,
  getGoalPriorityLabel,
  getTargetMetricLabel,
  getStrategyTypeLabel,
  getDependencyTypeLabel,
  getConflictTypeLabel,
  getHistoryActionLabel,
  computeProgress,
  getMeasurementDirection,
  createDefaultMeasurementRules,
  createDefaultStrategyRules,
  createDefaultConflictRules,
  createDefaultFeatureFlags,
} from './types';
