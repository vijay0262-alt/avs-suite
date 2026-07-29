/**
 * AI Context Builder — discovers, validates, collects, and merges
 * context from all registered providers into a single AIContext.
 *
 * The builder:
 *   Discovers providers from the registry
 *   Validates providers
 *   Collects context via the aggregator
 *   Validates the final context
 *   Returns one complete AIContext
 */
import type { AIContext, AIContextConfiguration, ContextValidationResult } from './types';
import type { AIContextRegistry } from './aiContextRegistry';
import type { AIContextAggregator } from './aiContextAggregator';
import type { AIContextValidator } from './aiContextValidator';
import type { AIContextCache } from './aiContextCache';
import { aiContextEvents } from './aiContextEvents';

export class AIContextBuilder {
  private _registry: AIContextRegistry;
  private _aggregator: AIContextAggregator;
  private _validator: AIContextValidator;
  private _cache: AIContextCache;
  private _config: AIContextConfiguration;

  constructor(
    registry: AIContextRegistry,
    aggregator: AIContextAggregator,
    validator: AIContextValidator,
    cache: AIContextCache,
    config: AIContextConfiguration,
  ) {
    this._registry = registry;
    this._aggregator = aggregator;
    this._validator = validator;
    this._cache = cache;
    this._config = config;
  }

  updateConfig(config: AIContextConfiguration): void {
    this._config = config;
  }

  /**
   * Build a complete AIContext from all registered providers.
   * Uses cache if enabled and valid.
   */
  async build(currentPlan: string = 'FREE'): Promise<AIContext> {
    // Check cache first
    if (this._config.cacheEnabled) {
      const cached = this._cache.get();
      if (cached) {
        aiContextEvents.emit('context_cache_hit', {
          contextId: cached.metadata.contextId,
          timestamp: new Date().toISOString(),
        });
        return cached;
      }
      aiContextEvents.emit('context_cache_miss', {
        timestamp: new Date().toISOString(),
      });
      this._cache.recordMiss();
    }

    aiContextEvents.emit('context_build_started', {
      timestamp: new Date().toISOString(),
      providerCount: this._registry.count,
    });

    const startTime = Date.now();

    // Get available providers (sorted by priority)
    const providers = this._registry.getAvailableProviders();

    // Aggregate context
    const { context, failures, successes } = await this._aggregator.aggregate(providers, currentPlan);

    // Validate final context
    const validation = this._validator.validateContext(context);

    // Cache the result
    const buildTime = Date.now() - startTime;
    if (this._config.cacheEnabled) {
      this._cache.set(context, buildTime);
    }

    aiContextEvents.emit('context_build_completed', {
      contextId: context.metadata.contextId,
      timestamp: new Date().toISOString(),
      buildTimeMs: buildTime,
      providerCount: providers.length,
      successes,
      failures,
      validationIssues: validation.issues.length,
    });

    return context;
  }

  /**
   * Force a rebuild, bypassing cache.
   */
  async rebuild(currentPlan: string = 'FREE'): Promise<AIContext> {
    this._cache.clear();
    return this.build(currentPlan);
  }

  /**
   * Validate the current context without building.
   */
  validateContext(context: AIContext): ContextValidationResult {
    return this._validator.validateContext(context);
  }

  /**
   * Get the last validation result (if context was built).
   */
  getLastValidation(): ContextValidationResult | null {
    return this._lastValidation;
  }

  private _lastValidation: ContextValidationResult | null = null;
}
