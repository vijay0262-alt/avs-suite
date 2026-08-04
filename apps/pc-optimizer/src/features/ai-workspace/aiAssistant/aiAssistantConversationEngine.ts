/**
 * AVS AI Assistant Platform — Conversation Engine
 *
 * EPIC 5 PHASE A PART 1
 *
 * Orchestrates the full conversation pipeline:
 *   Prompt → Intent → Context → Response → Suggestions → Actions
 *
 * Does NOT duplicate business logic. Coordinates existing engines.
 */
import type {
  AIAssistantConfiguration,
  AIAssistantConversation,
  AIAssistantSuggestion,
  AIAssistantActionPlan,
  AIAssistantContext,
  AIAssistantEntity,
  AIAssistantIntentType,
  AIAssistantPromptInput,
  AIAssistantPromptResult,
  AIAssistantReference,
  AIAssistantMessage,
} from './types';
import { generateMessageId, generateAIAssistantId } from './types';
import type { AIAssistantIntentEngine } from './AIAssistantIntentEngine';
import type { AIAssistantContextResolver, AIAssistantContextResolverInput } from './AIAssistantContextResolver';
import type { AIAssistantResponseEngine } from './AIAssistantResponseEngine';
import type { AIAssistantSuggestionEngine } from './AIAssistantSuggestionEngine';
import type { AIAssistantActionPlanner } from './AIAssistantActionPlanner';
import type { AIAssistantMemory } from './AIAssistantMemory';
import type { AIAssistantSessionManager } from './AIAssistantSessionManager';
import type { AIAssistantEvents } from './AIAssistantEvents';

export class AIAssistantConversationEngine {
  private _config: AIAssistantConfiguration;
  private _intentEngine: AIAssistantIntentEngine;
  private _contextResolver: AIAssistantContextResolver;
  private _responseEngine: AIAssistantResponseEngine;
  private _suggestionEngine: AIAssistantSuggestionEngine;
  private _actionPlanner: AIAssistantActionPlanner;
  private _memory: AIAssistantMemory;
  private _sessionManager: AIAssistantSessionManager;
  private _events: AIAssistantEvents;

  constructor(
    config: AIAssistantConfiguration,
    intentEngine: AIAssistantIntentEngine,
    contextResolver: AIAssistantContextResolver,
    responseEngine: AIAssistantResponseEngine,
    suggestionEngine: AIAssistantSuggestionEngine,
    actionPlanner: AIAssistantActionPlanner,
    memory: AIAssistantMemory,
    sessionManager: AIAssistantSessionManager,
    events: AIAssistantEvents,
  ) {
    this._config = config;
    this._intentEngine = intentEngine;
    this._contextResolver = contextResolver;
    this._responseEngine = responseEngine;
    this._suggestionEngine = suggestionEngine;
    this._actionPlanner = actionPlanner;
    this._memory = memory;
    this._sessionManager = sessionManager;
    this._events = events;
  }

  updateConfig(config: AIAssistantConfiguration): void {
    this._config = config;
  }

