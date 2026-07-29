/**
 * Insight Manager — main orchestrator and public API for the
 * AI Insight Engine.
 *
 * Public APIs:
 *   generateInsights(knowledge, recommendations, filter?)
 *   getInsights()
 *   getInsight(id)
 *   getMorningBrief()
 *   getHealthSummary()
 *   getOptimizationSummary()
 *   getAchievements()
 *   getMilestones()
 *   getTimeline(period?)
 *   getInsightStatistics()
 *
 * The Insight Engine NEVER executes optimizations.
 * It NEVER modifies the system.
 * It ONLY produces intelligent insights.
 *
 * Future consumers: Dashboard, AI Assistant, Reports, Notifications,
 * Mobile App, Email Reports.
 */
import type {
  KnowledgeObject,
  Recommendation,
  Insight,
  InsightList,
  InsightStatistics,
  InsightFilter,
  InsightValidationResult,
  InsightConfiguration,
  InsightProviderPlugin,
  InsightType,
  InsightCategory,
  InsightPriority,
  InsightOutputFormat,
  FormattedInsight,
  TimelinePeriod,
  InsightTimeline,
} from './types';
import { InsightRegistry } from './insightRegistry';
import { InsightValidator } from './insightValidator';
import { InsightBuilder } from './insightBuilder';
import { insightEvents } from './insightEvents';
import { createInsightConfig } from './insightConfiguration';

export class InsightManager {
  private _registry: InsightRegistry;
  private _validator: InsightValidator;
  private _builder: InsightBuilder;
  private _config: InsightConfiguration;
  private _currentList: InsightList | null = null;

  constructor(config?: Partial<InsightConfiguration>) {
    this._config = createInsightConfig(config);
    this._registry = new InsightRegistry();
    this._validator = new InsightValidator(this._config);
    this._builder = new InsightBuilder(this._registry, this._validator, this._config);
  }

  /**
   * Generate insights from knowledge and recommendations.
   */
  async generateInsights(
    knowledge: KnowledgeObject,
    recommendations: Recommendation[],
    filter?: InsightFilter,
  ): Promise<InsightList> {
    const list = await this._builder.build(knowledge, recommendations, filter);
    this._currentList = list;
    return list;
  }

  /**
   * Get the current insight list (null if not generated).
   */
  getInsightList(): InsightList | null {
    return this._currentList;
  }

  /**
   * Get all insights from the current list.
   */
  getInsights(): Insight[] {
    return this._currentList?.insights ?? [];
  }

  /**
   * Get a specific insight by ID.
   */
  getInsight(id: string): Insight | null {
    return this.getInsights().find((i) => i.id === id) ?? null;
  }

  /**
   * Get insights by type.
   */
  getInsightsByType(types: InsightType[]): Insight[] {
    return this.getInsights().filter((i) => types.includes(i.type));
  }

  /**
   * Get insights by category.
   */
  getInsightsByCategory(categories: InsightCategory[]): Insight[] {
    return this.getInsights().filter((i) => categories.includes(i.category));
  }

  /**
   * Get insights by priority.
   */
  getInsightsByPriority(priorities: InsightPriority[]): Insight[] {
    return this.getInsights().filter((i) => priorities.includes(i.priority));
  }

  /**
   * Get the morning brief insight.
   */
  getMorningBrief(): Insight | null {
    return this.getInsights().find((i) => i.type === 'morning_brief') ?? null;
  }

  /**
   * Get the health summary insight.
   */
  getHealthSummary(): Insight | null {
    return this.getInsights().find((i) => i.type === 'health_summary') ?? null;
  }

  /**
   * Get the optimization summary insight.
   */
  getOptimizationSummary(): Insight | null {
    return this.getInsights().find((i) => i.type === 'optimization_summary') ?? null;
  }

  /**
   * Get all achievement insights.
   */
  getAchievements(): Insight[] {
    return this.getInsights().filter((i) => i.type === 'achievement');
  }

  /**
   * Get all milestone insights.
   */
  getMilestones(): Insight[] {
    return this.getInsights().filter((i) => i.type === 'milestone');
  }

