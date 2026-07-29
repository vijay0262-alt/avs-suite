/**
 * Prediction Engine — core prediction generation.
 *
 * Generates predictions from knowledge trends and historical snapshots.
 * Uses the analyzer for trend analysis and the model for building predictions.
 *
 * It NEVER executes optimizations.
 * It NEVER modifies the system.
 * It ONLY predicts future trends using historical data.
 *
 * Extensibility: Future modules register prediction provider plugins.
 */
import type {
  KnowledgeObject,
  KnowledgeFact,
  ContextSnapshot,
  TrendDataPoint,
  Prediction,
  PredictionType,
  PredictionCategory,
  TimeHorizon,
  PredictionConfiguration,
} from './types';
import { PredictionAnalyzer } from './predictionAnalyzer';
import { PredictionModel } from './predictionModel';

export class PredictionEngine {
  private _analyzer: PredictionAnalyzer;
  private _model: PredictionModel;
  private _config: PredictionConfiguration;

  constructor(config: PredictionConfiguration) {
    this._config = config;
    this._analyzer = new PredictionAnalyzer(config);
    this._model = new PredictionModel(config);
  }

  updateConfig(config: PredictionConfiguration): void {
    this._config = config;
    this._analyzer.updateConfig(config);
    this._model.updateConfig(config);
  }

  getAnalyzer(): PredictionAnalyzer {
    return this._analyzer;
  }

  getModel(): PredictionModel {
    return this._model;
  }

  /**
   * Generate predictions from knowledge and historical snapshots.
   */
  generate(
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizons: TimeHorizon[] = ['7d', '30d'],
  ): Prediction[] {
    const predictions: Prediction[] = [];

    for (const type of this._config.enabledTypes) {
      const typePredictions = this._generateByType(type, knowledge, snapshots, horizons);
      predictions.push(...typePredictions);
    }

    return predictions;
  }

  /**
   * Generate predictions for a specific type.
   */
  generateByType(
    type: PredictionType,
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizons: TimeHorizon[] = ['7d', '30d'],
  ): Prediction[] {
    return this._generateByType(type, knowledge, snapshots, horizons);
  }

  // ── Private ────────────────────────────────────────────────

  private _generateByType(
    type: PredictionType,
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizons: TimeHorizon[],
  ): Prediction[] {
    const results: Prediction[] = [];

    for (const horizon of horizons) {
      const prediction = this._tryGeneratePrediction(type, knowledge, snapshots, horizon);
      if (prediction) results.push(prediction);
    }

    return results;
  }

  private _tryGeneratePrediction(
    type: PredictionType,
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizon: TimeHorizon,
  ): Prediction | null {
    switch (type) {
      case 'storage_capacity':
        return this._generateStoragePrediction(knowledge, snapshots, horizon);
      case 'health_score_trend':
        return this._generateHealthPrediction(knowledge, snapshots, horizon);
      case 'startup_growth':
        return this._generateStartupGrowthPrediction(knowledge, snapshots, horizon);
      case 'browser_cache_growth':
        return this._generateBrowserCachePrediction(knowledge, snapshots, horizon);
      case 'temp_file_growth':
        return this._generateGenericFromFacts(
          'temp_file_growth', 'privacy', 'Temporary File Growth', 'MB',
          knowledge, snapshots, horizon, ['temp_files', 'temp_files_mb'],
          ['Temp file growth continues at the current rate', 'No manual cleanup is performed'],
        );
      case 'duplicate_file_growth':
        return this._generateGenericFromFacts(
          'duplicate_file_growth', 'duplicates', 'Duplicate File Growth', 'MB',
          knowledge, snapshots, horizon, ['wasted_space', 'wasted_space_mb'],
          ['Duplicate file growth continues at the current rate', 'No deduplication is performed'],
        );
      case 'disk_consumption':
        return this._generateGenericFromFacts(
          'disk_consumption', 'storage', 'Disk Consumption Trend', 'MB',
          knowledge, snapshots, horizon, ['used_space', 'used_mb', 'disk_usage'],
          ['Disk consumption continues at the current rate', 'No large files are removed'],
        );
      case 'optimization_frequency':
        return this._generateGenericFromFacts(
          'optimization_frequency', 'maintenance', 'Optimization Frequency', 'count',
          knowledge, snapshots, horizon, ['total_optimizations', 'optimization_count'],
          ['Optimization frequency remains similar', 'User behavior remains consistent'],
        );
      case 'maintenance_requirement':
        return this._generateGenericFromFacts(
          'maintenance_requirement', 'maintenance', 'Maintenance Requirement', null,
          knowledge, snapshots, horizon, ['issues_count', 'pending_issues'],
          ['System degradation continues at the current rate', 'No maintenance is performed'],
        );
      case 'privacy_degradation':
        return this._generateGenericFromFacts(
          'privacy_degradation', 'privacy', 'Privacy Degradation', 'count',
          knowledge, snapshots, horizon, ['tracking_cookies', 'history_entries'],
          ['Privacy data accumulation continues at the current rate', 'No privacy cleanup is performed'],
        );
      case 'windows_maintenance':
        return this._generateGenericFromFacts(
          'windows_maintenance', 'windows', 'Windows Maintenance', 'count',
          knowledge, snapshots, horizon, ['pending_updates', 'pending_update_count'],
          ['Update accumulation continues at the current rate', 'No manual updates are installed'],
        );
      default:
        return null;
    }
  }

