/**
 * AVS AI Assistant Platform — Analytics
 *
 * EPIC 5 PHASE A PART 1
 *
 * Tracks and reports AIAssistant usage analytics.
 * No personal data is stored — only aggregate metrics.
 */
import type {
  AIAssistantAnalytics,
  AIAssistantConversation,
  AIAssistantResponse,
  AIAssistantSuggestion,
  AIAssistantActionPlan,
  TopicCount,
  EntityCount,
  EntityType,
} from './types';

export class AIAssistantAnalyticsEngine {
  private _totalConversations: number = 0;
  private _totalMessages: number = 0;
  private _byIntent: Map<string, number> = new Map();
  private _byCapability: Map<string, number> = new Map();
  private _confidenceSum: number = 0;
  private _confidenceCount: number = 0;
  private _responseTimeSum: number = 0;
  private _responseTimeCount: number = 0;
  private _suggestionAccepted: number = 0;
  private _suggestionTotal: number = 0;
  private _actionPlanTotal: number = 0;
  private _topics: Map<string, number> = new Map();
  private _entities: Map<EntityType, number> = new Map();

  recordConversation(conversation: AIAssistantConversation): void {
    this._totalConversations += 1;
    this._totalMessages += conversation.messages.length;

    this._incrementMap(this._byIntent, conversation.intent);
    this._incrementMap(this._topics, conversation.intent);

    for (const entity of conversation.entities) {
      this._incrementMap(this._entities, entity.type);
    }

    this._confidenceSum += conversation.confidence;
    this._confidenceCount += 1;
  }

  recordResponse(response: AIAssistantResponse, processingTimeMs: number): void {
    this._incrementMap(this._byIntent, response.intent);

    for (const cap of response.capabilities) {
      this._incrementMap(this._byCapability, cap);
    }

    this._confidenceSum += response.confidence;
    this._confidenceCount += 1;

    this._responseTimeSum += processingTimeMs;
    this._responseTimeCount += 1;
  }

  recordSuggestions(suggestions: AIAssistantSuggestion[], accepted: boolean): void {
    this._suggestionTotal += suggestions.length;
    if (accepted) {
      this._suggestionAccepted += suggestions.length;
    }
  }

  recordActionPlans(actionPlans: AIAssistantActionPlan[]): void {
    this._actionPlanTotal += actionPlans.length;
  }

  getAnalytics(): AIAssistantAnalytics {
    const byIntent: Record<string, number> = {};
    for (const [key, val] of this._byIntent) {
      byIntent[key] = val;
    }

    const byCapability: Record<string, number> = {};
    for (const [key, val] of this._byCapability) {
      byCapability[key] = val;
    }

    const topTopics: TopicCount[] = Array.from(this._topics.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topEntities: EntityCount[] = Array.from(this._entities.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalConversations: this._totalConversations,
      totalMessages: this._totalMessages,
      byIntent,
      byCapability,
      averageConfidence: this._confidenceCount > 0 ? this._confidenceSum / this._confidenceCount : 0,
      averageResponseTimeMs: this._responseTimeCount > 0 ? this._responseTimeSum / this._responseTimeCount : 0,
      suggestionAcceptanceRate: this._suggestionTotal > 0 ? this._suggestionAccepted / this._suggestionTotal : 0,
      actionPlanRate: this._totalConversations > 0 ? this._actionPlanTotal / this._totalConversations : 0,
      topTopics,
      topEntities,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  reset(): void {
    this._totalConversations = 0;
    this._totalMessages = 0;
    this._byIntent.clear();
    this._byCapability.clear();
    this._confidenceSum = 0;
    this._confidenceCount = 0;
    this._responseTimeSum = 0;
    this._responseTimeCount = 0;
    this._suggestionAccepted = 0;
    this._suggestionTotal = 0;
    this._actionPlanTotal = 0;
    this._topics.clear();
    this._entities.clear();
  }

  private _incrementMap<T extends string>(map: Map<T, number>, key: T): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }
}
