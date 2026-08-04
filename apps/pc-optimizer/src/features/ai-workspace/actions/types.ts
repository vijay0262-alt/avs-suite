/**
 * Natural Language Action Engine — Type Definitions
 *
 * EPIC 5 PHASE A PART 4
 *
 * Converts user requests into structured execution plans.
 * Uses the AI Tool Framework. Does NOT bypass execution safety.
 * No direct execution logic — hands approved plans to Execution Pipeline.
 *
 * Architecture:
 *   User Request → Intent Classification → Entity Extraction →
 *   Context Resolution → Tool Selection → Action Planning →
 *   Approval → Execution Pipeline
 */

// ── Re-export AIAssistant & Tool types ────────────────────────────

export type {
  AIAssistantContext,
  AIAssistantEvidence,
  PermissionLevel,
  AIAssistantCapability,
  AIAssistantIntentType,
} from '../AIAssistant/types';

export type {
  ToolDefinition,
  ToolResolutionResult,
} from '../tools/types';

import type {
  AIAssistantEvidence,
  PermissionLevel,
  AIAssistantCapability,
} from '../AIAssistant/types';

import type {
  ToolDefinition,
} from '../tools/types';

// ── Action Types ──────────────────────────────────────────────

export type ActionType =
  | 'optimization'
  | 'maintenance'
  | 'recovery'
  | 'simulation'
  | 'goal_management'
  | 'timeline_navigation'
  | 'health_analysis'
  | 'report_generation'
  | 'recommendation_management'
  | 'automation_management'
  | 'settings_navigation'
  | 'future_action';

export function getActionTypeLabel(type: ActionType): string {
  const labels: Record<ActionType, string> = {
    optimization: 'Optimization',
    maintenance: 'Maintenance',
    recovery: 'Recovery',
    simulation: 'Simulation',
    goal_management: 'Goal Management',
    timeline_navigation: 'Timeline Navigation',
    health_analysis: 'Health Analysis',
    report_generation: 'Report Generation',
    recommendation_management: 'Recommendation Management',
    automation_management: 'Automation Management',
    settings_navigation: 'Settings Navigation',
    future_action: 'Future Action',
  };
  return labels[type] ?? 'Unknown';
}

// ── Risk Levels ───────────────────────────────────────────────

export type ActionRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export function getRiskLevelLabel(risk: ActionRiskLevel): string {
  const labels: Record<ActionRiskLevel, string> = {
    none: 'None',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };
  return labels[risk] ?? 'Unknown';
}

// ── Entity Types ──────────────────────────────────────────────

export type EntityType =
  | 'optimization_profile'
  | 'goal'
  | 'time_range'
  | 'recommendation'
  | 'recovery_point'
  | 'health_metric'
  | 'report_type'
  | 'maintenance_type'
  | 'device_profile'
  | 'future_entity';

export function getEntityTypeLabel(type: EntityType): string {
  const labels: Record<EntityType, string> = {
    optimization_profile: 'Optimization Profile',
    goal: 'Goal',
    time_range: 'Time Range',
    recommendation: 'Recommendation',
    recovery_point: 'Recovery Point',
    health_metric: 'Health Metric',
    report_type: 'Report Type',
    maintenance_type: 'Maintenance Type',
    device_profile: 'Device Profile',
    future_entity: 'Future Entity',
  };
  return labels[type] ?? 'Unknown';
}

// ── Extracted Entity ──────────────────────────────────────────

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  rawText: string;
  confidence: number;
  position: { start: number; end: number };
  futureMetadata: Record<string, unknown>;
}

// ── Intent Model ──────────────────────────────────────────────

export interface ClassifiedIntent {
  id: string;
  intent: ActionType;
  confidence: number;
  entities: ExtractedEntity[];
  parameters: Record<string, unknown>;
  requiredTools: string[];
  requiredPermissions: PermissionLevel;
  riskLevel: ActionRiskLevel;
  rawRequest: string;
  futureMetadata: Record<string, unknown>;
}

// ── Intent Definition (for configuration) ─────────────────────

