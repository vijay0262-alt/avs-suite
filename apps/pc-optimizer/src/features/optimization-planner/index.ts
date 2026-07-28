/**
 * Optimization Planner — Barrel Export
 *
 * Intelligent Optimization Planner that converts AI Health Engine
 * analysis into structured, explainable optimization plans.
 *
 * This module NEVER executes changes — it only creates plans.
 */
// Types
export type {
  PlanType,
  OptimizationItem,
  OptimizationPlan,
  PlanPreview,
  OptimizationPlannerInput,
  PlannerUserPreferences,
  OptimizationEventType,
  OptimizationEventPayloads,
  OptimizationEventListener,
} from './types';
export {
  PLAN_TYPE_CATEGORIES,
  CATEGORY_TASK_MAP,
  CATEGORY_CAPABILITY_MAP,
  DEFAULT_USER_PREFERENCES,
  severityToWeight,
  riskToWeight,
  priorityToWeight,
  formatBytes,
  formatDuration,
  clampScore,
} from './types';

// Events
export { optimizationEvents, OptimizationEventEmitter } from './optimizationEvents';

// Estimator
export {
  estimateCategory,
  estimatePredictedScore,
  estimatePerformanceImprovement,
  estimatePrivacyImprovement,
  estimateOverallRisk,
  estimateFromStatistics,
  type CategoryEstimate,
} from './optimizationEstimator';

// Priority Engine
export {
  rankItems,
  getPrioritizationReasoning,
} from './optimizationPriorityEngine';

// Plan Builder
export { planBuilder } from './optimizationPlanBuilder';

// Preview Builder
export { previewBuilder } from './optimizationPreviewBuilder';

// Main Planner
export { OptimizationPlanner, optimizationPlanner, type PlannerOptions } from './optimizationPlanner';