  processPrompt(
    input: AIAssistantPromptInput,
    contextInput: AIAssistantContextResolverInput,
  ): AIAssistantPromptResult {
    const startTime = Date.now();

    // 1. Resolve intent
    const intentResult = this._intentEngine.resolve(input.prompt);

    // 2. Resolve context
    const context = this._contextResolver.resolve(contextInput);

    // 3. Extract entities from context
    const entities = this._extractEntities(context, intentResult.intent);

    // 4. Generate suggestions
    const suggestions = this._suggestionEngine.generate(
      intentResult.intent,
      context,
      input.conversationId ?? generateAIAssistantId(),
    );

    // 5. Generate response
    const response = this._responseEngine.generate(
      intentResult.intent,
      context,
      entities,
      input.prompt,
      input.conversationId ?? generateAIAssistantId(),
      suggestions,
      intentResult.capabilities,
    );

    // 6. Create action plans
    const actionPlans = this._actionPlanner.createPlans(
      intentResult.intent,
      context,
      input.userPermissionLevel,
    );

    // 7. Build references
    const references = this._buildReferences(context, entities);

    // 8. Create or update conversation
    let conversation: AIAssistantConversation;
    if (input.conversationId) {
      const existing = this._sessionManager.getConversation(input.conversationId);
      if (existing) {
        this._updateConversation(existing, intentResult, context, entities, suggestions, actionPlans, references);
        conversation = existing;
      } else {
        conversation = this._createNewConversation(
          input.conversationId,
          intentResult,
          context,
          entities,
          suggestions,
          actionPlans,
          references,
        );
      }
    } else {
      const newId = generateAIAssistantId();
      conversation = this._createNewConversation(
        newId,
        intentResult,
        context,
        entities,
        suggestions,
        actionPlans,
        references,
      );
    }

    // 9. Add messages
    const userMessage: AIAssistantMessage = {
      id: generateMessageId(),
      role: 'user',
      content: input.prompt,
      timestamp: new Date().toISOString(),
      intent: intentResult.intent,
      responseId: null,
      futureMetadata: {},
    };

    const AIAssistantMessage: AIAssistantMessage = {
      id: generateMessageId(),
      role: 'AIAssistant',
      content: response.answer,
      timestamp: new Date().toISOString(),
      intent: intentResult.intent,
      responseId: response.id,
      futureMetadata: {},
    };

    conversation.messages.push(userMessage, AIAssistantMessage);

    // 10. Update memory
    this._memory.setContext(context);
    this._memory.addTopic(intentResult.intent);
    this._memory.setPendingSuggestions(suggestions);
    for (const entity of entities) {
      this._memory.addEntity(entity);
    }

    // 11. Emit events
    if (this._config.enableEvents) {
      this._events.emit({
        type: 'intent_resolved',
        conversationId: conversation.id,
        timestamp: new Date().toISOString(),
        data: intentResult,
      });
      this._events.emit({
        type: 'response_generated',
        conversationId: conversation.id,
        timestamp: new Date().toISOString(),
        data: response,
      });
      if (suggestions.length > 0) {
        this._events.emit({
          type: 'suggestion_created',
          conversationId: conversation.id,
          timestamp: new Date().toISOString(),
          data: suggestions,
        });
      }
      if (actionPlans.length > 0) {
        this._events.emit({
          type: 'action_planned',
          conversationId: conversation.id,
          timestamp: new Date().toISOString(),
          data: actionPlans,
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      conversation,
      response,
      suggestions,
      actionPlans,
      processingTimeMs,
      futureMetadata: {},
    };
  }

  private _extractEntities(context: AIAssistantContext, _intent: AIAssistantIntentType): AIAssistantEntity[] {
    const entities: AIAssistantEntity[] = [];

    if (context.healthScore !== null) {
      entities.push({
        type: 'health_score',
        id: 'current',
        name: 'Health Score',
        value: context.healthScore,
        confidence: 0.9,
        futureMetadata: {},
      });
    }

    if (context.deviceProfile) {
      entities.push({
        type: 'device_profile',
        id: 'current',
        name: 'Device Profile',
        value: context.deviceProfile.profileType,
        confidence: context.deviceProfile.confidence,
        futureMetadata: {},
      });
    }

    for (const rec of context.activeRecommendations.slice(0, 5)) {
      entities.push({
        type: 'recommendation',
        id: rec.id,
        name: rec.title,
        value: rec.priority,
        confidence: rec.confidence,
        futureMetadata: {},
      });
    }

    for (const pred of context.activePredictions.slice(0, 3)) {
      entities.push({
        type: 'prediction',
        id: pred.id,
        name: pred.title,
        value: pred.riskLevel,
        confidence: pred.confidence,
        futureMetadata: {},
      });
    }

    for (const goal of context.activeGoals.slice(0, 3)) {
      entities.push({
        type: 'goal',
        id: goal.id,
        name: goal.name,
        value: goal.status,
        confidence: 0.8,
        futureMetadata: {},
      });
    }

    return entities;
  }

  private _buildReferences(context: AIAssistantContext, entities: AIAssistantEntity[]): AIAssistantReference[] {
    const references: AIAssistantReference[] = [];

    for (const entity of entities) {
      references.push({
        type: entity.type,
        id: entity.id,
        title: entity.name,
        source: `entity:${entity.type}`,
        futureMetadata: {},
      });
    }

    for (const event of context.recentTimelineEvents.slice(0, 3)) {
      references.push({
        type: 'timeline_event',
        id: event.id,
        title: event.title,
        source: 'timeline',
        futureMetadata: {},
      });
    }

    return references;
  }

  private _createNewConversation(
    id: string,
    intentResult: { intent: AIAssistantIntentType; confidence: number; capabilities: string[] },
    context: AIAssistantContext,
    entities: AIAssistantEntity[],
    suggestions: AIAssistantSuggestion[],
    actionPlans: AIAssistantActionPlan[],
    references: AIAssistantReference[],
  ): AIAssistantConversation {
    const now = new Date().toISOString();
    return {
      id,
      createdAt: now,
      updatedAt: now,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      context,
      entities,
      selectedModules: [],
      generatedActions: actionPlans,
      suggestions,
      references,
      messages: [],
      status: 'active',
      futureMetadata: {},
    };
  }

  private _updateConversation(
    conv: AIAssistantConversation,
    intentResult: { intent: AIAssistantIntentType; confidence: number; capabilities: string[] },
    context: AIAssistantContext,
    entities: AIAssistantEntity[],
    suggestions: AIAssistantSuggestion[],
    actionPlans: AIAssistantActionPlan[],
    references: AIAssistantReference[],
  ): void {
    conv.intent = intentResult.intent;
    conv.confidence = intentResult.confidence;
    conv.context = context;
    conv.entities = entities;
    conv.generatedActions = actionPlans;
    conv.suggestions = suggestions;
    conv.references = references;
    conv.updatedAt = new Date().toISOString();
  }
}
