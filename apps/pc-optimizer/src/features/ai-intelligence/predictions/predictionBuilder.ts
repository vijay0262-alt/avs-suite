/**
 * Prediction Builder — orchestrates the prediction pipeline.
 *
 * Pipeline:
 *   Knowledge + Snapshots → Prediction Engine →
 *   Deduplicate → Validate → Sort by Risk → Prediction List
 *
 * The builder NEVER executes optimizations.
 * It ONLY produces structured predictions.
 */
import type {
  KnowledgeObject,
  ContextSnapshot,
  Prediction,
  PredictionList,
  PredictionListMetadata,
  PredictionStatistics,
  PredictionConfiguration,
  PredictionFilter,
  PredictionValidationResult,
  TimeHorizon,
} from './types';
import { generatePredictionListId, clampScore } from './types';
import { PredictionEngine } from './predictionEngine';
import type { PredictionValidator } from './predictionValidator';
import type { PredictionRegistry } from './predictionRegistry';
import { PredictionHistory } from './predictionHistory';
import { PredictionTimelineManager } from './predictionTimeline';
import { predictionEvents } from './predictionEvents';

export class PredictionBuilder {
  private _engine: PredictionEngine;
  private _validator: PredictionValidator;
  private _registry: PredictionRegistry;
  private _history: PredictionHistory;
  private _timeline: PredictionTimelineManager;
  private _config: PredictionConfiguration;

  constructor(
    registry: PredictionRegistry,
    validator: PredictionValidator,
    config: PredictionConfiguration,
  ) {
    this._registry = registry;
    this._validator = validator;
    this._config = config;
    this._engine = new PredictionEngine(config);
    this._history = new PredictionHistory(config);
    this._timeline = new PredictionTimelineManager(config);
  }

  updateConfig(config: PredictionConfiguration): void {
    this._config = config;
    this._engine.updateConfig(config);
    this._history.updateConfig(config);
    this._timeline.updateConfig(config);
  }

  /**
   * Build predictions from knowledge and historical snapshots.
   */
  async build(
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizons: TimeHorizon[] = ['7d', '30d'],
    filter?: PredictionFilter,
  ): Promise<PredictionList> {
    const startTime = Date.now();

    // Step 1: Generate predictions from engine
    let predictions = this._engine.generate(knowledge, snapshots, horizons);

    // Step 2: Collect from registered plugins
    const plugins = this._registry.getAvailablePlugins();
    for (const plugin of plugins) {
      try {
        const pluginPredictions = plugin.generatePredictions(knowledge, snapshots, this._config);
        predictions = predictions.concat(pluginPredictions);
      } catch (err) {
        predictionEvents.emit('prediction_failed', {
          plugin: plugin.getPluginName(),
          error: err,
        });
      }
    }

    // Step 3: Deduplicate
    predictions = this._history.deduplicate(predictions);

    // Step 4: Sort by risk (highest first)
    predictions = this._sortByRisk(predictions);

    // Step 5: Apply filter if provided
    if (filter) {
      predictions = predictions.filter((p) => this._matchesFilter(p, filter));
    }

    // Step 6: Limit to max predictions
    if (predictions.length > this._config.maxPredictions) {
      predictions = predictions.slice(0, this._config.maxPredictions);
    }

    // Step 7: Check for expired
    const expired = this._history.checkExpired(predictions);
    for (const id of expired) {
      predictionEvents.emit('prediction_expired', { predictionId: id });
    }

    // Step 8: Record history
    this._history.recordGenerated(predictions);

    // Step 9: Add to timeline
    for (const pred of predictions) {
      this._timeline.addPrediction(pred);
    }
    if (this._timeline.count > 0) {
      predictionEvents.emit('timeline_updated', { totalEntries: this._timeline.count });
    }

    // Step 10: Build metadata and statistics
    const buildTime = Date.now() - startTime;
    const metadata: PredictionListMetadata = {
      listId: generatePredictionListId(),
      knowledgeId: knowledge.metadata.knowledgeId,
      generatedAt: new Date().toISOString(),
      predictionVersion: this._config.predictionVersion,
      generationTimeMs: buildTime,
      totalPredictions: predictions.length,
      historicalSnapshots: snapshots.length,
    };

    const statistics = this._buildStatistics(predictions);

    const list: PredictionList = {
      predictions,
      metadata,
      statistics,
    };

    // Validate
    const validation = this._validator.validateList(list);
    if (!validation.valid) {
      console.warn('[PredictionBuilder] Validation issues:', validation.issues);
    }

    predictionEvents.emit('prediction_generated', {
      listId: metadata.listId,
      knowledgeId: metadata.knowledgeId,
      count: predictions.length,
      buildTimeMs: buildTime,
    });

    return list;
  }

