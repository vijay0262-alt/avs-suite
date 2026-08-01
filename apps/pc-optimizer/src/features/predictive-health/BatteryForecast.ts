/**
 * BatteryForecast — forecasts battery health and wear.
 *
 * Consumes battery wear data from the TrendRepository.
 * Projects battery health decline and estimates time to replacement.
 */
import type {
  BatteryForecast as BatteryForecastResult,
  HistoricalSeries,
  PredictionConfiguration,
} from './types';
import { ForecastEngine } from './ForecastEngine';

export class BatteryForecastEngine {
  private forecastEngine: ForecastEngine;

  constructor(private config: PredictionConfiguration) {
    this.forecastEngine = new ForecastEngine(config);
  }

  generate(series: HistoricalSeries[]): BatteryForecastResult | null {
    const batterySeries = series.filter((s) => s.domain === 'battery');
    if (batterySeries.length === 0) return null;

    const base = this.forecastEngine.forecast('battery', batterySeries, 'Battery Health Forecast');

    const wearSeries = batterySeries.find((s) => s.metric === 'wearPercent');
    const chargeSeries = batterySeries.find((s) => s.metric === 'chargePercent');

    const lastWear = wearSeries?.dataPoints[wearSeries.dataPoints.length - 1]?.value ?? 0;
    const projectedHealthPercent = Math.max(0, 100 - lastWear);

    const wearRatePerMonth = this.computeWearRatePerMonth(wearSeries);

    let estimatedTimeToReplacement: number | null = null;
    if (wearRatePerMonth > 0) {
      const threshold = 100 - this.config.batteryReplacementThresholdPercent;
      const remainingWear = threshold - lastWear;
      if (remainingWear > 0) {
        estimatedTimeToReplacement = Math.round(remainingWear / wearRatePerMonth);
      }
    }

    const currentCycleEstimate = chargeSeries ? this.estimateCycles(chargeSeries) : null;

    return {
      ...base,
      domain: 'battery',
      projectedHealthPercent: Math.round(projectedHealthPercent),
      estimatedTimeToReplacement,
      wearRatePerMonth: Math.round(wearRatePerMonth * 100) / 100,
      currentCycleEstimate,
    };
  }

  private computeWearRatePerMonth(series?: HistoricalSeries): number {
    if (!series || series.dataPoints.length < 2) return 0;
    const points = series.dataPoints;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const durationMonths = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24 * 30);
    if (durationMonths === 0) return 0;
    return (last.value - first.value) / durationMonths;
  }

  private estimateCycles(series: HistoricalSeries): number | null {
    if (series.dataPoints.length < 2) return null;
    let cycles = 0;
    let prev = series.dataPoints[0]!.value;
    let direction: 'up' | 'down' | null = null;
    for (let i = 1; i < series.dataPoints.length; i++) {
      const current = series.dataPoints[i]!.value;
      const newDir: 'up' | 'down' | null = current > prev ? 'up' : current < prev ? 'down' : direction;
      if (direction && newDir && direction !== newDir) {
        cycles += 0.5;
      }
      if (newDir) direction = newDir;
      prev = current;
    }
    return Math.round(cycles);
  }
}
