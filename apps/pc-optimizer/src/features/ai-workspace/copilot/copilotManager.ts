/**
 * AI Copilot Platform — Copilot Manager
 *
 * EPIC 5 PHASE A PART 1
 *
 * The main public API facade for the AI Copilot.
 * Orchestrates all Copilot engines and provides the public interface:
 *   processPrompt(), resolveIntent(), generateResponse(),
 *   generateSuggestions(), createActionPlan(),
 *   getConversationHistory(), clearConversation()
 *
 * The Copilot MUST NOT execute optimizations directly.
 * The Copilot MUST NOT duplicate existing business logic.
 * The Copilot ONLY orchestrates and presents existing AI module outputs.
 */
import type {
  CopilotConfiguration,
  CopilotPromptInput,
  CopilotPromptResult,
  CopilotResponse,
  CopilotSuggestion,
  CopilotActionPlan,
  CopilotConversation,
  IntentResolutionResult,
  CopilotContext,
  CopilotProviderPlugin,
  PermissionLevel,
  CopilotExplanation,
  ExplanationSubject,
  CopilotAnalytics,
  CopilotValidationResult,
} from './types';
import { DEFAULT_COPILOT_CONFIGURATION, createCopilotConfiguration, validateConfiguration } from './copilotConfiguration';
import { CopilotEvents, copilotEvents } from './copilotEvents';
import { CopilotIntentEngine } from './copilotIntentEngine';
import { CopilotContextResolver, type CopilotContextResolverInput } from './copilotContextResolver';
import { CopilotResponseEngine } from './copilotResponseEngine';
import { CopilotSuggestionEngine } from './copilotSuggestionEngine';
import { CopilotExplanationEngine } from './copilotExplanationEngine';
import { CopilotActionPlanner } from './copilotActionPlanner';
import { CopilotPermissionEngine } from './copilotPermissionEngine';
import { CopilotMemory } from './copilotMemory';
import { CopilotSessionManager } from './copilotSessionManager';
import { CopilotConversationEngine } from './copilotConversationEngine';
import { CopilotAnalyticsEngine } from './copilotAnalytics';
import { CopilotValidator } from './copilotValidator';

export class CopilotManager {
  private _config: CopilotConfiguration;
  private _events: CopilotEvents;
  private _intentEngine: CopilotIntentEngine;
  private _contextResolver: CopilotContextResolver;
  private _responseEngine: CopilotResponseEngine;
  private _suggestionEngine: CopilotSuggestionEngine;
  private _explanationEngine: CopilotExplanationEngine;
  private _permissionEngine: CopilotPermissionEngine;
  private _actionPlanner: CopilotActionPlanner;
  private _memory: CopilotMemory;
  private _sessionManager: CopilotSessionManager;
  private _conversationEngine: CopilotConversationEngine;
  private _analytics: CopilotAnalyticsEngine;
  private _validator: CopilotValidator;

  constructor(config?: Partial<CopilotConfiguration>) {
    this._config = config
      ? createCopilotConfiguration(config as never)
      : structuredClone(DEFAULT_COPILOT_CONFIGURATION);

    const validation = validateConfiguration(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid Copilot configuration: ${validation.errors.join('; ')}`);
    }

    this._events = new CopilotEvents();
    this._intentEngine = new CopilotIntentEngine(this._config);
    this._contextResolver = new CopilotContextResolver();
    this._responseEngine = new CopilotResponseEngine(this._config);
    this._suggestionEngine = new CopilotSuggestionEngine(this._config);
    this._explanationEngine = new CopilotExplanationEngine();
    this._permissionEngine = new CopilotPermissionEngine(this._config);
    this._actionPlanner = new CopilotActionPlanner(this._config, this._permissionEngine);
    this._memory = new CopilotMemory();
    this._sessionManager = new CopilotSessionManager(this._config.maxConversations);
    this._conversationEngine = new CopilotConversationEngine(
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
    this._analytics = new CopilotAnalyticsEngine();
    this._validator = new CopilotValidator();
  }

  // ── Public API ──────────────────────────────────────────────

  processPrompt(
    input: CopilotPromptInput,
    contextInput: CopilotContextResolverInput,
  ): CopilotPromptResult {
    if (!this._config.featureFlags.enableCopilot) {
      throw new Error('Copilot is disabled');
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
    context: CopilotContext,
    entities: never[],
    prompt: string,
    conversationId: string,
    suggestions: CopilotSuggestion[],
    capabilities: never[],
  ): CopilotResponse {
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
    context: CopilotContext,
    conversationId: string,
  ): CopilotSuggestion[] {
    if (!this._config.featureFlags.enableSuggestions) {
      throw new Error('Suggestions are disabled');
    }
    return this._suggestionEngine.generate(intent as never, context, conversationId);
  }

  createActionPlan(
    intent: string,
    context: CopilotContext,
    userPermissionLevel: PermissionLevel,
  ): CopilotActionPlan[] {
    if (!this._config.featureFlags.enableActionPlanning) {
      throw new Error('Action planning is disabled');
    }
    return this._actionPlanner.createPlans(intent as never, context, userPermissionLevel);
  }

  generateExplanation(
    subject: ExplanationSubject,
    context: CopilotContext,
    entityId: string | null,
  ): CopilotExplanation {
    if (!this._config.featureFlags.enableExplanations) {
      throw new Error('Explanations are disabled');
    }
    return this._explanationEngine.explain(subject, context, entityId);
  }

  getConversationHistory(conversationId: string): CopilotConversation[] {
    return this._sessionManager.getConversationHistory(conversationId);
  }

  clearConversation(conversationId: string): boolean {
    return this._sessionManager.clearConversation(conversationId);
  }

  getAnalytics(): CopilotAnalytics {
    return this._analytics.getAnalytics();
  }

  validateConversation(conversation: CopilotConversation): CopilotValidationResult {
    return this._validator.validateConversation(conversation);
  }

  validateResponse(response: CopilotResponse): CopilotValidationResult {
    return this._validator.validateResponse(response);
  }

  // ── Configuration ───────────────────────────────────────────

  updateConfig(config: Partial<CopilotConfiguration>): void {
    this._config = createCopilotConfiguration(config as never);
    this._intentEngine.updateConfig(this._config);
    this._responseEngine.updateConfig(this._config);
    this._suggestionEngine.updateConfig(this._config);
    this._actionPlanner.updateConfig(this._config);
    this._permissionEngine.updateConfig(this._config);
    this._conversationEngine.updateConfig(this._config);
    this._sessionManager.setMaxConversations(this._config.maxConversations);
  }

  getConfig(): CopilotConfiguration {
    return this._config;
  }

  // ── Plugin Registration ─────────────────────────────────────

  registerPlugin(plugin: CopilotProviderPlugin): void {
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

  getEvents(): CopilotEvents {
    return this._events;
  }

  // ── Memory ──────────────────────────────────────────────────

  clearMemory(): void {
    this._memory.clear();
  }

  getMemorySnapshot(): ReturnType<CopilotMemory['getSnapshot']> {
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

export { copilotEvents };
