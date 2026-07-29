/**
 * Prediction Analyzer — trend analysis and projection.
 *
 * Performs linear regression on historical data points to determine
 * trend direction, slope, and confidence. Projects future values.
 *
 * Also detects seasonal patterns when enabled.
 *
 * NEVER fabricates data. Only analyzes what exists.
 */
import type {
  TrendDataPoint,
  TrendAnalysisResult,
  ProjectedValue,
  PredictionTrendType,
  TimeHorizon,
  PredictionConfiguration,
  KnowledgeTrend,
  KnowledgeFact,
} from './types';
import { getTimeHorizonHours, clampScore } from './types';

export class PredictionAnalyzer {
  private _config: PredictionConfiguration;

  constructor(config: PredictionConfiguration) {
    this._config = config;
  }

  updateConfig(config: PredictionConfiguration): void {
    this._config = config;
  }

  /**
   * Analyze a set of data points and return trend analysis.
   */
  analyzeDataPoints(
    factId: string,
    factName: string,
    dataPoints: TrendDataPoint[],
  ): TrendAnalysisResult | null {
    if (dataPoints.length < this._config.confidenceRules.minSamples) return null;

    const sorted = [...dataPoints].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const values = sorted.map((d) => d.value);
    const timestamps = sorted.map((d) => new Date(d.timestamp).getTime());

    const regression = this._linearRegression(timestamps, values);
    const direction = this._determineDirection(regression.slope, regression.rSquared);
    const confidence = this._calculateConfidence(sorted.length, regression.rSquared);

    return {
      factId,
      factName,
      direction,
      slope: regression.slope,
      intercept: regression.intercept,
      rSquared: regression.rSquared,
      variability: regression.variability,
      dataPoints: sorted,
      sampleCount: sorted.length,
      confidence,
      projectedValues: [],
    };
  }

  /**
   * Analyze a knowledge trend.
   */
  analyzeTrend(trend: KnowledgeTrend): TrendAnalysisResult | null {
    if (trend.dataPoints.length < this._config.confidenceRules.minSamples) return null;

    return this.analyzeDataPoints(trend.factId, trend.factName, trend.dataPoints);
  }

  /**
   * Project future values based on trend analysis.
   */
  projectValues(
    analysis: TrendAnalysisResult,
    horizons: TimeHorizon[],
  ): ProjectedValue[] {
    if (!analysis.slope || !analysis.intercept) return [];

    const projections: ProjectedValue[] = [];
    const lastTimestamp = analysis.dataPoints.length > 0
      ? new Date(analysis.dataPoints[analysis.dataPoints.length - 1]!.timestamp).getTime()
      : Date.now();

    const maxExtrapolationMs = this._config.modelSettings.maxExtrapolationDays * 24 * 60 * 60 * 1000;

    for (const horizon of horizons) {
      const hours = getTimeHorizonHours(horizon);
      if (hours === 0) continue;

      const futureMs = hours * 60 * 60 * 1000;
      if (futureMs > maxExtrapolationMs) continue;

      const projectedTimestamp = lastTimestamp + futureMs;
      const projectedValue = analysis.slope * projectedTimestamp + analysis.intercept;

      // Confidence decreases with distance
      const distanceFactor = 1 - (futureMs / maxExtrapolationMs) * 0.5;
      const projectedConfidence = clampScore(analysis.confidence * distanceFactor);

      projections.push({
        timestamp: new Date(projectedTimestamp).toISOString(),
        value: Math.max(0, projectedValue),
        confidence: projectedConfidence,
      });
    }

    return projections;
  }

  /**
   * Analyze a fact's historical values from snapshots.
   */
  analyzeFactFromSnapshots(
    fact: KnowledgeFact,
    snapshotValues: TrendDataPoint[],
  ): TrendAnalysisResult | null {
    if (typeof fact.value !== 'number') return null;
    if (snapshotValues.length < this._config.confidenceRules.minSamples) return null;

    return this.analyzeDataPoints(fact.id, fact.name, snapshotValues);
  }

  /**
   * Detect seasonal patterns in data.
   */
  detectSeasonality(dataPoints: TrendDataPoint[]): boolean {
    if (!this._config.modelSettings.seasonalDetectionEnabled) return false;
    if (dataPoints.length < 6) return false;

    const values = dataPoints.map((d) => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const deviations = values.map((v) => v - mean);

    // Check for alternating sign pattern (simple seasonality heuristic)
    let signChanges = 0;
    for (let i = 1; i < deviations.length; i++) {
      if (deviations[i]! * deviations[i - 1]! < 0) signChanges++;
    }

    // If sign changes are frequent relative to data length, likely seasonal
    return signChanges >= deviations.length * 0.4;
  }

  /**
   * Remove outliers from data points.
   */
  removeOutliers(dataPoints: TrendDataPoint[]): TrendDataPoint[] {
    if (!this._config.modelSettings.outlierRemovalEnabled) return dataPoints;
    if (dataPoints.length < 4) return dataPoints;

    const values = dataPoints.map((d) => d.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);

    if (stdDev === 0) return dataPoints;

    const threshold = 2 * stdDev;
    return dataPoints.filter((d) => Math.abs(d.value - mean) <= threshold);
  }

  // ── Private ────────────────────────────────────────────────

  private _linearRegression(
    timestamps: number[],
    values: number[],
  ): {
    slope: number;
    intercept: number;
    rSquared: number;
    variability: number;
  } {
    const n = timestamps.length;
    if (n < 2) return { slope: 0, intercept: 0, rSquared: 0, variability: 0 };

    const sumX = timestamps.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;

    let sumXY = 0;
    let sumXX = 0;
    let sumYY = 0;

    for (let i = 0; i < n; i++) {
      const dx = timestamps[i]! - meanX;
      const dy = values[i]! - meanY;
      sumXY += dx * dy;
      sumXX += dx * dx;
      sumYY += dy * dy;
    }

    const slope = sumXX !== 0 ? sumXY / sumXX : 0;
    const intercept = meanY - slope * meanX;
    const rSquared = sumXX !== 0 && sumYY !== 0 ? (sumXY * sumXY) / (sumXX * sumYY) : 0;
    const variability = Math.sqrt(sumYY / n);

    return { slope, intercept, rSquared, variability };
  }

  private _determineDirection(slope: number, rSquared: number | null): PredictionTrendType {
    if (Math.abs(slope) < 1e-9) return 'stable';
    if (rSquared !== null && rSquared < 0.1) return 'unknown';
    if (slope > 0) return 'increasing';
    if (slope < 0) return 'decreasing';
    return 'stable';
  }

  private _calculateConfidence(sampleCount: number, rSquared: number | null): number {
    const rules = this._config.confidenceRules;
    let confidence = 0;

    // Sample count factor
    if (sampleCount >= 10) confidence += 0.4;
    else if (sampleCount >= 5) confidence += 0.3;
    else if (sampleCount >= rules.minSamples) confidence += 0.2;

    // R-squared factor
    if (rSquared !== null) {
      confidence += rSquared * 0.5;
    }

    // Data freshness factor
    confidence += 0.1;

    return clampScore(confidence);
  }
}
