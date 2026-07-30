/**
 * Goal Orchestration Engine — Types
 *
 * EPIC 4 PHASE B PART 6
 *
 * Coordinates all active goals. The engine continuously evaluates
 * priorities, dependencies, conflicts and system state to determine
 * the optimal optimization strategy. It is the central decision layer
 * above all Smart Optimize components.
 *
 * Architecture:
 *   Goals → Goal Orchestrator → Priority Engine → Conflict Resolver →
 *   Strategy Coordinator → Optimization Planner → Automation →
 *   Maintenance → Timeline
 *
 * Core architectural principle:
 *   "Every orchestration decision must be explainable, traceable,
 *    and evidence-based. The AI must never invent priorities or
 *    resource allocations — all decisions come from goal metadata,
 *    system state, and historical data."
 */
import type {
  Goal,
  GoalType,
  GoalStrategy,
  Evidence,
  GoalMeasurementInput,
  SystemMetricsSnapshot,
  DeviceProfileSnapshot,
  RecommendationPriority,
  RiskLevel,
} from '../types';

// Re-export for convenience
export type {
  Goal,
  GoalType,
  GoalStrategy,
  Evidence,
  GoalMeasurementInput,
  SystemMetricsSnapshot,
  DeviceProfileSnapshot,
  RecommendationPriority,
  RiskLevel,
} from '../types';

// ── Orchestration Types ──────────────────────────────────────

export type OrchestrationType =
  | 'single'
  | 'multiple'
  | 'continuous'
  | 'temporary'
  | 'adaptive'
  | 'enterprise'
  | 'background'
  | 'future_orchestration';

// ── Orchestration State ──────────────────────────────────────

export type OrchestrationState =
  | 'pending'
  | 'planning'
  | 'waiting'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'blocked'
  | 'future_state';

// ── Orchestration Decision ───────────────────────────────────

export interface OrchestrationDecision {
  id: string;
  timestamp: string;
  activeGoals: string[];
  selectedGoals: string[];
  deferredGoals: string[];
  reason: string;
  supportingEvidence: Evidence[];
  confidence: number;
  estimatedBenefit: number;
  estimatedRisk: RiskLevel;
  resourceUsage: ResourceAllocation[];
  futureMetadata: Record<string, unknown>;
}

// ── Resource Allocation ──────────────────────────────────────

export type ResourceType =
  | 'cpu_budget'
  | 'memory_budget'
  | 'disk_budget'
  | 'network_budget'
  | 'maintenance_window'
  | 'execution_slot'
  | 'future_resource';

export interface ResourceAllocation {
  id: string;
  goalId: string;
  resourceType: ResourceType;
  allocatedAmount: number;
  maxAmount: number;
  unit: string;
  reason: string;
  futureMetadata: Record<string, unknown>;
}

// ── Priority Factors ─────────────────────────────────────────

export interface PriorityFactors {
  goalPriority: number;
  urgency: number;
  expectedBenefit: number;
  risk: number;
  predictionConfidence: number;
  healthScore: number;
  deviceProfileFit: number;
  historicalSuccess: number;
  enterprisePolicyWeight: number;
  userPreferenceWeight: number;
  futureSignals: number;
}

