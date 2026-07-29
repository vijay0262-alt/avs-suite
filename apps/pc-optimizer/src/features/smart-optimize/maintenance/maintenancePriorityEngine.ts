/**
 * Maintenance Priority Engine — ranks maintenance opportunities.
 *
 * Ranking factors: Expected Benefit, Risk, Urgency, Prediction Score,
 * Health Score, Historical Success, Execution Time.
 */
import type {
  MaintenanceOpportunity,
  PriorityFactors,
  PriorityResult,
  PriorityRule,
  MaintenanceConfiguration,
  MaintenanceHistoryEntry,
  MaintenanceType,
} from './types';
import { riskToScore, priorityToScore } from './types';

export class MaintenancePriorityEngine {
  private _config: MaintenanceConfiguration;

  constructor(config: MaintenanceConfiguration) {
    this._config = config;
  }

  rank(
    opportunities: MaintenanceOpportunity[],
    historicalOutcomes?: MaintenanceHistoryEntry[],
  ): PriorityResult[] {
    const results = opportunities.map((opp) => {
      const factors = this._computeFactors(opp, historicalOutcomes ?? []);
      const score = this._computeScore(factors);
      return {
        opportunityId: opp.id,
        score,
        rank: 0,
        factors,
        reason: this._generateReason(opp, factors, score),
      };
    });

    results.sort((a, b) => b.score - a.score);
    results.forEach((r, i) => { r.rank = i + 1; });

    return results;
  }

  rankSingle(
    opportunity: MaintenanceOpportunity,
    historicalOutcomes?: MaintenanceHistoryEntry[],
  ): PriorityResult {
    const factors = this._computeFactors(opportunity, historicalOutcomes ?? []);
    const score = this._computeScore(factors);
    return {
      opportunityId: opportunity.id,
      score,
      rank: 1,
      factors,
      reason: this._generateReason(opportunity, factors, score),
    };
  }

  private _computeFactors(
    opportunity: MaintenanceOpportunity,
    historicalOutcomes: MaintenanceHistoryEntry[],
  ): PriorityFactors {
    const typeHistory = historicalOutcomes.filter((h) => h.type === opportunity.type);
    const completed = typeHistory.filter((h) => h.outcome === 'completed');
    const historicalSuccess = typeHistory.length > 0
      ? completed.length / typeHistory.length
      : 0.5;

    return {
      expectedBenefit: opportunity.expectedBenefit,
      risk: riskToScore(opportunity.risk),
      urgency: priorityToScore(opportunity.priority),
      predictionScore: opportunity.confidence,
      healthScore: this._estimateHealthScore(opportunity.type),
      historicalSuccess,
      executionTime: opportunity.estimatedDuration / 60000,
      futureFactors: {},
    };
  }

  private _estimateHealthScore(type: MaintenanceType): number {
    const scores: Record<MaintenanceType, number> = {
      quick_maintenance: 0.3,
      routine_maintenance: 0.5,
      deep_maintenance: 0.8,
      privacy_maintenance: 0.6,
      performance_maintenance: 0.7,
      storage_maintenance: 0.6,
      startup_maintenance: 0.5,
      health_recovery: 0.9,
      custom_maintenance: 0.4,
      future_maintenance: 0.5,
    };
    return scores[type] ?? 0.5;
  }

  private _computeScore(factors: PriorityFactors): number {
    let score = 0;
    let totalWeight = 0;

    for (const rule of this._config.priorityRules) {
      if (!rule.enabled) continue;
      const factorValue = factors[rule.factor];
      if (typeof factorValue !== 'number') continue;

      const isInverse = rule.factor === 'risk' || rule.factor === 'executionTime';
      const adjustedValue = isInverse ? 1 - factorValue : factorValue;

      score += adjustedValue * rule.weight;
      totalWeight += rule.weight;
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  private _generateReason(
    opportunity: MaintenanceOpportunity,
    factors: PriorityFactors,
    score: number,
  ): string {
    const parts: string[] = [];
    parts.push(`${opportunity.type} scored ${score.toFixed(2)}`);
    parts.push(`benefit=${factors.expectedBenefit.toFixed(2)}`);
    parts.push(`urgency=${factors.urgency.toFixed(2)}`);
    parts.push(`risk=${factors.risk.toFixed(2)}`);
    if (factors.historicalSuccess > 0) {
      parts.push(`history=${(factors.historicalSuccess * 100).toFixed(0)}%`);
    }
    return parts.join(', ');
  }

  updateRules(rules: PriorityRule[]): void {
    this._config = { ...this._config, priorityRules: rules };
  }
}
