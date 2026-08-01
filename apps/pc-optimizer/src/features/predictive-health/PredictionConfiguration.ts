/**
 * PredictionConfiguration — manages predictive health engine configuration.
 *
 * Provides defaults, validation, and safe updates.
 */
import type { PredictionConfiguration, PredictionRisk } from './types';
import { DEFAULT_PREDICTION_CONFIG } from './types';

export class PredictionConfigurationManager {
  private config: PredictionConfiguration;

  constructor(overrides?: Partial<PredictionConfiguration>) {
    this.config = { ...DEFAULT_PREDICTION_CONFIG, ...overrides };
    this.validate();
  }

  get(): PredictionConfiguration {
    return { ...this.config };
  }

  update(updates: Partial<PredictionConfiguration>): void {
    this.config = { ...this.config, ...updates };
    this.validate();
  }

  isDomainEnabled(domain: string): boolean {
    switch (domain) {
      case 'system_health': return this.config.enableHealthForecast;
      case 'storage': return this.config.enableStorageForecast;
      case 'battery': return this.config.enableBatteryForecast;
      case 'thermal': return this.config.enableThermalForecast;
      case 'memory_pressure': return this.config.enableMemoryForecast;
      case 'startup_performance': return this.config.enablePerformanceForecast;
      case 'reliability': return this.config.enableReliabilityForecast;
      default: return true;
    }
  }

  isRiskNotifiable(risk: PredictionRisk): boolean {
    const order: PredictionRisk[] = ['none', 'low', 'moderate', 'high', 'severe'];
    const minIndex = order.indexOf(this.config.notificationMinRisk);
    const riskIndex = order.indexOf(risk);
    return riskIndex >= minIndex;
  }

  shouldNotify(confidence: number, risk: PredictionRisk): boolean {
    if (!this.config.enableNotifications) return false;
    if (confidence < this.config.notificationMinConfidence) return false;
    return this.isRiskNotifiable(risk);
  }

  private validate(): void {
    if (this.config.minDataPoints < 2) this.config.minDataPoints = 2;
    if (this.config.maxPredictionHorizonDays < 1) this.config.maxPredictionHorizonDays = 1;
    if (this.config.minConfidence < 0) this.config.minConfidence = 0;
    if (this.config.minConfidence > 1) this.config.minConfidence = 1;
    if (this.config.maxPredictions < 1) this.config.maxPredictions = 1;
    if (this.config.regressionThreshold < 0) this.config.regressionThreshold = 0;
    if (this.config.regressionThreshold > 1) this.config.regressionThreshold = 1;
    if (this.config.notificationMinConfidence < 0) this.config.notificationMinConfidence = 0;
    if (this.config.notificationMinConfidence > 1) this.config.notificationMinConfidence = 1;
  }
}
