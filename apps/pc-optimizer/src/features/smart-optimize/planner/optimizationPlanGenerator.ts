/**
 * Optimization Plan Generator — converts recommendations into SmartPlanActions.
 *
 * Transforms AI Recommendations into SmartPlanAction objects with
 * priority scores, dependencies, predicted impact, and learning weights.
 */
import type {
  Recommendation,
  SmartPlanAction,
  PlanningContext,
  PlannerConfiguration,
  OptimizationGoal,
} from './types';
import { priorityToScore } from './types';

export class OptimizationPlanGenerator {
  private _config: PlannerConfiguration;

  constructor(config: PlannerConfiguration) {
    this._config = config;
  }

  updateConfig(config: PlannerConfiguration): void {
    this._config = config;
  }

  generate(context: PlanningContext, _goal: OptimizationGoal): SmartPlanAction[] {
    const filtered = this._filterRecommendations(context.recommendations, _goal);
    return filtered.map((rec) => this._convertToAction(rec, context));
  }

  private _filterRecommendations(
    recommendations: Recommendation[],
    _goal: OptimizationGoal,
  ): Recommendation[] {
    return recommendations.filter((r) => {
      if (r.status !== 'active' && r.status !== 'pending') return false;
      if (r.scores.confidenceScore < this._config.planningRules.minRecommendationConfidence) return false;
      return true;
    });
  }

  private _convertToAction(rec: Recommendation, context: PlanningContext): SmartPlanAction {
    const predictedImpact = this._estimatePredictedImpact(rec, context);
    const futureLearningWeight = this._estimateLearningWeight(rec, context);

    return {
      id: rec.id,
      recommendationId: rec.id,
      title: rec.title,
      description: rec.description,
      category: rec.category,
      priority: rec.priority,
      estimatedDuration: rec.benefits.estimatedTime,
      estimatedBenefit: rec.benefits.estimatedBenefit,
      riskLevel: rec.safety.riskLevel,
      confidence: rec.scores.confidenceScore,
      rollbackAvailable: rec.safety.rollbackAvailable,
      priorityScore: priorityToScore(rec.priority),
      dependencies: [],
      predictedImpact,
      futureLearningWeight,
    };
  }

  private _estimatePredictedImpact(rec: Recommendation, context: PlanningContext): number {
    let impact = rec.scores.impactScore;

    if (context.predictions) {
      const relatedPredictions = context.predictions.predictions.filter(
        (p) => p.category === rec.category,
      );
      if (relatedPredictions.length > 0) {
        const avgPredictionConfidence = relatedPredictions.reduce(
          (sum, p) => sum + p.evidence.confidence, 0,
        ) / relatedPredictions.length;
        impact = (impact + avgPredictionConfidence) / 2;
      }
    }

    return Math.round(impact * 100) / 100;
  }

  private _estimateLearningWeight(rec: Recommendation, _context: PlanningContext): number {
    const baseWeight = 0.5;
    const categoryBonus = rec.category === 'performance' || rec.category === 'storage' ? 0.1 : 0;
    return Math.min(1, Math.round((baseWeight + categoryBonus) * 100) / 100);
  }
}
