/**
 * PredictionDashboardProvider — builds dashboard summary data for the
 * Predictive Health UI.
 *
 * Shows upcoming risks, improving trends, system trajectory,
 * and domain-specific forecasts.
 */
import type {
  Prediction,
  PredictionDashboardData,
  PredictionDashboardSummary,
  PredictionDashboardEntry,
  TrajectoryPoint,
  HealthForecast,
  StorageForecast,
  BatteryForecast,
  PerformanceForecast,
  TrendBehavior,
  PredictionRisk,
} from './types';
import type { PredictionHistory } from './PredictionHistory';

export class PredictionDashboardProvider {
  build(
    predictions: Prediction[],
    healthForecast: HealthForecast | null,
    storageForecast: StorageForecast | null,
    batteryForecast: BatteryForecast | null,
    performanceForecast: PerformanceForecast | null,
    history: PredictionHistory,
    healthScoreHistory: { timestamp: number; healthScore: number }[],
  ): PredictionDashboardData {
    const summary = this.buildSummary(predictions, healthForecast);
    const upcomingRisks = this.buildUpcomingRisks(predictions);
    const improvingTrends = this.buildImprovingTrends(predictions);
    const systemTrajectory = this.buildTrajectory(healthForecast, healthScoreHistory);

    return {
      summary,
      upcomingRisks,
      improvingTrends,
      systemTrajectory,
      healthForecast,
      storageForecast,
      batteryForecast,
      performanceForecast,
      lastPredictionAt: predictions.length > 0
        ? Math.max(...predictions.map((p) => p.createdAt))
        : null,
    };
  }

  private buildSummary(predictions: Prediction[], healthForecast: HealthForecast | null): PredictionDashboardSummary {
    const highRisk = predictions.filter((p) => p.risk === 'high' || p.risk === 'severe');
    const improving = predictions.filter((p) => p.behavior === 'improving');
    const degrading = predictions.filter((p) =>
      p.behavior === 'gradual_degradation' || p.behavior === 'rapid_degradation'
    );
    const avgConfidence = predictions.length > 0
      ? predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length
      : 0;

    const trajectory: TrendBehavior = healthForecast?.healthScoreTrend ?? 'stable';

    let nextAction: string | null = null;
    if (highRisk.length > 0) {
      nextAction = highRisk[0]!.recommendation?.action ?? highRisk[0]!.title;
    }

    return {
      totalPredictions: predictions.length,
      highRiskPredictions: highRisk.length,
      improvingTrendCount: improving.length,
      degradingTrendCount: degrading.length,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      systemTrajectory: trajectory,
      nextActionNeeded: nextAction,
    };
  }

  private buildUpcomingRisks(predictions: Prediction[]): PredictionDashboardEntry[] {
    return predictions
      .filter((p) => p.risk !== 'none' && p.risk !== 'low')
      .sort((a, b) => {
        const scores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
        return scores[b.risk] - scores[a.risk];
      })
      .slice(0, 10)
      .map((p) => this.toEntry(p));
  }

  private buildImprovingTrends(predictions: Prediction[]): PredictionDashboardEntry[] {
    return predictions
      .filter((p) => p.behavior === 'improving')
      .slice(0, 10)
      .map((p) => this.toEntry(p));
  }

  private buildTrajectory(
    healthForecast: HealthForecast | null,
    healthScoreHistory: { timestamp: number; healthScore: number }[],
  ): TrajectoryPoint[] {
    const points: TrajectoryPoint[] = healthScoreHistory.map((p) => ({
      timestamp: p.timestamp,
      healthScore: p.healthScore,
      projected: false,
    }));

    if (healthForecast && healthForecast.estimatedTimeToThreshold !== null) {
      points.push({
        timestamp: Date.now() + healthForecast.estimatedTimeToThreshold * 24 * 60 * 60 * 1000,
        healthScore: healthForecast.thresholdValue,
        projected: true,
      });
    }

    return points.slice(-20);
  }

  private toEntry(p: Prediction): PredictionDashboardEntry {
    const timeToEvent = p.projectionHorizonDays > 0
      ? `${p.projectionHorizonDays} days`
      : null;

    return {
      id: p.id,
      title: p.title,
      domain: p.domain,
      behavior: p.behavior,
      risk: p.risk,
      confidence: p.confidence,
      summary: p.summary,
      projectedValue: `${p.projectedValue.toFixed(1)}${p.projectedValueUnit}`,
      timeToEvent,
      urgency: p.urgency,
    };
  }
}
