/**
 * Smart Optimize 2.0 — Intelligent Maintenance Engine Type Definitions
 *
 * EPIC 4 PHASE A PART 4 — Intelligent Maintenance Engine.
 *
 * Determines the optimal maintenance opportunity using system state,
 * user behavior, policies, and AI recommendations.
 * Coordinates with the existing scheduler rather than replacing it.
 * Does NOT execute optimizations directly.
 *
 * Architecture:
 *   Context → Knowledge → Recommendations → Predictions →
 *   Adaptive Planner → Maintenance Engine → Existing Scheduler → Execution Pipeline
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every maintenance opportunity,
 *    eligibility decision, and priority ranking must be traceable,
 *    explainable, and policy-driven."
 */
import type { RiskLevel, RecommendationPriority } from '../planner/types';
import type { SystemState } from '../adaptive/types';

// Re-export for convenience
export type { SmartPlan, OptimizationGoal, RiskLevel, RecommendationPriority } from '../planner/types';
export type { SystemState } from '../adaptive/types';

// ── Maintenance Types ───────────────────────────────────────

export type MaintenanceType =
  | 'quick_maintenance'
  | 'routine_maintenance'
  | 'deep_maintenance'
  | 'privacy_maintenance'
  | 'performance_maintenance'
  | 'storage_maintenance'
  | 'startup_maintenance'
  | 'health_recovery'
  | 'custom_maintenance'
  | 'future_maintenance';

// ── Maintenance Window ──────────────────────────────────────

export type WindowSignal =
  | 'idle_time'
  | 'low_cpu'
  | 'low_memory'
  | 'low_disk'
  | 'ac_power'
  | 'sufficient_battery'
  | 'low_network'
  | 'no_windows_update'
  | 'no_full_screen'
  | 'no_gaming'
  | 'no_active_calls'
  | 'low_user_activity'
  | 'future_signal';

export interface MaintenanceWindow {
  id: string;
  detectedAt: string;
  windowStart: string;
  windowEnd: string;
  estimatedDurationMs: number;
  availableSignals: WindowSignal[];
  blockedSignals: WindowSignal[];
  confidence: number;
  quality: WindowQuality;
  futureMetadata: Record<string, unknown>;
}

export type WindowQuality = 'optimal' | 'good' | 'fair' | 'poor' | 'unavailable';

// ── Maintenance Opportunity ──────────────────────────────────

export interface MaintenanceOpportunity {
  id: string;
  type: MaintenanceType;
  recommendedStart: string;
  estimatedDuration: number;
  priority: RecommendationPriority;
  confidence: number;
  risk: RiskLevel;
  expectedBenefit: number;
  requiredConditions: MaintenanceRequiredConditions;
  currentEligibility: MaintenanceEligibility;
  recommendedActions: string[];
  deferredActions: string[];
  futureMetadata: Record<string, unknown>;
}

export interface MaintenanceRequiredConditions {
  maxCpuUsage: number;
  maxMemoryUsage: number;
  maxDiskActivity: number;
  minBatteryLevel: number | null;
  requireAcPower: boolean;
  requireIdle: boolean;
  blockOnFullScreen: boolean;
  blockOnGaming: boolean;
  blockOnWindowsUpdate: boolean;
  blockOnActiveCalls: boolean;
  futureConditions: Record<string, unknown>;
}

// ── Maintenance Eligibility ─────────────────────────────────

export type EligibilityStatus = 'eligible' | 'ineligible' | 'conditional' | 'unknown';

export interface MaintenanceEligibility {
  status: EligibilityStatus;
  checks: EligibilityCheck[];
  overallScore: number;
  blockers: string[];
  warnings: string[];
  futureMetadata: Record<string, unknown>;
}

export interface EligibilityCheck {
  id: string;
  name: string;
  passed: boolean;
  required: boolean;
  message: string;
  details: Record<string, unknown>;
}

