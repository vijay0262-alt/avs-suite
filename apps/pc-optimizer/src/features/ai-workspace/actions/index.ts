/**
 * Natural Language Action Engine — Barrel Export
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

// Manager
export { NaturalLanguageActionManager, actionEvents } from './naturalLanguageActionManager';

// Configuration
export {
  DEFAULT_ACTION_CONFIGURATION,
  createActionConfiguration,
  validateActionConfiguration,
} from './actionConfiguration';
export type { DeepPartial as ActionDeepPartial } from './actionConfiguration';

// Events
export { ActionEvents } from './actionEvents';

// Core components
export { IntentClassifier } from './intentClassifier';
export { EntityExtractor } from './entityExtractor';
export { ActionContextResolver } from './actionContextResolver';
export type { ResolvedActionContext } from './actionContextResolver';
export { ActionResolver } from './actionResolver';
export { ActionPlanner } from './actionPlanner';
export { ActionValidator } from './actionValidator';
export { ActionApprovalEngine } from './actionApprovalEngine';
export { ActionPlanFormatter } from './actionPlanFormatter';
export type { FormattedActionPlan } from './actionPlanFormatter';
export { ActionSuggestionEngine } from './actionSuggestionEngine';
export { ActionAnalytics } from './actionAnalytics';

// Types
export type {
  ActionType,
  ActionRiskLevel,
  EntityType,
  ExtractedEntity,
  ClassifiedIntent,
  IntentDefinition,
  EntityRule,
  ActionStep,
  ActionPlan,
  ActionPlanStatus,
  ActionExplanation,
  ApprovalPolicyType,
  ApprovalPolicy,
  ApprovalRequest,
  ApprovalResult,
  ActionValidationResult,
  ActionValidationError,
  ActionValidationWarning,
  ActionSuggestion,
  ParsedRequest,
  ActionAnalyticsData,
  ActionEventType,
  ActionEvent,
  ActionListener,
  ActionConfiguration,
  ActionFeatureFlags,
  ActionPerformanceTargets,
  ActionProviderSettings,
  SuggestionRule,
  ActionPlugin,
} from './types';

export {
  generateIntentId,
  generateActionPlanId,
  generateActionStepId,
  generateSuggestionId,
  generateApprovalRequestId,
  clampConfidence,
  getActionTypeLabel,
  getRiskLevelLabel,
  getEntityTypeLabel,
  getApprovalPolicyLabel,
  getActionPlanStatusLabel,
  createDefaultIntentDefinitions,
  createDefaultEntityRules,
  createDefaultApprovalPolicies,
  createDefaultSuggestionRules,
  createDefaultActionFeatureFlags,
  createDefaultActionPerformanceTargets,
  createDefaultActionProviderSettings,
  createDefaultActionConfiguration,
} from './types';
