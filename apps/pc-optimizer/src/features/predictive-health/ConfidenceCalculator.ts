/**
 * ConfidenceCalculator — computes confidence scores for predictions
 * based on statistical properties of the underlying data.
 *
 * Factors:
 *   - Number of historical samples
 *   - Trend strength (R² of linear regression)
 *   - Data recency
 *   - Prediction horizon (longer = less confident)
 *   - Data consistency (variance of residuals)
 */
import type { HistoricalSeries, TrendAnalysis } from './types';

export class ConfidenceCalculator {
  /**
   * Calculate confidence for a prediction based on trend analysis
   * and prediction horizon.
   */
  calculate(
    series: HistoricalSeries,
    trend: TrendAnalysis,
    horizonDays: number,
  ): number {
    const sampleScore = this.sampleScore(series.pointCount);
    const strengthScore = trend.rSquared;
    const recencyScore = this.recencyScore(series);
    const horizonScore = this.horizonScore(horizonDays);
    const consistencyScore = this.consistencyScore(series, trend);

    const confidence =
      sampleScore * 0.25 +
      strengthScore * 0.30 +
      recencyScore * 0.15 +
      horizonScore * 0.15 +
      consistencyScore * 0.15;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Score based on number of data points.
   * More points = higher confidence, with diminishing returns.
   */
  private sampleScore(count: number): number {
    if (count < 3) return 0.1;
    if (count < 5) return 0.3;
    if (count < 10) return 0.5;
    if (count < 20) return 0.7;
    if (count < 50) return 0.85;
    return 0.95;
  }

  /**
   * Score based on how recent the latest data point is.
   * Stale data reduces confidence.
   */
  private recencyScore(series: HistoricalSeries): number {
    const now = Date.now();
    const ageMs = now - series.lastTimestamp;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 1) return 1.0;
    if (ageDays < 7) return 0.9;
    if (ageDays < 30) return 0.7;
    if (ageDays < 90) return 0.5;
    return 0.3;
  }

  /**
   * Score based on prediction horizon.
   * Shorter predictions = higher confidence.
   */
  private horizonScore(horizonDays: number): number {
    if (horizonDays <= 7) return 0.95;
    if (horizonDays <= 30) return 0.85;
    if (horizonDays <= 90) return 0.7;
    if (horizonDays <= 180) return 0.55;
    if (horizonDays <= 365) return 0.4;
    return 0.2;
  }

  /**
   * Score based on consistency of data around the trend line.
   * Lower residual variance = higher confidence.
   */
  private consistencyScore(series: HistoricalSeries, _trend: TrendAnalysis): number {
    if (series.pointCount < 3) return 0.3;

    const values = series.dataPoints.map((p) => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    if (mean === 0) return 0.5;
    const cv = stdDev / Math.abs(mean);

    if (cv < 0.05) return 0.95;
    if (cv < 0.1) return 0.85;
    if (cv < 0.2) return 0.7;
    if (cv < 0.3) return 0.5;
    return 0.3;
  }

  /**
   * Calculate uncertainty range for a prediction.
   * Returns the +/- range around the projected value.
   */
  calculateUncertainty(
    series: HistoricalSeries,
    trend: TrendAnalysis,
    horizonDays: number,
  ): number {
    if (series.pointCount < 3) return Math.abs(trend.projectedValue ?? 0) * 0.5;

    const values = series.dataPoints.map((p) => p.value);
    const variance = values.reduce((a, b) => a + (b - values.reduce((x, y) => x + y, 0) / values.length) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const horizonFactor = Math.sqrt(horizonDays / 30);
    return stdDev * horizonFactor * (1 - trend.rSquared);
  }
}
