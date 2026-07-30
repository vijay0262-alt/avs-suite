/**
 * Goal Orchestration Engine — Barrel Exports
 *
 * EPIC 4 PHASE B PART 6
 *
 * Coordinates all active goals. The engine continuously evaluates
 * priorities, dependencies, conflicts and system state to determine
 * the optimal optimization strategy. It is the central decision layer
 * above all Smart Optimize components.
 */

// Orchestrator
export { GoalOrchestrator } from './goalOrchestrator';

// Components
export { GoalPriorityEngine } from './goalPriorityEngine';
export { GoalConflictEngine } from './goalConflictEngine';
export { GoalDependencyResolver } from './goalDependencyResolver';
export { GoalSchedulingEngine } from './goalSchedulingEngine';
export { GoalStrategyCoordinator } from './goalStrategyCoordinator';
export { GoalExecutionPlanner } from './goalExecutionPlanner';
export { GoalStateCoordinator } from './goalStateCoordinator';
export { GoalPolicyEngine } from './goalPolicyEngine';
export { GoalResourceAllocator } from './goalResourceAllocator';
export { GoalMetricsEngine } from './goalMetricsEngine';
export { GoalHistoryAggregator } from './goalHistoryAggregator';
export { OrchestrationEvents } from './orchestrationEvents';

// Configuration
export {
  DEFAULT_ORCHESTRATION_CONFIGURATION,
  createOrchestrationConfiguration,
  type DeepPartial,
} from './orchestrationConfiguration';

// Types
export type {
  OrchestrationType,
  OrchestrationState,
  OrchestrationDecision,
  ResourceType,
  ResourceAllocation,
  PriorityFactors,
  PriorityScore,
  OrchestrationConflictType,
  OrchestrationConflict,
  OrchestrationConflictResolution,
  ConflictAdjustment,
  OrchestrationDependencyType,
  DependencyResolution,
  DependencyGraph,
  DependencyGraphNode,
  DependencyGraphEdge,
  OrchestrationSchedule,
  CoordinatedStrategy,
  ExecutionPlan,
  ExecutionPlanStep,
  OrchestrationPolicy,
  OrchestrationPolicyRule,
  OrchestrationMetrics,
  ResourceAllocationSummary,
  GoalEffectivenessMetric,
  OrchestrationHistoryAction,
  OrchestrationHistoryEntry,
  OrchestrationStatus,
  OrchestrationInput,
  OrchestrationResult,
  OrchestrationProviderPlugin,
  OrchestrationFeatureFlags,
  PriorityRules,
  OrchestrationConflictRules,
  SchedulingRules,
  ResourcePolicies,
  EnterprisePolicyConfig,
  OrchestrationConfiguration,
  OrchestrationEventType,
  OrchestrationEvent,
  OrchestrationEventListener,
  OrchestrationValidationResult,
  OrchestrationValidationError,
  OrchestrationValidationWarning,
  ExplainabilityReport,
  Goal,
  GoalType,
  GoalStrategy,
  Evidence,
  GoalMeasurementInput,
  SystemMetricsSnapshot,
  DeviceProfileSnapshot,
  RecommendationPriority,
  RiskLevel,
} from './types';

export type {
  GoalStatus,
  GoalPriority,
  GoalConflict,
  GoalDependency,
} from '../types';

// Helpers
export {
  generateOrchestrationId,
  generateDecisionId,
  generatePriorityScoreId,
  generateOrchestrationConflictId,
  generateResourceAllocationId,
  generateOrchestrationScheduleId,
  generateCoordinatedStrategyId,
  generateExecutionPlanId,
  generateExecutionPlanStepId,
  generatePolicyId,
  generatePolicyRuleId,
  generateOrchestrationHistoryId,
  generateExplainabilityId,
  getOrchestrationTypeLabel,
  getOrchestrationStateLabel,
  getResourceTypeLabel,
  getOrchestrationConflictTypeLabel,
  getOrchestrationDependencyTypeLabel,
  getOrchestrationHistoryActionLabel,
  getOrchestrationEventTypeLabel,
  createDefaultPriorityRules,
  createDefaultOrchestrationConflictRules,
  createDefaultSchedulingRules,
  createDefaultResourcePolicies,
  createDefaultEnterprisePolicies,
  createDefaultOrchestrationFeatureFlags,
} from './types';
