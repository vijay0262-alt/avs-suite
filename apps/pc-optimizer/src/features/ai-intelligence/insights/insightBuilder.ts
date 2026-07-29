/**
 * Insight Builder — orchestrates the insight pipeline.
 *
 * Pipeline:
 *   Knowledge + Recommendations → Insight Generator →
 *   Prioritizer → Validator → Insight List
 *
 * The builder NEVER executes optimizations.
 * It ONLY produces structured insights.
 */
import type {
  KnowledgeObject,
  Recommendation,
  Insight,
  InsightList,
  InsightListMetadata,
  InsightStatistics,
  InsightConfiguration,
  InsightFilter,
  InsightValidationResult,
} from './types';
import { generateInsightListId, clampScore } from './types';
import { InsightGenerator } from './insightGenerator';
import { InsightPrioritizer } from './insightPrioritizer';
import { InsightFormatter } from './insightFormatter';
import type { InsightValidator } from './insightValidator';
import type { InsightRegistry } from './insightRegistry';
import { InsightHistory } from './insightHistory';
import { InsightTimelineManager } from './insightTimeline';
import { insightEvents } from './insightEvents';

export class InsightBuilder {
  private _generator: InsightGenerator;
  private _prioritizer: InsightPrioritizer;
  private _formatter: InsightFormatter;
  private _validator: InsightValidator;
  private _registry: InsightRegistry;
  private _history: InsightHistory;
  private _timeline: InsightTimelineManager;
  private _config: InsightConfiguration;

  constructor(
    registry: InsightRegistry,
    validator: InsightValidator,
    config: InsightConfiguration,
  ) {
    this._registry = registry;
    this._validator = validator;
    this._config = config;
    this._generator = new InsightGenerator(config);
    this._prioritizer = new InsightPrioritizer(config.priorityRules);
    this._formatter = new InsightFormatter(config.formattingRules);
    this._history = new InsightHistory(config);
    this._timeline = new InsightTimelineManager(config);
  }

  updateConfig(config: InsightConfiguration): void {
    this._config = config;
    this._generator.updateConfig(config);
    this._prioritizer.updateRules(config.priorityRules);
    this._formatter.updateRules(config.formattingRules);
    this._history.updateConfig(config);
    this._timeline.updateConfig(config);
  }

  /**
   * Build insights from knowledge and recommendations.
   */
  async build(
    knowledge: KnowledgeObject,
    recommendations: Recommendation[],
    filter?: InsightFilter,
  ): Promise<InsightList> {
    const startTime = Date.now();

    // Step 1: Generate insights from generator
    let insights = this._generator.generate(knowledge, recommendations);

    // Step 2: Collect from registered plugins
    const plugins = this._registry.getAvailablePlugins();
    for (const plugin of plugins) {
      try {
        const pluginInsights = plugin.generateInsights(knowledge, recommendations);
        insights = insights.concat(pluginInsights);
      } catch {
        // Continue on plugin failure
      }
    }

    // Step 3: Deduplicate
    insights = this._history.deduplicate(insights);

    // Step 4: Prioritize all insights
    this._prioritizer.prioritizeAll(insights);

    // Step 5: Sort by priority
    insights = this._prioritizer.sortByPriority(insights);

    // Step 6: Apply filter if provided
    if (filter) {
      insights = insights.filter((i) => this._matchesFilter(i, filter));
    }

    // Step 7: Limit to max insights
    if (insights.length > this._config.maxInsights) {
      insights = insights.slice(0, this._config.maxInsights);
    }

    // Step 8: Check for expired
    const expired = this._history.checkExpired(insights);
    for (const id of expired) {
      insightEvents.emit('insight_expired', { insightId: id });
    }

    // Step 9: Record history
    this._history.recordGenerated(insights);

    // Step 10: Add to timeline
    for (const insight of insights) {
      this._timeline.addInsight(insight);
    }
    if (this._timeline.count > 0) {
      insightEvents.emit('timeline_updated', { totalEntries: this._timeline.count });
    }

    // Step 11: Build metadata and statistics
    const buildTime = Date.now() - startTime;
    const metadata: InsightListMetadata = {
      listId: generateInsightListId(),
      knowledgeId: knowledge.metadata.knowledgeId,
      recommendationListId: null,
      generatedAt: new Date().toISOString(),
      insightVersion: this._config.insightVersion,
      generationTimeMs: buildTime,
      totalInsights: insights.length,
    };

    const statistics = this._buildStatistics(insights);

    const list: InsightList = {
      insights,
      metadata,
      statistics,
    };

    // Validate
    const validation = this._validator.validateList(list);
    if (!validation.valid) {
      console.warn('[InsightBuilder] Validation issues:', validation.issues);
    }

    insightEvents.emit('insight_generated', {
      listId: metadata.listId,
      knowledgeId: metadata.knowledgeId,
      count: insights.length,
      buildTimeMs: buildTime,
    });

    return list;
  }

  /**
   * Validate an insight list.
   */
  validate(list: InsightList): InsightValidationResult {
    return this._validator.validateList(list);
  }

  /**
   * Get the history.
   */
  getHistory(): InsightHistory {
    return this._history;
  }

  /**
   * Get the timeline.
   */
  getTimeline(): InsightTimelineManager {
    return this._timeline;
  }

  /**
   * Get the formatter.
   */
  getFormatter(): InsightFormatter {
    return this._formatter;
  }

  // ── Private ────────────────────────────────────────────────

  private _matchesFilter(insight: Insight, filter: InsightFilter): boolean {
    if (filter.types && !filter.types.includes(insight.type)) return false;
    if (filter.categories && !filter.categories.includes(insight.category)) return false;
    if (filter.priorities && !filter.priorities.includes(insight.priority)) return false;
    if (filter.minImportance !== undefined && insight.importanceScore < filter.minImportance) return false;
    if (filter.minConfidence !== undefined && insight.confidenceScore < filter.minConfidence) return false;
    if (filter.maxReadingTime !== undefined && insight.estimatedReadingTime > filter.maxReadingTime) return false;
    if (!filter.includeExpired && insight.status === 'expired') return false;
    if (filter.custom && !filter.custom(insight)) return false;
    return true;
  }

  private _buildStatistics(insights: Insight[]): InsightStatistics {
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    let totalImportance = 0;
    let totalConfidence = 0;
    let achievementsCount = 0;
    let milestonesCount = 0;
    let criticalCount = 0;
    let celebrationCount = 0;
    let totalReadingTime = 0;

    for (const insight of insights) {
      byType[insight.type] = (byType[insight.type] ?? 0) + 1;
      byCategory[insight.category] = (byCategory[insight.category] ?? 0) + 1;
      byPriority[insight.priority] = (byPriority[insight.priority] ?? 0) + 1;

      totalImportance += insight.importanceScore;
      totalConfidence += insight.confidenceScore;
      totalReadingTime += insight.estimatedReadingTime;

      if (insight.type === 'achievement') achievementsCount++;
      if (insight.type === 'milestone') milestonesCount++;
      if (insight.priority === 'critical') criticalCount++;
      if (insight.priority === 'celebration') celebrationCount++;
    }

    const count = insights.length || 1;

    return {
      totalInsights: insights.length,
      byType,
      byCategory,
      byPriority,
      averageImportance: clampScore(totalImportance / count),
      averageConfidence: clampScore(totalConfidence / count),
      achievementsCount,
      milestonesCount,
      criticalCount,
      celebrationCount,
      estimatedTotalReadingTime: totalReadingTime,
    };
  }
}
