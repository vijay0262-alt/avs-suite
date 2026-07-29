/**
 * Automation Ranking Engine — ranks recommendations using configurable weights.
 *
 * Ranking Factors: Historical Success, Benefit, Risk, Prediction Confidence,
 * Health Score, User Preference, Automation History, Device Profile.
 */
import type {
  IntelligenceInput,
  IntelligenceConfiguration,
  IntelligenceRecommendation,
  RankingResult,
  RankingWeight,
  RankingPlugin,
  Evidence,
} from './types';
import { riskToScore, priorityToScore } from './types';

export class AutomationRankingEngine {
  private _config: IntelligenceConfiguration;
  private _plugins: RankingPlugin[] = [];

  constructor(config: IntelligenceConfiguration) {
    this._config = config;
  }

  registerPlugin(plugin: RankingPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  rank(recommendations: IntelligenceRecommendation[], input: IntelligenceInput): RankingResult {
    const scores: Record<string, number> = {};
    const weights = this._config.rankingWeights.filter((w) => w.enabled);

    const ranked = recommendations.map((rec) => {
      let totalScore = 0;
      let totalWeight = 0;

      for (const weight of weights) {
        const pluginScore = this._checkPlugin(weight.factor, rec, input);
        const factorScore = pluginScore !== null ? pluginScore : this._scoreFactor(weight, rec, input);
        totalScore += factorScore * weight.weight;
        totalWeight += weight.weight;
      }

      const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;
      scores[rec.id] = finalScore;
      return { ...rec, rankScore: finalScore };
    });

    ranked.sort((a, b) => b.rankScore - a.rankScore);
    const rankedWithPosition = ranked.map((rec, idx) => ({ ...rec, rank: idx + 1 }));

    return {
      ranked: rankedWithPosition,
      scores,
      rankedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _checkPlugin(
    factor: RankingWeight['factor'],
    rec: IntelligenceRecommendation,
    input: IntelligenceInput,
  ): number | null {
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getFactor() === factor) {
        return plugin.score(rec, input);
      }
    }
    return null;
  }

  private _scoreFactor(
    weight: RankingWeight,
    rec: IntelligenceRecommendation,
    input: IntelligenceInput,
  ): number {
    switch (weight.factor) {
      case 'historical_success': return rec.historicalSuccess;
      case 'benefit': return Math.min(rec.expectedBenefit, 1.0);
      case 'risk': return 1.0 - riskToScore(rec.risk);
      case 'prediction_confidence': return rec.successPrediction?.confidence ?? 0.5;
      case 'health_score': return input.healthScore / 100;
      case 'user_preference': return this._scoreUserPreference(rec, input);
      case 'automation_history': return this._scoreAutomationHistory(rec, input);
      case 'device_profile': return this._scoreDeviceProfile(rec, input);
      default: return 0.5;
    }
  }

  private _scoreUserPreference(rec: IntelligenceRecommendation, _input: IntelligenceInput): number {
    return priorityToScore(rec.priority);
  }

  private _scoreAutomationHistory(rec: IntelligenceRecommendation, input: IntelligenceInput): number {
    const ruleEntries = input.automationHistory.filter((e) => rec.affectedRules.includes(e.ruleId));
    if (ruleEntries.length === 0) return 0.5;
    const successes = ruleEntries.filter((e) => e.outcome === 'executed').length;
    return successes / ruleEntries.length;
  }

  private _scoreDeviceProfile(rec: IntelligenceRecommendation, input: IntelligenceInput): number {
    if (rec.affectedProfiles.length === 0) return 0.5;
    return rec.affectedProfiles.includes(input.deviceProfileType) ? 1.0 : 0.3;
  }

  getEvidence(rec: IntelligenceRecommendation): Evidence[] {
    const ts = new Date().toISOString();
    return [
      { source: 'ranking', metric: 'historical_success', value: rec.historicalSuccess, timestamp: ts, description: `Historical success: ${(rec.historicalSuccess * 100).toFixed(1)}%`, futureMetadata: {} },
      { source: 'ranking', metric: 'expected_benefit', value: rec.expectedBenefit, timestamp: ts, description: `Expected benefit: ${rec.expectedBenefit.toFixed(2)}`, futureMetadata: {} },
      { source: 'ranking', metric: 'risk_level', value: rec.risk, timestamp: ts, description: `Risk: ${rec.risk}`, futureMetadata: {} },
      { source: 'ranking', metric: 'rank_score', value: rec.rankScore, timestamp: ts, description: `Rank score: ${rec.rankScore.toFixed(3)}`, futureMetadata: {} },
    ];
  }
}
