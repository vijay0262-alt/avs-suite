/**
 * AI Context Manager — main orchestrator for the AI Context Engine.
 *
 * Public APIs:
 *   buildContext()
 *   refreshContext()
 *   getContext()
 *   clearCache()
 *   registerProvider()
 *   unregisterProvider()
 *   getProviders()
 *   validateContext()
 *   getContextStatistics()
 *
 * This is the single source of truth for AI. Every future AI component
 * will consume this context. The AI never directly queries individual modules.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every insight, recommendation,
 *    or answer must be traceable back to one or more context providers,
 *    with supporting evidence and a confidence score."
 */
import type {
  AIContext,
  AIContextProvider,
  AIContextConfiguration,
  ContextStatistics,
  ContextValidationResult,
} from './types';
import { AIContextRegistry } from './aiContextRegistry';
import { AIContextAggregator } from './aiContextAggregator';
import { AIContextValidator } from './aiContextValidator';
import { AIContextCache } from './aiContextCache';
import { AIContextBuilder } from './aiContextBuilder';
import { aiContextEvents } from './aiContextEvents';
import { createConfig } from './aiContextConfiguration';
import { CONTEXT_SECTIONS } from './types';

export class AIContextManager {
  private _registry: AIContextRegistry;
  private _aggregator: AIContextAggregator;
  private _validator: AIContextValidator;
  private _cache: AIContextCache;
  private _builder: AIContextBuilder;
  private _config: AIContextConfiguration;
  private _currentContext: AIContext | null = null;
  private _currentPlan: string = 'FREE';
  private _lastFailures: string[] = [];
  private _lastSuccesses: string[] = [];

  constructor(config?: Partial<AIContextConfiguration>) {
    this._config = createConfig(config);
    this._registry = new AIContextRegistry();
    this._cache = new AIContextCache(this._config.cacheTtlMs, this._config.cacheEnabled);
    this._validator = new AIContextValidator(this._config);
    this._aggregator = new AIContextAggregator(this._config);
    this._builder = new AIContextBuilder(
      this._registry,
      this._aggregator,
      this._validator,
      this._cache,
      this._config,
    );
  }

  /**
   * Build context from all registered providers.
   */
  async buildContext(): Promise<AIContext> {
    const context = await this._builder.build(this._currentPlan);
    this._currentContext = context;
    return context;
  }

  /**
   * Force a refresh of context, bypassing cache.
   */
  async refreshContext(): Promise<AIContext> {
    this._cache.recordRefresh();
    this._cache.clear();

    const context = await this._builder.rebuild(this._currentPlan);
    this._currentContext = context;

    aiContextEvents.emit('context_refreshed', {
      contextId: context.metadata.contextId,
      timestamp: new Date().toISOString(),
    });

    return context;
  }

  /**
   * Get the current context (builds if not yet built).
   */
  async getContext(): Promise<AIContext> {
    if (this._currentContext && this._cache.isValid()) {
      return this._currentContext;
    }
    return this.buildContext();
  }

  /**
   * Get the last built context without rebuilding (null if not built).
   */
  getLastContext(): AIContext | null {
    return this._currentContext;
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this._cache.clear();
  }

  /**
   * Register a provider.
   */
  registerProvider(provider: AIContextProvider): boolean {
    const registered = this._registry.registerProvider(provider);
    if (registered) {
      // Clear cache since providers changed
      this._cache.clear();
    }
    return registered;
  }

  /**
   * Unregister a provider.
   */
  unregisterProvider(name: string): boolean {
    const removed = this._registry.unregisterProvider(name);
    if (removed) {
      this._cache.clear();
    }
    return removed;
  }

  /**
   * Get all registered providers.
   */
  getProviders(): AIContextProvider[] {
    return this._registry.getProviders();
  }

  /**
   * Get all provider names.
   */
  getProviderNames(): string[] {
    return this._registry.getProviderNames();
  }

  /**
   * Validate a context.
   */
  validateContext(context: AIContext): ContextValidationResult {
    return this._validator.validateContext(context);
  }

  /**
   * Get context statistics.
   */
  getContextStatistics(): ContextStatistics {
    const cacheStats = this._cache.getStatistics();
    const providers = this._registry.getProviders();
    const availableProviders = providers.filter((p) => p.isAvailable());

    const sectionsPresent: string[] = [];
    const sectionsMissing: string[] = [];

    if (this._currentContext) {
      for (const section of CONTEXT_SECTIONS) {
        if ((this._currentContext as unknown as Record<string, unknown>)[section] !== undefined) {
          sectionsPresent.push(section);
        } else {
          sectionsMissing.push(section);
        }
      }
    } else {
      sectionsMissing.push(...CONTEXT_SECTIONS);
    }

    // Calculate average confidence and total evidence
    let avgConfidence = 0;
    let totalEvidence = 0;
    if (this._currentContext?.provenance) {
      const provs = this._currentContext.provenance;
      if (provs.length > 0) {
        avgConfidence = provs.reduce((sum, p) => sum + p.confidence, 0) / provs.length;
        totalEvidence = provs.reduce((sum, p) => sum + p.evidence.length, 0);
      }
    }

    return {
      totalProviders: providers.length,
      activeProviders: availableProviders.length,
      failedProviders: this._lastFailures.length,
      lastBuildContext: this._currentContext?.metadata.timestamp ?? null,
      lastBuildTimeMs: cacheStats.lastBuildTimeMs,
      cacheStatistics: cacheStats,
      sectionsPresent,
      sectionsMissing,
      averageConfidence: avgConfidence,
      totalEvidencePieces: totalEvidence,
    };
  }

  /**
   * Set the current plan (used in metadata).
   */
  setCurrentPlan(plan: string): void {
    this._currentPlan = plan;
  }

  /**
   * Get the current plan.
   */
  getCurrentPlan(): string {
    return this._currentPlan;
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<AIContextConfiguration>): void {
    this._config = createConfig({ ...this._config, ...config });
    this._cache.setTtl(this._config.cacheTtlMs);
    this._cache.setEnabled(this._config.cacheEnabled);
    this._validator.updateConfig(this._config);
    this._aggregator.updateConfig(this._config);
    this._builder.updateConfig(this._config);
  }

  /**
   * Get the registry (for advanced usage).
   */
  getRegistry(): AIContextRegistry {
    return this._registry;
  }

  /**
   * Get the cache (for advanced usage).
   */
  getCache(): AIContextCache {
    return this._cache;
  }

  /**
   * Get the validator (for advanced usage).
   */
  getValidator(): AIContextValidator {
    return this._validator;
  }

  /**
   * Get the last build's failed providers.
   */
  getLastFailures(): string[] {
    return this._lastFailures;
  }

  /**
   * Get the last build's successful providers.
   */
  getLastSuccesses(): string[] {
    return this._lastSuccesses;
  }
}

export const aiContextManager = new AIContextManager();
