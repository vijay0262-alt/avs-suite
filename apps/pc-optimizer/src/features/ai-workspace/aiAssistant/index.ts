/**
 * AVS AI Assistant Platform — Barrel Export
 *
 * EPIC 5 PHASE A PART 1
 *
 * The AVS AI Assistant is the primary AI interface for AVS AI Shield.
 * It orchestrates all existing AI modules to answer questions,
 * explain system behavior, recommend actions, create optimization
 * sessions, and navigate the platform using natural language.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every answer, suggestion,
 *    and action plan must be traceable back to AI modules, with
 *    supporting evidence and a confidence score."
 *
 * The AIAssistant MUST NOT execute optimizations directly.
 * The AIAssistant MUST NOT duplicate existing business logic.
 * The AIAssistant ONLY orchestrates and presents existing AI module outputs.
 */

// Manager
export { AIAssistantManager } from './aiAssistantManager';

// Configuration
export {
  DEFAULT_AI_ASSISTANT_CONFIGURATION,
  createAIAssistantConfiguration,
  validateConfiguration,
  getDefaultProviders,
  getDefaultFeatureFlags,
} from './aiAssistantConfiguration';
export type { DeepPartial as AIAssistantDeepPartial } from './aiAssistantConfiguration';

// Events
export { AIAssistantEvents } from './aiAssistantEvents';

// Engines
export { AIAssistantIntentEngine } from './aiAssistantIntentEngine';
export { AIAssistantContextResolver } from './aiAssistantContextResolver';
export type { AIAssistantContextResolverInput } from './aiAssistantContextResolver';
export { AIAssistantResponseEngine } from './aiAssistantResponseEngine';
export { AIAssistantSuggestionEngine } from './aiAssistantSuggestionEngine';
export { AIAssistantExplanationEngine } from './aiAssistantExplanationEngine';
export { AIAssistantActionPlanner } from './aiAssistantActionPlanner';
export { AIAssistantPermissionEngine } from './aiAssistantPermissionEngine';
export { AIAssistantMemory } from './aiAssistantMemory';
export { AIAssistantSessionManager } from './aiAssistantSessionManager';
export { AIAssistantConversationEngine } from './aiAssistantConversationEngine';
export { AIAssistantAnalyticsEngine } from './aiAssistantAnalytics';
export { AIAssistantValidator } from './aiAssistantValidator';

// Types
export type {
  AIAssistantIntentType,
  AIAssistantCapability,
  IntentDefinition,
  IntentResolutionResult,
  AlternativeIntent,
  EntityType,
  AIAssistantEntity,
  ContextSourceType,
  AIAssistantContextSource,
  AIAssistantContext,
  DeviceProfileSummary,
  GoalSummary,
  TimelineEventSummary,
  RecommendationSummary,
  PredictionSummary,
  MaintenanceSummary,
  OptimizationHistorySummary,
  RecoverySummary,
  AIAssistantEvidence,
  AIAssistantResponse,
  SuggestionType,
  AIAssistantSuggestion,
  SuggestionPriority,
  ExplanationSubject,
  AIAssistantExplanation,
  ActionType,
  AIAssistantActionPlan,
  AIAssistantConversation,
  ConversationStatus,
  AIAssistantMessage,
  AIAssistantReference,
  AIAssistantMemory as AIAssistantMemoryData,
  AIAssistantSession,
  SessionStatus,
  PermissionLevel,
  PermissionRule,
  PermissionResult,
  AIAssistantAnalytics,
  TopicCount,
  EntityCount,
  AIAssistantValidationResult,
  AIAssistantValidationError,
  AIAssistantValidationWarning,
  AIAssistantPromptInput,
  AIAssistantPromptResult,
  IntentDefinitions,
  ResponseTemplates,
  ResponseTemplate,
  SuggestionRules,
  PermissionRules,
  AIAssistantFeatureFlags,
  ProviderConfiguration,
  AIAssistantConfiguration,
  AIAssistantEventType,
  AIAssistantEvent,
  AIAssistantEventListener,
  AIAssistantProviderPlugin,
  AIAssistantResponseInput,
  AIAssistantSuggestionInput,
} from './types';

export {
  generateAIAssistantId,
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
  createDefaultAIAssistantFeatureFlags,
  createDefaultProviders,
} from './types';
