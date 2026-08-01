/**
 * MemoryForecast — forecasts memory pressure and usage trends.
 *
 * Consumes memory data from the TrendRepository.
 * Projects memory usage and assesses exhaustion risk.
 */
import type {
  MemoryForecast as MemoryForecastResult,
  HistoricalSeries,
  PredictionConfiguration,
  PredictionRisk,
} from './types';
import { scoreToRisk } from './types';
import { ForecastEngine } from './ForecastEngine';

export class MemoryForecastEngine {
  private forecastEngine: ForecastEngine;

  constructor(private config: PredictionConfiguration) {
    this.forecastEngine = new ForecastEngine(config);
  }

  generate(series: HistoricalSeries[]): MemoryForecastResult | null {
    const memorySeries = series.filter((s) => s.domain === 'memory_pressure');
    if (memorySeries.length === 0) return null;

    const base = this.forecastEngine.forecast('memory_pressure', memorySeries, 'Memory Pressure Forecast');

    const usageSeries = memorySeries.find((s) => s.metric === 'usedMB');
    const pressureSeries = memorySeries.find((s) => s.metric === 'memoryPressure');

    const lastUsage = usageSeries?.dataPoints[usageSeries.dataPoints.length - 1]?.value ?? 0;
    const lastPressure = pressureSeries?.dataPoints[pressureSeries.dataPoints.length - 1]?.value ?? 0;

    const pressureIncreaseRatePerMonth = this.computeRatePerMonth(pressureSeries);
    const usageIncreaseRatePerMonth = this.computeRatePerMonth(usageSeries);

    const projectedUsageMB = lastUsage + usageIncreaseRatePerMonth * 6 * 30;
    const projectedPressurePercent = Math.min(100, lastPressure + pressureIncreaseRatePerMonth * 6);

    let exhaustionRiskScore = 0;
    if (projectedPressurePercent > this.config.memoryExhaustionThresholdPercent) exhaustionRiskScore += 50;
    else if (projectedPressurePercent > this.config.memoryExhaustionThresholdPercent - 10) exhaustionRiskScore += 25;
    if (pressureIncreaseRatePerMonth > 2) exhaustionRiskScore += 20;
    if (base.overallTrend === 'rapid_degradation') exhaustionRiskScore += 20;

    const exhaustionRisk: PredictionRisk = scoreToRisk(exhaustionRiskScore);

    return {
      ...base,
      domain: 'memory_pressure',
      projectedUsageMB: Math.round(projectedUsageMB),
      projectedPressurePercent: Math.round(projectedPressurePercent),
      pressureIncreaseRatePerMonth: Math.round(pressureIncreaseRatePerMonth * 100) / 100,
      exhaustionRisk,
    };
  }

  private computeRatePerMonth(series?: HistoricalSeries): number {
    if (!series || series.dataPoints.length < 2) return 0;
    const points = series.dataPoints;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const durationMonths = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24 * 30);
    if (durationMonths === 0) return 0;
    return (last.value - first.value) / durationMonths;
  }
}
