/**
 * Simulation Estimator — estimates outcomes using existing intelligence engines.
 *
 * Uses: Prediction Engine, Recommendation Engine, Optimization History,
 * Device Profile, Historical Outcomes, Adaptive Policies, Health Score.
 * No random values. No machine learning.
 */
import type {
  SimulationInput,
  SimulationConfiguration,
  Evidence,
  SimulationAssumption,
  EstimationPlugin,
  SimulationActionBreakdown,
  RiskLevel,
} from './types';
import { riskToScore, generateAssumptionId, scoreToRisk } from './types';

export class SimulationEstimator {
  private _config: SimulationConfiguration;
  private _plugins: EstimationPlugin[] = [];

  constructor(config: SimulationConfiguration) {
    this._config = config;
  }

  registerPlugin(plugin: EstimationPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  estimateHealthBefore(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const healthScore = input.healthScore;
    const evidence: Evidence[] = [
      {
        source: 'system_state',
        metric: 'current_health_score',
        value: healthScore,
        timestamp: new Date().toISOString(),
        description: `Current health score: ${healthScore}/100`,
        futureMetadata: {},
      },
    ];
    return { value: healthScore, evidence };
  }

  estimateHealthAfter(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const before = input.healthScore;
    const planBenefit = input.plan.estimatedBenefits.estimatedHealthGain;
    const planConfidence = input.plan.confidence;
    const historicalAdjustment = this._historicalAdjustment(input, evidence);
    const riskAdjustment = this._riskAdjustment(input, evidence);

    const rawGain = planBenefit * planConfidence * historicalAdjustment * riskAdjustment;
    const estimatedGain = Math.max(0, Math.min(rawGain, 100 - before));
    const healthAfter = Math.min(100, before + estimatedGain);

    evidence.push({
      source: 'estimation',
      metric: 'estimated_health_gain',
      value: estimatedGain,
      timestamp: new Date().toISOString(),
      description: `Estimated health gain: +${estimatedGain.toFixed(1)} (plan: ${planBenefit}, confidence: ${planConfidence}, history adj: ${historicalAdjustment.toFixed(2)}, risk adj: ${riskAdjustment.toFixed(2)})`,
      futureMetadata: {},
    });

    return { value: Math.round(healthAfter), evidence };
  }

  estimateStorageRecovered(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const planBenefit = input.plan.estimatedBenefits.estimatedStorageRecovery;
    const planConfidence = input.plan.confidence;
    const historicalAdjustment = this._historicalAdjustment(input, evidence);

    const estimated = planBenefit * planConfidence * historicalAdjustment;

    evidence.push({
      source: 'estimation',
      metric: 'estimated_storage_recovered',
      value: estimated,
      timestamp: new Date().toISOString(),
      description: `Estimated storage recovered: ${estimated.toFixed(2)} MB (plan: ${planBenefit}, confidence: ${planConfidence})`,
      futureMetadata: {},
    });

    return { value: Math.round(estimated * 100) / 100, evidence };
  }

  estimatePerformanceGain(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const planBenefit = input.plan.estimatedBenefits.estimatedPerformanceGain;
    const planConfidence = input.plan.confidence;
    const riskAdjustment = this._riskAdjustment(input, evidence);

    const estimated = planBenefit * planConfidence * riskAdjustment;

    evidence.push({
      source: 'estimation',
      metric: 'estimated_performance_gain',
      value: estimated,
      timestamp: new Date().toISOString(),
      description: `Estimated performance gain: ${(estimated * 100).toFixed(1)}% (plan: ${planBenefit}, confidence: ${planConfidence})`,
      futureMetadata: {},
    });

    return { value: Math.round(estimated * 1000) / 1000, evidence };
  }

  estimatePrivacyImprovement(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const planBenefit = input.plan.estimatedBenefits.estimatedPrivacyGain;
    const planConfidence = input.plan.confidence;

    const estimated = planBenefit * planConfidence;

    evidence.push({
      source: 'estimation',
      metric: 'estimated_privacy_improvement',
      value: estimated,
      timestamp: new Date().toISOString(),
      description: `Estimated privacy improvement: ${(estimated * 100).toFixed(1)}% (plan: ${planBenefit}, confidence: ${planConfidence})`,
      futureMetadata: {},
    });

    return { value: Math.round(estimated * 1000) / 1000, evidence };
  }

  estimateMemoryRecovery(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const currentMemory = input.systemState.memoryUsage;
    const planConfidence = input.plan.confidence;
    const estimatedReduction = currentMemory * 0.1 * planConfidence;

    evidence.push({
      source: 'estimation',
      metric: 'estimated_memory_recovery',
      value: estimatedReduction,
      timestamp: new Date().toISOString(),
      description: `Estimated memory recovery: ${estimatedReduction.toFixed(1)}% of ${currentMemory}% current usage`,
      futureMetadata: {},
    });

    return { value: Math.round(estimatedReduction * 10) / 10, evidence };
  }

  estimateStartupImprovement(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const planBenefit = input.plan.estimatedBenefits.estimatedStartupGain;
    const planConfidence = input.plan.confidence;

    const estimated = planBenefit * planConfidence;

    evidence.push({
      source: 'estimation',
      metric: 'estimated_startup_improvement',
      value: estimated,
      timestamp: new Date().toISOString(),
      description: `Estimated startup improvement: ${(estimated * 100).toFixed(1)}% (plan: ${planBenefit}, confidence: ${planConfidence})`,
      futureMetadata: {},
    });

    return { value: Math.round(estimated * 1000) / 1000, evidence };
  }

  estimateDuration(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const planDuration = input.plan.estimatedDuration;
    const systemLoadFactor = 1 + (input.systemState.cpuUsage / 100) * 0.2;
    const estimated = planDuration * systemLoadFactor;

    evidence.push({
      source: 'estimation',
      metric: 'estimated_duration',
      value: estimated,
      timestamp: new Date().toISOString(),
      description: `Estimated duration: ${estimated.toFixed(0)}ms (plan: ${planDuration}ms, system load factor: ${systemLoadFactor.toFixed(2)})`,
      futureMetadata: {},
    });

    return { value: Math.round(estimated), evidence };
  }

  estimateRisk(input: SimulationInput): { value: RiskLevel; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const planRisk = input.plan.estimatedRisk;
    const riskScore = riskToScore(planRisk);
    const actionAvgRisk = input.plan.recommendedActions.length > 0
      ? input.plan.recommendedActions.reduce((sum, a) => sum + riskToScore(a.riskLevel), 0) / input.plan.recommendedActions.length
      : riskScore;
    const combinedRisk = (riskScore * 0.6 + actionAvgRisk * 0.4);

    evidence.push({
      source: 'estimation',
      metric: 'estimated_risk',
      value: combinedRisk,
      timestamp: new Date().toISOString(),
      description: `Estimated risk score: ${combinedRisk.toFixed(2)} (plan: ${planRisk}, action avg: ${actionAvgRisk.toFixed(2)})`,
      futureMetadata: {},
    });

    return { value: scoreToRisk(combinedRisk), evidence };
  }

  estimateConfidence(input: SimulationInput): { value: number; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const factors: { name: string; weight: number; value: number }[] = [];

    const planConfidence = input.plan.confidence;
    const planConfRule = this._config.confidenceRules.find((r) => r.factor === 'plan_confidence' && r.enabled);
    if (planConfRule) {
      factors.push({ name: 'plan_confidence', weight: planConfRule.weight, value: planConfidence });
    }

    const actionConfidence = input.plan.recommendedActions.length > 0
      ? input.plan.recommendedActions.reduce((sum, a) => sum + a.confidence, 0) / input.plan.recommendedActions.length
      : planConfidence;
    const actionConfRule = this._config.confidenceRules.find((r) => r.factor === 'action_confidence' && r.enabled);
    if (actionConfRule) {
      factors.push({ name: 'action_confidence', weight: actionConfRule.weight, value: actionConfidence });
    }

    const historyFactor = input.optimizationHistory.length > 0
      ? Math.min(input.optimizationHistory.length / 10, 1.0)
      : 0.3;
    const historyRule = this._config.confidenceRules.find((r) => r.factor === 'historical_samples' && r.enabled);
    if (historyRule) {
      factors.push({ name: 'historical_samples', weight: historyRule.weight, value: historyFactor });
    }

    const riskScore = riskToScore(input.plan.estimatedRisk);
    const riskAlignment = 1.0 - riskScore;
    const riskRule = this._config.confidenceRules.find((r) => r.factor === 'risk_alignment' && r.enabled);
    if (riskRule) {
      factors.push({ name: 'risk_alignment', weight: riskRule.weight, value: riskAlignment });
    }

    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        const pluginValue = plugin.estimate(input, this._config);
        const rule = this._config.confidenceRules.find((r) => r.factor === plugin.getFactor());
        if (rule && rule.enabled) {
          factors.push({ name: plugin.getPluginName(), weight: rule.weight, value: pluginValue });
        }
      }
    }

    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const weightedSum = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
    const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

