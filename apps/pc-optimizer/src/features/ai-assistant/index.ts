/**
 * AVS AI Assistant Platform — Barrel Export
 *
 * Explainable AI assistant that understands PC health using
 * existing AVS platform data.
 *
 * Components:
 *   • AssistantContextBuilder — aggregates data from all AVS modules
 *   • ConversationEngine — orchestrates conversation pipeline
 *   • ExplanationEngine — builds structured explanations
 *   • RecommendationExplainer — explains individual recommendations
 *   • InsightGenerator — generates proactive insights
 *   • QuestionRouter — classifies and routes questions
 *   • ConversationHistory — session persistence and topic tracking
 *   • PromptTemplateRegistry — structured prompt templates
 *
 * Data Sources:
 *   AI Health Engine, Dashboard, Optimization Planner,
 *   Execution History, Maintenance Reports,
 *   Storage Intelligence, Browser Health, Windows Health,
 *   Startup Optimizer, Duplicate Engine,
 *   Configuration/Capabilities, Subscriptions
 *
 * Safety:
 *   Never exposes passwords, private file contents, or hashes.
 *   Never performs actions automatically.
 *   Never bypasses confirmation.
 *
 * This module does NOT modify:
 *   • Authentication, licensing, subscriptions, payment
 *   • Configuration synchronization
 *   • AI Health Engine architecture
 *   • Execution Engine architecture
 *   • Optimization Planner
 *   • Dashboard architecture
 *   • Storage Intelligence, Browser Health, Windows Health
 *   • Startup Optimizer, Duplicate Engine
 */

// Types
export type {
  MessageRole,
  ConversationMessage,
  Conversation,
  ConversationTopic,
  QuestionType,
  QuestionClassification,
  ExplanationEvidence,
  RecommendedAction,
  AssistantExplanation,
  InsightType,
  InsightSeverity,
  AssistantInsight,
  RecommendationExplanation,
  AssistantContext,
  PromptTemplateId,
  PromptTemplate,
  AssistantDashboardData,
  LLMAdapter,
  AssistantEventType,
  AssistantEventPayloads,
  AssistantEventListener,
} from './types';
export {
  QUICK_QUESTIONS,
  FORBIDDEN_PATTERNS,
  sanitizeContent,
  isSafeContent,
  generateMessageId,
  generateConversationId,
  generateInsightId,
  scoreToLevel,
  formatBytes,
  formatDuration,
  QUESTION_KEYWORDS,
} from './types';

// Events
export { AssistantEventEmitter, assistantEvents } from './assistantEvents';

// Prompt Templates
export { PromptTemplateRegistry, promptTemplateRegistry } from './promptTemplateRegistry';

// Context Builder
export { AssistantContextBuilder, assistantContextBuilder } from './assistantContextBuilder';
export type { ContextBuilderInput } from './assistantContextBuilder';

// Question Router
export { QuestionRouter, questionRouter } from './questionRouter';

// Explanation Engine
export { ExplanationEngine, explanationEngine } from './explanationEngine';

// Recommendation Explainer
export { RecommendationExplainer, recommendationExplainer } from './recommendationExplainer';

// Insight Generator
export { InsightGenerator, insightGenerator } from './insightGenerator';

// Conversation History
export { ConversationHistory, conversationHistory } from './conversationHistory';

// Conversation Engine
export { ConversationEngine, conversationEngine } from './conversationEngine';
export type { ConversationResponse } from './conversationEngine';
