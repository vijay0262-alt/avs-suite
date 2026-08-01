/**
 * PredictionValidator — validates predictions against historical data
 * and configuration constraints.
 *
 * Prevents false positives and hallucinated forecasts.
 * Only allows predictions that are:
 *   - Based on sufficient data
 *   - Statistically significant
 *   - Within configured horizon
 *   - Above minimum confidence
 */
import type {
  Prediction,
  HistoricalSeries,
  TrendAnalysis,
  PredictionConfiguration,
} from './types';

export class PredictionValidator {
  constructor(private config: PredictionConfiguration) {}

  validate(
    prediction: Prediction,
    series: HistoricalSeries,
    trend: TrendAnalysis,
  ): { valid: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (series.pointCount < this.config.minDataPoints) {
      reasons.push(`Insufficient data: ${series.pointCount} points (minimum ${this.config.minDataPoints})`);
    }

    if (!trend.isStatisticallySignificant) {
      reasons.push(`Trend is not statistically significant (R² = ${trend.rSquared.toFixed(3)}, threshold ${this.config.regressionThreshold})`);
    }

    if (prediction.confidence < this.config.minConfidence) {
      reasons.push(`Confidence ${prediction.confidence.toFixed(2)} below minimum ${this.config.minConfidence}`);
    }

    if (prediction.projectionHorizonDays > this.config.maxPredictionHorizonDays) {
      reasons.push(`Horizon ${prediction.projectionHorizonDays} days exceeds maximum ${this.config.maxPredictionHorizonDays}`);
    }

    if (prediction.behavior === 'unknown') {
      reasons.push('Trend behavior is unknown — cannot make reliable prediction');
    }

    if (prediction.behavior === 'stable') {
      reasons.push('Trend is stable — no meaningful prediction to make');
    }

    return {
      valid: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Check if a prediction is a false positive.
   * A prediction is considered a false positive if:
   *   - The trend is very weak (R² < 0.3)
   *   - The data is very noisy (high coefficient of variation)
   *   - The projected change is within normal variance
   */
  isFalsePositive(
    series: HistoricalSeries,
    trend: TrendAnalysis,
  ): boolean {
    if (trend.rSquared < 0.3) return true;

    const values = series.dataPoints.map((p) => p.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return false;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const cv = Math.sqrt(variance) / Math.abs(mean);

    if (cv > 0.5) return true;

    if (trend.projectedValue !== null && mean !== 0) {
      const projectedChange = Math.abs(trend.projectedValue - trend.lastValue) / Math.abs(mean);
      if (projectedChange < 0.05) return true;
    }

    return false;
  }

  /**
   * Check if a prediction should generate a notification.
   */
  shouldNotify(prediction: Prediction): boolean {
    if (prediction.actionability === 'informational') return false;
    if (prediction.confidence < this.config.notificationMinConfidence) return false;

    const order = ['none', 'low', 'moderate', 'high', 'severe'] as const;
    const minIndex = order.indexOf(this.config.notificationMinRisk);
    const riskIndex = order.indexOf(prediction.risk);
    return riskIndex >= minIndex;
  }
}
