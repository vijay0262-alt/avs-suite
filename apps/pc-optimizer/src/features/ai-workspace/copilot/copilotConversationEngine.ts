/**
 * AI Copilot Platform — Conversation Engine
 *
 * EPIC 5 PHASE A PART 1
 *
 * Orchestrates the full conversation pipeline:
 *   Prompt → Intent → Context → Response → Suggestions → Actions
 *
 * Does NOT duplicate business logic. Coordinates existing engines.
 */
import type {
  CopilotConfiguration,
  CopilotConversation,
  CopilotSuggestion,
  CopilotActionPlan,
  CopilotContext,
  CopilotEntity,
  CopilotIntentType,
  CopilotPromptInput,
  CopilotPromptResult,
  CopilotReference,
  CopilotMessage,
} from './types';
import { generateMessageId, generateCopilotId } from './types';
import type { CopilotIntentEngine } from './copilotIntentEngine';
import type { CopilotContextResolver, CopilotContextResolverInput } from './copilotContextResolver';
import type { CopilotResponseEngine } from './copilotResponseEngine';
import type { CopilotSuggestionEngine } from './copilotSuggestionEngine';
import type { CopilotActionPlanner } from './copilotActionPlanner';
import type { CopilotMemory } from './copilotMemory';
import type { CopilotSessionManager } from './copilotSessionManager';
import type { CopilotEvents } from './copilotEvents';

export class CopilotConversationEngine {
  private _config: CopilotConfiguration;
  private _intentEngine: CopilotIntentEngine;
  private _contextResolver: CopilotContextResolver;
  private _responseEngine: CopilotResponseEngine;
  private _suggestionEngine: CopilotSuggestionEngine;
  private _actionPlanner: CopilotActionPlanner;
  private _memory: CopilotMemory;
  private _sessionManager: CopilotSessionManager;
  private _events: CopilotEvents;

  constructor(
    config: CopilotConfiguration,
    intentEngine: CopilotIntentEngine,
    contextResolver: CopilotContextResolver,
    responseEngine: CopilotResponseEngine,
    suggestionEngine: CopilotSuggestionEngine,
    actionPlanner: CopilotActionPlanner,
    memory: CopilotMemory,
    sessionManager: CopilotSessionManager,
    events: CopilotEvents,
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

  updateConfig(config: CopilotConfiguration): void {
    this._config = config;
  }

  processPrompt(
    input: CopilotPromptInput,
    contextInput: CopilotContextResolverInput,
  ): CopilotPromptResult {
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
      input.conversationId ?? generateCopilotId(),
    );

    // 5. Generate response
    const response = this._responseEngine.generate(
      intentResult.intent,
      context,
      entities,
      input.prompt,
      input.conversationId ?? generateCopilotId(),
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
    let conversation: CopilotConversation;
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
      const newId = generateCopilotId();
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
    const userMessage: CopilotMessage = {
      id: generateMessageId(),
      role: 'user',
      content: input.prompt,
      timestamp: new Date().toISOString(),
      intent: intentResult.intent,
      responseId: null,
      futureMetadata: {},
    };

    const copilotMessage: CopilotMessage = {
      id: generateMessageId(),
      role: 'copilot',
      content: response.answer,
      timestamp: new Date().toISOString(),
      intent: intentResult.intent,
      responseId: response.id,
      futureMetadata: {},
    };

    conversation.messages.push(userMessage, copilotMessage);

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

  private _extractEntities(context: CopilotContext, _intent: CopilotIntentType): CopilotEntity[] {
    const entities: CopilotEntity[] = [];

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

  private _buildReferences(context: CopilotContext, entities: CopilotEntity[]): CopilotReference[] {
    const references: CopilotReference[] = [];

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
    intentResult: { intent: CopilotIntentType; confidence: number; capabilities: string[] },
    context: CopilotContext,
    entities: CopilotEntity[],
    suggestions: CopilotSuggestion[],
    actionPlans: CopilotActionPlan[],
    references: CopilotReference[],
  ): CopilotConversation {
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
    conv: CopilotConversation,
    intentResult: { intent: CopilotIntentType; confidence: number; capabilities: string[] },
    context: CopilotContext,
    entities: CopilotEntity[],
    suggestions: CopilotSuggestion[],
    actionPlans: CopilotActionPlan[],
    references: CopilotReference[],
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
