/**
 * AVS AI Assistant Platform — AIAssistant Manager
 *
 * EPIC 5 PHASE A PART 1
 *
 * The main public API facade for the AVS AI Assistant.
 * Orchestrates all AIAssistant engines and provides the public interface:
 *   processPrompt(), resolveIntent(), generateResponse(),
 *   generateSuggestions(), createActionPlan(),
 *   getConversationHistory(), clearConversation()
 *
 * The AIAssistant MUST NOT execute optimizations directly.
 * The AIAssistant MUST NOT duplicate existing business logic.
 * The AIAssistant ONLY orchestrates and presents existing AI module outputs.
 */
import type {
  AIAssistantConfiguration,
  AIAssistantPromptInput,
  AIAssistantPromptResult,
  AIAssistantResponse,
  AIAssistantSuggestion,
  AIAssistantActionPlan,
  AIAssistantConversation,
  IntentResolutionResult,
  AIAssistantContext,
  AIAssistantProviderPlugin,
  PermissionLevel,
  AIAssistantExplanation,
  ExplanationSubject,
  AIAssistantAnalytics,
  AIAssistantValidationResult,
} from './types';
import { DEFAULT_AIAssistant_CONFIGURATION, createAIAssistantConfiguration, validateConfiguration } from './AIAssistantConfiguration';
import { aiAssistantEvents, AIAssistantEvents } from './AIAssistantEvents';
import { AIAssistantIntentEngine } from './AIAssistantIntentEngine';
import { AIAssistantContextResolver, type AIAssistantContextResolverInput } from './AIAssistantContextResolver';
import { AIAssistantResponseEngine } from './AIAssistantResponseEngine';
import { AIAssistantSuggestionEngine } from './AIAssistantSuggestionEngine';
import { AIAssistantExplanationEngine } from './AIAssistantExplanationEngine';
import { AIAssistantActionPlanner } from './AIAssistantActionPlanner';
import { AIAssistantPermissionEngine } from './AIAssistantPermissionEngine';
import { AIAssistantMemory } from './AIAssistantMemory';
import { AIAssistantSessionManager } from './AIAssistantSessionManager';
import { AIAssistantConversationEngine } from './AIAssistantConversationEngine';
import { AIAssistantAnalyticsEngine } from './AIAssistantAnalytics';
import { AIAssistantValidator } from './AIAssistantValidator';

export class AIAssistantManager {
  private _config: AIAssistantConfiguration;
  private _events: AIAssistantEvents;
  private _intentEngine: AIAssistantIntentEngine;
  private _contextResolver: AIAssistantContextResolver;
  private _responseEngine: AIAssistantResponseEngine;
  private _suggestionEngine: AIAssistantSuggestionEngine;
  private _explanationEngine: AIAssistantExplanationEngine;
  private _permissionEngine: AIAssistantPermissionEngine;
  private _actionPlanner: AIAssistantActionPlanner;
  private _memory: AIAssistantMemory;
  private _sessionManager: AIAssistantSessionManager;
  private _conversationEngine: AIAssistantConversationEngine;
  private _analytics: AIAssistantAnalyticsEngine;
  private _validator: AIAssistantValidator;

