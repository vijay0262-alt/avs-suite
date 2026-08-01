/**
 * ForecastEngine — orchestrates trend analysis, prediction generation,
 * and forecast assembly.
 *
 * Consumes data from TrendRepository, uses PredictionModel for analysis,
 * ConfidenceCalculator for scoring, and PredictionValidator for validation.
 *
 * Produces Forecast objects containing validated predictions.
 */
import type {
  Forecast,
  Prediction,
  HistoricalSeries,
  TrendAnalysis,
  PredictionConfiguration,
  ForecastDomain,
  PredictionEvidence,
  PredictionRisk,
  TrendBehavior,
} from './types';
import { confidenceToLabel, scoreToRisk, urgencyFromRisk } from './types';
import { PredictionModel } from './PredictionModel';
import { ConfidenceCalculator } from './ConfidenceCalculator';
import { PredictionValidator } from './PredictionValidator';

export class ForecastEngine {
  private model: PredictionModel;
  private confidenceCalc: ConfidenceCalculator;
  private validator: PredictionValidator;

  constructor(private config: PredictionConfiguration) {
    this.model = new PredictionModel();
    this.confidenceCalc = new ConfidenceCalculator();
    this.validator = new PredictionValidator(config);
  }

  /**
   * Generate a forecast for a specific domain.
   */
  forecast(
    domain: ForecastDomain,
    series: HistoricalSeries[],
    title: string,
  ): Forecast {
    const predictions: Prediction[] = [];
    const dataSources = new Set<string>();

    for (const s of series) {
      dataSources.add(s.source);

      const trend = this.model.analyzeTrend(s, this.config.regressionThreshold);
      if (trend.behavior === 'stable' || trend.behavior === 'unknown') continue;

      const prediction = this.createPrediction(domain, s, trend);
      if (!prediction) continue;

      const validation = this.validator.validate(prediction, s, trend);
      if (!validation.valid) continue;

      if (this.validator.isFalsePositive(s, trend)) continue;

      predictions.push(prediction);
    }

    const sorted = predictions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxPredictions);

    const overallConfidence = sorted.length > 0
      ? sorted.reduce((a, b) => a + b.confidence, 0) / sorted.length
      : 0;

    const overallRisk = this.computeOverallRisk(sorted);
    const overallTrend = this.computeOverallTrend(sorted);

