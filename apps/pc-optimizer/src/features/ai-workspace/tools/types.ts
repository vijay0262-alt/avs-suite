/**
 * AI Tool Framework — Type Definitions
 *
 * EPIC 5 PHASE A PART 2
 *
 * Provider-independent AI Tool Framework.
 * Every AI capability is exposed as a discoverable tool.
 * The AIAssistant communicates through tools instead of directly
 * calling business managers.
 *
 * Architecture:
 *   User Prompt → Intent Engine → Tool Resolver → Tool Registry →
 *   Selected Tool → Business Modules → Tool Result → AIAssistant Response
 *
 * Core principles:
 *   - Tools are the only interface between AIAssistant and business modules.
 *   - Every tool result carries evidence, confidence, and traceability.
 *   - Tools never execute optimizations directly — they orchestrate
 *     existing module outputs and return structured results.
 *   - New AI capabilities require only registering a new tool.
 */

// ── Re-export AIAssistant types used by tools ─────────────────────

export type {
  AIAssistantIntentType,
  AIAssistantCapability,
  AIAssistantContext,
  AIAssistantEntity,
  AIAssistantEvidence,
  PermissionLevel,
  AIAssistantValidationResult,
  AIAssistantValidationError,
  AIAssistantValidationWarning,
  DeviceProfileSummary,
  GoalSummary,
  TimelineEventSummary,
  RecommendationSummary,
  PredictionSummary,
  MaintenanceSummary,
  OptimizationHistorySummary,
  RecoverySummary,
  ContextSourceType,
} from '../aiAssistant/types';

import type {
  AIAssistantIntentType,
  AIAssistantCapability,
  AIAssistantContext,
  AIAssistantEvidence,
  PermissionLevel,
  AIAssistantValidationResult,
  ContextSourceType,
} from '../aiAssistant/types';

// ── Tool Categories ───────────────────────────────────────────

export type ToolCategory =
  | 'explanation'
  | 'optimization'
  | 'maintenance'
  | 'recovery'
  | 'reporting'
  | 'goals'
  | 'predictions'
  | 'timeline'
  | 'diagnostics'
  | 'administration'
  | 'future_category';

export function getToolCategoryLabel(category: ToolCategory): string {
  const labels: Record<ToolCategory, string> = {
    explanation: 'Explanation',
    optimization: 'Optimization',
    maintenance: 'Maintenance',
    recovery: 'Recovery',
    reporting: 'Reporting',
    goals: 'Goals',
    predictions: 'Predictions',
    timeline: 'Timeline',
    diagnostics: 'Diagnostics',
    administration: 'Administration',
    future_category: 'Future Category',
  };
  return labels[category] ?? 'Unknown';
}

// ── Risk Levels ───────────────────────────────────────────────

export type ToolRiskLevel =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export function getRiskLevelLabel(risk: ToolRiskLevel): string {
  const labels: Record<ToolRiskLevel, string> = {
    none: 'None',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };
  return labels[risk] ?? 'Unknown';
}

// ── Output Types ──────────────────────────────────────────────

export type ToolOutputType =
  | 'explanation'
  | 'recommendation'
  | 'report'
  | 'plan'
  | 'comparison'
  | 'data'
  | 'navigation'
  | 'confirmation'
  | 'future_output';

export function getOutputTypeLabel(output: ToolOutputType): string {
  const labels: Record<ToolOutputType, string> = {
    explanation: 'Explanation',
    recommendation: 'Recommendation',
    report: 'Report',
    plan: 'Plan',
    comparison: 'Comparison',
    data: 'Data',
    navigation: 'Navigation',
    confirmation: 'Confirmation',
    future_output: 'Future Output',
  };
  return labels[output] ?? 'Unknown';
}

// ── Tool Status ───────────────────────────────────────────────

export type ToolStatus =
  | 'registered'
  | 'active'
  | 'disabled'
  | 'deprecated'
  | 'future_status';

export function getToolStatusLabel(status: ToolStatus): string {
  const labels: Record<ToolStatus, string> = {
    registered: 'Registered',
    active: 'Active',
    disabled: 'Disabled',
    deprecated: 'Deprecated',
    future_status: 'Future Status',
  };
  return labels[status] ?? 'Unknown';
}

// ── Execution Status ──────────────────────────────────────────

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'future_execution_status';

export function getExecutionStatusLabel(status: ExecutionStatus): string {
  const labels: Record<ExecutionStatus, string> = {
    pending: 'Pending',
    running: 'Running',
    success: 'Success',
    failed: 'Failed',
    cancelled: 'Cancelled',
    timeout: 'Timeout',
    future_execution_status: 'Future Status',
  };
  return labels[status] ?? 'Unknown';
}

