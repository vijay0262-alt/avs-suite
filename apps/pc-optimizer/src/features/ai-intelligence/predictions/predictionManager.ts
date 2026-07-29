/**
 * Prediction Manager — main orchestrator and public API for the
 * AI Prediction Engine.
 *
 * Public APIs:
 *   generatePredictions(knowledge, snapshots, horizons?, filter?)
 *   getPredictions()
 *   getPrediction(id)
 *   getPredictionsByCategory(categories)
 *   getPredictionsByRisk(riskLevels)
 *   getPredictionTimeline(period?)
 *   getPredictionStatistics()
 *
 * The Prediction Engine NEVER executes optimizations.
 * It NEVER modifies the system.
 * It ONLY predicts future trends using historical data.
 *
 * Future consumers: Dashboard, AI Assistant, Automation, Reports, Notifications.
 */
import type {
  KnowledgeObject,
  ContextSnapshot,
  Prediction,
  PredictionList,
  PredictionStatistics,
  PredictionFilter,
  PredictionValidationResult,
  PredictionConfiguration,
  PredictionProviderPlugin,
  PredictionType,
  PredictionCategory,
  RiskLevel,
  TimeHorizon,
  PredictionTimelinePeriod,
  PredictionTimeline,
  PredictionHistoryEntry,
  PredictionAccuracyRecord,
} from './types';
import { PredictionRegistry } from './predictionRegistry';
import { PredictionValidator } from './predictionValidator';
import { PredictionBuilder } from './predictionBuilder';
import { predictionEvents } from './predictionEvents';
import { createPredictionConfig } from './predictionConfiguration';

export class PredictionManager {
  private _registry: PredictionRegistry;
  private _validator: PredictionValidator;
  private _builder: PredictionBuilder;
  private _config: PredictionConfiguration;
  private _currentList: PredictionList | null = null;

  constructor(config?: Partial<PredictionConfiguration>) {
    this._config = createPredictionConfig(config);
    this._registry = new PredictionRegistry();
    this._validator = new PredictionValidator(this._config);
    this._builder = new PredictionBuilder(this._registry, this._validator, this._config);
  }

  /**
   * Generate predictions from knowledge and historical snapshots.
   */
  async generatePredictions(
    knowledge: KnowledgeObject,
    snapshots: ContextSnapshot[],
    horizons: TimeHorizon[] = ['7d', '30d'],
    filter?: PredictionFilter,
  ): Promise<PredictionList> {
    const list = await this._builder.build(knowledge, snapshots, horizons, filter);
    this._currentList = list;
    return list;
  }

  /**
   * Get the current prediction list (null if not generated).
   */
  getPredictionList(): PredictionList | null {
    return this._currentList;
  }

  /**
   * Get all predictions from the current list.
   */
  getPredictions(): Prediction[] {
    return this._currentList?.predictions ?? [];
  }

  /**
   * Get a specific prediction by ID.
   */
  getPrediction(id: string): Prediction | null {
    return this.getPredictions().find((p) => p.id === id) ?? null;
  }

  /**
   * Get predictions by type.
   */
  getPredictionsByType(types: PredictionType[]): Prediction[] {
    return this.getPredictions().filter((p) => types.includes(p.predictionType));
  }

  /**
   * Get predictions by category.
   */
  getPredictionsByCategory(categories: PredictionCategory[]): Prediction[] {
    return this.getPredictions().filter((p) => categories.includes(p.category));
  }

  /**
   * Get predictions by risk level.
   */
  getPredictionsByRisk(riskLevels: RiskLevel[]): Prediction[] {
    return this.getPredictions().filter((p) => riskLevels.includes(p.riskLevel));
  }

  /**
   * Get predictions by time horizon.
   */
  getPredictionsByHorizon(horizons: TimeHorizon[]): Prediction[] {
    return this.getPredictions().filter((p) => horizons.includes(p.timeHorizon));
  }

  /**
   * Get the prediction timeline.
   */
  getPredictionTimeline(period: PredictionTimelinePeriod = 'daily'): PredictionTimeline {
    return this._builder.getTimeline().getTimeline(period);
  }

