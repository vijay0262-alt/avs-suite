/**
 * Automation Success Predictor — predicts success probability based on history.
 *
 * Uses deterministic statistical analysis (no ML).
 * Factors: Historical Success, Benefit, Risk, Confidence, Health Score.
 */
import type {
  IntelligenceInput,
  IntelligenceConfiguration,
  SuccessPrediction,
  PredictionContext,
  PredictionFactor,
  Evidence,
  SuccessPredictorPlugin,
  RiskLevel,
} from './types';
import { generatePredictionId, riskToScore, scoreToRisk } from './types';

export class AutomationSuccessPredictor {
  private _config: IntelligenceConfiguration;
  private _plugins: SuccessPredictorPlugin[] = [];

  constructor(config: IntelligenceConfiguration) {
    this._config = config;
  }

  registerPlugin(plugin: SuccessPredictorPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  predict(context: PredictionContext, input: IntelligenceInput): SuccessPrediction {
    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        const result = plugin.predict(context, input);
        if (result) return result;
      }
    }

    return this._predictBuiltin(context, input);
  }

  private _predictBuiltin(context: PredictionContext, input: IntelligenceInput): SuccessPrediction {
    const factors: PredictionFactor[] = [];
    const evidence: Evidence[] = [];
    const ts = new Date().toISOString();

    const entries = this._filterRelevant(input.automationHistory, context);
    const samples = entries.length;

    if (samples >= this._config.minSamplesForPrediction) {
      const successes = entries.filter((e) => e.outcome === 'executed').length;
      const successRate = successes / samples;

      const rule = this._config.predictionRules.find((r) => r.factor === 'historical_success' && r.enabled);
      const weight = rule?.weight ?? 0.3;
      const contribution = successRate * weight;

      factors.push({
        name: 'Historical Success',
        weight,
        value: successRate,
        contribution,
        description: `${successes}/${samples} past executions succeeded`,
      });
      evidence.push({
        source: 'automation_history',
        metric: 'historical_success_rate',
        value: successRate,
        timestamp: ts,
        description: `Historical success rate: ${(successRate * 100).toFixed(1)}% (${samples} samples)`,
        futureMetadata: {},
      });
    }

    const avgBenefit = entries.length > 0
      ? entries.reduce((sum, e) => sum + ((e.metadata['benefit'] as number) ?? 0), 0) / entries.length
      : 0;
    const benefitRule = this._config.predictionRules.find((r) => r.factor === 'benefit' && r.enabled);
    if (benefitRule) {
      const contribution = Math.min(avgBenefit, 1.0) * benefitRule.weight;
      factors.push({
        name: 'Expected Benefit',
        weight: benefitRule.weight,
        value: avgBenefit,
        contribution,
        description: `Average benefit from ${entries.length} past executions: ${avgBenefit.toFixed(2)}`,
      });
      evidence.push({
        source: 'automation_history',
        metric: 'average_benefit',
        value: avgBenefit,
        timestamp: ts,
        description: `Average benefit: ${avgBenefit.toFixed(2)}`,
        futureMetadata: {},
      });
    }

    const riskLevel = context.riskLevel ?? 'low';
    const riskScore = riskToScore(riskLevel);
    const riskRule = this._config.predictionRules.find((r) => r.factor === 'risk' && r.enabled);
    if (riskRule) {
      const riskFactor = 1.0 - riskScore;
      const contribution = riskFactor * riskRule.weight;
      factors.push({
        name: 'Risk Factor',
        weight: riskRule.weight,
        value: riskFactor,
        contribution,
        description: `Risk level: ${riskLevel} (score ${riskScore.toFixed(2)}, inverted: ${riskFactor.toFixed(2)})`,
      });
      evidence.push({
        source: 'prediction_context',
        metric: 'risk_level',
        value: riskLevel,
        timestamp: ts,
        description: `Risk level: ${riskLevel}`,
        futureMetadata: {},
      });
    }

    const healthScore = context.healthScore ?? input.healthScore;
    const healthRule = this._config.predictionRules.find((r) => r.factor === 'health_score' && r.enabled);
    if (healthRule) {
      const healthFactor = healthScore / 100;
      const contribution = healthFactor * healthRule.weight;
      factors.push({
        name: 'Health Score',
        weight: healthRule.weight,
        value: healthFactor,
        contribution,
        description: `Health score: ${healthScore}/100`,
      });
      evidence.push({
        source: 'prediction_context',
        metric: 'health_score',
        value: healthScore,
        timestamp: ts,
        description: `Current health score: ${healthScore}`,
        futureMetadata: {},
      });
    }

    const totalContribution = factors.reduce((sum, f) => sum + f.contribution, 0);
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const predictedSuccessRate = totalWeight > 0 ? totalContribution / totalWeight : 0.5;
    const confidence = Math.min(samples / 10, 1.0);
    const predictedRisk: RiskLevel = scoreToRisk(1.0 - predictedSuccessRate);

    return {
      id: generatePredictionId(),
      predictedSuccessRate,
      confidence,
      basedOnSamples: samples,
      supportingEvidence: evidence,
      factors,
      riskLevel: predictedRisk,
      futureMetadata: {},
    };
  }

  private _filterRelevant(
    entries: IntelligenceInput['automationHistory'],
    context: PredictionContext,
  ): IntelligenceInput['automationHistory'] {
    let filtered = entries;
    if (context.ruleId) filtered = filtered.filter((e) => e.ruleId === context.ruleId);
    if (context.triggerType) filtered = filtered.filter((e) => e.triggerType === context.triggerType);
    if (context.actionType) filtered = filtered.filter((e) => e.actions.includes(context.actionType!));
    if (context.riskLevel) filtered = filtered.filter((e) => e.riskLevel === context.riskLevel);
    return filtered;
  }
}