// ── Tool Definition ───────────────────────────────────────────

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  supportedIntents: AIAssistantIntentType[];
  requiredCapabilities: AIAssistantCapability[];
  requiredPermissions: PermissionLevel;
  requiredContext: ContextSourceType[];
  estimatedDuration: number;
  riskLevel: ToolRiskLevel;
  outputType: ToolOutputType;
  status: ToolStatus;
  futureMetadata: Record<string, unknown>;
}

// ── Tool Input ────────────────────────────────────────────────

export interface ToolInput {
  toolId: string;
  context: AIAssistantContext;
  parameters: Record<string, unknown>;
  userPermissionLevel: PermissionLevel;
  userCapabilities: AIAssistantCapability[];
  conversationId: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Tool Result ───────────────────────────────────────────────

export interface ToolResult {
  toolId: string;
  executionId: string;
  status: ExecutionStatus;
  confidence: number;
  summary: string;
  details: Record<string, unknown>;
  supportingEvidence: AIAssistantEvidence[];
  recommendedActions: RecommendedAction[];
  relatedModules: string[];
  executionTime: number;
  errorMessage: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface RecommendedAction {
  actionType: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  parameters: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

// ── Tool Interface ────────────────────────────────────────────

export interface Tool {
  definition: ToolDefinition;
  execute(input: ToolInput): Promise<ToolResult>;
  canHandle(intent: AIAssistantIntentType, context: AIAssistantContext): boolean;
  getRequiredContext(): ContextSourceType[];
}

// ── Tool Plugin (Extensibility) ───────────────────────────────

export interface ToolPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getTools(): Tool[];
}

// ── Tool Permission ───────────────────────────────────────────

export interface ToolPermissionRule {
  toolId: string;
  requiredLevel: PermissionLevel;
  requiredCapabilities: AIAssistantCapability[];
  description: string;
  futureMetadata: Record<string, unknown>;
}

export interface ToolPermissionResult {
  allowed: boolean;
  reason: string | null;
  requiredLevel: PermissionLevel;
  currentLevel: PermissionLevel;
  missingCapabilities: AIAssistantCapability[];
  futureMetadata: Record<string, unknown>;
}

// ── Tool Discovery ────────────────────────────────────────────

export interface ToolDiscoveryResult {
  tools: ToolDefinition[];
  totalCount: number;
  filteredCount: number;
  futureMetadata: Record<string, unknown>;
}

export interface ToolSearchQuery {
  query?: string;
  category?: ToolCategory;
  intent?: AIAssistantIntentType;
  capability?: AIAssistantCapability;
  riskLevel?: ToolRiskLevel;
  futureMetadata?: Record<string, unknown>;
}

// ── Tool Telemetry ────────────────────────────────────────────

export interface ToolTelemetryEntry {
  executionId: string;
  toolId: string;
  status: ExecutionStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  confidence: number;
  errorMessage: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Tool Analytics ────────────────────────────────────────────

export interface ToolAnalytics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  byTool: Record<string, number>;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  averageExecutionTimeMs: number;
  averageConfidence: number;
  topTools: ToolUsageCount[];
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface ToolUsageCount {
  toolId: string;
  toolName: string;
  count: number;
}

// ── Tool Events ───────────────────────────────────────────────

export type ToolEventType =
  | 'tool_registered'
  | 'tool_unregistered'
  | 'tool_selected'
  | 'tool_executed'
  | 'tool_failed'
  | 'tool_validated'
  | 'tool_discovered';

export interface ToolEvent {
  type: ToolEventType;
  toolId: string | null;
  timestamp: string;
  data: unknown;
}

export type ToolEventListener = (event: ToolEvent) => void;

// ── Tool Configuration ────────────────────────────────────────

export interface ToolConfiguration {
  configVersion: string;
  permissionRules: ToolPermissionRules;
  executionPolicies: ToolExecutionPolicies;
  featureFlags: ToolFeatureFlags;
  providerSettings: ToolProviderSettings[];
  performanceTargets: ToolPerformanceTargets;
  futureMetadata: Record<string, unknown>;
}

export interface ToolPermissionRules {
  rules: ToolPermissionRule[];
  defaultLevel: PermissionLevel;
  futureMetadata: Record<string, unknown>;
}

export interface ToolExecutionPolicies {
  maxConcurrentExecutions: number;
  defaultTimeoutMs: number;
  retryOnFailure: boolean;
  maxRetries: number;
  enableTelemetry: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface ToolFeatureFlags {
  enableToolFramework: boolean;
  enableToolDiscovery: boolean;
  enableToolExecution: boolean;
  enableToolValidation: boolean;
  enableToolPermissions: boolean;
  enableToolTelemetry: boolean;
  enableToolAnalytics: boolean;
  enableToolEvents: boolean;
  enableToolPlugins: boolean;
  futureFlags: Record<string, boolean>;
}

export interface ToolProviderSettings {
  providerName: string;
  providerVersion: string;
  enabled: boolean;
  config: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface ToolPerformanceTargets {
  discoveryTargetMs: number;
  executionOverheadTargetMs: number;
  metadataLoadTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Tool Validation ───────────────────────────────────────────

export type ToolValidationResult = AIAssistantValidationResult;

// ── Tool Resolver ─────────────────────────────────────────────

export interface ToolResolutionResult {
  selectedTool: ToolDefinition | null;
  alternatives: ToolDefinition[];
  reason: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

// ── Helper Functions ───────────────────────────────────────────

export function generateToolId(): string {
  return `tool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateExecutionId(): string {
  return `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateToolEventId(): string {
  return `tool_evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ── Default Factories ─────────────────────────────────────────

export function createDefaultToolPermissionRules(): ToolPermissionRules {
  return {
    rules: [
      { toolId: 'explain_health', requiredLevel: 'free', requiredCapabilities: ['explain_health_score'], description: 'Explain health score', futureMetadata: {} },
      { toolId: 'explain_recommendation', requiredLevel: 'free', requiredCapabilities: ['explain_recommendations'], description: 'Explain a recommendation', futureMetadata: {} },
      { toolId: 'explain_prediction', requiredLevel: 'free', requiredCapabilities: ['explain_predictions'], description: 'Explain a prediction', futureMetadata: {} },
      { toolId: 'explain_timeline', requiredLevel: 'free', requiredCapabilities: ['explain_timeline_events'], description: 'Explain a timeline event', futureMetadata: {} },
      { toolId: 'explain_goal', requiredLevel: 'free', requiredCapabilities: [], description: 'Explain a goal', futureMetadata: {} },
      { toolId: 'show_recovery', requiredLevel: 'free', requiredCapabilities: ['explain_recovery_options'], description: 'Show recovery options', futureMetadata: {} },
      { toolId: 'compare_plans', requiredLevel: 'free', requiredCapabilities: ['compare_strategies'], description: 'Compare optimization plans', futureMetadata: {} },
      { toolId: 'run_simulation', requiredLevel: 'pro', requiredCapabilities: [], description: 'Run a simulation', futureMetadata: {} },
      { toolId: 'create_optimization_session', requiredLevel: 'pro', requiredCapabilities: ['generate_optimization_session'], description: 'Create an optimization session', futureMetadata: {} },
      { toolId: 'start_maintenance', requiredLevel: 'free', requiredCapabilities: [], description: 'Start maintenance', futureMetadata: {} },
      { toolId: 'create_goal', requiredLevel: 'pro', requiredCapabilities: [], description: 'Create a goal', futureMetadata: {} },
      { toolId: 'generate_report', requiredLevel: 'free', requiredCapabilities: ['generate_reports'], description: 'Generate a report', futureMetadata: {} },
    ],
    defaultLevel: 'free',
    futureMetadata: {},
  };
}

export function createDefaultToolExecutionPolicies(): ToolExecutionPolicies {
  return {
    maxConcurrentExecutions: 5,
    defaultTimeoutMs: 30000,
    retryOnFailure: false,
    maxRetries: 0,
    enableTelemetry: true,
    futureMetadata: {},
  };
}

export function createDefaultToolFeatureFlags(): ToolFeatureFlags {
  return {
    enableToolFramework: true,
    enableToolDiscovery: true,
    enableToolExecution: true,
    enableToolValidation: true,
    enableToolPermissions: true,
    enableToolTelemetry: true,
    enableToolAnalytics: true,
    enableToolEvents: true,
    enableToolPlugins: true,
    futureFlags: {},
  };
}

export function createDefaultToolProviderSettings(): ToolProviderSettings[] {
  return [
    {
      providerName: 'builtin',
      providerVersion: '1.0.0',
      enabled: true,
      config: {},
      futureMetadata: {},
    },
  ];
}

export function createDefaultToolPerformanceTargets(): ToolPerformanceTargets {
  return {
    discoveryTargetMs: 50,
    executionOverheadTargetMs: 20,
    metadataLoadTargetMs: 10,
    futureMetadata: {},
  };
}

export function createDefaultToolConfiguration(): ToolConfiguration {
  return {
    configVersion: '1.0.0',
    permissionRules: createDefaultToolPermissionRules(),
    executionPolicies: createDefaultToolExecutionPolicies(),
    featureFlags: createDefaultToolFeatureFlags(),
    providerSettings: createDefaultToolProviderSettings(),
    performanceTargets: createDefaultToolPerformanceTargets(),
    futureMetadata: {},
  };
}
