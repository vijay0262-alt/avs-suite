/**
 * TrendRepository — stores and retrieves historical data series
 * for the predictive health engine.
 *
 * Acts as the central data store. Never queries hardware directly.
 * All data is provided by existing modules via TrendCollector.
 */
import type { HistoricalDataPoint, HistoricalSeries, ForecastDomain } from './types';

export class TrendRepository {
  private series = new Map<string, HistoricalDataPoint[]>();
  private maxPointsPerSeries: number;

  constructor(maxPointsPerSeries = 1000) {
    this.maxPointsPerSeries = maxPointsPerSeries;
  }

  record(point: HistoricalDataPoint): void {
    const key = `${point.domain}:${point.metric}`;
    const points = this.series.get(key) ?? [];
    points.push(point);
    if (points.length > this.maxPointsPerSeries) {
      points.shift();
    }
    this.series.set(key, points);
  }

  recordMany(points: HistoricalDataPoint[]): void {
    for (const point of points) {
      this.record(point);
    }
  }

  getSeries(domain: ForecastDomain, metric: string): HistoricalSeries | null {
    const key = `${domain}:${metric}`;
    const points = this.series.get(key);
    if (!points || points.length === 0) return null;

    return {
      domain,
      metric,
      unit: points[points.length - 1]!.unit,
      source: points[0]!.source,
      dataPoints: [...points],
      firstTimestamp: points[0]!.timestamp,
      lastTimestamp: points[points.length - 1]!.timestamp,
      duration: points[points.length - 1]!.timestamp - points[0]!.timestamp,
      pointCount: points.length,
    };
  }

  getAllSeries(): HistoricalSeries[] {
    const result: HistoricalSeries[] = [];
    for (const key of this.series.keys()) {
      const [domain, ...metricParts] = key.split(':');
      const metric = metricParts.join(':');
      const series = this.getSeries(domain as ForecastDomain, metric);
      if (series) result.push(series);
    }
    return result;
  }

  getSeriesByDomain(domain: ForecastDomain): HistoricalSeries[] {
    return this.getAllSeries().filter((s) => s.domain === domain);
  }

  getPointCount(domain: ForecastDomain, metric: string): number {
    const key = `${domain}:${metric}`;
    return this.series.get(key)?.length ?? 0;
  }

  clear(): void {
    this.series.clear();
  }

  size(): number {
    return this.series.size;
  }
}
