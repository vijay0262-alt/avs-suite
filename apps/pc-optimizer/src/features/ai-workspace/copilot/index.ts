/**
 * AI Copilot Platform — Barrel Export
 *
 * EPIC 5 PHASE A PART 1
 *
 * The AI Copilot is the primary AI interface for AVS Shield.
 * It orchestrates all existing AI modules to answer questions,
 * explain system behavior, recommend actions, create optimization
 * sessions, and navigate the platform using natural language.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every answer, suggestion,
 *    and action plan must be traceable back to AI modules, with
 *    supporting evidence and a confidence score."
 *
 * The Copilot MUST NOT execute optimizations directly.
 * The Copilot MUST NOT duplicate existing business logic.
 * The Copilot ONLY orchestrates and presents existing AI module outputs.
 */

// Manager
export { CopilotManager, copilotEvents } from './copilotManager';

// Configuration
export {
  DEFAULT_COPILOT_CONFIGURATION,
  createCopilotConfiguration,
  validateConfiguration,
  getDefaultProviders,
  getDefaultFeatureFlags,
} from './copilotConfiguration';
export type { DeepPartial as CopilotDeepPartial } from './copilotConfiguration';

// Events
export { CopilotEvents } from './copilotEvents';

// Engines
export { CopilotIntentEngine } from './copilotIntentEngine';
export { CopilotContextResolver } from './copilotContextResolver';
export type { CopilotContextResolverInput } from './copilotContextResolver';
export { CopilotResponseEngine } from './copilotResponseEngine';
export { CopilotSuggestionEngine } from './copilotSuggestionEngine';
export { CopilotExplanationEngine } from './copilotExplanationEngine';
export { CopilotActionPlanner } from './copilotActionPlanner';
export { CopilotPermissionEngine } from './copilotPermissionEngine';
export { CopilotMemory } from './copilotMemory';
export { CopilotSessionManager } from './copilotSessionManager';
export { CopilotConversationEngine } from './copilotConversationEngine';
export { CopilotAnalyticsEngine } from './copilotAnalytics';
export { CopilotValidator } from './copilotValidator';

// Types
export type {
  CopilotIntentType,
  CopilotCapability,
  IntentDefinition,
  IntentResolutionResult,
  AlternativeIntent,
  EntityType,
  CopilotEntity,
  ContextSourceType,
  CopilotContextSource,
  CopilotContext,
  DeviceProfileSummary,
  GoalSummary,
  TimelineEventSummary,
  RecommendationSummary,
  PredictionSummary,
  MaintenanceSummary,
  OptimizationHistorySummary,
  RecoverySummary,
  CopilotEvidence,
  CopilotResponse,
  SuggestionType,
  CopilotSuggestion,
  SuggestionPriority,
  ExplanationSubject,
  CopilotExplanation,
  ActionType,
  CopilotActionPlan,
  CopilotConversation,
  ConversationStatus,
  CopilotMessage,
  CopilotReference,
  CopilotMemory as CopilotMemoryData,
  CopilotSession,
  SessionStatus,
  PermissionLevel,
  PermissionRule,
  PermissionResult,
  CopilotAnalytics,
  TopicCount,
  EntityCount,
  CopilotValidationResult,
  CopilotValidationError,
  CopilotValidationWarning,
  CopilotPromptInput,
  CopilotPromptResult,
  IntentDefinitions,
  ResponseTemplates,
  ResponseTemplate,
  SuggestionRules,
  PermissionRules,
  CopilotFeatureFlags,
  ProviderConfiguration,
  CopilotConfiguration,
  CopilotEventType,
  CopilotEvent,
  CopilotEventListener,
  CopilotProviderPlugin,
  CopilotResponseInput,
  CopilotSuggestionInput,
} from './types';

export {
  generateCopilotId,
  generateConversationId,
  generateMessageId,
  generateResponseId,
  generateSuggestionId,
  generateActionPlanId,
  generateSessionId,
  generateExplanationId,
  generateReferenceId,
  clampConfidence,
  getIntentLabel,
  getCapabilityLabel,
  getActionTypeLabel,
  getEventTypeLabel,
  getSuggestionTypeLabel,
  getExplanationSubjectLabel,
  getPermissionLevelLabel,
  getConversationStatusLabel,
  getSessionStatusLabel,
  createDefaultIntentDefinitions,
  createDefaultResponseTemplates,
  createDefaultSuggestionRules,
  createDefaultPermissionRules,
  createDefaultCopilotFeatureFlags,
  createDefaultProviders,
} from './types';
