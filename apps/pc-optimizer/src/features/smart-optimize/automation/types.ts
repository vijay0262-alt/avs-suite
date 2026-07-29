/**
 * Smart Optimize 2.0 — Policy-Based Automation Engine Type Definitions
 *
 * EPIC 4 PHASE A PART 5 — Policy-Based Automation Engine.
 *
 * Evaluates system events, AI recommendations, and user-defined rules
 * to generate intelligent automation decisions. Always respects safety
 * policies and user preferences. Produces execution plans rather than
 * executing optimizations directly.
 *
 * Architecture:
 *   System Events → AI Recommendations → Prediction Engine →
 *   Automation Policies → Automation Engine → Automation Plan →
 *   Execution Pipeline
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every automation decision,
 *    trigger evaluation, and action plan must be traceable,
 *    explainable, and policy-driven."
 */
import type { RiskLevel, RecommendationPriority } from '../planner/types';
import type { SystemState } from '../adaptive/types';

// Re-export for convenience
export type { RiskLevel, RecommendationPriority } from '../planner/types';
export type { SystemState } from '../adaptive/types';

// ── Automation Triggers ──────────────────────────────────────

export type AutomationTriggerType =
  | 'health_score_changed'
  | 'recommendation_generated'
  | 'prediction_updated'
  | 'maintenance_window_available'
  | 'system_idle'
  | 'user_inactive'
  | 'windows_update_completed'
  | 'storage_threshold_reached'
  | 'startup_growth'
  | 'battery_charging'
  | 'power_connected'
  | 'device_profile_changed'
  | 'custom_trigger'
  | 'future_trigger';

export interface AutomationTrigger {
  id: string;
  type: AutomationTriggerType;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  evaluate: (context: AutomationTriggerContext) => boolean;
  futureMetadata: Record<string, unknown>;
}

export interface AutomationTriggerContext {
  systemState: SystemState;
  eventData: Record<string, unknown>;
  timestamp: string;
  futureMetadata: Record<string, unknown>;
}

