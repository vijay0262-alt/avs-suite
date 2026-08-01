/**
 * FailureRiskAssessment — standalone failure risk assessor.
 *
 * Can be used independently of ReliabilityForecast to assess
 * failure risk from a set of predictions.
 */
import type {
  Prediction,
  FailureRiskAssessment,
  ComponentFailureRisk,
  PredictionRisk,
  ForecastDomain,
} from './types';
import { scoreToRisk } from './types';

export class FailureRiskAssessor {
  assess(predictions: Prediction[]): FailureRiskAssessment {
    const componentRisks = this.assessComponents(predictions);
    const systemRiskFactors = this.collectFactors(predictions, true);
    const mitigatingFactors = this.collectFactors(predictions, false);
    const overallRisk = this.computeOverallRisk(componentRisks);
    const estimatedTimeToFailure = this.estimateTime(componentRisks);
    const recommendedPreventiveActions = this.collectActions(predictions);

    return {
      overallRisk,
      componentRisks,
      systemRiskFactors,
      mitigatingFactors,
      estimatedTimeToFailure,
      recommendedPreventiveActions,
    };
  }

  private assessComponents(predictions: Prediction[]): ComponentFailureRisk[] {
    const byDomain = new Map<ForecastDomain, Prediction>();
    for (const p of predictions) {
      const existing = byDomain.get(p.domain);
      if (!existing) {
        byDomain.set(p.domain, p);
        continue;
      }
      const scores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
      if (scores[p.risk] > scores[existing.risk]) {
        byDomain.set(p.domain, p);
      }
    }

    const risks: ComponentFailureRisk[] = [];
    for (const [domain, pred] of byDomain) {
      risks.push({
        component: domain.replace(/_/g, ' '),
        domain,
        risk: pred.risk,
        failureProbability: pred.confidence * (pred.risk === 'severe' ? 0.9 : pred.risk === 'high' ? 0.7 : pred.risk === 'moderate' ? 0.4 : 0.1),
        estimatedTimeToFailure: pred.projectionHorizonDays > 0 ? `~${pred.projectionHorizonDays} days` : null,
        primaryConcern: pred.title,
      });
    }

    return risks.sort((a, b) => {
      const scores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
      return scores[b.risk] - scores[a.risk];
    });
  }

  private collectFactors(predictions: Prediction[], riskFactors: boolean): string[] {
    const factors = new Set<string>();
    for (const p of predictions) {
      if (riskFactors && (p.risk === 'high' || p.risk === 'severe')) {
        factors.add(p.title);
      }
      if (!riskFactors && p.behavior === 'improving') {
        factors.add(`${p.domain.replace(/_/g, ' ')} improving`);
      }
    }
    return Array.from(factors);
  }

  private computeOverallRisk(risks: ComponentFailureRisk[]): PredictionRisk {
    if (risks.length === 0) return 'none';
    const maxScore = risks.reduce((max, r) => {
      const scores: Record<PredictionRisk, number> = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
      return Math.max(max, scores[r.risk]);
    }, 0);
    return scoreToRisk(maxScore);
  }

  private estimateTime(risks: ComponentFailureRisk[]): string | null {
    const high = risks.filter((r) => r.risk === 'high' || r.risk === 'severe');
    return high[0]?.estimatedTimeToFailure ?? null;
  }

  private collectActions(predictions: Prediction[]): string[] {
    const actions = new Set<string>();
    for (const p of predictions) {
      if (p.recommendation && p.risk !== 'none') {
        actions.add(p.recommendation.action);
      }
    }
    return Array.from(actions);
  }
}