  constructor(config?: Partial<AIAssistantConfiguration>) {
    this._config = config
      ? createAIAssistantConfiguration(config as never)
      : structuredClone(DEFAULT_AIAssistant_CONFIGURATION);

    const validation = validateConfiguration(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid AIAssistant configuration: ${validation.errors.join('; ')}`);
    }

    this._events = new AIAssistantEvents();
    this._intentEngine = new AIAssistantIntentEngine(this._config);
    this._contextResolver = new AIAssistantContextResolver();
    this._responseEngine = new AIAssistantResponseEngine(this._config);
    this._suggestionEngine = new AIAssistantSuggestionEngine(this._config);
    this._explanationEngine = new AIAssistantExplanationEngine();
    this._permissionEngine = new AIAssistantPermissionEngine(this._config);
    this._actionPlanner = new AIAssistantActionPlanner(this._config, this._permissionEngine);
    this._memory = new AIAssistantMemory();
    this._sessionManager = new AIAssistantSessionManager(this._config.maxConversations);
    this._conversationEngine = new AIAssistantConversationEngine(
      this._config,
      this._intentEngine,
      this._contextResolver,
      this._responseEngine,
      this._suggestionEngine,
      this._actionPlanner,
      this._memory,
      this._sessionManager,
      this._events,
    );
    this._analytics = new AIAssistantAnalyticsEngine();
    this._validator = new AIAssistantValidator();
  }

  // ── Public API ──────────────────────────────────────────────

  processPrompt(
    input: AIAssistantPromptInput,
    contextInput: AIAssistantContextResolverInput,
  ): AIAssistantPromptResult {
    if (!this._config.featureFlags.enableAIAssistant) {
      throw new Error('AIAssistant is disabled');
    }

    const validation = this._validator.validatePrompt(input);
    if (!validation.valid) {
      throw new Error(`Invalid prompt: ${validation.errors.map((e) => e.message).join('; ')}`);
    }

    // Create session if needed
    if (!this._memory.getSessionId()) {
      const session = this._sessionManager.createSession();
      this._memory.setSessionId(session.id);
    }

    // Emit conversation started event
    if (this._config.enableEvents) {
      this._events.emit({
        type: 'conversation_started',
        conversationId: input.conversationId,
        timestamp: new Date().toISOString(),
        data: { prompt: input.prompt.substring(0, 100) },
      });
    }

    const result = this._conversationEngine.processPrompt(input, contextInput);

    // Record analytics
    this._analytics.recordConversation(result.conversation);
    this._analytics.recordResponse(result.response, result.processingTimeMs);
    this._analytics.recordSuggestions(result.suggestions, false);
    this._analytics.recordActionPlans(result.actionPlans);

    // Emit completion event
    if (this._config.enableEvents) {
      this._events.emit({
        type: 'conversation_completed',
        conversationId: result.conversation.id,
        timestamp: new Date().toISOString(),
        data: { processingTimeMs: result.processingTimeMs },
      });
    }

    return result;
  }

  resolveIntent(prompt: string): IntentResolutionResult {
    if (!this._config.featureFlags.enableIntentResolution) {
      throw new Error('Intent resolution is disabled');
    }
    return this._intentEngine.resolve(prompt);
  }

  generateResponse(
    intent: string,
    context: AIAssistantContext,
    entities: never[],
    prompt: string,
    conversationId: string,
    suggestions: AIAssistantSuggestion[],
    capabilities: never[],
  ): AIAssistantResponse {
    if (!this._config.featureFlags.enableResponseGeneration) {
      throw new Error('Response generation is disabled');
    }
    return this._responseEngine.generate(
      intent as never,
      context,
      entities,
      prompt,
      conversationId,
      suggestions,
      capabilities,
    );
  }

  generateSuggestions(
    intent: string,
    context: AIAssistantContext,
    conversationId: string,
  ): AIAssistantSuggestion[] {
    if (!this._config.featureFlags.enableSuggestions) {
      throw new Error('Suggestions are disabled');
    }
    return this._suggestionEngine.generate(intent as never, context, conversationId);
  }

  createActionPlan(
    intent: string,
    context: AIAssistantContext,
    userPermissionLevel: PermissionLevel,
  ): AIAssistantActionPlan[] {
    if (!this._config.featureFlags.enableActionPlanning) {
      throw new Error('Action planning is disabled');
    }
    return this._actionPlanner.createPlans(intent as never, context, userPermissionLevel);
  }

  generateExplanation(
    subject: ExplanationSubject,
    context: AIAssistantContext,
    entityId: string | null,
  ): AIAssistantExplanation {
    if (!this._config.featureFlags.enableExplanations) {
      throw new Error('Explanations are disabled');
    }
    return this._explanationEngine.explain(subject, context, entityId);
  }

  getConversationHistory(conversationId: string): AIAssistantConversation[] {
    return this._sessionManager.getConversationHistory(conversationId);
  }

  clearConversation(conversationId: string): boolean {
    return this._sessionManager.clearConversation(conversationId);
  }

  getAnalytics(): AIAssistantAnalytics {
    return this._analytics.getAnalytics();
  }

  validateConversation(conversation: AIAssistantConversation): AIAssistantValidationResult {
    return this._validator.validateConversation(conversation);
  }

  validateResponse(response: AIAssistantResponse): AIAssistantValidationResult {
    return this._validator.validateResponse(response);
  }

  // ── Configuration ───────────────────────────────────────────

  updateConfig(config: Partial<AIAssistantConfiguration>): void {
    this._config = createAIAssistantConfiguration(config as never);
    this._intentEngine.updateConfig(this._config);
    this._responseEngine.updateConfig(this._config);
    this._suggestionEngine.updateConfig(this._config);
    this._actionPlanner.updateConfig(this._config);
    this._permissionEngine.updateConfig(this._config);
    this._conversationEngine.updateConfig(this._config);
    this._sessionManager.setMaxConversations(this._config.maxConversations);
  }

  getConfig(): AIAssistantConfiguration {
    return this._config;
  }

  // ── Plugin Registration ─────────────────────────────────────

  registerPlugin(plugin: AIAssistantProviderPlugin): void {
    this._intentEngine.registerPlugin(plugin);
    this._responseEngine.registerPlugin(plugin);
    this._suggestionEngine.registerPlugin(plugin);
  }

  // ── Events ──────────────────────────────────────────────────

  on(type: never, listener: never): void {
    this._events.on(type, listener);
  }

  off(type: never, listener: never): void {
    this._events.off(type, listener);
  }

  getEvents(): AIAssistantEvents {
    return this._events;
  }

  // ── Memory ──────────────────────────────────────────────────

  clearMemory(): void {
    this._memory.clear();
  }

  getMemorySnapshot(): ReturnType<AIAssistantMemory['getSnapshot']> {
    return this._memory.getSnapshot();
  }

  // ── Session ─────────────────────────────────────────────────

  createSession(): string {
    const session = this._sessionManager.createSession();
    this._memory.setSessionId(session.id);
    return session.id;
  }

  clearAll(): void {
    this._sessionManager.clearAll();
    this._memory.clear();
    this._analytics.reset();
    this._events.removeAllListeners();
  }
}

export { AIAssistantEvents };
