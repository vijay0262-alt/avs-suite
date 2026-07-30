/**
 * Goals & Objectives Engine — Types
 *
 * EPIC 4 PHASE B PART 5
 *
 * Enables users to define measurable PC objectives. Instead of selecting
 * optimization modes, users define outcomes. The AI continuously plans,
 * measures, and adapts optimization strategies until goals are achieved.
 *
 * Architecture:
 *   Goals → Strategy Engine → Recommendation Engine →
 *   Optimization Planner → Automation → Maintenance →
 *   Timeline → Progress Measurement
 *
 * Core architectural principle:
 *   "Every goal must be measurable, explainable, and traceable.
 *    The AI must never invent measurements — all progress data comes
 *    from existing modules: Timeline, Recommendations, Predictions,
 *    Maintenance Results, Optimization History, Health Score, Device Profile."
 */
import type { RecommendationPriority, RiskLevel } from '../../ai-intelligence/recommendations/types';
import type { Evidence } from '../intelligence/types';
import type { OptimizationHistoryEntry } from '../planner/types';

// Re-export for convenience
export type { RecommendationPriority, RiskLevel } from '../../ai-intelligence/recommendations/types';
export type { Evidence } from '../intelligence/types';
export type { OptimizationHistoryEntry } from '../planner/types';

// ── Goal Types ───────────────────────────────────────────────

export type GoalType =
  | 'performance'
  | 'gaming'
  | 'developer'
  | 'trading'
  | 'privacy'
  | 'storage'
  | 'startup'
  | 'battery'
  | 'health'
  | 'security'
  | 'business'
  | 'creator'
  | 'student'
  | 'accessibility'
  | 'custom'
  | 'future_goal';

// ── Goal Status ──────────────────────────────────────────────

export type GoalStatus =
  | 'draft'
  | 'started'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'blocked'
  | 'future_status';

// ── Goal Priority ────────────────────────────────────────────

export type GoalPriority = 'critical' | 'high' | 'medium' | 'low' | 'informational';

// ── Target Metrics ───────────────────────────────────────────

export type TargetMetric =
  | 'health_score'
  | 'boot_time'
  | 'free_disk_space'
  | 'memory_usage'
  | 'cpu_usage'
  | 'background_processes'
  | 'privacy_score'
  | 'security_score'
  | 'startup_duration'
  | 'storage_recovery'
  | 'app_launch_time'
  | 'battery_usage'
  | 'future_metric';

// ── Measurement Direction ────────────────────────────────────

export type MeasurementDirection = 'increase' | 'decrease' | 'maintain';

// ── Goal Strategy Types ──────────────────────────────────────

export type GoalStrategyType =
  | 'one_time'
  | 'continuous'
  | 'scheduled'
  | 'adaptive'
  | 'event_driven'
  | 'maintenance_assisted'
  | 'automation_assisted'
  | 'prediction_driven'
  | 'custom_strategy'
  | 'future_strategy';

// ── Goal ─────────────────────────────────────────────────────

