/**
 * Recommendation Builder — orchestrates the recommendation pipeline.
 *
 * Pipeline:
 *   Knowledge Object → Recommendation Engine → Scorer →
 *   Ranker → Filter → Validator → Recommendation List
 *
 * The builder NEVER executes optimizations.
 * It ONLY produces structured recommendations.
 */
import type {
  KnowledgeObject,
  Recommendation,
  RecommendationList,
  RecommendationListMetadata,
  RecommendationStatistics,
  RecommendationConfiguration,
  RecommendationFilter,
  RecommendationValidationResult,
} from './types';
import { generateRecommendationListId } from './types';
import { RecommendationEngine } from './recommendationEngine';
import { RecommendationScorer } from './recommendationScorer';
import { RecommendationRanker } from './recommendationRanker';
import { RecommendationFilterer } from './recommendationFilter';
import type { RecommendationValidator } from './recommendationValidator';
import type { RecommendationRegistry } from './recommendationRegistry';
import { RecommendationHistory } from './recommendationHistory';
import { recommendationEvents } from './recommendationEvents';

export class RecommendationBuilder {
  private _engine: RecommendationEngine;
  private _scorer: RecommendationScorer;
  private _ranker: RecommendationRanker;
  private _filterer: RecommendationFilterer;
  private _validator: RecommendationValidator;
  private _registry: RecommendationRegistry;
  private _history: RecommendationHistory;
  private _config: RecommendationConfiguration;

  constructor(
    registry: RecommendationRegistry,
    validator: RecommendationValidator,
    config: RecommendationConfiguration,
  ) {
    this._registry = registry;
    this._validator = validator;
    this._config = config;
    this._engine = new RecommendationEngine(config);
    this._scorer = new RecommendationScorer(config);
    this._ranker = new RecommendationRanker();
    this._filterer = new RecommendationFilterer(config);
    this._history = new RecommendationHistory(config);
  }

  updateConfig(config: RecommendationConfiguration): void {
    this._config = config;
    this._engine.updateConfig(config);
    this._scorer.updateConfig(config);
    this._filterer.updateConfig(config);
    this._history.updateConfig(config);
  }

  /**
   * Build recommendations from a knowledge object.
   */
  async build(
    knowledge: KnowledgeObject,
    filter?: RecommendationFilter,
  ): Promise<RecommendationList> {
    const startTime = Date.now();

    // Step 1: Generate recommendations from engine
    let recommendations = this._engine.generate(knowledge);

    // Step 2: Collect from registered plugins
    const plugins = this._registry.getAvailablePlugins();
    for (const plugin of plugins) {
      try {
        const pluginRecs = plugin.buildRecommendations(knowledge);
        recommendations = recommendations.concat(pluginRecs);
      } catch (err) {
        // Continue on plugin failure
      }
    }

    // Step 3: Deduplicate
    recommendations = this._history.deduplicate(recommendations);

    // Step 4: Score all recommendations
    this._scorer.scoreAll(recommendations);

    // Step 5: Rank recommendations
    recommendations = this._ranker.rank(recommendations);
    recommendationEvents.emit('recommendation_ranked', {
      count: recommendations.length,
      timestamp: new Date().toISOString(),
    });

    // Step 6: Apply filter if provided
    let filteredCount = recommendations.length;
    if (filter) {
      recommendations = this._filterer.filter(recommendations, filter);
      filteredCount = recommendations.length;
      recommendationEvents.emit('recommendation_filtered', {
        filteredCount,
        timestamp: new Date().toISOString(),
      });
    }

    // Step 7: Limit to max recommendations
    if (recommendations.length > this._config.maxRecommendations) {
      recommendations = recommendations.slice(0, this._config.maxRecommendations);
    }

    // Step 8: Check for expired
    const expired = this._history.checkExpired(recommendations);
    for (const id of expired) {
      recommendationEvents.emit('recommendation_expired', { recommendationId: id });
    }

    // Step 9: Record history
    this._history.recordGenerated(recommendations);

    // Step 10: Validate
    const buildTime = Date.now() - startTime;
    const metadata: RecommendationListMetadata = {
      listId: generateRecommendationListId(),
      knowledgeId: knowledge.metadata.knowledgeId,
      generatedAt: new Date().toISOString(),
      recommendationVersion: this._config.recommendationVersion,
      generationTimeMs: buildTime,
      totalRecommendations: recommendations.length,
      filteredCount,
    };

    const statistics = this._buildStatistics(recommendations);

    const list: RecommendationList = {
      recommendations,
      metadata,
      statistics,
    };

    // Validate the list
    const validation = this._validator.validateList(list);
    if (!validation.valid) {
      // Log issues but still return the list
      console.warn('[RecommendationBuilder] Validation issues:', validation.issues);
    }

    recommendationEvents.emit('recommendations_generated', {
      listId: metadata.listId,
      knowledgeId: metadata.knowledgeId,
      count: recommendations.length,
      buildTimeMs: buildTime,
    });

    return list;
  }

  /**
   * Validate a recommendation list.
   */
  validate(list: RecommendationList): RecommendationValidationResult {
    return this._validator.validateList(list);
  }

  /**
   * Get the history.
   */
  getHistory(): RecommendationHistory {
    return this._history;
  }

  // ── Private: Statistics ────────────────────────────────────

  private _buildStatistics(recommendations: Recommendation[]): RecommendationStatistics {
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};

    let totalImpact = 0;
    let totalSafety = 0;
    let totalUrgency = 0;
    let totalEffort = 0;
    let totalConfidence = 0;
    let totalOverall = 0;
    let quickWinsCount = 0;
    let safeCount = 0;
    let proRequiredCount = 0;
    let automationEligibleCount = 0;
    let estimatedTotalTime = 0;
    let estimatedTotalSpaceRecovered = 0;

    for (const rec of recommendations) {
      byCategory[rec.category] = (byCategory[rec.category] ?? 0) + 1;
      byPriority[rec.priority] = (byPriority[rec.priority] ?? 0) + 1;
      byRiskLevel[rec.safety.riskLevel] = (byRiskLevel[rec.safety.riskLevel] ?? 0) + 1;

      totalImpact += rec.scores.impactScore;
      totalSafety += rec.scores.safetyScore;
      totalUrgency += rec.scores.urgencyScore;
      totalEffort += rec.scores.effortScore;
      totalConfidence += rec.scores.confidenceScore;
      totalOverall += rec.scores.overallScore;

      if (this._filterer.isQuickWin(rec)) quickWinsCount++;
      if (rec.safety.riskLevel === 'none' || rec.safety.riskLevel === 'low') safeCount++;
      if (rec.requiresPro) proRequiredCount++;
      if (rec.safety.automationEligible) automationEligibleCount++;

      estimatedTotalTime += rec.benefits.estimatedTime;
      if (rec.benefits.estimatedSpaceRecovered !== null) {
        estimatedTotalSpaceRecovered += rec.benefits.estimatedSpaceRecovered;
      }
    }

    const count = recommendations.length || 1;

    return {
      totalRecommendations: recommendations.length,
      byCategory,
      byPriority,
      byRiskLevel,
      averageImpact: totalImpact / count,
      averageSafety: totalSafety / count,
      averageUrgency: totalUrgency / count,
      averageEffort: totalEffort / count,
      averageConfidence: totalConfidence / count,
      averageOverall: totalOverall / count,
      quickWinsCount,
      safeCount,
      proRequiredCount,
      automationEligibleCount,
      estimatedTotalTime,
      estimatedTotalSpaceRecovered,
    };
  }
}
