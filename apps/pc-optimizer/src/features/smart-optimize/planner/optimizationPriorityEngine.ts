/**
 * Optimization Priority Engine — ranks actions by multiple factors.
 *
 * Factors: Overall Benefit, Risk, Confidence, Estimated Time,
 * Dependencies, Predicted Impact, Future Learning Weight.
 */
import type {
  SmartPlanAction,
  PriorityWeights,
} from './types';
import { riskToScore, priorityToScore } from './types';

export class OptimizationPriorityEngine {
  private _weights: PriorityWeights;

  constructor(weights: PriorityWeights) {
    this._weights = weights;
  }

  updateWeights(weights: PriorityWeights): void {
    this._weights = weights;
  }

  rank(actions: SmartPlanAction[]): SmartPlanAction[] {
    const scored = actions.map((a) => ({
      action: a,
      score: this.score(a),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => ({ ...s.action, priorityScore: s.score }));
  }

  score(action: SmartPlanAction): number {
    const benefitScore = priorityToScore(action.priority);
    const riskScore = 1 - riskToScore(action.riskLevel);
    const confidenceScore = action.confidence;
    const timeScore = action.estimatedDuration > 0 ? 1 / (1 + action.estimatedDuration / 60) : 1;
    const dependencyScore = action.dependencies.length === 0 ? 1 : 1 / (1 + action.dependencies.length);
    const predictedImpactScore = action.predictedImpact;
    const futureLearningScore = action.futureLearningWeight;

    const total =
      benefitScore * this._weights.benefitWeight +
      riskScore * this._weights.riskWeight +
      confidenceScore * this._weights.confidenceWeight +
      timeScore * this._weights.timeWeight +
      dependencyScore * this._weights.dependencyWeight +
      predictedImpactScore * this._weights.predictedImpactWeight +
      futureLearningScore * this._weights.futureLearningWeight;

    return Math.round(total * 1000) / 1000;
  }

  applyCategoryBoost(
    actions: SmartPlanAction[],
    boostCategories: string[],
    penaltyCategories: string[],
  ): SmartPlanAction[] {
    return actions.map((a) => {
      let score = a.priorityScore;
      if (boostCategories.includes(a.category)) score += 0.1;
      if (penaltyCategories.includes(a.category)) score -= 0.1;
      return { ...a, priorityScore: Math.max(0, Math.min(1, score)) };
    });
  }

  getTopActions(actions: SmartPlanAction[], count: number): SmartPlanAction[] {
    return this.rank(actions).slice(0, count);
  }
}