export interface PriorityScore {
  goalId: string;
  score: number;
  factors: PriorityFactors;
  rank: number;
  reason: string;
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Orchestration Conflict ───────────────────────────────────

export type OrchestrationConflictType =
  | 'performance_vs_battery'
  | 'gaming_vs_maintenance'
  | 'privacy_vs_convenience'
  | 'storage_vs_performance'
  | 'business_vs_entertainment'
  | 'security_vs_speed'
  | 'custom_conflict'
  | 'future_conflict';

export interface OrchestrationConflict {
  id: string;
  type: OrchestrationConflictType;
  goalIds: string[];
  description: string;
  severity: RiskLevel;
  resolution: OrchestrationConflictResolution | null;
  detectedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface OrchestrationConflictResolution {
  strategy: 'prioritize' | 'compromise' | 'sequential' | 'defer' | 'cancel' | 'custom';
  winningGoalId: string | null;
  deferredGoalId: string | null;
  description: string;
  adjustments: ConflictAdjustment[];
  confidence: number;
  alternativeStrategy: string;
  futureMetadata: Record<string, unknown>;
}

export interface ConflictAdjustment {
  goalId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}

// ── Dependency Resolution ────────────────────────────────────

export type OrchestrationDependencyType =
  | 'chain'
  | 'prerequisite'
  | 'parent'
  | 'child'
  | 'mutually_exclusive'
  | 'shared_objective'
  | 'future_dependency';

export interface DependencyResolution {
  goalId: string;
  canExecute: boolean;
  blockingDependencies: string[];
  resolvedDependencies: string[];
  unresolvedDependencies: string[];
  executionOrder: number;
  reason: string;
  futureMetadata: Record<string, unknown>;
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  cycles: string[][];
  executionOrder: string[];
  futureMetadata: Record<string, unknown>;
}

export interface DependencyGraphNode {
  goalId: string;
  goalName: string;
  state: OrchestrationState;
  futureMetadata: Record<string, unknown>;
}

export interface DependencyGraphEdge {
  from: string;
  to: string;
  type: OrchestrationDependencyType;
  required: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Scheduling ───────────────────────────────────────────────

export interface OrchestrationSchedule {
  id: string;
  goalId: string;
  scheduledAt: string;
  nextRunAt: string;
  intervalMs: number;
  recurring: boolean;
  priority: number;
  state: OrchestrationState;
  futureMetadata: Record<string, unknown>;
}

// ── Strategy Coordination ────────────────────────────────────

export interface CoordinatedStrategy {
  id: string;
  goalId: string;
  strategy: GoalStrategy;
  coordinatedModules: string[];
  estimatedDurationMs: number;
  estimatedBenefit: number;
  estimatedRisk: RiskLevel;
  resourceRequirements: ResourceAllocation[];
  evidence: Evidence[];
  alternativeStrategy: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface ExecutionPlan {
  id: string;
  goalId: string;
  steps: ExecutionPlanStep[];
  estimatedDurationMs: number;
  estimatedBenefit: number;
  estimatedRisk: RiskLevel;
  resourceUsage: ResourceAllocation[];
  dependencies: string[];
  state: OrchestrationState;
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

export interface ExecutionPlanStep {
  id: string;
  name: string;
  description: string;
  module: string;
  action: string;
  priority: RecommendationPriority;
  estimatedImpact: number;
  estimatedDurationMs: number;
  resourceRequirements: ResourceAllocation[];
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Policy ───────────────────────────────────────────────────

export interface OrchestrationPolicy {
  id: string;
  name: string;
  description: string;
  type: 'priority' | 'conflict' | 'scheduling' | 'resource' | 'enterprise' | 'future_policy';
  rules: OrchestrationPolicyRule[];
  enabled: boolean;
  priority: number;
  futureMetadata: Record<string, unknown>;
}

export interface OrchestrationPolicyRule {
  id: string;
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'custom';
  value: unknown;
  action: string;
  description: string;
  futureMetadata: Record<string, unknown>;
}

// ── Metrics ──────────────────────────────────────────────────

export interface OrchestrationMetrics {
  totalOrchestrations: number;
  activeOrchestrations: number;
  completedOrchestrations: number;
  failedOrchestrations: number;
  averageOrchestrationTimeMs: number;
  goalUtilization: Record<string, number>;
  conflictFrequency: Record<string, number>;
  resourceAllocationSummary: ResourceAllocationSummary;
  completionSuccessRate: number;
  goalEffectiveness: GoalEffectivenessMetric[];
  averageCompletionTimeMs: number;
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface ResourceAllocationSummary {
  totalAllocated: Record<ResourceType, number>;
  totalAvailable: Record<ResourceType, number>;
  utilizationRate: Record<ResourceType, number>;
  futureMetadata: Record<string, unknown>;
}

export interface GoalEffectivenessMetric {
  goalId: string;
  goalName: string;
  goalType: GoalType;
  totalOrchestrations: number;
  completedOrchestrations: number;
  effectiveness: number;
  averageCompletionTimeMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Orchestration History ────────────────────────────────────

export type OrchestrationHistoryAction =
  | 'orchestration_started'
  | 'goals_prioritized'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'resources_allocated'
  | 'strategy_generated'
  | 'goal_deferred'
  | 'goal_completed'
  | 'state_changed'
  | 'future_action';

export interface OrchestrationHistoryEntry {
  id: string;
  orchestrationId: string;
  goalId: string | null;
  action: OrchestrationHistoryAction;
  timestamp: string;
  description: string;
  oldValue: unknown;
  newValue: unknown;
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Orchestration Status ─────────────────────────────────────

export interface OrchestrationStatus {
  state: OrchestrationState;
  activeGoals: string[];
  pendingGoals: string[];
  deferredGoals: string[];
  blockedGoals: string[];
  completedGoals: string[];
  currentDecision: OrchestrationDecision | null;
  lastOrchestrationAt: string | null;
  resourceUtilization: ResourceAllocationSummary | null;
  futureMetadata: Record<string, unknown>;
}

// ── Orchestration Input ──────────────────────────────────────

export interface OrchestrationInput {
  goals: Goal[];
  measurementInput: GoalMeasurementInput;
  systemMetrics: SystemMetricsSnapshot | null;
  deviceProfile: DeviceProfileSnapshot | null;
  healthScore: number | null;
  enterprisePolicies: OrchestrationPolicy[];
  userPreferences: Record<string, unknown>;
  futureData: Record<string, unknown>;
}

// ── Orchestration Result ─────────────────────────────────────

export interface OrchestrationResult {
  decision: OrchestrationDecision;
  priorityScores: PriorityScore[];
  conflicts: OrchestrationConflict[];
  dependencyResolutions: DependencyResolution[];
  schedule: OrchestrationSchedule[];
  coordinatedStrategies: CoordinatedStrategy[];
  executionPlans: ExecutionPlan[];
  resourceAllocations: ResourceAllocation[];
  status: OrchestrationStatus;
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Orchestration Provider Plugin ────────────────────────────

export interface OrchestrationProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getOrchestrationType(): OrchestrationType;
  prioritize(goals: Goal[], input: OrchestrationInput): PriorityScore[] | null;
  resolveConflicts(goals: Goal[], conflicts: OrchestrationConflict[]): OrchestrationConflict[] | null;
  allocateResources(goals: Goal[], input: OrchestrationInput): ResourceAllocation[] | null;
}

// ── Configuration ────────────────────────────────────────────

export interface OrchestrationFeatureFlags {
  enableOrchestration: boolean;
  enablePrioritization: boolean;
  enableConflictResolution: boolean;
  enableDependencies: boolean;
  enableScheduling: boolean;
  enableStrategyCoordination: boolean;
  enableResourceAllocation: boolean;
  enableMetrics: boolean;
  enableHistory: boolean;
  enableEvents: boolean;
  enablePolicies: boolean;
  enableExplainability: boolean;
  futureFlags: Record<string, boolean>;
}

export interface PriorityRules {
  priorityWeight: number;
  urgencyWeight: number;
  benefitWeight: number;
  riskWeight: number;
  predictionConfidenceWeight: number;
  healthScoreWeight: number;
  deviceProfileWeight: number;
  historicalSuccessWeight: number;
  enterprisePolicyWeight: number;
  userPreferenceWeight: number;
  futureSignalsWeight: number;
  maxActiveGoals: number;
  futureRules: Record<string, unknown>;
}

export interface OrchestrationConflictRules {
  autoResolve: boolean;
  maxConflictsBeforePause: number;
  priorityWeight: number;
  enterprisePolicyOverrides: boolean;
  allowCompromise: boolean;
  futureRules: Record<string, unknown>;
}

export interface SchedulingRules {
  defaultIntervalMs: number;
  maxConcurrentExecutions: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  allowPreemption: boolean;
  futureRules: Record<string, unknown>;
}

export interface ResourcePolicies {
  maxCpuBudget: number;
  maxMemoryBudget: number;
  maxDiskBudget: number;
  maxNetworkBudget: number;
  maxMaintenanceWindows: number;
  maxExecutionSlots: number;
  futurePolicies: Record<string, unknown>;
}

export interface EnterprisePolicyConfig {
  enforcePolicies: boolean;
  policyOverrides: boolean;
  allowedGoalTypes: GoalType[];
  blockedGoalTypes: GoalType[];
  futureConfig: Record<string, unknown>;
}

export interface OrchestrationConfiguration {
  configVersion: string;
  priorityRules: PriorityRules;
  conflictRules: OrchestrationConflictRules;
  schedulingRules: SchedulingRules;
  resourcePolicies: ResourcePolicies;
  enterprisePolicies: EnterprisePolicyConfig;
  featureFlags: OrchestrationFeatureFlags;
  enableEvents: boolean;
  maxOrchestrations: number;
  maxHistoryEntries: number;
  performanceTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Events ───────────────────────────────────────────────────

export type OrchestrationEventType =
  | 'goal_orchestration_started'
  | 'goals_prioritized'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'resources_allocated'
  | 'strategy_generated'
  | 'goal_deferred'
  | 'goal_completed';

export interface OrchestrationEvent {
  type: OrchestrationEventType;
  orchestrationId: string;
  goalId: string | null;
  timestamp: string;
  data: unknown;
}

export type OrchestrationEventListener = (event: OrchestrationEvent) => void;

// ── Validation ───────────────────────────────────────────────

export interface OrchestrationValidationResult {
  valid: boolean;
  errors: OrchestrationValidationError[];
  warnings: OrchestrationValidationWarning[];
}

export interface OrchestrationValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface OrchestrationValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Explainability ───────────────────────────────────────────

export interface ExplainabilityReport {
  decisionId: string;
  goalId: string;
  whyPrioritized: string;
  whyDeferred: string | null;
  expectedOutcome: string;
  supportingEvidence: Evidence[];
  confidence: number;
  alternativeStrategy: string;
  potentialConflicts: string[];
  futureMetadata: Record<string, unknown>;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateOrchestrationId(): string {
  return `orch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateDecisionId(): string {
  return `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generatePriorityScoreId(): string {
  return `pscore_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateOrchestrationConflictId(): string {
  return `oconf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateResourceAllocationId(): string {
  return `rall_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateOrchestrationScheduleId(): string {
  return `osch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateCoordinatedStrategyId(): string {
  return `cstrat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateExecutionPlanId(): string {
  return `eplan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateExecutionPlanStepId(): string {
  return `estep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generatePolicyId(): string {
  return `opol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generatePolicyRuleId(): string {
  return `opolrule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateOrchestrationHistoryId(): string {
  return `ohist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateExplainabilityId(): string {
  return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function getOrchestrationTypeLabel(type: OrchestrationType): string {
  const labels: Record<OrchestrationType, string> = {
    single: 'Single Goal',
    multiple: 'Multiple Goals',
    continuous: 'Continuous Goals',
    temporary: 'Temporary Goals',
    adaptive: 'Adaptive Goals',
    enterprise: 'Enterprise Goals',
    background: 'Background Goals',
    future_orchestration: 'Future Orchestration',
  };
  return labels[type] ?? 'Unknown';
}

export function getOrchestrationStateLabel(state: OrchestrationState): string {
  const labels: Record<OrchestrationState, string> = {
    pending: 'Pending',
    planning: 'Planning',
    waiting: 'Waiting',
    executing: 'Executing',
    paused: 'Paused',
    completed: 'Completed',
    cancelled: 'Cancelled',
    blocked: 'Blocked',
    future_state: 'Future State',
  };
  return labels[state] ?? 'Unknown';
}

export function getResourceTypeLabel(type: ResourceType): string {
  const labels: Record<ResourceType, string> = {
    cpu_budget: 'CPU Budget',
    memory_budget: 'Memory Budget',
    disk_budget: 'Disk Budget',
    network_budget: 'Network Budget',
    maintenance_window: 'Maintenance Window',
    execution_slot: 'Execution Slot',
    future_resource: 'Future Resource',
  };
  return labels[type] ?? 'Unknown';
}

export function getOrchestrationConflictTypeLabel(type: OrchestrationConflictType): string {
  const labels: Record<OrchestrationConflictType, string> = {
    performance_vs_battery: 'Performance vs Battery',
    gaming_vs_maintenance: 'Gaming vs Maintenance',
    privacy_vs_convenience: 'Privacy vs Convenience',
    storage_vs_performance: 'Storage vs Performance',
    business_vs_entertainment: 'Business vs Entertainment',
    security_vs_speed: 'Security vs Speed',
    custom_conflict: 'Custom Conflict',
    future_conflict: 'Future Conflict',
  };
  return labels[type] ?? 'Unknown';
}

export function getOrchestrationDependencyTypeLabel(type: OrchestrationDependencyType): string {
  const labels: Record<OrchestrationDependencyType, string> = {
    chain: 'Chain',
    prerequisite: 'Prerequisite',
    parent: 'Parent',
    child: 'Child',
    mutually_exclusive: 'Mutually Exclusive',
    shared_objective: 'Shared Objective',
    future_dependency: 'Future Dependency',
  };
  return labels[type] ?? 'Unknown';
}

export function getOrchestrationHistoryActionLabel(action: OrchestrationHistoryAction): string {
  const labels: Record<OrchestrationHistoryAction, string> = {
    orchestration_started: 'Orchestration Started',
    goals_prioritized: 'Goals Prioritized',
    conflict_detected: 'Conflict Detected',
    conflict_resolved: 'Conflict Resolved',
    resources_allocated: 'Resources Allocated',
    strategy_generated: 'Strategy Generated',
    goal_deferred: 'Goal Deferred',
    goal_completed: 'Goal Completed',
    state_changed: 'State Changed',
    future_action: 'Future Action',
  };
  return labels[action] ?? 'Unknown';
}

export function getOrchestrationEventTypeLabel(type: OrchestrationEventType): string {
  const labels: Record<OrchestrationEventType, string> = {
    goal_orchestration_started: 'Goal Orchestration Started',
    goals_prioritized: 'Goals Prioritized',
    conflict_detected: 'Conflict Detected',
    conflict_resolved: 'Conflict Resolved',
    resources_allocated: 'Resources Allocated',
    strategy_generated: 'Strategy Generated',
    goal_deferred: 'Goal Deferred',
    goal_completed: 'Goal Completed',
  };
  return labels[type] ?? 'Unknown';
}

export function createDefaultPriorityRules(): PriorityRules {
  return {
    priorityWeight: 0.25,
    urgencyWeight: 0.15,
    benefitWeight: 0.15,
    riskWeight: 0.1,
    predictionConfidenceWeight: 0.1,
    healthScoreWeight: 0.05,
    deviceProfileWeight: 0.05,
    historicalSuccessWeight: 0.05,
    enterprisePolicyWeight: 0.05,
    userPreferenceWeight: 0.03,
    futureSignalsWeight: 0.02,
    maxActiveGoals: 5,
    futureRules: {},
  };
}

export function createDefaultOrchestrationConflictRules(): OrchestrationConflictRules {
  return {
    autoResolve: true,
    maxConflictsBeforePause: 3,
    priorityWeight: 0.5,
    enterprisePolicyOverrides: false,
    allowCompromise: true,
    futureRules: {},
  };
}

export function createDefaultSchedulingRules(): SchedulingRules {
  return {
    defaultIntervalMs: 3600000,
    maxConcurrentExecutions: 3,
    minIntervalMs: 60000,
    maxIntervalMs: 86400000,
    allowPreemption: true,
    futureRules: {},
  };
}

export function createDefaultResourcePolicies(): ResourcePolicies {
  return {
    maxCpuBudget: 100,
    maxMemoryBudget: 100,
    maxDiskBudget: 100,
    maxNetworkBudget: 100,
    maxMaintenanceWindows: 2,
    maxExecutionSlots: 3,
    futurePolicies: {},
  };
}

export function createDefaultEnterprisePolicies(): EnterprisePolicyConfig {
  return {
    enforcePolicies: false,
    policyOverrides: false,
    allowedGoalTypes: [],
    blockedGoalTypes: [],
    futureConfig: {},
  };
}

export function createDefaultOrchestrationFeatureFlags(): OrchestrationFeatureFlags {
  return {
    enableOrchestration: true,
    enablePrioritization: true,
    enableConflictResolution: true,
    enableDependencies: true,
    enableScheduling: true,
    enableStrategyCoordination: true,
    enableResourceAllocation: true,
    enableMetrics: true,
    enableHistory: true,
    enableEvents: true,
    enablePolicies: true,
    enableExplainability: true,
    futureFlags: {},
  };
}
