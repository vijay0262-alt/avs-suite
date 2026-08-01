/**
 * OptimizationPrioritizer — ranks optimization actions by composite score
 * and groups them into impact tiers.
 *
 * Respects maxActions and maxHighImpactActions limits.
 */
import type {
  OptimizationAction,
  OptimizationImpactTier,
  OptimizationConfiguration,
} from './types';

export class OptimizationPrioritizer {
  constructor(private config: OptimizationConfiguration) {}

  prioritize(actions: OptimizationAction[]): OptimizationAction[] {
    const filtered = actions.filter((a) => a.status !== 'rejected' && a.status !== 'skipped');

    const sorted = filtered.sort((a, b) => {
      if (b.impact.score !== a.impact.score) return b.impact.score - a.impact.score;
      if (a.risk.score !== b.risk.score) return a.risk.score - b.risk.score;
      return b.confidence - a.confidence;
    });

    const highImpact = sorted.filter((a) => a.impactTier === 'high');
    const mediumImpact = sorted.filter((a) => a.impactTier === 'medium');
    const lowImpact = sorted.filter((a) => a.impactTier === 'low');
    const informational = sorted.filter((a) => a.impactTier === 'informational');

    const maxHigh = this.config.maxHighImpactActions;
    const maxTotal = this.config.maxActions;

    const result: OptimizationAction[] = [
      ...highImpact.slice(0, maxHigh),
      ...mediumImpact,
      ...lowImpact,
      ...informational,
    ];

    return result.slice(0, maxTotal);
  }

  getTierBreakdown(actions: OptimizationAction[]): Record<OptimizationImpactTier, number> {
    return {
      high: actions.filter((a) => a.impactTier === 'high').length,
      medium: actions.filter((a) => a.impactTier === 'medium').length,
      low: actions.filter((a) => a.impactTier === 'low').length,
      informational: actions.filter((a) => a.impactTier === 'informational').length,
    };
  }

  determinePlanTier(actions: OptimizationAction[]): OptimizationImpactTier {
    if (actions.some((a) => a.impactTier === 'high')) return 'high';
    if (actions.some((a) => a.impactTier === 'medium')) return 'medium';
    if (actions.some((a) => a.impactTier === 'low')) return 'low';
    return 'informational';
  }
}
