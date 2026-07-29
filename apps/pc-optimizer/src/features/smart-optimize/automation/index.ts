/**
 * Smart Optimize 2.0 — Policy-Based Automation Engine
 *
 * EPIC 4 PHASE A PART 5 — Barrel Export
 *
 * Evaluates system events, AI recommendations, and user-defined rules
 * to generate intelligent automation decisions. Always respects safety
 * policies and user preferences. Produces execution plans rather than
 * executing optimizations directly.
 */
// Types
export type {
  AutomationTriggerType,
  AutomationTrigger,
  AutomationTriggerContext,
  AutomationTriggerDefinition,
  ConditionOperator,
  ConditionType,
  AutomationCondition,
  AutomationConditionContext,
  ConditionEvaluationResult,
  AutomationActionType,
  AutomationAction,
  AutomationActionDefinition,
  AutomationRule,
  ExecutionPolicy,
  ApprovalPolicyType,
  ApprovalPolicy,
  ApprovalContext,
  ApprovalDecision,
  EnterpriseApprovalInfo,
  SafetyPolicyType,
  SafetyPolicy,
  SafetyEvaluationContext,
  SafetyEvaluationResult,
  CooldownUnit,
  CooldownConfig,
  CooldownScope,
  CooldownState,
  AutomationPlan,
  AutomationValidationResult,
  AutomationValidationError,
  AutomationValidationWarning,
  AutomationOutcome,
  AutomationHistoryEntry,
  AutomationStatistics,
  AutomationEventType,
  AutomationEvent,
  AutomationEventListener,
  AutomationConfiguration,
  ConditionDefinition,
  ApprovalPolicyConfig,
  SafetyPolicyConfig,
  CooldownRule,
  AutomationFeatureFlags,
  AutomationTriggerPlugin,
  AutomationConditionPlugin,
  AutomationActionPlugin,
  AutomationActionContext,
  AutomationPlannedAction,
} from './types';

// Re-export shared types
export type { RiskLevel, RecommendationPriority, SystemState } from './types';

// Helpers
export {
  createDefaultAutomationConfiguration,
  createDefaultApprovalPolicy,
  createDefaultCooldownConfig,
  createDefaultExecutionPolicy,
  generateAutomationId,
  generateRuleId,
  generateTriggerId,
  generateActionId,
  generatePlanId,
  generateHistoryId,
  generateConditionId,
  riskToScore,
  priorityToScore,
  cooldownToMs,
} from './types';

// Configuration
export {
  DEFAULT_AUTOMATION_CONFIGURATION,
  createAutomationConfiguration,
} from './automationConfiguration';
export type { DeepPartial as AutomationDeepPartial } from './automationConfiguration';

// Events
export { AutomationEvents } from './automationEvents';

// Trigger Registry
export { AutomationTriggerRegistry } from './automationTriggerRegistry';

// Condition Engine
export { AutomationConditionEngine } from './automationConditionEngine';

// Policy Registry
export { AutomationPolicyRegistry } from './automationPolicyRegistry';

// Rule Registry
export { AutomationRuleRegistry } from './automationRuleRegistry';

// Action Planner
export { AutomationActionPlanner } from './automationActionPlanner';

// Approval Engine
export { AutomationApprovalEngine } from './automationApprovalEngine';

// Cooldown Manager
export { AutomationCooldownManager } from './automationCooldownManager';

// History
export { AutomationHistory } from './automationHistory';

// Validator
export { AutomationValidator } from './automationValidator';

// Engine
export { AutomationEngine, type AutomationEngineOptions, type RuleEvaluationResult } from './automationEngine';

// Manager
export { AutomationManager } from './automationManager';
