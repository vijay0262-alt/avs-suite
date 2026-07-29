/**
 * Recommendation Manager — main orchestrator and public API for the
 * AI Recommendation Engine.
 *
 * Public APIs:
 *   buildRecommendations(knowledge, filter?)
 *   getRecommendations()
 *   getRecommendation(id)
 *   getTopRecommendations(n)
 *   getRecommendationsByCategory(categories)
 *   getRecommendationsByPriority(priorities)
 *   getSafeRecommendations()
 *   getQuickWins()
 *   getRecommendationStatistics()
 *   validateRecommendations()
 *
 * The Recommendation Engine NEVER executes optimizations.
 * It NEVER modifies the system.
 * It ONLY produces structured recommendations.
 *
 * Future consumers: Dashboard, AI Assistant, Smart Optimize, Automation, Reports.
 */
import type {
  KnowledgeObject,
  Recommendation,
  RecommendationList,
  RecommendationStatistics,
  RecommendationFilter,
  RecommendationValidationResult,
  RecommendationConfiguration,
  RecommendationBuilderPlugin,
  RecommendationCategory,
  RecommendationPriority,
} from './types';
import { RecommendationRegistry } from './recommendationRegistry';
import { RecommendationValidator } from './recommendationValidator';
import { RecommendationBuilder } from './recommendationBuilder';
import { RecommendationFilterer } from './recommendationFilter';
import { recommendationEvents } from './recommendationEvents';
import { createRecommendationConfig } from './recommendationConfiguration';

export class RecommendationManager {
  private _registry: RecommendationRegistry;
  private _validator: RecommendationValidator;
  private _builder: RecommendationBuilder;
  private _filterer: RecommendationFilterer;
  private _config: RecommendationConfiguration;
  private _currentList: RecommendationList | null = null;

  constructor(config?: Partial<RecommendationConfiguration>) {
    this._config = createRecommendationConfig(config);
    this._registry = new RecommendationRegistry();
    this._validator = new RecommendationValidator(this._config);
    this._builder = new RecommendationBuilder(this._registry, this._validator, this._config);
    this._filterer = new RecommendationFilterer(this._config);
  }

  /**
   * Build recommendations from a knowledge object.
   */
  async buildRecommendations(
    knowledge: KnowledgeObject,
    filter?: RecommendationFilter,
  ): Promise<RecommendationList> {
    const list = await this._builder.build(knowledge, filter);
    this._currentList = list;
    return list;
  }

  /**
   * Get the current recommendation list (null if not built).
   */
  getRecommendationList(): RecommendationList | null {
    return this._currentList;
  }

  /**
   * Get all recommendations from the current list.
   */
  getRecommendations(): Recommendation[] {
    return this._currentList?.recommendations ?? [];
  }

  /**
   * Get a specific recommendation by ID.
   */
  getRecommendation(id: string): Recommendation | null {
    return this.getRecommendations().find((r) => r.id === id) ?? null;
  }

  /**
   * Get the top N recommendations.
   */
  getTopRecommendations(n: number): Recommendation[] {
    return this.getRecommendations().slice(0, n);
  }

  /**
   * Get recommendations by category.
   */
  getRecommendationsByCategory(categories: RecommendationCategory[]): Recommendation[] {
    return this._filterer.byCategory(this.getRecommendations(), categories);
  }

  /**
   * Get recommendations by priority.
   */
  getRecommendationsByPriority(priorities: RecommendationPriority[]): Recommendation[] {
    return this._filterer.byPriority(this.getRecommendations(), priorities);
  }

  /**
   * Get safe recommendations (risk none or low).
   */
  getSafeRecommendations(): Recommendation[] {
    return this._filterer.safeOnly(this.getRecommendations());
  }

  /**
   * Get quick wins (high benefit, low effort, very safe, under 2 minutes).
   */
  getQuickWins(): Recommendation[] {
    return this._filterer.quickWins(this.getRecommendations());
  }

  /**
   * Get automation-eligible recommendations.
   */
  getAutomationReady(): Recommendation[] {
    return this._filterer.automationReady(this.getRecommendations());
  }

  /**
   * Filter recommendations with a custom filter.
   */
  filterRecommendations(filter: RecommendationFilter): Recommendation[] {
    return this._filterer.filter(this.getRecommendations(), filter);
  }

  /**
   * Get recommendation statistics.
   */
  getRecommendationStatistics(): RecommendationStatistics | null {
    return this._currentList?.statistics ?? null;
  }

  /**
   * Validate the current recommendation list.
   */
  validateRecommendations(): RecommendationValidationResult {
    if (!this._currentList) {
      return {
        valid: false,
        issues: [{ level: 'error', code: 'NO_RECOMMENDATIONS', message: 'No recommendation list available' }],
      };
    }
    return this._validator.validateList(this._currentList);
  }

  /**
   * Validate a specific recommendation list.
   */
  validate(list: RecommendationList): RecommendationValidationResult {
    return this._validator.validateList(list);
  }

  /**
   * Select a recommendation (emits event, records history).
   */
  selectRecommendation(id: string): void {
    const rec = this.getRecommendation(id);
    if (rec) {
      recommendationEvents.emit('recommendation_selected', { recommendationId: id });
      this._builder.getHistory().recordSelected(id);
    }
  }

  /**
   * Register a recommendation builder plugin.
   */
  registerPlugin(plugin: RecommendationBuilderPlugin): boolean {
    return this._registry.registerPlugin(plugin);
  }

  /**
   * Unregister a recommendation builder plugin.
   */
  unregisterPlugin(name: string): boolean {
    return this._registry.unregisterPlugin(name);
  }

  /**
   * Get all registered plugins.
   */
  getPlugins(): RecommendationBuilderPlugin[] {
    return this._registry.getPlugins();
  }

  /**
   * Get plugin names.
   */
  getPluginNames(): string[] {
    return this._registry.getPluginNames();
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<RecommendationConfiguration>): void {
    this._config = createRecommendationConfig({ ...this._config, ...config });
    this._validator.updateConfig(this._config);
    this._builder.updateConfig(this._config);
    this._filterer.updateConfig(this._config);
  }

  /**
   * Get the registry.
   */
  getRegistry(): RecommendationRegistry {
    return this._registry;
  }

  /**
   * Get the validator.
   */
  getValidator(): RecommendationValidator {
    return this._validator;
  }

  /**
   * Get the builder.
   */
  getBuilder(): RecommendationBuilder {
    return this._builder;
  }

  /**
   * Get history entries.
   */
  getHistory() {
    return this._builder.getHistory().getEntries();
  }

  /**
   * Clear current recommendations.
   */
  clear(): void {
    this._currentList = null;
  }
}

export const recommendationManager = new RecommendationManager();
