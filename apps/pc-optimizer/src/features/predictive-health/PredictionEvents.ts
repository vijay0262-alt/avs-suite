/**
 * PredictionEvents — event bus for AI Predictive Health lifecycle.
 *
 * Pub/sub pattern matching other AVS AI Shield event buses.
 */
import type { PredictionEvent, PredictionRisk, ForecastDomain } from './types';

type PredictionEventListener = (event: PredictionEvent) => void;

class PredictionEventBus {
  private listeners = new Set<PredictionEventListener>();

  subscribe(listener: PredictionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: PredictionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  emitPredictionGenerated(predictionId: string, domain: ForecastDomain, risk: PredictionRisk): void {
    this.emit({ type: 'prediction_generated', timestamp: Date.now(), predictionId, domain, risk });
  }

  emitPredictionUpdated(predictionId: string, domain: ForecastDomain): void {
    this.emit({ type: 'prediction_updated', timestamp: Date.now(), predictionId, domain });
  }

  emitPredictionExpired(predictionId: string): void {
    this.emit({ type: 'prediction_expired', timestamp: Date.now(), predictionId });
  }

  emitRiskDetected(predictionId: string, risk: PredictionRisk, message: string): void {
    this.emit({ type: 'risk_detected', timestamp: Date.now(), predictionId, risk, message });
  }

  emitTrendChanged(domain: ForecastDomain, message: string): void {
    this.emit({ type: 'trend_changed', timestamp: Date.now(), domain, message });
  }

  emitNotificationSent(predictionId: string, message: string): void {
    this.emit({ type: 'notification_sent', timestamp: Date.now(), predictionId, message });
  }

  emitNotificationDismissed(predictionId: string): void {
    this.emit({ type: 'notification_dismissed', timestamp: Date.now(), predictionId });
  }

  emitForecastCompleted(domain: ForecastDomain, predictionCount: number): void {
    this.emit({ type: 'forecast_completed', timestamp: Date.now(), domain, message: `${predictionCount} predictions generated` });
  }

  emitLearningUpdated(totalForecasts: number): void {
    this.emit({ type: 'learning_updated', timestamp: Date.now(), message: `${totalForecasts} total forecasts` });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const predictionEventBus = new PredictionEventBus();