export type EligibilityDimension =
  | 'subscription'
  | 'capabilities'
  | 'quota'
  | 'permissions'
  | 'device_state'
  | 'power_policy'
  | 'enterprise_policy'
  | 'safety_policy'
  | 'dependencies'
  | 'future_dimension';

export interface EligibilityRule {
  id: string;
  dimension: EligibilityDimension;
  name: string;
  description: string;
  enabled: boolean;
  required: boolean;
  evaluate: (context: MaintenanceEligibilityContext) => EligibilityCheck;
  futureMetadata: Record<string, unknown>;
}

export interface MaintenanceEligibilityContext {
  systemState: SystemState;
  opportunity: MaintenanceOpportunity;
  subscription: SubscriptionInfo | null;
  capabilities: CapabilityInfo | null;
  quota: QuotaInfo | null;
  permissions: PermissionInfo | null;
  enterprisePolicy: EnterprisePolicyInfo | null;
  historicalOutcomes: MaintenanceHistoryEntry[];
  futureMetadata: Record<string, unknown>;
}

export interface SubscriptionInfo {
  active: boolean;
  tier: string;
  expiresAt: string | null;
}

export interface CapabilityInfo {
  available: string[];
  required: string[];
}

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
}

export interface PermissionInfo {
  granted: string[];
  denied: string[];
}

export interface EnterprisePolicyInfo {
  maintenanceAllowed: boolean;
  allowedTypes: MaintenanceType[];
  blockedTypes: MaintenanceType[];
  maxDuration: number | null;
}

// ── Maintenance Policies ─────────────────────────────────────

export type MaintenancePolicyType =
  | 'never_interrupt_user'
  | 'battery_protection'
  | 'gaming_protection'
  | 'business_hours'
  | 'developer_mode'
  | 'privacy_mode'
  | 'enterprise_rules'
  | 'custom_policy'
  | 'future_policy';

export interface MaintenancePolicy {
  id: string;
  type: MaintenancePolicyType;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  rules: MaintenancePolicyRule[];
  futureMetadata: Record<string, unknown>;
}

export interface MaintenancePolicyRule {
  id: string;
  dimension: EligibilityDimension;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number;
  action: MaintenancePolicyAction;
  reason: string;
  confidence: number;
}

export type MaintenancePolicyAction =
  | 'allow'
  | 'defer'
  | 'block'
  | 'require_confirmation'
  | 'future_action';

export interface PolicyEvaluationResult {
  action: MaintenancePolicyAction;
  matchedPolicies: MaintenancePolicy[];
  reason: string;
  confidence: number;
}

// ── Priority Engine ──────────────────────────────────────────

export interface PriorityFactors {
  expectedBenefit: number;
  risk: number;
  urgency: number;
  predictionScore: number;
  healthScore: number;
  historicalSuccess: number;
  executionTime: number;
  futureFactors: Record<string, number>;
}

export interface PriorityResult {
  opportunityId: string;
  score: number;
  rank: number;
  factors: PriorityFactors;
  reason: string;
}

// ── Maintenance Plan ─────────────────────────────────────────