  /**
   * Get the timeline.
   */
  getTimeline(period: TimelinePeriod = 'daily'): InsightTimeline {
    return this._builder.getTimeline().getTimeline(period);
  }

  /**
   * Get insight statistics.
   */
  getInsightStatistics(): InsightStatistics | null {
    return this._currentList?.statistics ?? null;
  }

  /**
   * Filter insights with a custom filter.
   */
  filterInsights(filter: InsightFilter): Insight[] {
    return this.getInsights().filter((i) => {
      if (filter.types && !filter.types.includes(i.type)) return false;
      if (filter.categories && !filter.categories.includes(i.category)) return false;
      if (filter.priorities && !filter.priorities.includes(i.priority)) return false;
      if (filter.minImportance !== undefined && i.importanceScore < filter.minImportance) return false;
      if (filter.minConfidence !== undefined && i.confidenceScore < filter.minConfidence) return false;
      if (filter.maxReadingTime !== undefined && i.estimatedReadingTime > filter.maxReadingTime) return false;
      if (!filter.includeExpired && i.status === 'expired') return false;
      if (filter.custom && !filter.custom(i)) return false;
      return true;
    });
  }

  /**
   * Format an insight for a specific output.
   */
  formatInsight(insight: Insight, format: InsightOutputFormat): FormattedInsight {
    return this._builder.getFormatter().format(insight, format);
  }

  /**
   * Format all insights for a specific output.
   */
  formatAllInsights(format: InsightOutputFormat): FormattedInsight[] {
    return this._builder.getFormatter().formatAll(this.getInsights(), format);
  }

  /**
   * Validate the current insight list.
   */
  validateInsights(): InsightValidationResult {
    if (!this._currentList) {
      return {
        valid: false,
        issues: [{ level: 'error', code: 'NO_INSIGHTS', message: 'No insight list available' }],
      };
    }
    return this._validator.validateList(this._currentList);
  }

  /**
   * Validate a specific insight list.
   */
  validate(list: InsightList): InsightValidationResult {
    return this._validator.validateList(list);
  }

  /**
   * Mark an insight as viewed (emits event, records history).
   */
  viewInsight(id: string): void {
    const insight = this.getInsight(id);
    if (insight) {
      insight.status = 'viewed';
      insightEvents.emit('insight_viewed', { insightId: id });
      this._builder.getHistory().recordViewed(id);
    }
  }

  /**
   * Archive an insight (emits event, records history).
   */
  archiveInsight(id: string): void {
    const insight = this.getInsight(id);
    if (insight) {
      insight.status = 'archived';
      insightEvents.emit('insight_archived', { insightId: id });
      this._builder.getHistory().recordArchived(id);
    }
  }

  /**
   * Register an insight provider plugin.
   */
  registerPlugin(plugin: InsightProviderPlugin): boolean {
    return this._registry.registerPlugin(plugin);
  }

  /**
   * Unregister an insight provider plugin.
   */
  unregisterPlugin(name: string): boolean {
    return this._registry.unregisterPlugin(name);
  }

  /**
   * Get all registered plugins.
   */
  getPlugins(): InsightProviderPlugin[] {
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
  updateConfig(config: Partial<InsightConfiguration>): void {
    this._config = createInsightConfig({ ...this._config, ...config });
    this._validator.updateConfig(this._config);
    this._builder.updateConfig(this._config);
  }

  /**
   * Get the registry.
   */
  getRegistry(): InsightRegistry {
    return this._registry;
  }

  /**
   * Get the validator.
   */
  getValidator(): InsightValidator {
    return this._validator;
  }

  /**
   * Get the builder.
   */
  getBuilder(): InsightBuilder {
    return this._builder;
  }

  /**
   * Get history entries.
   */
  getHistory() {
    return this._builder.getHistory().getEntries();
  }

  /**
   * Clear current insights.
   */
  clear(): void {
    this._currentList = null;
  }
}

export const insightManager = new InsightManager();