export interface AutomationTriggerDefinition {
  id: string;
  type: AutomationTriggerType;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Automation Conditions ────────────────────────────────────

export type ConditionOperator = 'AND' | 'OR' | 'NOT';

export type ConditionType =
  | 'and'
  | 'or'
  | 'not'
  | 'nested_group'
  | 'time_window'
  | 'cooldown'
  | 'priority_threshold'
  | 'confidence_threshold'
  | 'capability_check'
  | 'quota_check'
  | 'subscription_check'
  | 'custom_condition'
  | 'future_condition';

export interface AutomationCondition {
  id: string;
  type: ConditionType;
  operator?: ConditionOperator;
  children?: AutomationCondition[];
  field?: string;
  operator2?: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value?: unknown;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  cooldownMs?: number;
  threshold?: number;
  requiredCapabilities?: string[];
  requiredQuota?: number;
  requiredSubscription?: string;
  customEvaluator?: (context: AutomationConditionContext) => boolean;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface AutomationConditionContext {
  systemState: SystemState;
  rule: AutomationRule;
  trigger: AutomationTrigger;
  eventData: Record<string, unknown>;
  timestamp: string;
  availableCapabilities: string[];
  quotaRemaining: number;
  subscriptionTier: string | null;
  confidence: number;
  priority: RecommendationPriority;
  futureMetadata: Record<string, unknown>;
}

export interface ConditionEvaluationResult {
  passed: boolean;
  conditionId: string;
  reason: string;
  details: Record<string, unknown>;
}

// ── Automation Actions ───────────────────────────────────────

export type AutomationActionType =
  | 'generate_optimization_plan'
  | 'queue_maintenance'
  | 'notify_user'
  | 'request_approval'
  | 'regenerate_recommendations'
  | 'refresh_predictions'
  | 'refresh_dashboard'
  | 'schedule_execution'
  | 'dismiss_recommendation'
  | 'log_event'
  | 'future_action';

export interface AutomationAction {
  id: string;
  type: AutomationActionType;
  name: string;
  description: string;
  enabled: boolean;
  parameters: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface AutomationActionDefinition {
  id: string;
  type: AutomationActionType;
  name: string;
  description: string;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Automation Rules ─────────────────────────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  approvalPolicy: ApprovalPolicy;
  cooldown: CooldownConfig;
  executionPolicy: ExecutionPolicy;
  riskLevel: RiskLevel;
  futureMetadata: Record<string, unknown>;
}

export type ExecutionPolicy =
  | 'immediate'
  | 'deferred'
  | 'batched'
  | 'scheduled'
  | 'future_policy';

// ── Approval Policies ────────────────────────────────────────

export type ApprovalPolicyType =
  | 'always_ask'
  | 'ask_once'
  | 'never_ask'
  | 'enterprise_approval'
  | 'risk_based'
  | 'profile_based'
  | 'custom_approval'
  | 'future_approval';

export interface ApprovalPolicy {
  type: ApprovalPolicyType;
  autoApprove: boolean;
  riskThreshold: number;
  requireEnterpriseApproval: boolean;
  customEvaluator?: (context: ApprovalContext) => ApprovalDecision;
  futureMetadata: Record<string, unknown>;
}

export interface ApprovalContext {
  rule: AutomationRule;
  systemState: SystemState;
  riskLevel: RiskLevel;
  confidence: number;
  userId: string | null;
  enterprisePolicy: EnterpriseApprovalInfo | null;
  futureMetadata: Record<string, unknown>;
}

export interface ApprovalDecision {
  approved: boolean;
  reason: string;
  requiresUserInput: boolean;
  expiresAt: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface EnterpriseApprovalInfo {
  autoApproveLowRisk: boolean;
  requireApprovalForHighRisk: boolean;
  blockedActions: AutomationActionType[];
  futureMetadata: Record<string, unknown>;
}

// ── Safety Policies ──────────────────────────────────────────

export type SafetyPolicyType =
  | 'never_full_screen'
  | 'never_on_battery'
  | 'never_during_gaming'
  | 'business_hours_only'
  | 'idle_only'
  | 'developer_safe'
  | 'enterprise_safe'
  | 'custom_safety'
  | 'future_safety';

export interface SafetyPolicy {
  id: string;
  type: SafetyPolicyType;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  evaluate: (context: SafetyEvaluationContext) => SafetyEvaluationResult;
  futureMetadata: Record<string, unknown>;
}

export interface SafetyEvaluationContext {
  systemState: SystemState;
  rule: AutomationRule;
  timestamp: string;
  futureMetadata: Record<string, unknown>;
}

export interface SafetyEvaluationResult {
  safe: boolean;
  reason: string;
  policyId: string;
  futureMetadata: Record<string, unknown>;
}

// ── Cooldown ─────────────────────────────────────────────────

export type CooldownUnit = 'minutes' | 'hours' | 'days' | 'custom';

export interface CooldownConfig {
  enabled: boolean;
  duration: number;
  unit: CooldownUnit;
  scope: CooldownScope;
  futureMetadata: Record<string, unknown>;
}

export type CooldownScope = 'per_rule' | 'per_action' | 'global';

export interface CooldownState {
  ruleId: string;
  actionId: string | null;
  lastTriggeredAt: string;
  expiresAt: string;
  scope: CooldownScope;
}

// ── Automation Plan ──────────────────────────────────────────

export interface AutomationPlan {
  id: string;
  ruleId: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  approvalDecision: ApprovalDecision | null;
  safetyResults: SafetyEvaluationResult[];
  generatedAt: string;
  expiresAt: string;
  confidence: number;
  riskLevel: RiskLevel;
  executionPolicy: ExecutionPolicy;
  summary: string;
  futureMetadata: Record<string, unknown>;
}

// ── Automation Validation ────────────────────────────────────

export interface AutomationValidationResult {
  valid: boolean;
  errors: AutomationValidationError[];
  warnings: AutomationValidationWarning[];
}

export interface AutomationValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface AutomationValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Automation History ───────────────────────────────────────

export type AutomationOutcome =
  | 'triggered'
  | 'ignored'
  | 'deferred'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'cancelled'
  | 'expired';

export interface AutomationHistoryEntry {
  id: string;
  ruleId: string;
  triggerType: AutomationTriggerType;
  outcome: AutomationOutcome;
  timestamp: string;
  actions: AutomationActionType[];
  confidence: number;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  cooldownApplied: boolean;
  metadata: Record<string, unknown>;
}

// ── Automation Statistics ─────────────────────────────────────

export interface AutomationStatistics {
  totalEvaluations: number;
  totalTriggered: number;
  totalExecuted: number;
  totalApproved: number;
  totalRejected: number;
  totalDeferred: number;
  totalCancelled: number;
  totalExpired: number;
  totalIgnored: number;
  byTrigger: Record<string, number>;
  byOutcome: Record<string, number>;
  successRate: number;
  averageConfidence: number;
  lastTriggeredAt: string | null;
}

// ── Events ───────────────────────────────────────────────────

export type AutomationEventType =
  | 'automation_triggered'
  | 'automation_rule_matched'
  | 'automation_deferred'
  | 'automation_approved'
  | 'automation_rejected'
  | 'automation_cancelled'
  | 'automation_completed';

export interface AutomationEvent {
  type: AutomationEventType;
  ruleId: string;
  timestamp: string;
  data: unknown;
}

export type AutomationEventListener = (event: AutomationEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface AutomationConfiguration {
  configVersion: string;
  triggerDefinitions: AutomationTriggerDefinition[];
  conditionDefinitions: ConditionDefinition[];
  actionDefinitions: AutomationActionDefinition[];
  approvalPolicies: ApprovalPolicyConfig[];
  safetyPolicies: SafetyPolicyConfig[];
  cooldownRules: CooldownRule[];
  featureFlags: AutomationFeatureFlags;
  enableEvents: boolean;
  maxHistoryEntries: number;
  evaluationIntervalMs: number;
  futureMetadata: Record<string, unknown>;
}

export interface ConditionDefinition {
  id: string;
  type: ConditionType;
  name: string;
  description: string;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface ApprovalPolicyConfig {
  id: string;
  type: ApprovalPolicyType;
  name: string;
  description: string;
  autoApprove: boolean;
  riskThreshold: number;
  requireEnterpriseApproval: boolean;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface SafetyPolicyConfig {
  id: string;
  type: SafetyPolicyType;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  futureMetadata: Record<string, unknown>;
}

export interface CooldownRule {
  id: string;
  ruleId: string | null;
  actionId: string | null;
  scope: CooldownScope;
  duration: number;
  unit: CooldownUnit;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface AutomationFeatureFlags {
  enableTriggers: boolean;
  enableConditions: boolean;
  enableActions: boolean;
  enableApprovals: boolean;
  enableCooldowns: boolean;
  enableSafetyPolicies: boolean;
  enableHistory: boolean;
  enableStatistics: boolean;
  enableValidation: boolean;
  futureFlags: Record<string, boolean>;
}

// ── Provider Plugin (Extensibility) ──────────────────────────

export interface AutomationTriggerPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getTriggerType(): AutomationTriggerType;
  evaluate(context: AutomationTriggerContext): boolean;
}

export interface AutomationConditionPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getConditionType(): ConditionType;
  evaluate(condition: AutomationCondition, context: AutomationConditionContext): ConditionEvaluationResult;
}

export interface AutomationActionPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getActionType(): AutomationActionType;
  plan(action: AutomationAction, context: AutomationActionContext): AutomationPlannedAction;
}

export interface AutomationActionContext {
  systemState: SystemState;
  rule: AutomationRule;
  timestamp: string;
  futureMetadata: Record<string, unknown>;
}

export interface AutomationPlannedAction {
  action: AutomationAction;
  executable: boolean;
  requiresApproval: boolean;
  parameters: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

// ── Helper Functions ─────────────────────────────────────────

export function createDefaultAutomationConfiguration(): AutomationConfiguration {
  return {
    configVersion: '1.0.0',
    triggerDefinitions: [
      { id: 'td_health', type: 'health_score_changed', name: 'Health Score Changed', description: 'Triggered when health score changes significantly', priority: 1, enabled: true, futureMetadata: {} },
      { id: 'td_rec', type: 'recommendation_generated', name: 'Recommendation Generated', description: 'Triggered when a new recommendation is generated', priority: 2, enabled: true, futureMetadata: {} },
      { id: 'td_pred', type: 'prediction_updated', name: 'Prediction Updated', description: 'Triggered when predictions are updated', priority: 3, enabled: true, futureMetadata: {} },
      { id: 'td_maint', type: 'maintenance_window_available', name: 'Maintenance Window Available', description: 'Triggered when a maintenance window is detected', priority: 4, enabled: true, futureMetadata: {} },
      { id: 'td_idle', type: 'system_idle', name: 'System Idle', description: 'Triggered when system becomes idle', priority: 5, enabled: true, futureMetadata: {} },
      { id: 'td_inactive', type: 'user_inactive', name: 'User Inactive', description: 'Triggered when user is inactive', priority: 6, enabled: true, futureMetadata: {} },
      { id: 'td_wu', type: 'windows_update_completed', name: 'Windows Update Completed', description: 'Triggered after Windows update completes', priority: 7, enabled: true, futureMetadata: {} },
      { id: 'td_storage', type: 'storage_threshold_reached', name: 'Storage Threshold Reached', description: 'Triggered when storage pressure exceeds threshold', priority: 8, enabled: true, futureMetadata: {} },
      { id: 'td_startup', type: 'startup_growth', name: 'Startup Growth', description: 'Triggered when startup items grow', priority: 9, enabled: true, futureMetadata: {} },
      { id: 'td_battery', type: 'battery_charging', name: 'Battery Charging', description: 'Triggered when battery starts charging', priority: 10, enabled: true, futureMetadata: {} },
      { id: 'td_power', type: 'power_connected', name: 'Power Connected', description: 'Triggered when AC power is connected', priority: 11, enabled: true, futureMetadata: {} },
      { id: 'td_profile', type: 'device_profile_changed', name: 'Device Profile Changed', description: 'Triggered when device profile changes', priority: 12, enabled: true, futureMetadata: {} },
    ],
    conditionDefinitions: [
      { id: 'cd_and', type: 'and', name: 'AND', description: 'All children must pass', enabled: true, futureMetadata: {} },
      { id: 'cd_or', type: 'or', name: 'OR', description: 'Any child must pass', enabled: true, futureMetadata: {} },
      { id: 'cd_not', type: 'not', name: 'NOT', description: 'Child must not pass', enabled: true, futureMetadata: {} },
      { id: 'cd_time', type: 'time_window', name: 'Time Window', description: 'Current time within specified window', enabled: true, futureMetadata: {} },
      { id: 'cd_cooldown', type: 'cooldown', name: 'Cooldown', description: 'Rule/action is not in cooldown', enabled: true, futureMetadata: {} },
      { id: 'cd_priority', type: 'priority_threshold', name: 'Priority Threshold', description: 'Priority meets threshold', enabled: true, futureMetadata: {} },
      { id: 'cd_confidence', type: 'confidence_threshold', name: 'Confidence Threshold', description: 'Confidence meets threshold', enabled: true, futureMetadata: {} },
      { id: 'cd_capability', type: 'capability_check', name: 'Capability Check', description: 'Required capabilities are available', enabled: true, futureMetadata: {} },
      { id: 'cd_quota', type: 'quota_check', name: 'Quota Check', description: 'Sufficient quota available', enabled: true, futureMetadata: {} },
      { id: 'cd_subscription', type: 'subscription_check', name: 'Subscription Check', description: 'Required subscription tier is active', enabled: true, futureMetadata: {} },
    ],
    actionDefinitions: [
      { id: 'ad_gen_plan', type: 'generate_optimization_plan', name: 'Generate Optimization Plan', description: 'Generate a new optimization plan', enabled: true, futureMetadata: {} },
      { id: 'ad_queue_maint', type: 'queue_maintenance', name: 'Queue Maintenance', description: 'Queue a maintenance task', enabled: true, futureMetadata: {} },
      { id: 'ad_notify', type: 'notify_user', name: 'Notify User', description: 'Send a notification to the user', enabled: true, futureMetadata: {} },
      { id: 'ad_approval', type: 'request_approval', name: 'Request Approval', description: 'Request user approval', enabled: true, futureMetadata: {} },
      { id: 'ad_regen_rec', type: 'regenerate_recommendations', name: 'Regenerate Recommendations', description: 'Regenerate AI recommendations', enabled: true, futureMetadata: {} },
      { id: 'ad_refresh_pred', type: 'refresh_predictions', name: 'Refresh Predictions', description: 'Refresh AI predictions', enabled: true, futureMetadata: {} },
      { id: 'ad_refresh_dash', type: 'refresh_dashboard', name: 'Refresh Dashboard', description: 'Refresh the dashboard', enabled: true, futureMetadata: {} },
      { id: 'ad_schedule', type: 'schedule_execution', name: 'Schedule Execution', description: 'Schedule execution with the scheduler', enabled: true, futureMetadata: {} },
      { id: 'ad_dismiss', type: 'dismiss_recommendation', name: 'Dismiss Recommendation', description: 'Dismiss a recommendation', enabled: true, futureMetadata: {} },
      { id: 'ad_log', type: 'log_event', name: 'Log Event', description: 'Log an event', enabled: true, futureMetadata: {} },
    ],
    approvalPolicies: [
      { id: 'ap_always', type: 'always_ask', name: 'Always Ask', description: 'Always ask user for approval', autoApprove: false, riskThreshold: 0, requireEnterpriseApproval: false, enabled: true, futureMetadata: {} },
      { id: 'ap_once', type: 'ask_once', name: 'Ask Once', description: 'Ask once and remember', autoApprove: false, riskThreshold: 0, requireEnterpriseApproval: false, enabled: true, futureMetadata: {} },
      { id: 'ap_never', type: 'never_ask', name: 'Never Ask', description: 'Never ask for approval', autoApprove: true, riskThreshold: 1.0, requireEnterpriseApproval: false, enabled: true, futureMetadata: {} },
      { id: 'ap_enterprise', type: 'enterprise_approval', name: 'Enterprise Approval', description: 'Require enterprise approval', autoApprove: false, riskThreshold: 0.5, requireEnterpriseApproval: true, enabled: true, futureMetadata: {} },
      { id: 'ap_risk', type: 'risk_based', name: 'Risk Based', description: 'Auto-approve low risk, ask for high risk', autoApprove: true, riskThreshold: 0.5, requireEnterpriseApproval: false, enabled: true, futureMetadata: {} },
      { id: 'ap_profile', type: 'profile_based', name: 'Profile Based', description: 'Approval based on device profile', autoApprove: true, riskThreshold: 0.6, requireEnterpriseApproval: false, enabled: true, futureMetadata: {} },
    ],
    safetyPolicies: [
      { id: 'sp_fullscreen', type: 'never_full_screen', name: 'Never During Full Screen', description: 'Never automate during full screen apps', enabled: true, priority: 1, futureMetadata: {} },
      { id: 'sp_battery', type: 'never_on_battery', name: 'Never On Battery', description: 'Never automate on battery power', enabled: true, priority: 2, futureMetadata: {} },
      { id: 'sp_gaming', type: 'never_during_gaming', name: 'Never During Gaming', description: 'Never automate during gaming', enabled: true, priority: 3, futureMetadata: {} },
      { id: 'sp_business', type: 'business_hours_only', name: 'Business Hours Only', description: 'Only automate during business hours', enabled: true, priority: 4, futureMetadata: {} },
      { id: 'sp_idle', type: 'idle_only', name: 'Idle Only', description: 'Only automate when system is idle', enabled: true, priority: 5, futureMetadata: {} },
      { id: 'sp_dev', type: 'developer_safe', name: 'Developer Safe', description: 'Safe for developer workstations', enabled: true, priority: 6, futureMetadata: {} },
      { id: 'sp_enterprise', type: 'enterprise_safe', name: 'Enterprise Safe', description: 'Safe for enterprise environments', enabled: true, priority: 7, futureMetadata: {} },
    ],
    cooldownRules: [],
    featureFlags: {
      enableTriggers: true,
      enableConditions: true,
      enableActions: true,
      enableApprovals: true,
      enableCooldowns: true,
      enableSafetyPolicies: true,
      enableHistory: true,
      enableStatistics: true,
      enableValidation: true,
      futureFlags: {},
    },
    enableEvents: true,
    maxHistoryEntries: 500,
    evaluationIntervalMs: 5000,
    futureMetadata: {},
  };
}

export function createDefaultApprovalPolicy(): ApprovalPolicy {
  return {
    type: 'risk_based',
    autoApprove: true,
    riskThreshold: 0.5,
    requireEnterpriseApproval: false,
    futureMetadata: {},
  };
}

export function createDefaultCooldownConfig(): CooldownConfig {
  return {
    enabled: false,
    duration: 60,
    unit: 'minutes',
    scope: 'per_rule',
    futureMetadata: {},
  };
}

export function createDefaultExecutionPolicy(): ExecutionPolicy {
  return 'immediate';
}

let _idCounter = 0;

export function generateAutomationId(): string {
  _idCounter += 1;
  return `auto_${Date.now().toString(36)}_${_idCounter}`;
}

export function generateRuleId(): string {
  _idCounter += 1;
  return `rule_${Date.now().toString(36)}_${_idCounter}`;
}

export function generateTriggerId(): string {
  _idCounter += 1;
  return `trigger_${Date.now().toString(36)}_${_idCounter}`;
}

export function generateActionId(): string {
  _idCounter += 1;
  return `action_${Date.now().toString(36)}_${_idCounter}`;
}

export function generatePlanId(): string {
  _idCounter += 1;
  return `autoplan_${Date.now().toString(36)}_${_idCounter}`;
}

export function generateHistoryId(): string {
  _idCounter += 1;
  return `autohist_${Date.now().toString(36)}_${_idCounter}`;
}

export function generateConditionId(): string {
  _idCounter += 1;
  return `cond_${Date.now().toString(36)}_${_idCounter}`;
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

export function cooldownToMs(duration: number, unit: CooldownUnit): number {
  switch (unit) {
    case 'minutes': return duration * 60 * 1000;
    case 'hours': return duration * 60 * 60 * 1000;
    case 'days': return duration * 24 * 60 * 60 * 1000;
    case 'custom': return duration;
    default: return duration * 60 * 1000;
  }
}