  /**
   * Get prediction statistics.
   */
  getPredictionStatistics(): PredictionStatistics | null {
    return this._currentList?.statistics ?? null;
  }

  /**
   * Filter predictions with a custom filter.
   */
  filterPredictions(filter: PredictionFilter): Prediction[] {
    return this.getPredictions().filter((p) => {
      if (filter.types && !filter.types.includes(p.predictionType)) return false;
      if (filter.categories && !filter.categories.includes(p.category)) return false;
      if (filter.riskLevels && !filter.riskLevels.includes(p.riskLevel)) return false;
      if (filter.timeHorizons && !filter.timeHorizons.includes(p.timeHorizon)) return false;
      if (filter.minConfidence !== undefined && p.confidenceScore < filter.minConfidence) return false;
      if (!filter.includeExpired && p.status === 'expired') return false;
      if (filter.custom && !filter.custom(p)) return false;
      return true;
    });
  }

  /**
   * Validate the current prediction list.
   */
  validatePredictions(): PredictionValidationResult {
    if (!this._currentList) {
      return {
        valid: false,
        issues: [{ level: 'error', code: 'NO_PREDICTIONS', message: 'No prediction list available' }],
      };
    }
    return this._validator.validateList(this._currentList);
  }

  /**
   * Validate a specific prediction list.
   */
  validate(list: PredictionList): PredictionValidationResult {
    return this._validator.validateList(list);
  }

  /**
   * Dismiss a prediction (emits event, records history).
   */
  dismissPrediction(id: string): void {
    const pred = this.getPrediction(id);
    if (pred) {
      pred.status = 'dismissed';
      predictionEvents.emit('prediction_updated', { predictionId: id, action: 'dismissed' });
      this._builder.getHistory().recordDismissed(id);
    }
  }

  /**
   * Mark a prediction as fulfilled (records accuracy).
   */
  fulfillPrediction(id: string, actualValue: number | string): void {
    const pred = this.getPrediction(id);
    if (pred) {
      pred.status = 'fulfilled';
      this._builder.getHistory().recordFulfilled(id, actualValue);
      this._builder.getHistory().recordAccuracy(pred, actualValue);
      this._builder.getTimeline().addFulfillment(pred, actualValue);
      predictionEvents.emit('prediction_updated', { predictionId: id, action: 'fulfilled', actualValue });
    }
  }

  /**
   * Register a prediction provider plugin.
   */
  registerPlugin(plugin: PredictionProviderPlugin): boolean {
    return this._registry.registerPlugin(plugin);
  }

  /**
   * Unregister a prediction provider plugin.
   */
  unregisterPlugin(name: string): boolean {
    return this._registry.unregisterPlugin(name);
  }

  /**
   * Get all registered plugins.
   */
  getPlugins(): PredictionProviderPlugin[] {
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
  updateConfig(config: Partial<PredictionConfiguration>): void {
    this._config = createPredictionConfig({ ...this._config, ...config });
    this._validator.updateConfig(this._config);
    this._builder.updateConfig(this._config);
  }

  /**
   * Get the registry.
   */
  getRegistry(): PredictionRegistry {
    return this._registry;
  }

  /**
   * Get the validator.
   */
  getValidator(): PredictionValidator {
    return this._validator;
  }

  /**
   * Get the builder.
   */
  getBuilder(): PredictionBuilder {
    return this._builder;
  }

  /**
   * Get history entries.
   */
  getHistory(): PredictionHistoryEntry[] {
    return this._builder.getHistory().getEntries();
  }

  /**
   * Get accuracy records.
   */
  getAccuracyRecords(): PredictionAccuracyRecord[] {
    return this._builder.getHistory().getAccuracyRecords();
  }

  /**
   * Get average accuracy.
   */
  getAverageAccuracy(): number {
    return this._builder.getHistory().getAverageAccuracy();
  }

  /**
   * Clear current predictions.
   */
  clear(): void {
    this._currentList = null;
  }
}

export const predictionManager = new PredictionManager();
