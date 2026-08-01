/**
 * PredictionModel — core statistical model for trend analysis
 * and value projection.
 *
 * Uses linear regression to compute trend slope, R², and project
 * future values. Also classifies trend behavior.
 *
 * Never invents data. Only works with provided historical series.
 */
import type {
  HistoricalSeries,
  TrendAnalysis,
  TrendBehavior,
  ForecastDomain,
} from './types';

export class PredictionModel {
  /**
   * Analyze a historical series and produce a trend analysis.
   */
  analyzeTrend(series: HistoricalSeries, regressionThreshold: number): TrendAnalysis {
    const points = series.dataPoints;
    if (points.length < 2) {
      return {
        domain: series.domain,
        metric: series.metric,
        behavior: 'unknown',
        slope: 0,
        slopeUnit: `${series.unit}/day`,
        rSquared: 0,
        changePercent: 0,
        duration: series.duration,
        dataPointCount: points.length,
        firstValue: points[0]?.value ?? 0,
        lastValue: points[points.length - 1]?.value ?? 0,
        projectedValue: null,
        projectionTimestamp: null,
        isStatisticallySignificant: false,
      };
    }

    const regression = this.linearRegression(points.map((p) => [p.timestamp, p.value]));
    const slope = regression.slope;
    const rSquared = regression.rSquared;

    const first = points[0]!;
    const last = points[points.length - 1]!;
    const changePercent = first.value !== 0
      ? ((last.value - first.value) / Math.abs(first.value)) * 100
      : 0;

    const durationDays = series.duration / (1000 * 60 * 60 * 24);
    const slopePerDay = durationDays > 0 ? slope * (1000 * 60 * 60 * 24) : 0;

    const behavior = this.classifyBehavior(series, slopePerDay, changePercent, rSquared);

    return {
      domain: series.domain,
      metric: series.metric,
      behavior,
      slope: slopePerDay,
      slopeUnit: `${series.unit}/day`,
      rSquared,
      changePercent,
      duration: series.duration,
      dataPointCount: points.length,
      firstValue: first.value,
      lastValue: last.value,
      projectedValue: null,
      projectionTimestamp: null,
      isStatisticallySignificant: rSquared >= regressionThreshold,
    };
  }

  /**
   * Project a future value at the given timestamp.
   */
  projectValue(
    series: HistoricalSeries,
    trend: TrendAnalysis,
    targetTimestamp: number,
  ): number {
    const points = series.dataPoints;
    if (points.length < 2) return points[points.length - 1]?.value ?? 0;

    const regression = this.linearRegression(points.map((p) => [p.timestamp, p.value]));
    const projected = regression.intercept + regression.slope * targetTimestamp;
    return projected;
  }

  /**
   * Estimate time until a threshold is reached.
   * Returns timestamp when the value crosses the threshold, or null.
   */
  estimateTimeToThreshold(
    series: HistoricalSeries,
    threshold: number,
    direction: 'below' | 'above',
  ): number | null {
    const points = series.dataPoints;
    if (points.length < 2) return null;

    const regression = this.linearRegression(points.map((p) => [p.timestamp, p.value]));

    if (regression.slope === 0) return null;

    const targetTimestamp = (threshold - regression.intercept) / regression.slope;
    if (targetTimestamp <= Date.now()) return null;

    const projected = regression.intercept + regression.slope * targetTimestamp;
    if (direction === 'below' && projected > threshold) return null;
    if (direction === 'above' && projected < threshold) return null;

    return targetTimestamp;
  }

  /**
   * Linear regression on [x, y] pairs.
   * Returns slope, intercept, and R².
   */
  private linearRegression(data: [number, number][]): {
    slope: number;
    intercept: number;
    rSquared: number;
  } {
    const n = data.length;
    if (n < 2) return { slope: 0, intercept: data[0]?.[1] ?? 0, rSquared: 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const [x, y] of data) {
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return { slope: 0, intercept: sumY / n, rSquared: 0 };

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    const meanY = sumY / n;
    let ssRes = 0, ssTot = 0;
    for (const [x, y] of data) {
      const predicted = intercept + slope * x;
      ssRes += (y - predicted) ** 2;
      ssTot += (y - meanY) ** 2;
    }

    const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

    return { slope, intercept, rSquared };
  }

  /**
   * Classify trend behavior based on slope, change percent, and R².
   */
  private classifyBehavior(
    series: HistoricalSeries,
    slopePerDay: number,
    changePercent: number,
    rSquared: number,
  ): TrendBehavior {
    if (rSquared < 0.3) return 'unknown';

    const absChange = Math.abs(changePercent);
    if (absChange < 3) return 'stable';

    const isDegrading = this.isDegrading(series.domain, series.metric, slopePerDay);

    if (isDegrading) {
      if (absChange > 20) return 'rapid_degradation';
      if (absChange > 5) return 'gradual_degradation';
    } else {
      if (absChange > 5) return 'improving';
    }

    return 'stable';
  }

  /**
   * Determine if a slope represents degradation for the given domain/metric.
   */
  private isDegrading(domain: ForecastDomain, metric: string, slopePerDay: number): boolean {
    const lowerIsBetter = [
      'temperatureC', 'powerDrawW', 'usedMB', 'memoryPressure',
      'wearPercent', 'utilization', 'startup_time', 'startupTime',
    ];

    const higherIsBetter = [
      'health_score', 'healthScore', 'healthPercent', 'free_space',
      'freeSpaceMB', 'chargePercent',
    ];

    if (higherIsBetter.some((m) => metric.includes(m))) {
      return slopePerDay < 0;
    }

    if (lowerIsBetter.some((m) => metric.includes(m))) {
      return slopePerDay > 0;
    }

    return slopePerDay < 0;
  }
}
