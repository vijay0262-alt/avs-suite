/**
 * Goal Orchestration Engine — Priority Engine
 *
 * Evaluates goal priorities using multiple factors:
 * Goal Priority, Urgency, Expected Benefit, Risk, Prediction Confidence,
 * Health Score, Device Profile, Historical Success, Enterprise Policies,
 * User Preferences, Future Signals.
 *
 * Never invents priority data — all factors are derived from goal metadata
 * and provided input.
 */
import type {
  Goal,
  PriorityScore,
  PriorityFactors,
  OrchestrationConfiguration,
  OrchestrationInput,
  Evidence,
  OrchestrationProviderPlugin,
} from './types';
import { priorityToScore } from '../types';

export class GoalPriorityEngine {
  private _config: OrchestrationConfiguration;
  private _providers: OrchestrationProviderPlugin[] = [];

  constructor(config: OrchestrationConfiguration) {
    this._config = config;
  }

  registerProvider(plugin: OrchestrationProviderPlugin): boolean {
    if (this._providers.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._providers.push(plugin);
    this._providers.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  prioritize(goals: Goal[], input: OrchestrationInput): PriorityScore[] {
    // Check provider plugins first
    for (const provider of this._providers) {
      if (!provider.isAvailable()) continue;
      const scores = provider.prioritize(goals, input);
      if (scores && scores.length > 0) return scores;
    }

    // Built-in prioritization
    const rules = this._config.priorityRules;
    const activeGoals = goals.filter(
      (g) => g.status === 'started' || g.status === 'in_progress' || g.status === 'draft',
    );

    const scores = activeGoals.map((goal) => {
      const factors = this._computeFactors(goal, input);
      const score = this._computeScore(factors, rules);
      const evidence = this._collectEvidence(goal, input, factors);
      const reason = this._generateReason(goal, factors, score);

      return {
        goalId: goal.id,
        score,
        factors,
        rank: 0,
        reason,
        evidence,
        futureMetadata: {},
      } satisfies PriorityScore;
    });

    // Sort by score descending and assign ranks
    scores.sort((a, b) => b.score - a.score);
    scores.forEach((s, i) => { s.rank = i + 1; });

    return scores;
  }

  private _computeFactors(goal: Goal, input: OrchestrationInput): PriorityFactors {
    const goalPriorityScore = priorityToScore(goal.priority) / 4;
    const urgency = this._computeUrgency(goal);
    const expectedBenefit = this._computeExpectedBenefit(goal);
    const risk = this._computeRisk(goal);
    const predictionConfidence = this._computePredictionConfidence(goal, input);
    const healthScore = input.healthScore !== null ? input.healthScore / 100 : 0.5;
    const deviceProfileFit = this._computeDeviceProfileFit(goal, input);
    const historicalSuccess = this._computeHistoricalSuccess(goal, input);
    const enterprisePolicyWeight = this._computeEnterprisePolicyWeight(goal, input);
    const userPreferenceWeight = this._computeUserPreferenceWeight(goal, input);
    const futureSignals = 0.5;

    return {
      goalPriority: goalPriorityScore,
      urgency,
      expectedBenefit,
      risk,
      predictionConfidence,
      healthScore,
      deviceProfileFit,
      historicalSuccess,
      enterprisePolicyWeight,
      userPreferenceWeight,
      futureSignals,
    };
  }

  private _computeScore(factors: PriorityFactors, rules: OrchestrationConfiguration['priorityRules']): number {
    let score = 0;
    score += factors.goalPriority * rules.priorityWeight;
    score += factors.urgency * rules.urgencyWeight;
    score += factors.expectedBenefit * rules.benefitWeight;
    score += (1 - factors.risk) * rules.riskWeight;
    score += factors.predictionConfidence * rules.predictionConfidenceWeight;
    score += factors.healthScore * rules.healthScoreWeight;
    score += factors.deviceProfileFit * rules.deviceProfileWeight;
    score += factors.historicalSuccess * rules.historicalSuccessWeight;
    score += factors.enterprisePolicyWeight * rules.enterprisePolicyWeight;
    score += factors.userPreferenceWeight * rules.userPreferenceWeight;
    score += factors.futureSignals * rules.futureSignalsWeight;
    return Math.min(1, Math.max(0, score));
  }

  private _computeUrgency(goal: Goal): number {
    if (goal.priority === 'critical') return 1;
    if (goal.priority === 'high') return 0.75;
    if (goal.priority === 'medium') return 0.5;
    if (goal.priority === 'low') return 0.25;
    return 0.1;
  }

  private _computeExpectedBenefit(goal: Goal): number {
    const remaining = Math.abs(goal.targetValue - goal.currentValue);
    const total = Math.abs(goal.targetValue) || 1;
    const benefit = 1 - (remaining / total);
    return Math.min(1, Math.max(0, benefit));
  }

  private _computeRisk(goal: Goal): number {
    if (goal.strategy.riskLevel === 'critical') return 1;
    if (goal.strategy.riskLevel === 'high') return 0.75;
    if (goal.strategy.riskLevel === 'medium') return 0.5;
    if (goal.strategy.riskLevel === 'low') return 0.25;
    return 0;
  }

  private _computePredictionConfidence(goal: Goal, input: OrchestrationInput): number {
    if (input.measurementInput.predictions.length === 0) return 0.5;
    const avgConfidence = input.measurementInput.predictions.reduce((sum, p) => sum + p.confidence, 0) /
      input.measurementInput.predictions.length;
    return Math.min(1, avgConfidence);
  }

  private _computeDeviceProfileFit(goal: Goal, input: OrchestrationInput): number {
    if (!input.deviceProfile) return 0.5;
    const tier = input.deviceProfile.performanceTier.toLowerCase();
    if (goal.category === 'gaming' && tier.includes('high')) return 0.9;
    if (goal.category === 'gaming' && tier.includes('low')) return 0.3;
    if (goal.category === 'battery' && tier.includes('low')) return 0.8;
    if (goal.category === 'performance' && tier.includes('high')) return 0.7;
    return 0.5;
  }

  private _computeHistoricalSuccess(goal: Goal, input: OrchestrationInput): number {
    const history = input.measurementInput.optimizationHistory;
    if (history.length === 0) return 0.5;
    const successCount = history.filter((h) => h.successRate > 0.7).length;
    return Math.min(1, successCount / history.length);
  }

  private _computeEnterprisePolicyWeight(goal: Goal, input: OrchestrationInput): number {
    if (input.enterprisePolicies.length === 0) return 0.5;
    const relevant = input.enterprisePolicies.filter((p) => p.enabled);
    if (relevant.length === 0) return 0.5;
    const blocked = this._config.enterprisePolicies.blockedGoalTypes.includes(goal.category);
    if (blocked) return 0;
    const allowed = this._config.enterprisePolicies.allowedGoalTypes;
    if (allowed.length > 0 && !allowed.includes(goal.category)) return 0.2;
    return 0.8;
  }

  private _computeUserPreferenceWeight(goal: Goal, input: OrchestrationInput): number {
    const prefs = input.userPreferences;
    if (Object.keys(prefs).length === 0) return 0.5;
    const goalTypePref = prefs[goal.category];
    if (typeof goalTypePref === 'number') return Math.min(1, Math.max(0, goalTypePref));
    return 0.5;
  }

  private _collectEvidence(goal: Goal, input: OrchestrationInput, factors: PriorityFactors): Evidence[] {
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    evidence.push({
      source: 'priority-engine',
      metric: 'goal_priority',
      value: priorityToScore(goal.priority),
      timestamp: now,
      description: `Goal priority: ${goal.priority} (score: ${priorityToScore(goal.priority)})`,
      futureMetadata: {},
    });

    if (input.healthScore !== null) {
      evidence.push({
        source: 'health-engine',
        metric: 'health_score',
        value: input.healthScore,
        timestamp: now,
        description: `Current health score: ${input.healthScore}`,
        futureMetadata: {},
      });
    }

    if (input.measurementInput.predictions.length > 0) {
      evidence.push({
        source: 'prediction-engine',
        metric: 'prediction_confidence',
        value: factors.predictionConfidence,
        timestamp: now,
        description: `Prediction confidence: ${factors.predictionConfidence.toFixed(2)}`,
        futureMetadata: {},
      });
    }

    if (input.measurementInput.optimizationHistory.length > 0) {
      evidence.push({
        source: 'optimization-history',
        metric: 'historical_success',
        value: factors.historicalSuccess,
        timestamp: now,
        description: `Historical success rate: ${factors.historicalSuccess.toFixed(2)}`,
        futureMetadata: {},
      });
    }

    return evidence;
  }

  private _generateReason(goal: Goal, factors: PriorityFactors, score: number): string {
    const topFactor = this._getTopFactor(factors);
    return `Goal "${goal.name}" scored ${score.toFixed(3)} — top factor: ${topFactor} (priority: ${goal.priority})`;
  }

  private _getTopFactor(factors: PriorityFactors): string {
    const entries: Array<[string, number]> = [
      ['goalPriority', factors.goalPriority],
      ['urgency', factors.urgency],
      ['expectedBenefit', factors.expectedBenefit],
      ['predictionConfidence', factors.predictionConfidence],
      ['historicalSuccess', factors.historicalSuccess],
    ];
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]![0];
  }

  getTopGoals(scores: PriorityScore[], max: number): PriorityScore[] {
    return scores.slice(0, max);
  }

  getDeferredGoals(scores: PriorityScore[], max: number): PriorityScore[] {
    return scores.slice(max);
  }
}