export interface Goal {
  id: string;
  name: string;
  description: string;
  category: GoalType;
  priority: GoalPriority;
  status: GoalStatus;
  targetMetric: TargetMetric;
  targetValue: number;
  currentValue: number;
  progress: number;
  confidence: number;
  strategy: GoalStrategy;
  estimatedCompletion: string | null;
  dependencies: GoalDependency[];
  constraints: GoalConstraint[];
  recommendations: GoalRecommendation[];
  evidence: Evidence[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Goal Strategy ────────────────────────────────────────────

export interface GoalStrategy {
  type: GoalStrategyType;
  steps: GoalStrategyStep[];
  estimatedDurationMs: number;
  estimatedEffort: 'low' | 'medium' | 'high';
  riskLevel: RiskLevel;
  confidence: number;
  rationale: string;
  futureMetadata: Record<string, unknown>;
}

export interface GoalStrategyStep {
  id: string;
  name: string;
  description: string;
  action: string;
  module: string;
  priority: RecommendationPriority;
  estimatedImpact: number;
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Goal Dependency ──────────────────────────────────────────

export type DependencyType =
  | 'parent'
  | 'child'
  | 'chain'
  | 'prerequisite'
  | 'blocking'
  | 'optional'
  | 'future_dependency';

export interface GoalDependency {
  id: string;
  goalId: string;
  type: DependencyType;
  required: boolean;
  description: string;
  futureMetadata: Record<string, unknown>;
}

// ── Goal Constraint ──────────────────────────────────────────

export type ConstraintType =
  | 'time_window'
  | 'resource_limit'
  | 'budget'
  | 'subscription'
  | 'enterprise_policy'
  | 'user_preference'
  | 'future_constraint';

export interface GoalConstraint {
  id: string;
  type: ConstraintType;
  value: string;
  description: string;
  enforced: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Goal Recommendation ──────────────────────────────────────

export type GoalRecommendationType =
  | 'next_best_action'
  | 'suggested_maintenance'
  | 'optimization_strategy'
  | 'alternative_strategy'
  | 'priority_change'
  | 'conflict_resolution'
  | 'future_recommendation';

export interface GoalRecommendation {
  id: string;
  type: GoalRecommendationType;
  title: string;
  description: string;
  module: string;
  priority: RecommendationPriority;
  confidence: number;
  evidence: Evidence[];
  actionData: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

// ── Goal Progress ────────────────────────────────────────────

export interface GoalProgress {
  goalId: string;
  status: GoalStatus;
  currentValue: number;
  targetValue: number;
  progress: number;
  delta: number;
  direction: MeasurementDirection;
  measuredAt: string;
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Goal Measurement Input ───────────────────────────────────

export interface GoalMeasurementInput {
  goalId: string;
  timelineEvents: TimelineEventSnapshot[];
  recommendations: RecommendationSnapshot[];
  predictions: PredictionSnapshot[];
  maintenanceResults: MaintenanceResultSnapshot[];
  optimizationHistory: OptimizationHistoryEntry[];
  healthScore: number | null;
  deviceProfile: DeviceProfileSnapshot | null;
  systemMetrics: SystemMetricsSnapshot | null;
  futureData: Record<string, unknown>;
}

export interface TimelineEventSnapshot {
  eventType: string;
  category: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface RecommendationSnapshot {
  id: string;
  category: string;
  priority: RecommendationPriority;
  confidence: number;
  accepted: boolean;
}

export interface PredictionSnapshot {
  type: string;
  confidence: number;
  predictedValue: number;
  timestamp: string;
}

export interface MaintenanceResultSnapshot {
  id: string;
  type: string;
  completed: boolean;
  timestamp: string;
}

export interface DeviceProfileSnapshot {
  profileType: string;
  performanceTier: string;
  confidence: number;
}

export interface SystemMetricsSnapshot {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  bootTimeMs: number;
  freeDiskSpaceBytes: number;
  backgroundProcessCount: number;
  privacyScore: number;
  securityScore: number;
  startupDurationMs: number;
  appLaunchTimeMs: number;
  batteryLevel: number | null;
  batteryUsagePerHour: number | null;
  futureMetrics: Record<string, number>;
}

// ── Goal Conflict ────────────────────────────────────────────

export type ConflictType =
  | 'battery_vs_performance'
  | 'gaming_vs_maintenance'
  | 'privacy_vs_convenience'
  | 'storage_vs_recovery'
  | 'multiple_active'
  | 'enterprise_policy'
  | 'future_conflict';

export interface GoalConflict {
  id: string;
  type: ConflictType;
  goalIds: string[];
  description: string;
  severity: RiskLevel;
  resolution: ConflictResolution | null;
  detectedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface ConflictResolution {
  strategy: 'prioritize' | 'compromise' | 'sequential' | 'defer' | 'cancel' | 'custom';
  winningGoalId: string | null;
  description: string;
  adjustments: ConflictAdjustment[];
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface ConflictAdjustment {
  goalId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}

// ── Goal History ─────────────────────────────────────────────

export type GoalHistoryAction =
  | 'created'
  | 'updated'
  | 'started'
  | 'paused'
  | 'resumed'
  | 'completed'
  | 'cancelled'
  | 'blocked'
  | 'unblocked'
  | 'measured'
  | 'strategy_generated'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'expired'
  | 'future_action';

export interface GoalHistoryEntry {
  id: string;
  goalId: string;
  action: GoalHistoryAction;
  timestamp: string;
  description: string;
  oldValue: unknown;
  newValue: unknown;
  futureMetadata: Record<string, unknown>;
}

// ── Goal Analytics ───────────────────────────────────────────

export interface GoalAnalytics {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  blockedGoals: number;
  cancelledGoals: number;
  completionRate: number;
  averageProgress: number;
  averageTimeToCompletionMs: number;
  successRate: number;
  goalsByType: Record<GoalType, number>;
  goalsByStatus: Record<GoalStatus, number>;
  goalsByPriority: Record<GoalPriority, number>;
  goalEffectiveness: GoalEffectiveness[];
  historicalTrends: GoalTrendPoint[];
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface GoalEffectiveness {
  goalType: GoalType;
  totalGoals: number;
  completedGoals: number;
  averageProgress: number;
  averageTimeMs: number;
  effectiveness: number;
}

export interface GoalTrendPoint {
  timestamp: string;
  activeGoals: number;
  completedGoals: number;
  averageProgress: number;
}

// ── Goal Validation ──────────────────────────────────────────

export interface GoalValidationResult {
  valid: boolean;
  errors: GoalValidationError[];
  warnings: GoalValidationWarning[];
}

export interface GoalValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface GoalValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Goal Provider Plugin ─────────────────────────────────────

export interface GoalProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getGoalType(): GoalType;
  generateStrategy(goal: Goal, input: GoalMeasurementInput): GoalStrategy | null;
  measure(goal: Goal, input: GoalMeasurementInput): number | null;
}

// ── Goal Configuration ───────────────────────────────────────

export interface GoalFeatureFlags {
  enableGoals: boolean;
  enableStrategies: boolean;
  enableMeasurement: boolean;
  enableProgress: boolean;
  enableConflicts: boolean;
  enableDependencies: boolean;
  enableRecommendations: boolean;
  enableAnalytics: boolean;
  enableHistory: boolean;
  enableEvents: boolean;
  enableValidation: boolean;
  enableScheduling: boolean;
  futureFlags: Record<string, boolean>;
}

export interface MeasurementRules {
  measurementIntervalMs: number;
  requireEvidence: boolean;
  minConfidence: number;
  staleDataThresholdMs: number;
  futureRules: Record<string, unknown>;
}

export interface StrategyRules {
  maxStepsPerStrategy: number;
  maxStrategiesPerGoal: number;
  allowAdaptiveStrategies: boolean;
  allowPredictionDriven: boolean;
  minStrategyConfidence: number;
  futureRules: Record<string, unknown>;
}

export interface ConflictRules {
  autoResolve: boolean;
  maxActiveGoals: number;
  priorityWeight: number;
  enterprisePolicyOverrides: boolean;
  futureRules: Record<string, unknown>;
}

export interface GoalConfiguration {
  configVersion: string;
  measurementRules: MeasurementRules;
  strategyRules: StrategyRules;
  conflictRules: ConflictRules;
  featureFlags: GoalFeatureFlags;
  enableEvents: boolean;
  maxGoals: number;
  maxHistoryEntries: number;
  performanceTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Goal Events ──────────────────────────────────────────────

export type GoalEventType =
  | 'goal_created'
  | 'goal_updated'
  | 'goal_started'
  | 'goal_paused'
  | 'goal_completed'
  | 'goal_blocked'
  | 'goal_measured'
  | 'strategy_generated';

export interface GoalEvent {
  type: GoalEventType;
  goalId: string;
  timestamp: string;
  data: unknown;
}

export type GoalEventListener = (event: GoalEvent) => void;

// ── Goal Schedule ────────────────────────────────────────────

export interface GoalSchedule {
  goalId: string;
  nextRunAt: string;
  intervalMs: number;
  recurring: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateGoalId(): string {
  return `goal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateStrategyStepId(): string {
  return `gss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateRecommendationId(): string {
  return `grec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateDependencyId(): string {
  return `gdep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateConstraintId(): string {
  return `gcon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateHistoryId(): string {
  return `ghist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateConflictId(): string {
  return `gconf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateScheduleId(): string {
  return `gsch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function priorityToScore(priority: GoalPriority): number {
  const scores: Record<GoalPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    informational: 0,
  };
  return scores[priority] ?? 0;
}

export function scoreToPriority(score: number): GoalPriority {
  if (score >= 4) return 'critical';
  if (score >= 3) return 'high';
  if (score >= 2) return 'medium';
  if (score >= 1) return 'low';
  return 'informational';
}

export function getGoalTypeLabel(type: GoalType): string {
  const labels: Record<GoalType, string> = {
    performance: 'Performance',
    gaming: 'Gaming',
    developer: 'Developer',
    trading: 'Trading',
    privacy: 'Privacy',
    storage: 'Storage',
    startup: 'Startup',
    battery: 'Battery',
    health: 'Health',
    security: 'Security',
    business: 'Business',
    creator: 'Creator',
    student: 'Student',
    accessibility: 'Accessibility',
    custom: 'Custom',
    future_goal: 'Future',
  };
  return labels[type] ?? 'Unknown';
}

export function getGoalStatusLabel(status: GoalStatus): string {
  const labels: Record<GoalStatus, string> = {
    draft: 'Draft',
    started: 'Started',
    in_progress: 'In Progress',
    paused: 'Paused',
    completed: 'Completed',
    cancelled: 'Cancelled',
    expired: 'Expired',
    blocked: 'Blocked',
    future_status: 'Future',
  };
  return labels[status] ?? 'Unknown';
}

export function getGoalPriorityLabel(priority: GoalPriority): string {
  const labels: Record<GoalPriority, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    informational: 'Informational',
  };
  return labels[priority] ?? 'Unknown';
}

export function getTargetMetricLabel(metric: TargetMetric): string {
  const labels: Record<TargetMetric, string> = {
    health_score: 'Health Score',
    boot_time: 'Boot Time',
    free_disk_space: 'Free Disk Space',
    memory_usage: 'Memory Usage',
    cpu_usage: 'CPU Usage',
    background_processes: 'Background Processes',
    privacy_score: 'Privacy Score',
    security_score: 'Security Score',
    startup_duration: 'Startup Duration',
    storage_recovery: 'Storage Recovery',
    app_launch_time: 'Application Launch Time',
    battery_usage: 'Battery Usage',
    future_metric: 'Future Metric',
  };
  return labels[metric] ?? 'Unknown';
}

export function getStrategyTypeLabel(type: GoalStrategyType): string {
  const labels: Record<GoalStrategyType, string> = {
    one_time: 'One-Time',
    continuous: 'Continuous',
    scheduled: 'Scheduled',
    adaptive: 'Adaptive',
    event_driven: 'Event Driven',
    maintenance_assisted: 'Maintenance Assisted',
    automation_assisted: 'Automation Assisted',
    prediction_driven: 'Prediction Driven',
    custom_strategy: 'Custom Strategy',
    future_strategy: 'Future Strategy',
  };
  return labels[type] ?? 'Unknown';
}

export function getDependencyTypeLabel(type: DependencyType): string {
  const labels: Record<DependencyType, string> = {
    parent: 'Parent',
    child: 'Child',
    chain: 'Chain',
    prerequisite: 'Prerequisite',
    blocking: 'Blocking',
    optional: 'Optional',
    future_dependency: 'Future',
  };
  return labels[type] ?? 'Unknown';
}

export function getConflictTypeLabel(type: ConflictType): string {
  const labels: Record<ConflictType, string> = {
    battery_vs_performance: 'Battery vs Performance',
    gaming_vs_maintenance: 'Gaming vs Maintenance',
    privacy_vs_convenience: 'Privacy vs Convenience',
    storage_vs_recovery: 'Storage vs Recovery',
    multiple_active: 'Multiple Active Goals',
    enterprise_policy: 'Enterprise Policy',
    future_conflict: 'Future Conflict',
  };
  return labels[type] ?? 'Unknown';
}

export function getHistoryActionLabel(action: GoalHistoryAction): string {
  const labels: Record<GoalHistoryAction, string> = {
    created: 'Created',
    updated: 'Updated',
    started: 'Started',
    paused: 'Paused',
    resumed: 'Resumed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    blocked: 'Blocked',
    unblocked: 'Unblocked',
    measured: 'Measured',
    strategy_generated: 'Strategy Generated',
    conflict_detected: 'Conflict Detected',
    conflict_resolved: 'Conflict Resolved',
    expired: 'Expired',
    future_action: 'Future Action',
  };
  return labels[action] ?? 'Unknown';
}

export function computeProgress(current: number, target: number, direction: MeasurementDirection): number {
  if (direction === 'increase') {
    if (target <= 0) return 0;
    return Math.min(1, Math.max(0, current / target));
  } else if (direction === 'decrease') {
    if (current <= target) return 1;
    if (current <= 0) return 0;
    return Math.min(1, Math.max(0, target / current));
  }
  // maintain
  const tolerance = Math.abs(target * 0.05);
  return Math.abs(current - target) <= tolerance ? 1 : 0;
}

export function getMeasurementDirection(metric: TargetMetric): MeasurementDirection {
  const increaseMetrics: TargetMetric[] = [
    'health_score', 'free_disk_space', 'privacy_score', 'security_score', 'storage_recovery',
  ];
  const decreaseMetrics: TargetMetric[] = [
    'boot_time', 'memory_usage', 'cpu_usage', 'background_processes',
    'startup_duration', 'app_launch_time', 'battery_usage',
  ];
  if (increaseMetrics.includes(metric)) return 'increase';
  if (decreaseMetrics.includes(metric)) return 'decrease';
  return 'maintain';
}

export function createDefaultMeasurementRules(): MeasurementRules {
  return {
    measurementIntervalMs: 3600000,
    requireEvidence: true,
    minConfidence: 0.5,
    staleDataThresholdMs: 86400000,
    futureRules: {},
  };
}

export function createDefaultStrategyRules(): StrategyRules {
  return {
    maxStepsPerStrategy: 10,
    maxStrategiesPerGoal: 3,
    allowAdaptiveStrategies: true,
    allowPredictionDriven: true,
    minStrategyConfidence: 0.5,
    futureRules: {},
  };
}

export function createDefaultConflictRules(): ConflictRules {
  return {
    autoResolve: true,
    maxActiveGoals: 5,
    priorityWeight: 0.5,
    enterprisePolicyOverrides: false,
    futureRules: {},
  };
}

export function createDefaultFeatureFlags(): GoalFeatureFlags {
  return {
    enableGoals: true,
    enableStrategies: true,
    enableMeasurement: true,
    enableProgress: true,
    enableConflicts: true,
    enableDependencies: true,
    enableRecommendations: true,
    enableAnalytics: true,
    enableHistory: true,
    enableEvents: true,
    enableValidation: true,
    enableScheduling: true,
    futureFlags: {},
  };
}