export interface IntentDefinition {
  actionType: ActionType;
  keywords: string[];
  phrases: string[];
  requiredEntities: EntityType[];
  optionalEntities: EntityType[];
  requiredTools: string[];
  requiredPermissions: PermissionLevel;
  riskLevel: ActionRiskLevel;
  minConfidence: number;
  futureMetadata: Record<string, unknown>;
}

// ── Entity Rule (for extraction) ──────────────────────────────

export interface EntityRule {
  type: EntityType;
  patterns: string[];
  synonyms: Record<string, string[]>;
  defaultValue: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Action Step ───────────────────────────────────────────────

export interface ActionStep {
  id: string;
  order: number;
  toolId: string;
  description: string;
  parameters: Record<string, unknown>;
  riskLevel: ActionRiskLevel;
  estimatedDurationMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Action Plan ───────────────────────────────────────────────

export interface ActionPlan {
  id: string;
  intent: ActionType;
  steps: ActionStep[];
  selectedTools: ToolDefinition[];
  estimatedDuration: number;
  estimatedBenefit: string;
  estimatedRisk: ActionRiskLevel;
  requiresApproval: boolean;
  requiredCapabilities: AIAssistantCapability[];
  rollbackAvailable: boolean;
  explanation: ActionExplanation;
  alternatives: ActionPlan[];
  status: ActionPlanStatus;
  createdAt: string;
  futureMetadata: Record<string, unknown>;
}

export type ActionPlanStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'future_status';

export function getActionPlanStatusLabel(status: ActionPlanStatus): string {
  const labels: Record<ActionPlanStatus, string> = {
    draft: 'Draft',
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    executing: 'Executing',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    future_status: 'Future Status',
  };
  return labels[status] ?? 'Unknown';
}

// ── Action Explanation ────────────────────────────────────────

export interface ActionExplanation {
  summary: string;
  reasoning: string;
  evidence: AIAssistantEvidence[];
  expectedOutcome: string;
  potentialRisks: string[];
  rollbackAvailable: boolean;
  alternativeCount: number;
  futureMetadata: Record<string, unknown>;
}

// ── Approval ──────────────────────────────────────────────────

export type ApprovalPolicyType =
  | 'always_ask'
  | 'risk_based'
  | 'enterprise_policy'
  | 'user_preference'
  | 'one_time_approval'
  | 'session_approval'
  | 'future_policy';

export function getApprovalPolicyLabel(policy: ApprovalPolicyType): string {
  const labels: Record<ApprovalPolicyType, string> = {
    always_ask: 'Always Ask',
    risk_based: 'Risk Based',
    enterprise_policy: 'Enterprise Policy',
    user_preference: 'User Preference',
    one_time_approval: 'One-Time Approval',
    session_approval: 'Session Approval',
    future_policy: 'Future Policy',
  };
  return labels[policy] ?? 'Unknown';
}

export interface ApprovalPolicy {
  type: ApprovalPolicyType;
  riskThreshold: ActionRiskLevel;
  autoApproveBelow: boolean;
  description: string;
  futureMetadata: Record<string, unknown>;
}

export interface ApprovalRequest {
  planId: string;
  plan: ActionPlan;
  policy: ApprovalPolicy;
  reason: string;
  createdAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface ApprovalResult {
  approved: boolean;
  reason: string;
  policy: ApprovalPolicyType;
  expiresAt: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Validation ────────────────────────────────────────────────

export interface ActionValidationResult {
  valid: boolean;
  errors: ActionValidationError[];
  warnings: ActionValidationWarning[];
  futureMetadata: Record<string, unknown>;
}

export interface ActionValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ActionValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Action Suggestion ─────────────────────────────────────────

export interface ActionSuggestion {
  id: string;
  title: string;
  description: string;
  actionType: ActionType;
  confidence: number;
  trigger: string;
  futureMetadata: Record<string, unknown>;
}

// ── Parsed Request ────────────────────────────────────────────

export interface ParsedRequest {
  rawRequest: string;
  intent: ClassifiedIntent | null;
  entities: ExtractedEntity[];
  actionPlan: ActionPlan | null;
  validation: ActionValidationResult | null;
  approval: ApprovalResult | null;
  futureMetadata: Record<string, unknown>;
}

// ── Analytics ─────────────────────────────────────────────────

export interface ActionAnalyticsData {
  totalRequests: number;
  totalPlansGenerated: number;
  totalApproved: number;
  totalRejected: number;
  totalExecuted: number;
  byActionType: Record<string, number>;
  averageConfidence: number;
  averagePlanningTimeMs: number;
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Events ────────────────────────────────────────────────────

export type ActionEventType =
  | 'intent_detected'
  | 'entities_extracted'
  | 'action_generated'
  | 'action_approved'
  | 'action_rejected'
  | 'action_completed';

export interface ActionEvent {
  type: ActionEventType;
  timestamp: string;
  data: unknown;
}

export type ActionListener = (event: ActionEvent) => void;

// ── Configuration ─────────────────────────────────────────────

export interface ActionConfiguration {
  configVersion: string;
  intentDefinitions: IntentDefinition[];
  entityRules: EntityRule[];
  approvalPolicies: ApprovalPolicy[];
  suggestionRules: SuggestionRule[];
  featureFlags: ActionFeatureFlags;
  performanceTargets: ActionPerformanceTargets;
  providerSettings: ActionProviderSettings[];
  futureMetadata: Record<string, unknown>;
}

export interface ActionFeatureFlags {
  enableActionEngine: boolean;
  enableIntentClassification: boolean;
  enableEntityExtraction: boolean;
  enableActionPlanning: boolean;
  enableApproval: boolean;
  enableSuggestions: boolean;
  enableAnalytics: boolean;
  enableEvents: boolean;
  enablePlugins: boolean;
  futureFlags: Record<string, boolean>;
}

export interface ActionPerformanceTargets {
  intentClassificationTargetMs: number;
  actionPlanningTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

export interface ActionProviderSettings {
  providerName: string;
  providerVersion: string;
  enabled: boolean;
  config: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface SuggestionRule {
  actionType: ActionType;
  trigger: string;
  title: string;
  description: string;
  priority: number;
  futureMetadata: Record<string, unknown>;
}

// ── Action Plugin ─────────────────────────────────────────────

export interface ActionPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getIntentDefinitions(): IntentDefinition[];
  getEntityRules(): EntityRule[];
}

// ── Helper Functions ───────────────────────────────────────────

export function generateIntentId(): string {
  return `intent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateActionPlanId(): string {
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateActionStepId(): string {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateSuggestionId(): string {
  return `sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateApprovalRequestId(): string {
  return `approval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ── Default Factories ─────────────────────────────────────────

export function createDefaultIntentDefinitions(): IntentDefinition[] {
  return [
    {
      actionType: 'optimization',
      keywords: ['optimize', 'optimization', 'boost', 'speed up', 'improve performance', 'tune'],
      phrases: ['optimize my pc', 'prepare for gaming', 'prepare for trading', 'improve startup'],
      requiredEntities: [],
      optionalEntities: ['optimization_profile', 'device_profile'],
      requiredTools: ['create_optimization_session', 'run_simulation'],
      requiredPermissions: 'pro',
      riskLevel: 'medium',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'maintenance',
      keywords: ['maintenance', 'clean', 'cleanup', 'scan', 'check', 'update'],
      phrases: ['start maintenance', 'resume maintenance', 'run cleanup'],
      requiredEntities: [],
      optionalEntities: ['maintenance_type'],
      requiredTools: ['start_maintenance'],
      requiredPermissions: 'free',
      riskLevel: 'low',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'recovery',
      keywords: ['recover', 'rollback', 'restore', 'undo', 'revert'],
      phrases: ['recover yesterday changes', 'undo last optimization', 'restore system'],
      requiredEntities: [],
      optionalEntities: ['recovery_point', 'time_range'],
      requiredTools: ['show_recovery'],
      requiredPermissions: 'free',
      riskLevel: 'medium',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'simulation',
      keywords: ['simulate', 'simulation', 'preview', 'what if', 'project'],
      phrases: ['run simulation', 'compare optimization plans', 'what if i optimize'],
      requiredEntities: [],
      optionalEntities: ['optimization_profile'],
      requiredTools: ['run_simulation', 'compare_plans'],
      requiredPermissions: 'pro',
      riskLevel: 'none',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'goal_management',
      keywords: ['goal', 'target', 'objective', 'aim'],
      phrases: ['create new goal', 'set a goal', 'track progress'],
      requiredEntities: [],
      optionalEntities: ['goal'],
      requiredTools: ['create_goal', 'explain_goal'],
      requiredPermissions: 'pro',
      riskLevel: 'none',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'timeline_navigation',
      keywords: ['timeline', 'history', 'events', 'log', 'when'],
      phrases: ['show timeline', 'view history', 'what happened'],
      requiredEntities: [],
      optionalEntities: ['time_range'],
      requiredTools: ['explain_timeline'],
      requiredPermissions: 'free',
      riskLevel: 'none',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'health_analysis',
      keywords: ['health', 'score', 'status', 'condition', 'how is'],
      phrases: ['show health', 'how is my pc', 'show health history'],
      requiredEntities: [],
      optionalEntities: ['health_metric'],
      requiredTools: ['explain_health'],
      requiredPermissions: 'free',
      riskLevel: 'none',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'report_generation',
      keywords: ['report', 'summary', 'overview', 'digest'],
      phrases: ['generate weekly report', 'create report', 'system summary'],
      requiredEntities: [],
      optionalEntities: ['report_type', 'time_range'],
      requiredTools: ['generate_report'],
      requiredPermissions: 'free',
      riskLevel: 'none',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'recommendation_management',
      keywords: ['recommendation', 'suggest', 'advice', 'tip'],
      phrases: ['show recommendations', 'what should i do', 'best actions'],
      requiredEntities: [],
      optionalEntities: ['recommendation'],
      requiredTools: ['explain_recommendation'],
      requiredPermissions: 'free',
      riskLevel: 'none',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'automation_management',
      keywords: ['automation', 'automate', 'pause', 'resume', 'enable', 'disable'],
      phrases: ['pause automation', 'resume automation', 'enable automation'],
      requiredEntities: [],
      optionalEntities: [],
      requiredTools: [],
      requiredPermissions: 'pro',
      riskLevel: 'low',
      minConfidence: 0.5,
      futureMetadata: {},
    },
    {
      actionType: 'settings_navigation',
      keywords: ['settings', 'preferences', 'config', 'configure', 'options'],
      phrases: ['open settings', 'change preferences', 'configure'],
      requiredEntities: [],
      optionalEntities: [],
      requiredTools: [],
      requiredPermissions: 'free',
      riskLevel: 'none',
      minConfidence: 0.5,
      futureMetadata: {},
    },
  ];
}

export function createDefaultEntityRules(): EntityRule[] {
  return [
    {
      type: 'optimization_profile',
      patterns: ['gaming', 'trading', 'productivity', 'development', 'quick boost', 'deep clean'],
      synonyms: { gaming: ['game', 'play', 'fps'], trading: ['trade', 'stock', 'finance'], productivity: ['work', 'office', 'business'] },
      defaultValue: null,
      futureMetadata: {},
    },
    {
      type: 'time_range',
      patterns: ['today', 'yesterday', 'this week', 'last week', 'this month', 'last month'],
      synonyms: { today: ['now', 'current'], yesterday: ['last day', 'previous day'] },
      defaultValue: null,
      futureMetadata: {},
    },
    {
      type: 'report_type',
      patterns: ['weekly', 'monthly', 'daily', 'system', 'performance', 'health'],
      synonyms: { weekly: ['week', '7 days'], monthly: ['month', '30 days'] },
      defaultValue: 'system',
      futureMetadata: {},
    },
    {
      type: 'maintenance_type',
      patterns: ['routine', 'deep', 'quick', 'full', 'custom'],
      synonyms: { routine: ['regular', 'standard'], deep: ['thorough', 'complete'] },
      defaultValue: 'routine',
      futureMetadata: {},
    },
    {
      type: 'health_metric',
      patterns: ['score', 'cpu', 'memory', 'disk', 'network', 'gpu', 'temperature'],
      synonyms: { cpu: ['processor'], memory: ['ram'], disk: ['storage', 'drive'] },
      defaultValue: 'score',
      futureMetadata: {},
    },
    {
      type: 'recovery_point',
      patterns: ['snapshot', 'checkpoint', 'backup', 'restore point'],
      synonyms: { snapshot: ['snap'], backup: ['save'] },
      defaultValue: null,
      futureMetadata: {},
    },
    {
      type: 'goal',
      patterns: ['performance', 'storage', 'startup', 'battery', 'network', 'security'],
      synonyms: { performance: ['speed', 'fast'], storage: ['space', 'disk'] },
      defaultValue: null,
      futureMetadata: {},
    },
    {
      type: 'device_profile',
      patterns: ['laptop', 'desktop', 'workstation', 'server', 'gaming pc'],
      synonyms: { laptop: ['notebook'], desktop: ['pc', 'tower'] },
      defaultValue: null,
      futureMetadata: {},
    },
    {
      type: 'recommendation',
      patterns: ['clean temp', 'disable startup', 'update drivers', 'defrag', 'clear cache'],
      synonyms: {},
      defaultValue: null,
      futureMetadata: {},
    },
  ];
}

export function createDefaultApprovalPolicies(): ApprovalPolicy[] {
  return [
    { type: 'always_ask', riskThreshold: 'none', autoApproveBelow: false, description: 'Always ask for approval', futureMetadata: {} },
    { type: 'risk_based', riskThreshold: 'medium', autoApproveBelow: true, description: 'Auto-approve low risk, ask for medium+', futureMetadata: {} },
    { type: 'user_preference', riskThreshold: 'high', autoApproveBelow: true, description: 'Based on user preferences', futureMetadata: {} },
  ];
}

export function createDefaultSuggestionRules(): SuggestionRule[] {
  return [
    { actionType: 'optimization', trigger: 'Low health score detected', title: 'Optimize Your PC', description: 'Your health score is below 60. Consider running an optimization.', priority: 1, futureMetadata: {} },
    { actionType: 'maintenance', trigger: 'Maintenance overdue', title: 'Run Maintenance', description: 'It has been a while since your last maintenance.', priority: 2, futureMetadata: {} },
    { actionType: 'report_generation', trigger: 'Weekly report available', title: 'Generate Weekly Report', description: 'Your weekly system report is ready to generate.', priority: 3, futureMetadata: {} },
    { actionType: 'simulation', trigger: 'Multiple recommendations available', title: 'Compare Plans', description: 'Compare optimization plans before committing.', priority: 4, futureMetadata: {} },
    { actionType: 'goal_management', trigger: 'No active goals', title: 'Create a Goal', description: 'Set an optimization goal to track progress.', priority: 5, futureMetadata: {} },
  ];
}

export function createDefaultActionFeatureFlags(): ActionFeatureFlags {
  return {
    enableActionEngine: true,
    enableIntentClassification: true,
    enableEntityExtraction: true,
    enableActionPlanning: true,
    enableApproval: true,
    enableSuggestions: true,
    enableAnalytics: true,
    enableEvents: true,
    enablePlugins: true,
    futureFlags: {},
  };
}

export function createDefaultActionPerformanceTargets(): ActionPerformanceTargets {
  return {
    intentClassificationTargetMs: 100,
    actionPlanningTargetMs: 250,
    futureMetadata: {},
  };
}

export function createDefaultActionProviderSettings(): ActionProviderSettings[] {
  return [{ providerName: 'builtin', providerVersion: '1.0.0', enabled: true, config: {}, futureMetadata: {} }];
}

export function createDefaultActionConfiguration(): ActionConfiguration {
  return {
    configVersion: '1.0.0',
    intentDefinitions: createDefaultIntentDefinitions(),
    entityRules: createDefaultEntityRules(),
    approvalPolicies: createDefaultApprovalPolicies(),
    suggestionRules: createDefaultSuggestionRules(),
    featureFlags: createDefaultActionFeatureFlags(),
    performanceTargets: createDefaultActionPerformanceTargets(),
    providerSettings: createDefaultActionProviderSettings(),
    futureMetadata: {},
  };
}
