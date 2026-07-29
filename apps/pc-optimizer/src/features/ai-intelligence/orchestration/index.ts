/**
 * AI Orchestration Engine — Barrel Export.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every response must be
 *    evidence-based, traceable back to AI modules, with confidence."
 *
 * The Orchestration Engine is the single gateway between LLMs and the
 * AVS Shield Intelligence Platform.
 *
 * Components:
 *   - AIOrchestrator                — main orchestrator coordinating all components
 *   - IntentResolver                — resolve user queries to supported intents
 *   - TaskPlanner                   — multi-step planning for complex queries
 *   - ConversationContextBuilder    — build compact structured context
 *   - ExplanationBuilder            — build evidence-based explanations
 *   - ResponseComposer              — compose structured responses
 *   - ConversationMemory            — maintain conversation state
 *   - ToolRegistry                  — register/unregister orchestrator tools
 *   - ToolExecutor                  — execute registered tools safely
 *   - ConversationValidator         — validate conversation integrity
 *   - ConversationEvents            — typed event emitter (7 events)
 *   - ConversationConfiguration     — default config and factory
 */

// Types
export type {
  ConversationIntentType,
  IntentDefinition,
  IntentResolutionResult,
  AIModuleName,
  TaskStepStatus,
  TaskStep,
  TaskPlan,
  OrchestratorTool,
  ToolParams,
  ToolResult,
  ToolDefinition,
  ContextDetailLevel,
  ConversationContext,
  SystemSummary,
  HealthSummary,
  StorageSummary,
  PerformanceSummary,
  StartupSummary,
  BrowserSummary,
  PrivacySummary,
  KnowledgeSummaryInfo,
  RecommendationSummaryInfo,
  InsightSummaryInfo,
  PredictionSummaryInfo,
  DeviceProfileSummaryInfo,
  HistorySummaryInfo,
  ConversationContextMetadata,
  Explanation,
  ExplanationEvidence,
  ConversationResponse,
  SupportingFact,
  ConversationMemoryData,
  ConversationPreferences,
  LLMProviderType,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ConversationValidationIssue,
  ConversationValidationResult,
  ConversationStatistics,
  ConversationEventType,
  ConversationEventListener,
  IntentRules,
  PlannerRules,
  MemoryRules,
  ProviderSettings,
  ContextLimits,
  ConversationConfiguration,
  EngineProviderPlugin,
  ConversationRequest,
  AIContext,
  KnowledgeObject,
  RecommendationList,
  Recommendation,
  InsightList,
  Insight,
  PredictionList,
  Prediction,
  DeviceProfile,
} from './types';

export {
  generateConversationId,
  generateResponseId,
  generateTaskPlanId,
  generateTaskStepId,
  generateContextId,
  clampScore,
  getIntentLabel,
  getAIModuleLabel,
  getDefaultPreferences,
} from './types';

export { ConversationEventEmitter, conversationEvents } from './conversationEvents';
export {
  DEFAULT_CONVERSATION_CONFIG,
  DEFAULT_INTENT_DEFINITIONS,
  DEFAULT_TOOL_DEFINITIONS,
  createConversationConfig,
} from './conversationConfiguration';
export type { DeepPartial as ConversationDeepPartial } from './conversationConfiguration';
export { ConversationMemory } from './conversationMemory';
export { ToolRegistry } from './toolRegistry';
export { ToolExecutor } from './toolExecutor';
export { IntentResolver } from './intentResolver';
export { TaskPlanner } from './taskPlanner';
export { ConversationContextBuilder } from './conversationContextBuilder';
export { ExplanationBuilder } from './explanationBuilder';
export { ResponseComposer } from './responseComposer';
export { ConversationValidator } from './conversationValidator';
export { AIOrchestrator } from './aiOrchestrator';
export type { OrchestratorDataBundle } from './aiOrchestrator';
