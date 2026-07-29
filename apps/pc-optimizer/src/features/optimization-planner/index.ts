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

// ═══════════════════════════════════════════════════════════════
// EPIC 3 PHASE A PART 5 — Optimization Plan Engine
// Consumes Recommendations from AI Intelligence Platform.
// NEVER executes optimizations. Creates plans only.
// ═══════════════════════════════════════════════════════════════

// Part 5 Types
export type {
  OptimizationPlanType,
  PlanRiskLevel,
  PlanStepStatus,
  PlanStep,
  OptimizationPlanV2,
  PlanComparisonEntry,
  PlanComparison,
  PlanValidationResult,
  PlanStatistics,
  PlanHistoryEntry,
  PlanEventType,
  PlanEvent,
  PlanEventListener,
  BenefitRules,
  RiskRules,
  OrderingRules,
  PlanFeatureFlags,
  PlanConfiguration,
  PlanBuilderInput,
  PlanUserPreferences,
} from './types';

// Part 5 Helpers
export {
  getPlanTypeLabel,
  getPlanRiskLabel,
  riskToPlanRisk,
  planRiskToWeight,
  createDefaultPlanConfiguration,
  createDefaultPlanUserPreferences,
  generatePlanId,
  generateStepId,
} from './types';

// Part 5 Configuration
export {
  DEFAULT_PLAN_CONFIGURATION,
  createPlanConfiguration,
  isPlanTypeEnabled,
} from './planConfiguration';
export type { DeepPartial as PlanDeepPartial } from './planConfiguration';

// Part 5 Events
export { PlanEvents } from './planEvents';

// Part 5 Registry
export { PlanRegistry } from './planRegistry';

// Part 5 Estimator
export { PlanEstimator, type PlanEstimate } from './planEstimator';

// Part 5 Scorer
export { PlanScorer, type PlanScore } from './planScorer';

// Part 5 Analyzer
export { PlanAnalyzer, type PlanAnalysis } from './planAnalyzer';

// Part 5 Validator
export { PlanValidator } from './planValidator';

// Part 5 Builder
export { PlanBuilder } from './planBuilder';

// Part 5 History
export { PlanHistory } from './planHistory';

// Part 5 Manager
export { OptimizationPlanManager } from './planManager';
