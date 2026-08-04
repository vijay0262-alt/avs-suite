/**
 * Multimodal AI Interaction Platform — Context Enricher
 *
 * EPIC 5 PHASE A PART 6
 *
 * Combines context from multiple AI modules and conversation history.
 * Reuses cached context where applicable. Does NOT duplicate business logic.
 */
import type {
  EnrichedContext,
  ConversationContext,
  MultimodalInput,
  MultimodalConfiguration,
} from './types';
import type { AIAssistantContextResolverInput } from '../aiAssistant/aiAssistantContextResolver';
import { AIAssistantContextResolver } from '../aiAssistant/aiAssistantContextResolver';

export interface ContextEnricherInput {
  input: MultimodalInput;
  aiAssistantContextInput: AIAssistantContextResolverInput;
  previousInputs: MultimodalInput[];
  activeTopics: string[];
  sessionId: string | null;
  conversationId: string | null;
}

export class ContextEnricher {
  private _config: MultimodalConfiguration;
  private _resolver: AIAssistantContextResolver;
  private _cache: Map<string, { context: EnrichedContext; timestamp: number }> = new Map();
  private _cacheTtlMs: number = 5000;

  constructor(config: MultimodalConfiguration) {
    this._config = config;
    this._resolver = new AIAssistantContextResolver();
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  enrich(input: ContextEnricherInput): EnrichedContext {
    const start = Date.now();
    const cacheKey = this._getCacheKey(input);

    // Check cache
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this._cacheTtlMs) {
      return cached.context;
    }

    const aiAssistantContext = this._resolver.resolve(input.aiAssistantContextInput);

    const conversationContext: ConversationContext = {
      sessionId: input.sessionId,
      conversationId: input.conversationId,
      previousInputs: input.previousInputs.slice(-10),
      activeTopics: input.activeTopics,
      futureMetadata: {},
    };

    const enriched: EnrichedContext = {
      inputId: input.input.id,
      aiAssistantContext,
      healthScore: aiAssistantContext.healthScore,
      timeline: aiAssistantContext.recentTimelineEvents,
      goals: aiAssistantContext.activeGoals,
      recommendations: aiAssistantContext.activeRecommendations,
      predictions: aiAssistantContext.activePredictions,
      optimizationHistory: aiAssistantContext.optimizationHistory,
      recoveryHistory: aiAssistantContext.recoveryHistory,
      deviceProfile: aiAssistantContext.deviceProfile,
      conversationContext,
      futureMetadata: { enrichmentTimeMs: Date.now() - start },
    };

    // Cache the result
    this._cache.set(cacheKey, { context: enriched, timestamp: Date.now() });
    this._evictStaleCache();

    return enriched;
  }

  extractContext(input: MultimodalInput, aiAssistantContextInput: AIAssistantContextResolverInput): EnrichedContext {
    return this.enrich({
      input,
      aiAssistantContextInput,
      previousInputs: [],
      activeTopics: [],
      sessionId: input.context.sessionId,
      conversationId: input.context.conversationId,
    });
  }

  clearCache(): void {
    this._cache.clear();
  }

  getCacheSize(): number {
    return this._cache.size;
  }

  setCacheTtl(ms: number): void {
    this._cacheTtlMs = ms;
  }

  private _getCacheKey(input: ContextEnricherInput): string {
    const ctx = input.aiAssistantContextInput;
    return [
      input.input.id,
      ctx.healthScore ?? 'null',
      ctx.activeGoals.length,
      ctx.activeRecommendations.length,
      ctx.activePredictions.length,
      ctx.recentTimelineEvents.length,
      ctx.optimizationHistory.length,
      ctx.recoveryHistory.length,
    ].join(':');
  }

  private _evictStaleCache(): void {
    const now = Date.now();
    for (const [key, entry] of this._cache) {
      if (now - entry.timestamp > this._cacheTtlMs) {
        this._cache.delete(key);
      }
    }
  }

  getResolver(): AIAssistantContextResolver {
    return this._resolver;
  }
}