    evidence.push({
      source: 'estimation',
      metric: 'estimated_confidence',
      value: confidence,
      timestamp: new Date().toISOString(),
      description: `Estimated confidence: ${confidence.toFixed(2)} (factors: ${factors.map((f) => `${f.name}=${f.value.toFixed(2)}`).join(', ')})`,
      futureMetadata: {},
    });

    return { value: Math.round(confidence * 100) / 100, evidence };
  }

  estimateRollbackAvailability(input: SimulationInput): { value: boolean; evidence: Evidence[] } {
    const evidence: Evidence[] = [];
    const planRollback = input.plan.rollbackAvailable;
    const allActionsRollback = input.plan.recommendedActions.every((a) => a.rollbackAvailable);

    evidence.push({
      source: 'estimation',
      metric: 'rollback_availability',
      value: planRollback && allActionsRollback ? 1 : 0,
      timestamp: new Date().toISOString(),
      description: `Rollback available: ${planRollback && allActionsRollback} (plan: ${planRollback}, all actions: ${allActionsRollback})`,
      futureMetadata: {},
    });

    return { value: planRollback && allActionsRollback, evidence };
  }

  generateAssumptions(input: SimulationInput): SimulationAssumption[] {
    const assumptions: SimulationAssumption[] = [];

    assumptions.push({
      id: generateAssumptionId(),
      description: 'System state remains stable during optimization execution',
      impact: 0.1,
      confidence: 0.8,
      category: 'system_stability',
      futureMetadata: {},
    });

    assumptions.push({
      id: generateAssumptionId(),
      description: 'User does not interrupt the optimization process',
      impact: 0.15,
      confidence: 0.7,
      category: 'user_behavior',
      futureMetadata: {},
    });

    if (input.optimizationHistory.length < 3) {
      assumptions.push({
        id: generateAssumptionId(),
        description: 'Limited historical data — estimates based on plan configuration rather than historical outcomes',
        impact: 0.2,
        confidence: 0.5,
        category: 'data_quality',
        futureMetadata: {},
      });
    }

    assumptions.push({
      id: generateAssumptionId(),
      description: 'Estimated benefits scale linearly with plan confidence',
      impact: 0.1,
      confidence: 0.6,
      category: 'estimation_model',
      futureMetadata: {},
    });

    if (input.systemState.cpuUsage > 70) {
      assumptions.push({
        id: generateAssumptionId(),
        description: 'High CPU usage may extend optimization duration',
        impact: 0.15,
        confidence: 0.75,
        category: 'system_load',
        futureMetadata: {},
      });
    }

    return assumptions;
  }

  generateActionBreakdown(input: SimulationInput): SimulationActionBreakdown[] {
    return input.plan.recommendedActions.map((action) => ({
      actionId: action.id,
      title: action.title,
      estimatedDuration: action.estimatedDuration,
      estimatedBenefit: action.predictedImpact,
      estimatedRisk: action.riskLevel,
      confidence: action.confidence,
      evidence: [
        {
          source: 'plan_action',
          metric: 'action_confidence',
          value: action.confidence,
          timestamp: new Date().toISOString(),
          description: `Action confidence: ${action.confidence}`,
          futureMetadata: {},
        },
        {
          source: 'plan_action',
          metric: 'predicted_impact',
          value: action.predictedImpact,
          timestamp: new Date().toISOString(),
          description: `Predicted impact: ${action.predictedImpact}`,
          futureMetadata: {},
        },
      ],
      futureMetadata: {},
    }));
  }

  private _historicalAdjustment(input: SimulationInput, evidence: Evidence[]): number {
    if (input.optimizationHistory.length === 0) return 0.8;

    const avgSuccessRate = input.optimizationHistory.reduce((sum, h) => sum + h.successRate, 0) / input.optimizationHistory.length;
    const adjustment = 0.5 + avgSuccessRate * 0.5;

    evidence.push({
      source: 'optimization_history',
      metric: 'historical_success_rate',
      value: avgSuccessRate,
      timestamp: new Date().toISOString(),
      description: `Historical success rate: ${(avgSuccessRate * 100).toFixed(1)}% across ${input.optimizationHistory.length} entries`,
      futureMetadata: {},
    });

    return Math.max(0.5, Math.min(1.0, adjustment));
  }

  private _riskAdjustment(input: SimulationInput, evidence: Evidence[]): number {
    const riskScore = riskToScore(input.plan.estimatedRisk);
    const adjustment = 1.0 - riskScore * 0.3;

    evidence.push({
      source: 'risk_assessment',
      metric: 'risk_adjustment',
      value: adjustment,
      timestamp: new Date().toISOString(),
      description: `Risk adjustment factor: ${adjustment.toFixed(2)} (risk: ${input.plan.estimatedRisk})`,
      futureMetadata: {},
    });

    return Math.max(0.5, adjustment);
  }

  get config(): SimulationConfiguration { return this._config; }

  updateConfig(config: SimulationConfiguration): void {
    this._config = config;
  }
}
