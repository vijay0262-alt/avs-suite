/**
 * StorageForecast — forecasts storage capacity and free space.
 *
 * Consumes storage data from the TrendRepository.
 * Projects free space depletion and estimates time to critical threshold.
 */
import type {
  StorageForecast as StorageForecastResult,
  HistoricalSeries,
  PredictionConfiguration,
} from './types';
import { ForecastEngine } from './ForecastEngine';

export class StorageForecastEngine {
  private forecastEngine: ForecastEngine;

  constructor(private config: PredictionConfiguration) {
    this.forecastEngine = new ForecastEngine(config);
  }

  generate(series: HistoricalSeries[]): StorageForecastResult | null {
    const storageSeries = series.filter((s) => s.domain === 'storage');
    if (storageSeries.length === 0) return null;

    const base = this.forecastEngine.forecast('storage', storageSeries, 'Storage Forecast');

    const freeSpaceSeries = storageSeries.filter((s) => s.metric.startsWith('free_space:'));
    const drivesAtRisk: string[] = [];
    let totalGrowthRate = 0;
    let minProjectedFreeSpace = Infinity;

    for (const s of freeSpaceSeries) {
      const drive = s.metric.split(':')[1] ?? 'unknown';
      const lastValue = s.dataPoints[s.dataPoints.length - 1]?.value ?? 0;
      const totalCapacity = s.dataPoints[s.dataPoints.length - 1]?.metadata?.totalCapacity as number ?? 0;

      if (totalCapacity > 0) {
        const freePercent = (lastValue / totalCapacity) * 100;
        if (freePercent <= this.config.storageCriticalThresholdPercent) {
          drivesAtRisk.push(drive);
        }
      }

      const growthRate = this.computeGrowthRate(s);
      totalGrowthRate += Math.max(0, growthRate);

      const projected = this.projectFreeSpace(s, 90);
      if (projected !== null && projected < minProjectedFreeSpace) {
        minProjectedFreeSpace = projected;
      }
    }

    const projectedFreeSpaceMB = minProjectedFreeSpace === Infinity ? 0 : minProjectedFreeSpace;
    const growthRateMBPerDay = totalGrowthRate / Math.max(1, freeSpaceSeries.length);

    let estimatedTimeToFull: number | null = null;
    if (growthRateMBPerDay > 0 && projectedFreeSpaceMB > 0) {
      estimatedTimeToFull = Math.round(projectedFreeSpaceMB / growthRateMBPerDay);
    }

    return {
      ...base,
      domain: 'storage',
      projectedFreeSpaceMB: Math.round(projectedFreeSpaceMB),
      estimatedTimeToFull,
      growthRateMBPerDay: Math.round(growthRateMBPerDay * 100) / 100,
      drivesAtRisk,
    };
  }

  private computeGrowthRate(series: HistoricalSeries): number {
    const points = series.dataPoints;
    if (points.length < 2) return 0;

    const first = points[0]!;
    const last = points[points.length - 1]!;
    const durationDays = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24);
    if (durationDays === 0) return 0;

    const usedSpaceChange = first.value - last.value;
    return usedSpaceChange / durationDays;
  }

  private projectFreeSpace(series: HistoricalSeries, horizonDays: number): number | null {
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
    if (denom === 0) return points[points.length - 1]!.value;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const targetTs = Date.now() + horizonDays * 24 * 60 * 60 * 1000;
    return Math.max(0, intercept + slope * targetTs);
  }
}
