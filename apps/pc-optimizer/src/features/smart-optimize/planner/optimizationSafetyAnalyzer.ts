/**
 * Optimization Safety Analyzer — analyzes safety of plans and actions.
 *
 * Every plan specifies: Overall Risk, Confirmation Required,
 * Rollback Availability, Protected Areas, Unsafe Actions, Skipped Actions.
 */
import type {
  SmartPlanAction,
  SafetyAssessment,
  RiskLevel,
  PlannerConfiguration,
} from './types';
import { riskToScore } from './types';

export class OptimizationSafetyAnalyzer {
  private _config: PlannerConfiguration;

  constructor(config: PlannerConfiguration) {
    this._config = config;
  }

  updateConfig(config: PlannerConfiguration): void {
    this._config = config;
  }

  analyze(actions: SmartPlanAction[]): SafetyAssessment {
    const riskScores = actions.map((a) => riskToScore(a.riskLevel));
    const avgRisk = riskScores.length > 0 ? riskScores.reduce((s, r) => s + r, 0) / riskScores.length : 0;
    const maxRiskScore = riskScores.length > 0 ? Math.max(...riskScores) : 0;

    const overallRisk = this._scoreToRisk(maxRiskScore);
    const confirmationRequired = maxRiskScore >= riskToScore(this._config.riskThresholds.confirmationThreshold);
    const rollbackAvailable = actions.every((a) => a.rollbackAvailable);

    const unsafeActions = actions
      .filter((a) => riskToScore(a.riskLevel) >= riskToScore(this._config.riskThresholds.exclusionThreshold))
      .map((a) => a.id);

    const skippedActions = actions
      .filter((a) => this._config.riskThresholds.protectedCategories.includes(a.category))
      .map((a) => a.id);

    const protectedAreas = this._config.riskThresholds.protectedCategories;

    return {
      overallRisk,
      confirmationRequired,
      rollbackAvailable,
      protectedAreas,
      unsafeActions,
      skippedActions,
      riskScore: Math.round(avgRisk * 100) / 100,
    };
  }

  isActionSafe(action: SmartPlanAction): boolean {
    return riskToScore(action.riskLevel) < riskToScore(this._config.riskThresholds.exclusionThreshold);
  }

  filterUnsafeActions(actions: SmartPlanAction[]): { safe: SmartPlanAction[]; unsafe: SmartPlanAction[] } {
    const safe: SmartPlanAction[] = [];
    const unsafe: SmartPlanAction[] = [];

    for (const action of actions) {
      if (this.isActionSafe(action)) {
        safe.push(action);
      } else {
        unsafe.push(action);
      }
    }

    return { safe, unsafe };
  }

  private _scoreToRisk(score: number): RiskLevel {
    if (score >= 0.9) return 'critical';
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.1) return 'low';
    return 'none';
  }
}
