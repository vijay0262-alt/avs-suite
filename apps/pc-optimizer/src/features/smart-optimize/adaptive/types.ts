/**
 * Smart Optimize 2.0 — Adaptive Optimization Engine Type Definitions
 *
 * EPIC 4 PHASE A PART 3 — Adaptive Optimization Engine.
 *
 * Dynamically adapts optimization plans based on real-time system conditions.
 * Makes optimization context-aware without changing the optimization modules.
 *
 * Architecture:
 *   Context → Knowledge → Prediction Engine → Device Profile →
 *   Adaptive Engine → Updated Optimization Plan → Execution Pipeline
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every adaptation, decision, and
 *    condition evaluation must be traceable, explainable, and policy-driven."
 */
import type { SmartPlan, OptimizationGoal, RiskLevel, RecommendationPriority } from '../planner/types';

// Re-export for convenience
export type { SmartPlan, OptimizationGoal, RiskLevel, RecommendationPriority } from '../planner/types';

// ── System Condition Types ───────────────────────────────────

export type ConditionType =
  | 'cpu_usage'
  | 'memory_usage'
  | 'disk_activity'
  | 'battery_level'
  | 'power_source'
  | 'user_activity'
  | 'full_screen_app'
  | 'gaming_mode'
  | 'windows_update'
  | 'network_activity'
  | 'thermal_state'
  | 'storage_pressure'
  | 'custom_condition'
  | 'future_condition';

export type ConditionSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type ConditionStatus = 'active' | 'inactive' | 'unknown';

// ── System State ─────────────────────────────────────────────

export interface SystemState {
  cpuUsage: number;
  memoryUsage: number;
  diskActivity: number;
  batteryLevel: number | null;
  powerSource: 'ac' | 'battery' | 'ups' | 'unknown';
  userActive: boolean;
  fullScreenApp: boolean;
  gamingMode: boolean;
  windowsUpdateActive: boolean;
  networkActivity: number;
  thermalState: 'normal' | 'warm' | 'hot' | 'critical' | 'unknown';
  storagePressure: number;
  isIdle: boolean;
  timestamp: string;
}

// ── Condition ────────────────────────────────────────────────

