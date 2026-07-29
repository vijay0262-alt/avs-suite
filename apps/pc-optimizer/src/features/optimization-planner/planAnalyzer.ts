/**
 * Plan Analyzer — analyzes risk and step composition for plans.
 *
 * Risk is calculated from evidence and step composition.
 */
import type {
  OptimizationPlanV2,
  PlanStep,
  PlanRiskLevel,
  PlanConfiguration,
} from './types';
import { planRiskToWeight } from './types';

export interface PlanAnalysis {
  planId: string;
  overallRisk: PlanRiskLevel;
  riskBreakdown: Record<string, number>;
  stepCount: number;
  rollbackAvailable: boolean;
  rollbackSteps: number;
  highRiskSteps: number;
  criticalSteps: number;
  averageConfidence: number;
  categoriesCovered: string[];
}

export class PlanAnalyzer {
  private _config: PlanConfiguration;

  constructor(config: PlanConfiguration) {
    this._config = config;
  }

  updateConfig(config: PlanConfiguration): void {
    this._config = config;
  }

  analyze(plan: OptimizationPlanV2): PlanAnalysis {
    const riskBreakdown: Record<string, number> = {};
    let rollbackSteps = 0;
    let highRiskSteps = 0;
    let criticalSteps = 0;
    let totalConfidence = 0;
    const categories = new Set<string>();

    for (const step of plan.steps) {
      riskBreakdown[step.riskLevel] = (riskBreakdown[step.riskLevel] ?? 0) + 1;
      if (step.rollbackAvailable) rollbackSteps++;
      if (step.riskLevel === 'high') highRiskSteps++;
      if (step.riskLevel === 'critical') criticalSteps++;
      totalConfidence += step.confidence;
      categories.add(step.category);
    }

    return {
      planId: plan.id,
      overallRisk: this._calculateRisk(plan.steps),
      riskBreakdown,
      stepCount: plan.steps.length,
      rollbackAvailable: rollbackSteps === plan.steps.length,
      rollbackSteps,
      highRiskSteps,
      criticalSteps,
      averageConfidence: plan.steps.length > 0 ? totalConfidence / plan.steps.length : 0,
      categoriesCovered: Array.from(categories),
    };
  }

  analyzeRisk(steps: PlanStep[]): PlanRiskLevel {
    return this._calculateRisk(steps);
  }

  private _calculateRisk(steps: PlanStep[]): PlanRiskLevel {
    if (steps.length === 0) return this._config.riskRules.defaultRisk;
    const weights = steps.map((s) => planRiskToWeight(s.riskLevel));
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length;

    if (avg >= 75) return 'high';
    if (avg >= 50) return 'medium';
    if (avg >= 25) return 'low';
    if (avg >= 10) return 'very_low';
    return 'none';
  }
}