    const now = Date.now();
    return {
      id: `forecast-${domain}-${now}`,
      domain,
      title,
      predictions: sorted,
      overallTrend,
      overallConfidence,
      overallRisk,
      generatedAt: now,
      validUntil: now + 24 * 60 * 60 * 1000,
      dataSources: Array.from(dataSources),
    };
  }

  private createPrediction(
    domain: ForecastDomain,
    series: HistoricalSeries,
    trend: TrendAnalysis,
  ): Prediction | null {
    const horizonDays = this.estimateHorizon(trend);
    if (horizonDays <= 0 || horizonDays > this.config.maxPredictionHorizonDays) return null;

    const projectionTimestamp = Date.now() + horizonDays * 24 * 60 * 60 * 1000;
    const projectedValue = this.model.projectValue(series, trend, projectionTimestamp);

    const confidence = this.confidenceCalc.calculate(series, trend, horizonDays);
    const uncertainty = this.confidenceCalc.calculateUncertainty(series, trend, horizonDays);

    const risk = this.assessRisk(domain, trend, projectedValue, series);
    const evidence = this.buildEvidence(series, trend);

    const now = Date.now();
    return {
      id: `pred-${domain}-${series.metric}-${now}`,
      domain,
      title: this.buildTitle(domain, series.metric, trend),
      summary: this.buildSummary(domain, series, trend, projectedValue, horizonDays),
      description: this.buildDescription(domain, series, trend, projectedValue, horizonDays),
      behavior: trend.behavior,
      currentValue: trend.lastValue,
      currentValueUnit: series.unit,
      projectedValue,
      projectedValueUnit: series.unit,
      projectionTimestamp,
      projectionHorizonDays: horizonDays,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk,
      urgency: urgencyFromRisk(risk),
      actionability: this.assessActionability(risk, trend.behavior),
      evidence,
      historicalSamples: series.pointCount,
      trendStrength: trend.rSquared,
      uncertainty,
      recommendation: null,
      explanation: null,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    };
  }

  private estimateHorizon(trend: TrendAnalysis): number {
    if (trend.behavior === 'rapid_degradation') return 30;
    if (trend.behavior === 'gradual_degradation') return 90;
    if (trend.behavior === 'improving') return 60;
    return 30;
  }

  private assessRisk(
    domain: ForecastDomain,
    trend: TrendAnalysis,
    projectedValue: number,
    series: HistoricalSeries,
  ): PredictionRisk {
    let riskScore = 0;

    if (trend.behavior === 'rapid_degradation') riskScore += 40;
    else if (trend.behavior === 'gradual_degradation') riskScore += 20;
    else if (trend.behavior === 'improving') riskScore -= 10;

    riskScore += trend.rSquared * 20;

    const changePercent = Math.abs(trend.changePercent);
    if (changePercent > 30) riskScore += 20;
    else if (changePercent > 10) riskScore += 10;

    if (domain === 'storage' && series.metric.includes('free_space')) {
      if (projectedValue < 10000) riskScore += 30;
      else if (projectedValue < 50000) riskScore += 15;
    }
    if (domain === 'battery' && projectedValue < 80) riskScore += 25;
    if (domain === 'thermal' && projectedValue > 85) riskScore += 30;
    if (domain === 'memory_pressure' && projectedValue > 90) riskScore += 25;
    if (domain === 'system_health' && projectedValue < 50) riskScore += 30;

    return scoreToRisk(Math.max(0, Math.min(100, riskScore)));
  }

  private assessActionability(risk: PredictionRisk, behavior: TrendBehavior): 'actionable' | 'informational' | 'monitoring_only' {
    if (risk === 'high' || risk === 'severe') return 'actionable';
    if (risk === 'moderate') return 'actionable';
    if (behavior === 'improving') return 'informational';
    return 'monitoring_only';
  }

  private buildEvidence(series: HistoricalSeries, trend: TrendAnalysis): PredictionEvidence[] {
    const evidence: PredictionEvidence[] = [];
    const recent = series.dataPoints.slice(-5);
    for (const point of recent) {
      evidence.push({
        source: point.source,
        metric: series.metric,
        value: String(point.value),
        unit: point.unit,
        timestamp: point.timestamp,
        description: `Historical reading: ${point.value}${point.unit}`,
      });
    }
    evidence.push({
      source: 'predictive-health',
      metric: series.metric,
      value: trend.slope.toFixed(4),
      unit: trend.slopeUnit,
      timestamp: Date.now(),
      description: `Trend slope: ${trend.slope.toFixed(4)} ${trend.slopeUnit} (R²=${trend.rSquared.toFixed(3)})`,
    });
    return evidence;
  }

  private buildTitle(domain: ForecastDomain, metric: string, trend: TrendAnalysis): string {
    const domainLabel = domain.replace(/_/g, ' ');
    const metricLabel = metric.replace(/_/g, ' ');
    if (trend.behavior === 'rapid_degradation') return `Rapid degradation detected: ${domainLabel} ${metricLabel}`;
    if (trend.behavior === 'gradual_degradation') return `Gradual degradation: ${domainLabel} ${metricLabel}`;
    if (trend.behavior === 'improving') return `Improving trend: ${domainLabel} ${metricLabel}`;
    return `${domainLabel} ${metricLabel} trend`;
  }

  private buildSummary(
    _domain: ForecastDomain,
    series: HistoricalSeries,
    trend: TrendAnalysis,
    projectedValue: number,
    horizonDays: number,
  ): string {
    const direction = trend.slope > 0 ? 'increasing' : 'decreasing';
    return `${series.metric.replace(/_/g, ' ')} is ${direction} at ${Math.abs(trend.slope).toFixed(2)} ${trend.slopeUnit}. ` +
      `Projected to reach ${projectedValue.toFixed(1)}${series.unit} within ${horizonDays} days. ` +
      `Based on ${series.pointCount} data points over ${(series.duration / (1000 * 60 * 60 * 24)).toFixed(0)} days.`;
  }

  private buildDescription(
    domain: ForecastDomain,
    series: HistoricalSeries,
    trend: TrendAnalysis,
    projectedValue: number,
    horizonDays: number,
  ): string {
    return this.buildSummary(domain, series, trend, projectedValue, horizonDays) +
      ` Trend strength: R²=${trend.rSquared.toFixed(3)}. ` +
      `Change over observation period: ${trend.changePercent.toFixed(1)}%.`;
  }

  private computeOverallRisk(predictions: Prediction[]): PredictionRisk {
    if (predictions.length === 0) return 'none';
    const maxRisk = predictions.reduce((max, p) => {
      const scores = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
      return scores[p.risk] > scores[max] ? p.risk : max;
    }, 'none' as PredictionRisk);
    return maxRisk;
  }

  private computeOverallTrend(predictions: Prediction[]): TrendBehavior {
    if (predictions.length === 0) return 'stable';
    const behaviors = predictions.map((p) => p.behavior);
    if (behaviors.includes('rapid_degradation')) return 'rapid_degradation';
    if (behaviors.includes('gradual_degradation')) return 'gradual_degradation';
    if (behaviors.includes('improving')) return 'improving';
    return 'stable';
  }
}
