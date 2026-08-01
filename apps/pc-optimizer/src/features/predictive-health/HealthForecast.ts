/**
 * HealthForecast — forecasts overall system health score.
 *
 * Consumes health score history from the TrendRepository.
 * Projects future health score and estimates time to warning/critical thresholds.
 */
import type {
  HealthForecast as HealthForecastResult,
  HistoricalSeries,
  PredictionConfiguration,
  TrendBehavior,
} from './types';
import { ForecastEngine } from './ForecastEngine';

export class HealthForecastEngine {
  private forecastEngine: ForecastEngine;

  constructor(private config: PredictionConfiguration) {
    this.forecastEngine = new ForecastEngine(config);
  }

  generate(series: HistoricalSeries[]): HealthForecastResult | null {
    const healthSeries = series.filter((s) => s.domain === 'system_health');
    if (healthSeries.length === 0) return null;

    const base = this.forecastEngine.forecast('system_health', healthSeries, 'System Health Forecast');

    const healthScoreSeries = healthSeries.find((s) => s.metric === 'health_score');
    if (!healthScoreSeries) {
      return { ...base, domain: 'system_health', projectedHealthScore: 0, healthScoreTrend: 'unknown', estimatedTimeToThreshold: null, thresholdValue: this.config.healthScoreWarningThreshold };
    }

    const lastValue = healthScoreSeries.dataPoints[healthScoreSeries.dataPoints.length - 1]?.value ?? 0;
    const trend = base.predictions.find((p) => p.domain === 'system_health');

    const projectedHealthScore = trend?.projectedValue ?? lastValue;
    const healthScoreTrend: TrendBehavior = trend?.behavior ?? 'stable';

    let estimatedTimeToThreshold: number | null = null;
    if (healthScoreTrend === 'gradual_degradation' || healthScoreTrend === 'rapid_degradation') {
      const thresholdTimestamp = this.estimateTimeToThreshold(healthScoreSeries, this.config.healthScoreWarningThreshold);
      if (thresholdTimestamp !== null) {
        estimatedTimeToThreshold = Math.round((thresholdTimestamp - Date.now()) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      ...base,
      domain: 'system_health',
      projectedHealthScore: Math.round(projectedHealthScore),
      healthScoreTrend,
      estimatedTimeToThreshold,
      thresholdValue: this.config.healthScoreWarningThreshold,
    };
  }

  private estimateTimeToThreshold(series: HistoricalSeries, threshold: number): number | null {
    const points = series.dataPoints;
    if (points.length < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = points.length;
    for (const p of points) {
      sumX += p.timestamp;
      sumY += p.value;
      sumXY += p.timestamp * p.value;
      sumXX += p.timestamp * p.timestamp;
    }
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    if (slope >= 0) return null;
    const targetTs = (threshold - intercept) / slope;
    if (targetTs <= Date.now()) return null;
    return targetTs;
  }
}
