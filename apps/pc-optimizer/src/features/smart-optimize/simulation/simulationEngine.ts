/**
 * Simulation Engine — core simulation engine that produces a SimulationResult.
 *
 * Orchestrates the estimator to produce all estimated outcomes.
 * Does NOT execute any optimization. Only simulates expected outcomes.
 */
import type {
  SimulationInput,
  SimulationResult,
  SimulationConfiguration,
  SimulationType,
  SimulationExplainability,
  Evidence,
  SimulationProviderPlugin,
} from './types';
import { generateSimulationId } from './types';
import { SimulationEstimator } from './simulationEstimator';
import { SimulationScenarioBuilder } from './simulationScenarioBuilder';

export class SimulationEngine {
  private _config: SimulationConfiguration;
  private _estimator: SimulationEstimator;
  private _scenarioBuilder: SimulationScenarioBuilder;
  private _plugins: SimulationProviderPlugin[] = [];

  constructor(config: SimulationConfiguration) {
    this._config = config;
    this._estimator = new SimulationEstimator(config);
    this._scenarioBuilder = new SimulationScenarioBuilder(config);
  }

  registerPlugin(plugin: SimulationProviderPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  simulate(input: SimulationInput): SimulationResult {
    const type = this._scenarioBuilder.determineSimulationType(input.plan);

    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getSimulationType() === type) {
        const result = plugin.simulate(input, this._config);
        if (result) return result;
      }
    }

    return this._simulateBuiltin(input, type);
  }

  private _simulateBuiltin(input: SimulationInput, type: SimulationType): SimulationResult {
    const allEvidence: Evidence[] = [];

    const healthBefore = this._estimator.estimateHealthBefore(input);
    allEvidence.push(...healthBefore.evidence);

    const healthAfter = this._estimator.estimateHealthAfter(input);
    allEvidence.push(...healthAfter.evidence);

    const storage = this._estimator.estimateStorageRecovered(input);
    allEvidence.push(...storage.evidence);

    const performance = this._estimator.estimatePerformanceGain(input);
    allEvidence.push(...performance.evidence);

    const privacy = this._estimator.estimatePrivacyImprovement(input);
    allEvidence.push(...privacy.evidence);

    const memory = this._estimator.estimateMemoryRecovery(input);
    allEvidence.push(...memory.evidence);

    const startup = this._estimator.estimateStartupImprovement(input);
    allEvidence.push(...startup.evidence);

    const duration = this._estimator.estimateDuration(input);
    allEvidence.push(...duration.evidence);

    const risk = this._estimator.estimateRisk(input);
    allEvidence.push(...risk.evidence);

    const confidence = this._estimator.estimateConfidence(input);
    allEvidence.push(...confidence.evidence);

    const rollback = this._estimator.estimateRollbackAvailability(input);
    allEvidence.push(...rollback.evidence);

    const assumptions = this._estimator.generateAssumptions(input);
    const actionBreakdown = this._estimator.generateActionBreakdown(input);

    const explainability = this._buildExplainability(input, type, confidence.value, allEvidence, assumptions);

    return {
      id: generateSimulationId(),
      planId: input.plan.id,
      type,
      generatedAt: new Date().toISOString(),
      estimatedDuration: duration.value,
      estimatedHealthBefore: healthBefore.value,
      estimatedHealthAfter: healthAfter.value,
      estimatedStorageRecovered: storage.value,
      estimatedPerformanceGain: performance.value,
      estimatedPrivacyImprovement: privacy.value,
      estimatedMemoryRecovery: memory.value,
      estimatedStartupImprovement: startup.value,
      estimatedRisk: risk.value,
      estimatedConfidence: confidence.value,
      rollbackAvailability: rollback.value,
      assumptions,
      supportingEvidence: allEvidence,
      explainability,
      actionBreakdown,
      futureMetadata: {},
    };
  }

  private _buildExplainability(
    input: SimulationInput,
    type: SimulationType,
    confidence: number,
    evidence: Evidence[],
    assumptions: { description: string }[],
  ): SimulationExplainability {
    const typeLabel = this._scenarioBuilder.getSimulationTypeLabel(type);
    const evidenceUsed = evidence.map((e) => `${e.source}:${e.metric}`);
    const assumptionTexts = assumptions.map((a) => a.description);

    const uncertainty = confidence < 0.5
      ? 'Low confidence — estimates may vary significantly from actual outcomes'
      : confidence < 0.75
        ? 'Moderate confidence — estimates should be reasonably accurate but may deviate'
        : 'High confidence — estimates are likely to be close to actual outcomes';

    return {
      whyThisEstimate: `This ${typeLabel} simulation estimates outcomes based on plan configuration (${input.plan.confidence * 100}% confidence), historical data (${input.optimizationHistory.length} entries), current health score (${input.healthScore}), and risk assessment (${input.plan.estimatedRisk}).`,
      evidenceUsed,
      confidenceScore: confidence,
      assumptions: assumptionTexts,
      potentialUncertainty: uncertainty,
      alternativePlanId: input.plan.deferredActions.length > 0 ? null : null,
      futureMetadata: {},
    };
  }

  get estimator(): SimulationEstimator { return this._estimator; }
  get scenarioBuilder(): SimulationScenarioBuilder { return this._scenarioBuilder; }
  get config(): SimulationConfiguration { return this._config; }

  updateConfig(config: SimulationConfiguration): void {
    this._config = config;
    this._estimator.updateConfig(config);
  }
}
