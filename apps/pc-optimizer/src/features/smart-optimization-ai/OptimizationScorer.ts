/**
 * OptimizationScorer — computes a composite score for each optimization action.
 *
 * Combines impact, risk, confidence, and learning preferences into a
 * single prioritization score.
 */
import type {
  OptimizationAction,
  OptimizationConfiguration,
  OptimizationLearningData,
} from './types';

export class OptimizationScorer {
  constructor(
    private config: OptimizationConfiguration,
    private learning: OptimizationLearningData,
  ) {}

  score(action: OptimizationAction): number {
    const impactScore = action.impact.score;
    const riskPenalty = action.risk.score * 0.3;
    const confidenceBonus = action.confidence * 15;

    let learningBonus = 0;
    const acceptanceRate = this.getCategoryAcceptanceRate(action.category);
    if (acceptanceRate > 0.8) learningBonus += 10;
    if (acceptanceRate < 0.3) learningBonus -= 15;

    const styleAdjustment = this.getStyleAdjustment(action);
    const rollbackBonus = action.rollbackAvailable ? 5 : 0;

    const raw = impactScore - riskPenalty + confidenceBonus + learningBonus + styleAdjustment + rollbackBonus;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  private getCategoryAcceptanceRate(category: OptimizationAction['category']): number {
    const accepted = this.learning.acceptedOptimizations.filter((r) => r.category === category).length;
    const rejected = this.learning.rejectedRecommendations.filter((r) => r.category === category).length;
    const total = accepted + rejected;
    return total > 0 ? accepted / total : 0.5;
  }

  private getStyleAdjustment(action: OptimizationAction): number {
    switch (this.learning.preferredStyle) {
      case 'aggressive':
        return action.risk.level === 'low' ? 5 : 0;
      case 'conservative':
        return action.risk.level === 'moderate' || action.risk.level === 'high' ? -10 : 0;
      case 'minimal':
        return action.impact.tier === 'informational' ? -10 : 0;
      default:
        return 0;
    }
  }
}
