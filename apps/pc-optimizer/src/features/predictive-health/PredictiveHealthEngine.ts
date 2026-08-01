/**
 * PredictiveHealthEngine — top-level orchestrator for the AI Predictive
 * Health Engine.
 *
 * EPIC 5 — AI Predictive Health
 *
 * Consumes historical trend data from existing modules and produces
 * evidence-based forecasts of future system health.
 *
 * Core principles:
 *   - Never invent predictions. Every prediction is evidence-based.
 *   - Never query hardware directly. Only consume existing data.
 *   - Every prediction includes confidence, evidence, and uncertainty.
 *   - Predictions are explainable and actionable.
 *   - Learning is local-only. Never upload personal data.
 *   - Avoid notification fatigue — only notify on meaningful, actionable risks.
 */
import type {
  Prediction,
  PredictionInput,
  PredictionConfiguration,
  PredictionDashboardData,
  PredictionExplanation,
  PredictionNotification,
  Forecast,
  HealthForecast,
  StorageForecast,
  BatteryForecast,
  PerformanceForecast,
  HealthScorePoint,
} from './types';
import { PredictionConfigurationManager } from './PredictionConfiguration';
import { TrendRepository } from './TrendRepository';
import { TrendCollector } from './TrendCollector';
import { ForecastEngine } from './ForecastEngine';
import { HealthForecastEngine } from './HealthForecast';
import { StorageForecastEngine } from './StorageForecast';
import { BatteryForecastEngine } from './BatteryForecast';
import { ThermalForecastEngine } from './ThermalForecast';
import { MemoryForecastEngine } from './MemoryForecast';
import { PerformanceForecastEngine } from './PerformanceForecast';
import { ReliabilityForecastEngine } from './ReliabilityForecast';
import { PredictionExplanationEngine } from './PredictionExplanationEngine';
import { PredictionRecommendationEngine } from './PredictionRecommendationEngine';
import { PredictionDashboardProvider } from './PredictionDashboardProvider';
import { PredictionHistory } from './PredictionHistory';
import { predictionEventBus } from './PredictionEvents';

export class PredictiveHealthEngine {
  private configManager: PredictionConfigurationManager;
  private repository: TrendRepository;
  private collector: TrendCollector;
  private forecastEngine: ForecastEngine;
  private healthForecastEngine: HealthForecastEngine;
  private storageForecastEngine: StorageForecastEngine;
  private batteryForecastEngine: BatteryForecastEngine;
  private thermalForecastEngine: ThermalForecastEngine;
  private memoryForecastEngine: MemoryForecastEngine;
  private performanceForecastEngine: PerformanceForecastEngine;
  private reliabilityForecastEngine: ReliabilityForecastEngine;
  private explanationEngine: PredictionExplanationEngine;
  private recommendationEngine: PredictionRecommendationEngine;
  private dashboardProvider: PredictionDashboardProvider;
  private history: PredictionHistory;
  private notifications: PredictionNotification[] = [];
  private lastPredictions: Prediction[] = [];
  private lastForecasts: Forecast[] = [];
  private healthScoreHistory: HealthScorePoint[] = [];

  constructor(config?: Partial<PredictionConfiguration>) {
    this.configManager = new PredictionConfigurationManager(config);
    const configObj = this.configManager.get();
    this.repository = new TrendRepository();
    this.collector = new TrendCollector(this.repository);
    this.forecastEngine = new ForecastEngine(configObj);
    this.healthForecastEngine = new HealthForecastEngine(configObj);
    this.storageForecastEngine = new StorageForecastEngine(configObj);
    this.batteryForecastEngine = new BatteryForecastEngine(configObj);
    this.thermalForecastEngine = new ThermalForecastEngine(configObj);
    this.memoryForecastEngine = new MemoryForecastEngine(configObj);
    this.performanceForecastEngine = new PerformanceForecastEngine(configObj);
    this.reliabilityForecastEngine = new ReliabilityForecastEngine(configObj);
    this.explanationEngine = new PredictionExplanationEngine();
    this.recommendationEngine = new PredictionRecommendationEngine();
    this.dashboardProvider = new PredictionDashboardProvider();
    this.history = new PredictionHistory();
  }

  /**
   * Ingest historical data from existing modules.
   */
  ingestData(input: PredictionInput): void {
    this.collector.collectAll(input);
    this.healthScoreHistory = input.healthScores;
  }

