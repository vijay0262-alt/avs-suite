/**
 * PerformanceForecast — forecasts startup performance and general
 * system performance trends.
 *
 * Consumes startup time data from the TrendRepository.
 * Projects startup time degradation.
 */
import type {
  PerformanceForecast as PerformanceForecastResult,
  HistoricalSeries,
  PredictionConfiguration,
} from './types';
import { ForecastEngine } from './ForecastEngine';

export class PerformanceForecastEngine {
  private forecastEngine: ForecastEngine;

  constructor(private config: PredictionConfiguration) {
    this.forecastEngine = new ForecastEngine(config);
  }

  generate(series: HistoricalSeries[]): PerformanceForecastResult | null {
    const perfSeries = series.filter((s) => s.domain === 'startup_performance');
    if (perfSeries.length === 0) return null;

    const base = this.forecastEngine.forecast('startup_performance', perfSeries, 'Performance Forecast');

    const startupSeries = perfSeries.find((s) => s.metric === 'startup_time');
    if (!startupSeries) {
      return {
        ...base,
        domain: 'startup_performance',
        projectedStartupTimeSeconds: 0,
        startupTimeIncreasePerMonth: 0,
        degradationRate: 0,
      };
    }

    const lastStartupTime = startupSeries.dataPoints[startupSeries.dataPoints.length - 1]?.value ?? 0;
    const startupTimeIncreasePerMonth = this.computeRatePerMonth(startupSeries);

    const projectedStartupTimeSeconds = lastStartupTime + startupTimeIncreasePerMonth * 6;
    const degradationRate = startupTimeIncreasePerMonth / Math.max(1, lastStartupTime) * 100;

    return {
      ...base,
      domain: 'startup_performance',
      projectedStartupTimeSeconds: Math.round(projectedStartupTimeSeconds * 100) / 100,
      startupTimeIncreasePerMonth: Math.round(startupTimeIncreasePerMonth * 100) / 100,
      degradationRate: Math.round(degradationRate * 100) / 100,
    };
  }

  private computeRatePerMonth(series: HistoricalSeries): number {
    const points = series.dataPoints;
    if (points.length < 2) return 0;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const durationMonths = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24 * 30);
    if (durationMonths === 0) return 0;
    return (last.value - first.value) / durationMonths;
  }
}
