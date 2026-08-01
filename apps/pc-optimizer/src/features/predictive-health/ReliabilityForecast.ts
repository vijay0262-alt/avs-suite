/**
 * ReliabilityForecast — forecasts system reliability and failure risk.
 *
 * Aggregates predictions from all domains to assess overall reliability.
 * Identifies components at risk of failure.
 */
import type {
  ReliabilityForecast as ReliabilityForecastResult,
  FailureRiskAssessment,
  ComponentFailureRisk,
  HistoricalSeries,
  PredictionConfiguration,
  Prediction,
  PredictionRisk,
  ForecastDomain,
} from './types';
import { scoreToRisk } from './types';
import { ForecastEngine } from './ForecastEngine';

export class ReliabilityForecastEngine {
  private forecastEngine: ForecastEngine;

  constructor(private config: PredictionConfiguration) {
    this.forecastEngine = new ForecastEngine(config);
  }

  generate(series: HistoricalSeries[], allPredictions: Prediction[]): ReliabilityForecastResult | null {
    const reliabilitySeries = series.filter((s) => s.domain === 'reliability');
    const base = this.forecastEngine.forecast('reliability', reliabilitySeries, 'Reliability Forecast');

    const componentRisks = this.assessComponentRisks(allPredictions);
    const systemRiskFactors = this.collectRiskFactors(allPredictions);
    const mitigatingFactors = this.collectMitigatingFactors(allPredictions);
    const predictedFailureComponents = componentRisks
      .filter((c) => c.risk === 'high' || c.risk === 'severe')
      .map((c) => c.component);

    const overallRisk = this.computeOverallReliabilityRisk(componentRisks);
    const estimatedTimeToFailure = this.estimateTimeToFailure(componentRisks);
    const recommendedPreventiveActions = this.collectPreventiveActions(allPredictions);

    const failureRiskAssessment: FailureRiskAssessment = {
      overallRisk,
      componentRisks,
      systemRiskFactors,
      mitigatingFactors,
      estimatedTimeToFailure,
      recommendedPreventiveActions,
    };

    const projectedReliabilityScore = this.computeReliabilityScore(componentRisks);

    return {
      ...base,
      domain: 'reliability',
      projectedReliabilityScore: Math.round(projectedReliabilityScore),
      failureRiskAssessment,
      predictedFailureComponents,
    };
  }

  private assessComponentRisks(predictions: Prediction[]): ComponentFailureRisk[] {
    const byDomain = new Map<ForecastDomain, Prediction[]>();
    for (const p of predictions) {
      const existing = byDomain.get(p.domain) ?? [];
      existing.push(p);
      byDomain.set(p.domain, existing);
    }

    const risks: ComponentFailureRisk[] = [];
    for (const preds of byDomain.values()) {
      const worst = preds.reduce((max, p) => {
        const scores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
        return scores[p.risk] > scores[max.risk] ? p : max;
      }, preds[0]!);

      if (!worst) continue;

      const failureProbability = this.computeFailureProbability(worst);
      const timeToFailure = worst.projectionHorizonDays > 0
        ? `~${worst.projectionHorizonDays} days`
        : null;

      risks.push({
        component: this.domainToComponent(worst.domain),
        domain: worst.domain,
        risk: worst.risk,
        failureProbability,
        estimatedTimeToFailure: timeToFailure,
        primaryConcern: worst.title,
      });
    }

    return risks.sort((a, b) => {
      const scores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
      return scores[b.risk] - scores[a.risk];
    });
  }

  private computeFailureProbability(prediction: Prediction): number {
    const riskScores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
    const baseScore = riskScores[prediction.risk] / 100;
    const confidenceWeight = prediction.confidence;
    return Math.round(baseScore * confidenceWeight * 100) / 100;
  }

  private domainToComponent(domain: ForecastDomain): string {
    const labels: Record<ForecastDomain, string> = {
      cpu: 'CPU',
      gpu: 'GPU',
      ram: 'Memory',
      storage: 'Storage Drive',
      battery: 'Battery',
      cooling: 'Cooling System',
      system_health: 'System Health',
      startup_performance: 'Startup',
      memory_pressure: 'Memory',
      thermal: 'Thermal Management',
      optimization_effectiveness: 'Optimization',
      reliability: 'Overall System',
    };
    return labels[domain] ?? domain;
  }

  private collectRiskFactors(predictions: Prediction[]): string[] {
    const factors = new Set<string>();
    for (const p of predictions) {
      if (p.risk === 'high' || p.risk === 'severe') {
        factors.add(`${p.domain.replace(/_/g, ' ')}: ${p.title}`);
      }
    }
    return Array.from(factors);
  }

  private collectMitigatingFactors(predictions: Prediction[]): string[] {
    const factors = new Set<string>();
    for (const p of predictions) {
      if (p.behavior === 'improving') {
        factors.add(`${p.domain.replace(/_/g, ' ')} is showing improvement`);
      }
      if (p.behavior === 'stable') {
        factors.add(`${p.domain.replace(/_/g, ' ')} is stable`);
      }
    }
    return Array.from(factors);
  }

  private collectPreventiveActions(predictions: Prediction[]): string[] {
    const actions = new Set<string>();
    for (const p of predictions) {
      if (p.recommendation && (p.risk === 'high' || p.risk === 'severe' || p.risk === 'moderate')) {
        actions.add(p.recommendation.action);
      }
    }
    return Array.from(actions);
  }

  private computeOverallReliabilityRisk(risks: ComponentFailureRisk[]): PredictionRisk {
    if (risks.length === 0) return 'none';
    const maxScore = risks.reduce((max, r) => {
      const scores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
      return Math.max(max, scores[r.risk]);
    }, 0);
    return scoreToRisk(maxScore);
  }

  private computeReliabilityScore(risks: ComponentFailureRisk[]): number {
    if (risks.length === 0) return 100;
    const avgRisk = risks.reduce((sum, r) => {
      const scores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
      return sum + scores[r.risk];
    }, 0) / risks.length;
    return Math.max(0, 100 - avgRisk);
  }

  private estimateTimeToFailure(risks: ComponentFailureRisk[]): string | null {
    const highRisks = risks.filter((r) => r.risk === 'high' || r.risk === 'severe');
    if (highRisks.length === 0) return null;
    return highRisks[0]!.estimatedTimeToFailure ?? 'Unknown';
  }
}