export interface MaintenancePlan {
  id: string;
  opportunities: MaintenanceOpportunity[];
  window: MaintenanceWindow | null;
  generatedAt: string;
  expiresAt: string;
  summary: string;
  totalEstimatedDuration: number;
  totalExpectedBenefit: number;
  overallRisk: RiskLevel;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

// ── Maintenance Validation ───────────────────────────────────

export interface MaintenanceValidationResult {
  valid: boolean;
  errors: MaintenanceValidationError[];
  warnings: MaintenanceValidationWarning[];
}

export interface MaintenanceValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface MaintenanceValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Maintenance History ─────────────────────────────────────

export type MaintenanceOutcome =
  | 'recommended'
  | 'accepted'
  | 'deferred'
  | 'skipped'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface MaintenanceHistoryEntry {
  id: string;
  opportunityId: string;
  type: MaintenanceType;
  outcome: MaintenanceOutcome;
  timestamp: string;
  confidence: number;
  duration: number;
  expectedBenefit: number;
  actualBenefit: number | null;
  metadata: Record<string, unknown>;
}

// ── Maintenance Statistics ──────────────────────────────────

export interface MaintenanceStatistics {
  totalOpportunities: number;
  byType: Record<string, number>;
  byOutcome: Record<string, number>;
  successRate: number;
  averageDuration: number;
  averageBenefit: number;
  averageConfidence: number;
  deferredCount: number;
  cancelledCount: number;
  expiredCount: number;
  lastMaintenanceAt: string | null;
}

// ── Events ───────────────────────────────────────────────────

export type MaintenanceEventType =
  | 'maintenance_generated'
  | 'maintenance_window_found'
  | 'maintenance_deferred'
  | 'maintenance_accepted'
  | 'maintenance_expired'
  | 'maintenance_completed'
  | 'maintenance_cancelled';

export interface MaintenanceEvent {
  type: MaintenanceEventType;
  opportunityId: string;
  timestamp: string;
  data: unknown;
}

export type MaintenanceEventListener = (event: MaintenanceEvent) => void;

// ── Configuration ───────────────────────────────────────────

export interface MaintenanceConfiguration {
  configVersion: string;
  windowRules: WindowRule[];
  policies: MaintenancePolicy[];
  priorityRules: PriorityRule[];
  eligibilityRules: EligibilityRule[];
  thresholds: MaintenanceThresholds;
  featureFlags: MaintenanceFeatureFlags;
  enableEvents: boolean;
  maxHistoryEntries: number;
  evaluationIntervalMs: number;
  futureMetadata: Record<string, unknown>;
}

export interface WindowRule {
  id: string;
  signal: WindowSignal;
  name: string;
  description: string;
  threshold: number;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  weight: number;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface PriorityRule {
  id: string;
  name: string;
  description: string;
  factor: keyof PriorityFactors;
  weight: number;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface MaintenanceThresholds {
  maxCpuForWindow: number;
  maxMemoryForWindow: number;
  maxDiskForWindow: number;
  minBatteryForWindow: number;
  minIdleMinutesForWindow: number;
  maxNetworkForWindow: number;
  windowConfidenceThreshold: number;
  eligibilityScoreThreshold: number;
  priorityScoreThreshold: number;
  futureThresholds: Record<string, number>;
}

export interface MaintenanceFeatureFlags {
  enableWindowDetection: boolean;
  enableEligibilityCheck: boolean;
  enablePolicyEvaluation: boolean;
  enablePriorityRanking: boolean;
  enableHistory: boolean;
  enableValidation: boolean;
  enableStatistics: boolean;
  enableCoordination: boolean;
  futureFlags: Record<string, boolean>;
}

// ── Provider Plugin (Extensibility) ──────────────────────────

export interface MaintenanceWindowProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  detectWindow(state: SystemState): MaintenanceWindow | null;
}

export interface MaintenanceTypeProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getMaintenanceType(): MaintenanceType;
  evaluate(state: SystemState): MaintenanceOpportunity | null;
}

// ── Coordination ─────────────────────────────────────────────

export interface CoordinationResult {
  coordinated: boolean;
  schedulerNotified: boolean;
  reason: string;
  scheduledTime: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Helper Functions ─────────────────────────────────────────

export function createDefaultMaintenanceConfiguration(): MaintenanceConfiguration {
  return {
    configVersion: '1.0.0',
    windowRules: [
      { id: 'wr_idle', signal: 'idle_time', name: 'Idle Time', description: 'System is idle', threshold: 1, operator: '>=', weight: 0.15, enabled: true, futureMetadata: {} },
      { id: 'wr_low_cpu', signal: 'low_cpu', name: 'Low CPU', description: 'CPU usage is low', threshold: 30, operator: '<', weight: 0.15, enabled: true, futureMetadata: {} },
      { id: 'wr_low_memory', signal: 'low_memory', name: 'Low Memory', description: 'Memory usage is low', threshold: 40, operator: '<', weight: 0.10, enabled: true, futureMetadata: {} },
      { id: 'wr_low_disk', signal: 'low_disk', name: 'Low Disk', description: 'Disk activity is low', threshold: 20, operator: '<', weight: 0.10, enabled: true, futureMetadata: {} },
      { id: 'wr_ac_power', signal: 'ac_power', name: 'AC Power', description: 'On AC power', threshold: 1, operator: '==', weight: 0.10, enabled: true, futureMetadata: {} },
      { id: 'wr_battery', signal: 'sufficient_battery', name: 'Sufficient Battery', description: 'Battery level sufficient', threshold: 30, operator: '>=', weight: 0.05, enabled: true, futureMetadata: {} },
      { id: 'wr_low_network', signal: 'low_network', name: 'Low Network', description: 'Network activity is low', threshold: 20, operator: '<', weight: 0.05, enabled: true, futureMetadata: {} },
      { id: 'wr_no_update', signal: 'no_windows_update', name: 'No Windows Update', description: 'No Windows update running', threshold: 0, operator: '==', weight: 0.10, enabled: true, futureMetadata: {} },
      { id: 'wr_no_fullscreen', signal: 'no_full_screen', name: 'No Full Screen', description: 'No full screen app', threshold: 0, operator: '==', weight: 0.10, enabled: true, futureMetadata: {} },
      { id: 'wr_no_gaming', signal: 'no_gaming', name: 'No Gaming', description: 'No gaming session', threshold: 0, operator: '==', weight: 0.10, enabled: true, futureMetadata: {} },
    ],
    policies: [
      { id: 'pol_never_interrupt', type: 'never_interrupt_user', name: 'Never Interrupt User', description: 'Never run maintenance during active user sessions', priority: 1, enabled: true, rules: [], futureMetadata: {} },
      { id: 'pol_battery_protection', type: 'battery_protection', name: 'Battery Protection', description: 'Defer heavy maintenance on battery', priority: 2, enabled: true, rules: [], futureMetadata: {} },
      { id: 'pol_gaming_protection', type: 'gaming_protection', name: 'Gaming Protection', description: 'Never run maintenance during gaming', priority: 3, enabled: true, rules: [], futureMetadata: {} },
      { id: 'pol_business_hours', type: 'business_hours', name: 'Business Hours', description: 'Restrict maintenance during business hours', priority: 4, enabled: true, rules: [], futureMetadata: {} },
      { id: 'pol_developer_mode', type: 'developer_mode', name: 'Developer Mode', description: 'Defer maintenance during development sessions', priority: 5, enabled: true, rules: [], futureMetadata: {} },
      { id: 'pol_privacy_mode', type: 'privacy_mode', name: 'Privacy Mode', description: 'Extra caution for privacy maintenance', priority: 6, enabled: true, rules: [], futureMetadata: {} },
      { id: 'pol_enterprise', type: 'enterprise_rules', name: 'Enterprise Rules', description: 'Enterprise policy compliance', priority: 7, enabled: true, rules: [], futureMetadata: {} },
    ],
    priorityRules: [
      { id: 'pr_benefit', name: 'Expected Benefit', description: 'Weight of expected benefit', factor: 'expectedBenefit', weight: 0.25, enabled: true, futureMetadata: {} },
      { id: 'pr_risk', name: 'Risk', description: 'Weight of risk (inverted)', factor: 'risk', weight: 0.15, enabled: true, futureMetadata: {} },
      { id: 'pr_urgency', name: 'Urgency', description: 'Weight of urgency', factor: 'urgency', weight: 0.20, enabled: true, futureMetadata: {} },
      { id: 'pr_prediction', name: 'Prediction Score', description: 'Weight of AI prediction', factor: 'predictionScore', weight: 0.15, enabled: true, futureMetadata: {} },
      { id: 'pr_health', name: 'Health Score', description: 'Weight of health score', factor: 'healthScore', weight: 0.10, enabled: true, futureMetadata: {} },
      { id: 'pr_historical', name: 'Historical Success', description: 'Weight of historical success rate', factor: 'historicalSuccess', weight: 0.10, enabled: true, futureMetadata: {} },
      { id: 'pr_execution', name: 'Execution Time', description: 'Weight of execution time (inverted)', factor: 'executionTime', weight: 0.05, enabled: true, futureMetadata: {} },
    ],
    eligibilityRules: [],
    thresholds: {
      maxCpuForWindow: 30,
      maxMemoryForWindow: 40,
      maxDiskForWindow: 20,
      minBatteryForWindow: 30,
      minIdleMinutesForWindow: 5,
      maxNetworkForWindow: 20,
      windowConfidenceThreshold: 0.5,
      eligibilityScoreThreshold: 0.6,
      priorityScoreThreshold: 0.3,
      futureThresholds: {},
    },
    featureFlags: {
      enableWindowDetection: true,
      enableEligibilityCheck: true,
      enablePolicyEvaluation: true,
      enablePriorityRanking: true,
      enableHistory: true,
      enableValidation: true,
      enableStatistics: true,
      enableCoordination: true,
      futureFlags: {},
    },
    enableEvents: true,
    maxHistoryEntries: 500,
    evaluationIntervalMs: 5000,
    futureMetadata: {},
  };
}

export function createDefaultRequiredConditions(): MaintenanceRequiredConditions {
  return {
    maxCpuUsage: 30,
    maxMemoryUsage: 40,
    maxDiskActivity: 20,
    minBatteryLevel: 30,
    requireAcPower: false,
    requireIdle: false,
    blockOnFullScreen: true,
    blockOnGaming: true,
    blockOnWindowsUpdate: true,
    blockOnActiveCalls: true,
    futureConditions: {},
  };
}

export function createDefaultEligibility(): MaintenanceEligibility {
  return {
    status: 'unknown',
    checks: [],
    overallScore: 0,
    blockers: [],
    warnings: [],
    futureMetadata: {},
  };
}

let _idCounter = 0;

export function generateMaintenanceId(): string {
  _idCounter += 1;
  return `maint_${Date.now().toString(36)}_${_idCounter}`;
}

export function generateWindowId(): string {
  _idCounter += 1;
  return `window_${Date.now().toString(36)}_${_idCounter}`;
}

export function generateOpportunityId(): string {
  _idCounter += 1;
  return `opp_${Date.now().toString(36)}_${_idCounter}`;
}

export function generatePlanId(): string {
  _idCounter += 1;
  return `maintplan_${Date.now().toString(36)}_${_idCounter}`;
}

export function generateHistoryId(): string {
  _idCounter += 1;
  return `mainthist_${Date.now().toString(36)}_${_idCounter}`;
}

export function riskToScore(risk: RiskLevel): number {
  const scores: Record<RiskLevel, number> = { none: 0, low: 0.2, medium: 0.5, high: 0.8, critical: 1.0 };
  return scores[risk] ?? 0.5;
}

export function priorityToScore(priority: RecommendationPriority): number {
  const scores: Record<RecommendationPriority, number> = {
    critical: 1.0, high: 0.8, medium: 0.5, low: 0.2, informational: 0.1,
  };
  return scores[priority] ?? 0.5;
}

export function windowQualityToScore(quality: WindowQuality): number {
  const scores: Record<WindowQuality, number> = {
    optimal: 1.0, good: 0.8, fair: 0.5, poor: 0.2, unavailable: 0,
  };
  return scores[quality] ?? 0;
}
