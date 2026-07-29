/**
 * Plan Scorer — scores optimization plans for comparison and ranking.
 *
 * Computes overall plan quality from benefits, risk, confidence, and duration.
 */
import type { OptimizationPlanV2, PlanConfiguration } from './types';
import { planRiskToWeight } from './types';

export interface PlanScore {
  planId: string;
  overallScore: number;
  benefitScore: number;
  riskScore: number;
  confidenceScore: number;
  efficiencyScore: number;
}

export class PlanScorer {
  private _config: PlanConfiguration;

  constructor(config: PlanConfiguration) {
    this._config = config;
  }

  updateConfig(config: PlanConfiguration): void {
    this._config = config;
  }

  score(plan: OptimizationPlanV2): PlanScore {
    const benefitScore = this._scoreBenefits(plan);
    const riskScore = this._scoreRisk(plan);
    const confidenceScore = plan.confidenceScore * 100;
    const efficiencyScore = this._scoreEfficiency(plan);

    const overall = (
      benefitScore * 0.35 +
      riskScore * 0.25 +
      confidenceScore * 0.25 +
      efficiencyScore * 0.15
    );

    return {
      planId: plan.id,
      overallScore: Math.round(overall * 100) / 100,
      benefitScore: Math.round(benefitScore * 100) / 100,
      riskScore: Math.round(riskScore * 100) / 100,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      efficiencyScore: Math.round(efficiencyScore * 100) / 100,
    };
  }

  rankPlans(plans: OptimizationPlanV2[]): PlanScore[] {
    return plans
      .map((p) => this.score(p))
      .sort((a, b) => b.overallScore - a.overallScore);
  }

  private _scoreBenefits(plan: OptimizationPlanV2): number {
    const health = plan.estimatedHealthGain;
    const storage = Math.min(50, plan.estimatedStorageRecovery / 100);
    const perf = plan.estimatedPerformanceGain;
    const privacy = plan.estimatedPrivacyGain;
    const startup = plan.estimatedStartupGain;
    return Math.min(100, health + storage + perf + privacy + startup);
  }

  private _scoreRisk(plan: OptimizationPlanV2): number {
    const riskWeight = planRiskToWeight(plan.estimatedRisk);
    return 100 - riskWeight;
  }

  private _scoreEfficiency(plan: OptimizationPlanV2): number {
    if (plan.estimatedDuration === 0) return 100;
    const gainPerMinute = plan.estimatedHealthGain / (plan.estimatedDuration / 60);
    return Math.min(100, gainPerMinute * 10);
  }
}