  /**
   * Generate all forecasts and predictions.
   */
  generateForecasts(): Prediction[] {
    const config = this.configManager.get();
    const allSeries = this.repository.getAllSeries();
    const predictions: Prediction[] = [];
    const forecasts: Forecast[] = [];

    if (config.enableHealthForecast) {
      const hf = this.healthForecastEngine.generate(allSeries);
      if (hf) {
        forecasts.push(hf);
        predictions.push(...hf.predictions);
      }
    }

    if (config.enableStorageForecast) {
      const sf = this.storageForecastEngine.generate(allSeries);
      if (sf) {
        forecasts.push(sf);
        predictions.push(...sf.predictions);
      }
    }

    if (config.enableBatteryForecast) {
      const bf = this.batteryForecastEngine.generate(allSeries);
      if (bf) {
        forecasts.push(bf);
        predictions.push(...bf.predictions);
      }
    }

    if (config.enableThermalForecast) {
      const tf = this.thermalForecastEngine.generate(allSeries);
      if (tf) {
        forecasts.push(tf);
        predictions.push(...tf.predictions);
      }
    }

    if (config.enableMemoryForecast) {
      const mf = this.memoryForecastEngine.generate(allSeries);
      if (mf) {
        forecasts.push(mf);
        predictions.push(...mf.predictions);
      }
    }

    if (config.enablePerformanceForecast) {
      const pf = this.performanceForecastEngine.generate(allSeries);
      if (pf) {
        forecasts.push(pf);
        predictions.push(...pf.predictions);
      }
    }

    // Attach recommendations and explanations to all predictions
    for (const pred of predictions) {
      pred.recommendation = this.recommendationEngine.generate(pred);
      pred.explanation = this.explanationEngine.explain(pred);
    }

    // Generate reliability forecast from all predictions
    if (config.enableReliabilityForecast) {
      const rf = this.reliabilityForecastEngine.generate(allSeries, predictions);
      if (rf) {
        forecasts.push(rf);
        predictions.push(...rf.predictions);
      }
    }

    // Record predictions in history
    for (const pred of predictions) {
      this.history.recordPrediction(pred);
      predictionEventBus.emitPredictionGenerated(pred.id, pred.domain, pred.risk);
    }

    // Generate notifications for actionable, high-confidence predictions
    this.generateNotifications(predictions);

    this.lastPredictions = predictions;
    this.lastForecasts = forecasts;

    return predictions;
  }

  /**
   * Generate explanations for predictions.
   */
  generateExplanations(predictions?: Prediction[]): PredictionExplanation[] {
    const target = predictions ?? this.lastPredictions;
    return this.explanationEngine.explainAll(target);
  }

  /**
   * Build dashboard data from current predictions and forecasts.
   */
  buildDashboard(): PredictionDashboardData {
    const healthForecast = this.lastForecasts.find((f) => f.domain === 'system_health') as HealthForecast | null;
    const storageForecast = this.lastForecasts.find((f) => f.domain === 'storage') as StorageForecast | null;
    const batteryForecast = this.lastForecasts.find((f) => f.domain === 'battery') as BatteryForecast | null;
    const performanceForecast = this.lastForecasts.find((f) => f.domain === 'startup_performance') as PerformanceForecast | null;

    return this.dashboardProvider.build(
      this.lastPredictions,
      healthForecast,
      storageForecast,
      batteryForecast,
      performanceForecast,
      this.history,
      this.healthScoreHistory,
    );
  }

  /**
   * Get active notifications.
   */
  getNotifications(): PredictionNotification[] {
    return this.notifications.filter((n) => !n.dismissed);
  }

  dismissNotification(notificationId: string): void {
    const notif = this.notifications.find((n) => n.id === notificationId);
    if (notif) {
      notif.dismissed = true;
      predictionEventBus.emitNotificationDismissed(notif.predictionId);
    }
  }

  /**
   * Validate a past prediction against actual values.
   */
  validatePrediction(predictionId: string, actualValue: number): void {
    this.history.validatePrediction(predictionId, actualValue);
  }

  getConfiguration(): PredictionConfiguration {
    return this.configManager.get();
  }

  updateConfiguration(updates: Partial<PredictionConfiguration>): void {
    this.configManager.update(updates);
  }

  getHistory(): PredictionHistory {
    return this.history;
  }

  getRepository(): TrendRepository {
    return this.repository;
  }

  getLastPredictions(): Prediction[] {
    return this.lastPredictions;
  }

  getLastForecasts(): Forecast[] {
    return this.lastForecasts;
  }

  dispose(): void {
    this.repository.clear();
    this.history.clear();
    this.notifications = [];
    this.lastPredictions = [];
    this.lastForecasts = [];
    this.healthScoreHistory = [];
    predictionEventBus.clear();
  }

  private generateNotifications(predictions: Prediction[]): void {
    const config = this.configManager.get();
    if (!config.enableNotifications) return;

    for (const pred of predictions) {
      if (!this.configManager.shouldNotify(pred.confidence, pred.risk)) continue;
      if (pred.actionability === 'informational') continue;

      const notification: PredictionNotification = {
        id: `notif-${pred.id}`,
        predictionId: pred.id,
        title: pred.title,
        message: pred.summary,
        risk: pred.risk,
        urgency: pred.urgency,
        confidence: pred.confidence,
        actionability: pred.actionability,
        createdAt: Date.now(),
        dismissed: false,
      };
      this.notifications.push(notification);
      predictionEventBus.emitNotificationSent(pred.id, pred.title);
    }

    // Keep only recent notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(-100);
    }
  }
}