  private _generateStoragePrediction(
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizon: TimeHorizon,
  ): Prediction | null {
    const storageFacts = knowledge.facts.filter((f) => f.category === 'storage');
    if (storageFacts.length === 0) return null;

    const usedFact = storageFacts.find((f) => f.name === 'used_space' || f.name === 'used_mb');
    if (!usedFact || typeof usedFact.value !== 'number') return null;

    const dataPoints = this._extractDataPoints(usedFact, snapshots);
    if (dataPoints.length < this._config.confidenceRules.minSamples) return null;

    const analysis = this._analyzer.analyzeDataPoints(usedFact.id, usedFact.name, dataPoints);
    if (!analysis) return null;

    analysis.projectedValues = this._analyzer.projectValues(analysis, [horizon]);

    const trends = knowledge.trends.filter((t) => t.factId === usedFact.id);
    return this._model.buildStoragePrediction(analysis, storageFacts, trends, knowledge, horizon);
  }

  private _generateHealthPrediction(
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizon: TimeHorizon,
  ): Prediction | null {
    const healthFacts = knowledge.facts.filter((f) => f.category === 'health');
    if (healthFacts.length === 0) return null;

    const scoreFact = healthFacts.find((f) => f.name === 'overall_score');
    if (!scoreFact || typeof scoreFact.value !== 'number') return null;

    const dataPoints = this._extractDataPoints(scoreFact, snapshots);
    if (dataPoints.length < this._config.confidenceRules.minSamples) return null;

    const analysis = this._analyzer.analyzeDataPoints(scoreFact.id, scoreFact.name, dataPoints);
    if (!analysis) return null;

    analysis.projectedValues = this._analyzer.projectValues(analysis, [horizon]);

    const trends = knowledge.trends.filter((t) => t.factId === scoreFact.id);
    return this._model.buildHealthPrediction(analysis, healthFacts, trends, knowledge, horizon);
  }

  private _generateStartupGrowthPrediction(
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizon: TimeHorizon,
  ): Prediction | null {
    const startupFacts = knowledge.facts.filter((f) => f.category === 'startup');
    if (startupFacts.length === 0) return null;

    const enabledFact = startupFacts.find((f) => f.name === 'enabled_items');
    if (!enabledFact || typeof enabledFact.value !== 'number') return null;

    const dataPoints = this._extractDataPoints(enabledFact, snapshots);
    if (dataPoints.length < this._config.confidenceRules.minSamples) return null;

    const analysis = this._analyzer.analyzeDataPoints(enabledFact.id, enabledFact.name, dataPoints);
    if (!analysis) return null;

    analysis.projectedValues = this._analyzer.projectValues(analysis, [horizon]);

    const trends = knowledge.trends.filter((t) => t.factId === enabledFact.id);
    return this._model.buildStartupGrowthPrediction(analysis, startupFacts, trends, knowledge, horizon);
  }

  private _generateBrowserCachePrediction(
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizon: TimeHorizon,
  ): Prediction | null {
    const browserFacts = knowledge.facts.filter((f) => f.category === 'browser');
    if (browserFacts.length === 0) return null;

    const cacheFact = browserFacts.find((f) => f.name === 'total_cache' || f.name === 'cache_mb');
    if (!cacheFact || typeof cacheFact.value !== 'number') return null;

    const dataPoints = this._extractDataPoints(cacheFact, snapshots);
    if (dataPoints.length < this._config.confidenceRules.minSamples) return null;

    const analysis = this._analyzer.analyzeDataPoints(cacheFact.id, cacheFact.name, dataPoints);
    if (!analysis) return null;

    analysis.projectedValues = this._analyzer.projectValues(analysis, [horizon]);

    const trends = knowledge.trends.filter((t) => t.factId === cacheFact.id);
    return this._model.buildBrowserCachePrediction(analysis, browserFacts, trends, knowledge, horizon);
  }

  private _generateGenericFromFacts(
    type: PredictionType,
    category: PredictionCategory,
    title: string,
    unit: string | null,
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizon: TimeHorizon,
    factNames: string[],
    assumptions: string[],
  ): Prediction | null {
    const facts = knowledge.facts.filter((f) =>
      f.category === this._mapCategoryToFactCategory(category),
    );

    // Find a fact matching any of the candidate names
    const targetFact = factNames
      .map((name) => facts.find((f) => f.name === name))
      .find((f) => f && typeof f.value === 'number');

    if (!targetFact || typeof targetFact.value !== 'number') return null;

    const dataPoints = this._extractDataPoints(targetFact, snapshots);
    if (dataPoints.length < this._config.confidenceRules.minSamples) return null;

    const analysis = this._analyzer.analyzeDataPoints(targetFact.id, targetFact.name, dataPoints);
    if (!analysis) return null;

    analysis.projectedValues = this._analyzer.projectValues(analysis, [horizon]);

    const trends = knowledge.trends.filter((t) => t.factId === targetFact.id);
    return this._model.buildGenericPrediction(
      type, category, title, unit,
      analysis, facts, trends, knowledge, horizon, assumptions,
    );
  }

  private _extractDataPoints(fact: KnowledgeFact, snapshots: ContextSnapshot[]): TrendDataPoint[] {
    const points: TrendDataPoint[] = [];

    for (const snapshot of snapshots) {
      const snapFact = snapshot.facts.find((f) => f.id === fact.id || f.name === fact.name);
      if (snapFact && typeof snapFact.value === 'number') {
        points.push({
          timestamp: snapFact.timestamp,
          value: snapFact.value,
        });
      }
    }

    return points;
  }

  private _mapCategoryToFactCategory(category: PredictionCategory): string {
    const map: Record<string, string> = {
      system: 'system', health: 'health', performance: 'performance',
      storage: 'storage', browser: 'browser', privacy: 'privacy',
      startup: 'startup', windows: 'windows', duplicates: 'duplicates',
      security: 'security', maintenance: 'history', automation: 'scheduler',
      custom: 'custom',
    };
    return map[category] ?? 'custom';
  }
}