  validate(list: PredictionList): PredictionValidationResult {
    return this._validator.validateList(list);
  }

  getHistory(): PredictionHistory {
    return this._history;
  }

  getTimeline(): PredictionTimelineManager {
    return this._timeline;
  }

  getEngine(): PredictionEngine {
    return this._engine;
  }

  // ── Private ────────────────────────────────────────────────

  private _sortByRisk(predictions: Prediction[]): Prediction[] {
    const order: Record<string, number> = {
      critical: 0, high: 1, medium: 2, low: 3, none: 4,
    };
    return [...predictions].sort((a, b) => {
      const ra = order[a.riskLevel] ?? 5;
      const rb = order[b.riskLevel] ?? 5;
      if (ra !== rb) return ra - rb;
      return b.confidenceScore - a.confidenceScore;
    });
  }

  private _matchesFilter(prediction: Prediction, filter: PredictionFilter): boolean {
    if (filter.types && !filter.types.includes(prediction.predictionType)) return false;
    if (filter.categories && !filter.categories.includes(prediction.category)) return false;
    if (filter.riskLevels && !filter.riskLevels.includes(prediction.riskLevel)) return false;
    if (filter.timeHorizons && !filter.timeHorizons.includes(prediction.timeHorizon)) return false;
    if (filter.minConfidence !== undefined && prediction.confidenceScore < filter.minConfidence) return false;
    if (!filter.includeExpired && prediction.status === 'expired') return false;
    if (filter.custom && !filter.custom(prediction)) return false;
    return true;
  }

  private _buildStatistics(predictions: Prediction[]): PredictionStatistics {
    const byType: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};
    const byTimeHorizon: Record<string, number> = {};
    const byTrend: Record<string, number> = {};

    let totalConfidence = 0;
    let criticalCount = 0;
    let highRiskCount = 0;
    let fulfilledCount = 0;
    let expiredCount = 0;

    for (const pred of predictions) {
      byType[pred.predictionType] = (byType[pred.predictionType] ?? 0) + 1;
      byCategory[pred.category] = (byCategory[pred.category] ?? 0) + 1;
      byRiskLevel[pred.riskLevel] = (byRiskLevel[pred.riskLevel] ?? 0) + 1;
      byTimeHorizon[pred.timeHorizon] = (byTimeHorizon[pred.timeHorizon] ?? 0) + 1;
      byTrend[pred.trend] = (byTrend[pred.trend] ?? 0) + 1;

      totalConfidence += pred.confidenceScore;

      if (pred.riskLevel === 'critical') criticalCount++;
      if (pred.riskLevel === 'high') highRiskCount++;
      if (pred.status === 'fulfilled') fulfilledCount++;
      if (pred.status === 'expired') expiredCount++;
    }

    const count = predictions.length || 1;

    return {
      totalPredictions: predictions.length,
      byType,
      byCategory,
      byRiskLevel,
      byTimeHorizon,
      byTrend,
      averageConfidence: clampScore(totalConfidence / count),
      criticalCount,
      highRiskCount,
      fulfilledCount,
      expiredCount,
    };
  }
}