export interface Condition {
  id: string;
  type: ConditionType;
  name: string;
  description: string;
  severity: ConditionSeverity;
  status: ConditionStatus;
  value: number;
  threshold: number;
  unit: string;
  detectedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Condition Rule ───────────────────────────────────────────

export interface ConditionRule {
  id: string;
  conditionType: ConditionType;
  name: string;
  description: string;
  threshold: number;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  severity: ConditionSeverity;
  enabled: boolean;
  adaptationAction: AdaptationAction;
  futureMetadata: Record<string, unknown>;
}

// ── Adaptation Action ────────────────────────────────────────

export type AdaptationAction =
  | 'postpone_step'
  | 'skip_step'
  | 'reorder_step'
  | 'reduce_scope'
  | 'increase_scope'
  | 'split_plan'
  | 'pause_plan'
  | 'resume_plan'
  | 'cancel_plan'
  | 'no_action'
  | 'future_adaptation';

// ── Adaptation Decision ──────────────────────────────────────

export interface AdaptationDecision {
  id: string;
  condition: string;
  conditionType: ConditionType;
  decision: AdaptationAction;
  reason: string;
  confidence: number;
  priority: RecommendationPriority;
  estimatedImpact: number;
  estimatedDelay: number;
  rollbackAvailable: boolean;
  affectedActionIds: string[];
  futureMetadata: Record<string, unknown>;
}

// ── Adaptation Result ────────────────────────────────────────

export interface AdaptationResult {
  originalPlan: SmartPlan;
  adaptedPlan: SmartPlan;
  decisions: AdaptationDecision[];
  conditions: Condition[];
  adapted: boolean;
  summary: string;
  adaptedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Adaptive Policies ────────────────────────────────────────

export type AdaptivePolicyType =
  | 'performance'
  | 'battery'
  | 'gaming'
  | 'developer'
  | 'business'
  | 'safety'
  | 'thermal'
  | 'maintenance'
  | 'enterprise'
  | 'custom'
  | 'future_policy';

export interface AdaptivePolicy {
  id: string;
  type: AdaptivePolicyType;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  rules: AdaptationRule[];
  futureMetadata: Record<string, unknown>;
}

export interface AdaptationRule {
  id: string;
  conditionType: ConditionType;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number;
  action: AdaptationAction;
  reason: string;
  priority: RecommendationPriority;
  confidence: number;
}

// ── Evaluation Context ───────────────────────────────────────

export interface EvaluationContext {
  systemState: SystemState;
  plan: SmartPlan;
  goal: OptimizationGoal;
  deviceProfileType: string;
  riskTolerance: RiskLevel;
  userPreferences: AdaptiveUserPreferences | null;
  historicalOutcomes: AdaptiveHistoryEntry[];
}

export interface AdaptiveUserPreferences {
  allowBackgroundOptimization: boolean;
  pauseOnFullScreen: boolean;
  pauseOnGaming: boolean;
  deferOnBattery: boolean;
  thermalThrottle: boolean;
}

// ── Validation ───────────────────────────────────────────────

export interface AdaptationValidationResult {
  valid: boolean;
  errors: AdaptationValidationError[];
  warnings: AdaptationValidationWarning[];
}

export interface AdaptationValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface AdaptationValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Statistics ───────────────────────────────────────────────

export interface AdaptiveStatistics {
  totalAdaptations: number;
  totalConditionsDetected: number;
  byAction: Record<string, number>;
  byConditionType: Record<string, number>;
  averageConfidence: number;
  averageDelay: number;
  plansPaused: number;
  plansResumed: number;
  plansCancelled: number;
  lastAdaptationAt: string | null;
}

// ── History ──────────────────────────────────────────────────

export interface AdaptiveHistoryEntry {
  id: string;
  planId: string;
  action: AdaptationAction;
  conditionType: ConditionType;
  timestamp: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

// ── Events ───────────────────────────────────────────────────

export type AdaptiveEventType =
  | 'adaptation_started'
  | 'condition_detected'
  | 'plan_modified'
  | 'plan_paused'
  | 'plan_resumed'
  | 'plan_cancelled'
  | 'adaptation_completed';

export interface AdaptiveEvent {
  type: AdaptiveEventType;
  planId: string;
  timestamp: string;
  data: unknown;
}

export type AdaptiveEventListener = (event: AdaptiveEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface AdaptiveConfiguration {
  configVersion: string;
  conditionRules: ConditionRule[];
  adaptationRules: AdaptationRule[];
  policies: AdaptivePolicy[];
  thresholds: AdaptiveThresholds;
  priorities: AdaptivePriorities;
  featureFlags: AdaptiveFeatureFlags;
  enableEvents: boolean;
  maxHistoryEntries: number;
  evaluationIntervalMs: number;
}

export interface AdaptiveThresholds {
  cpuHighUsage: number;
  cpuCriticalUsage: number;
  memoryHighUsage: number;
  memoryCriticalUsage: number;
  diskHighActivity: number;
  batteryLowLevel: number;
  batteryCriticalLevel: number;
  storageHighPressure: number;
  thermalWarmThreshold: number;
  thermalHotThreshold: number;
  idleThresholdMinutes: number;
}

export interface AdaptivePriorities {
  safetyPriority: number;
  performancePriority: number;
  batteryPriority: number;
  thermalPriority: number;
  userExperiencePriority: number;
  maintenancePriority: number;
}

export interface AdaptiveFeatureFlags {
  enableConditionEvaluation: boolean;
  enablePlanModification: boolean;
  enablePlanPause: boolean;
  enablePlanCancel: boolean;
  enableStateMonitoring: boolean;
  enableHistory: boolean;
  enableValidation: boolean;
  futureFlags: Record<string, boolean>;
}

// ── Provider Plugin (Extensibility) ──────────────────────────

export interface ConditionProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  evaluate(state: SystemState): Condition | null;
}

export interface PolicyProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getPolicy(): AdaptivePolicy;
}

// ── Helper Functions ─────────────────────────────────────────

export function createDefaultAdaptiveConfiguration(): AdaptiveConfiguration {
  return {
    configVersion: '1.0.0',
    conditionRules: [
      { id: 'rule_cpu_high', conditionType: 'cpu_usage', name: 'High CPU Usage', description: 'Delay heavy optimization when CPU is high', threshold: 80, operator: '>', severity: 'high', enabled: true, adaptationAction: 'postpone_step', futureMetadata: {} },
      { id: 'rule_cpu_critical', conditionType: 'cpu_usage', name: 'Critical CPU Usage', description: 'Cancel optimization when CPU is critical', threshold: 95, operator: '>', severity: 'critical', enabled: true, adaptationAction: 'pause_plan', futureMetadata: {} },
      { id: 'rule_memory_high', conditionType: 'memory_usage', name: 'High Memory Usage', description: 'Reduce scope when memory is high', threshold: 85, operator: '>', severity: 'high', enabled: true, adaptationAction: 'reduce_scope', futureMetadata: {} },
      { id: 'rule_battery_low', conditionType: 'battery_level', name: 'Low Battery', description: 'Disable deep optimization on battery', threshold: 20, operator: '<', severity: 'high', enabled: true, adaptationAction: 'reduce_scope', futureMetadata: {} },
      { id: 'rule_battery_critical', conditionType: 'battery_level', name: 'Critical Battery', description: 'Pause plan on critical battery', threshold: 10, operator: '<', severity: 'critical', enabled: true, adaptationAction: 'pause_plan', futureMetadata: {} },
      { id: 'rule_full_screen', conditionType: 'full_screen_app', name: 'Full Screen Active', description: 'Pause background work during full screen', threshold: 1, operator: '==', severity: 'medium', enabled: true, adaptationAction: 'pause_plan', futureMetadata: {} },
      { id: 'rule_gaming_mode', conditionType: 'gaming_mode', name: 'Gaming Mode Active', description: 'Pause optimization during gaming', threshold: 1, operator: '==', severity: 'high', enabled: true, adaptationAction: 'pause_plan', futureMetadata: {} },
      { id: 'rule_windows_update', conditionType: 'windows_update', name: 'Windows Update Active', description: 'Skip conflicting operations during update', threshold: 1, operator: '==', severity: 'medium', enabled: true, adaptationAction: 'skip_step', futureMetadata: {} },
      { id: 'rule_thermal_hot', conditionType: 'thermal_state', name: 'Thermal Hot', description: 'Reduce scope when thermal state is hot', threshold: 2, operator: '>=', severity: 'high', enabled: true, adaptationAction: 'reduce_scope', futureMetadata: {} },
      { id: 'rule_idle', conditionType: 'user_activity', name: 'System Idle', description: 'Resume deferred tasks when idle', threshold: 0, operator: '==', severity: 'low', enabled: true, adaptationAction: 'resume_plan', futureMetadata: {} },
      { id: 'rule_storage_pressure', conditionType: 'storage_pressure', name: 'Storage Pressure', description: 'Prioritize storage optimization under pressure', threshold: 90, operator: '>', severity: 'medium', enabled: true, adaptationAction: 'reorder_step', futureMetadata: {} },
    ],
    adaptationRules: [],
    policies: [
      { id: 'policy_safety', type: 'safety', name: 'Safety Policy', description: 'Prioritize system safety', priority: 1, enabled: true, rules: [], futureMetadata: {} },
      { id: 'policy_performance', type: 'performance', name: 'Performance Policy', description: 'Optimize for performance', priority: 2, enabled: true, rules: [], futureMetadata: {} },
      { id: 'policy_battery', type: 'battery', name: 'Battery Policy', description: 'Conserve battery life', priority: 3, enabled: true, rules: [], futureMetadata: {} },
      { id: 'policy_gaming', type: 'gaming', name: 'Gaming Policy', description: 'Pause during gaming', priority: 4, enabled: true, rules: [], futureMetadata: {} },
      { id: 'policy_thermal', type: 'thermal', name: 'Thermal Policy', description: 'Manage thermal state', priority: 5, enabled: true, rules: [], futureMetadata: {} },
    ],
    thresholds: {
      cpuHighUsage: 80,
      cpuCriticalUsage: 95,
      memoryHighUsage: 85,
      memoryCriticalUsage: 95,
      diskHighActivity: 80,
      batteryLowLevel: 20,
      batteryCriticalLevel: 10,
      storageHighPressure: 90,
      thermalWarmThreshold: 1,
      thermalHotThreshold: 2,
      idleThresholdMinutes: 5,
    },
    priorities: {
      safetyPriority: 1,
      performancePriority: 2,
      batteryPriority: 3,
      thermalPriority: 4,
      userExperiencePriority: 5,
      maintenancePriority: 6,
    },
    featureFlags: {
      enableConditionEvaluation: true,
      enablePlanModification: true,
      enablePlanPause: true,
      enablePlanCancel: true,
      enableStateMonitoring: true,
      enableHistory: true,
      enableValidation: true,
      futureFlags: {},
    },
    enableEvents: true,
    maxHistoryEntries: 500,
    evaluationIntervalMs: 5000,
  };
}

export function generateAdaptationId(): string {
  return `adapt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateDecisionId(): string {
  return `decision_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateConditionId(): string {
  return `cond_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function generateAdaptiveHistoryId(): string {
  return `adaphist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function severityToScore(severity: ConditionSeverity): number {
  const scores: Record<ConditionSeverity, number> = { none: 0, low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
  return scores[severity] ?? 0;
}

export function createDefaultSystemState(): SystemState {
  return {
    cpuUsage: 0,
    memoryUsage: 0,
    diskActivity: 0,
    batteryLevel: null,
    powerSource: 'unknown',
    userActive: true,
    fullScreenApp: false,
    gamingMode: false,
    windowsUpdateActive: false,
    networkActivity: 0,
    thermalState: 'normal',
    storagePressure: 0,
    isIdle: false,
    timestamp: new Date().toISOString(),
  };
}
