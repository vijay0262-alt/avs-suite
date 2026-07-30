/**
 * AI Tool Framework — Barrel Export
 *
 * EPIC 5 PHASE A PART 2
 *
 * Provider-independent AI Tool Framework.
 * Every AI capability is exposed as a discoverable tool.
 * The Copilot communicates through tools instead of directly
 * calling business managers.
 *
 * Architecture:
 *   User Prompt → Intent Engine → Tool Resolver → Tool Registry →
 *   Selected Tool → Business Modules → Tool Result → Copilot Response
 */

// Manager
export { ToolManager, toolEvents } from './toolManager';

// Configuration
export {
  DEFAULT_TOOL_CONFIGURATION,
  createToolConfiguration,
  validateToolConfiguration,
} from './toolConfiguration';
export type { DeepPartial as ToolDeepPartial } from './toolConfiguration';

// Events
export { ToolEvents } from './toolEvents';

// Core components
export { ToolRegistry } from './toolRegistry';
export { ToolResolver } from './toolResolver';
export { ToolValidator } from './toolValidator';
export { ToolPermissionEngine } from './toolPermissionEngine';
export { ToolExecutor } from './toolExecutor';
export { ToolResultFormatter } from './toolResultFormatter';
export type { FormattedToolResult } from './toolResultFormatter';
export { ToolTelemetry } from './toolTelemetry';
export { ToolAnalytics } from './toolAnalytics';

// Base tool
export { BaseTool } from './baseTool';

// Built-in tools
export {
  ExplainHealthTool,
  ExplainRecommendationTool,
  ExplainPredictionTool,
  ExplainTimelineTool,
  ExplainGoalTool,
  ShowRecoveryTool,
  ComparePlansTool,
  SimulationTool,
  OptimizationSessionTool,
  MaintenanceTool,
  GoalCreationTool,
  ReportGenerationTool,
  createDefaultTools,
} from './builtinTools';

// Types
export type {
  ToolCategory,
  ToolRiskLevel,
  ToolOutputType,
  ToolStatus,
  ExecutionStatus,
  ToolDefinition,
  ToolInput,
  ToolResult,
  RecommendedAction,
  Tool,
  ToolPlugin,
  ToolPermissionRule,
  ToolPermissionResult,
  ToolDiscoveryResult,
  ToolSearchQuery,
  ToolTelemetryEntry,
  ToolAnalytics as ToolAnalyticsData,
  ToolUsageCount,
  ToolEventType,
  ToolEvent,
  ToolEventListener,
  ToolConfiguration,
  ToolPermissionRules,
  ToolExecutionPolicies,
  ToolFeatureFlags,
  ToolProviderSettings,
  ToolPerformanceTargets,
  ToolValidationResult,
  ToolResolutionResult,
} from './types';

export {
  generateToolId,
  generateExecutionId,
  generateToolEventId,
  clampConfidence as clampToolConfidence,
  getToolCategoryLabel,
  getRiskLevelLabel,
  getOutputTypeLabel,
  getToolStatusLabel,
  getExecutionStatusLabel,
  createDefaultToolPermissionRules,
  createDefaultToolExecutionPolicies,
  createDefaultToolFeatureFlags,
  createDefaultToolProviderSettings,
  createDefaultToolPerformanceTargets,
  createDefaultToolConfiguration,
} from './types';
