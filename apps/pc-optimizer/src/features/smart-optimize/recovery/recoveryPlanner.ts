/**
 * Optimization Recovery & Rollback Center — Planner
 *
 * Creates evidence-based, explainable recovery plans from optimization
 * history, snapshot data, and step results. Does NOT execute recovery.
 */
import type {
  RecoveryPlan,
  RecoveryStep,
  RecoveryAssumption,
  RecoveryExplainability,
  RecoveryPlanningInput,
  RecoveryConfiguration,
  RecoveryProviderPlugin,
  RecoveryRecord,
  Evidence,
  RiskLevel,
} from './types';
import {
  generateRecoveryPlanId,
  generateRecoveryStepId,
  generateAssumptionId,
  generateRecoveryId,
  riskToScore,
  getRecoveryTypeLabel,
} from './types';

export class RecoveryPlanner {
  private _config: RecoveryConfiguration;
  private _plugins: RecoveryProviderPlugin[] = [];

  constructor(config: RecoveryConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecoveryConfiguration): void {
    this._config = config;
  }

  registerPlugin(plugin: RecoveryProviderPlugin): boolean {
    if (this._plugins.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  unregisterPlugin(name: string): boolean {
    const idx = this._plugins.findIndex((p) => p.getPluginName() === name);
    if (idx === -1) return false;
    this._plugins.splice(idx, 1);
    return true;
  }

  plan(input: RecoveryPlanningInput): RecoveryPlan {
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getRecoveryType() === input.recoveryType) {
        const plan = plugin.planRecovery(input);
        if (plan) return plan;
      }
    }

    return this._builtinPlan(input);
  }

  createRecoveryRecord(input: RecoveryPlanningInput, plan: RecoveryPlan): RecoveryRecord {
    return {
      id: generateRecoveryId(),
      operationId: input.operationId,
      snapshotId: input.snapshotId,
      createdAt: new Date().toISOString(),
      recoveryType: input.recoveryType,
      affectedModules: plan.affectedModules,
      estimatedDuration: plan.estimatedDuration,
      estimatedRisk: plan.estimatedRisk,
      estimatedSuccess: plan.estimatedSuccess,
      rollbackDepth: plan.rollbackDepth,
      healthBefore: input.healthBefore,
      healthAfter: input.healthAfter,
      storageImpact: 0,
      performanceImpact: 0,
      confidence: plan.confidence,
      supportingEvidence: plan.supportingEvidence,
      futureMetadata: {},
    };
  }

  private _builtinPlan(input: RecoveryPlanningInput): RecoveryPlan {
    const steps = this._generateSteps(input);
    const evidence = this._generateEvidence(input);
    const assumptions = this._generateAssumptions(input);
    const explainability = this._generateExplainability(input, steps, evidence);
    const estimatedRisk = this._estimateRisk(steps);
    const confidence = this._estimateConfidence(input, steps);

    return {
      id: generateRecoveryPlanId(),
      recoveryId: '',
      steps,
      estimatedDuration: steps.reduce((sum, s) => sum + s.estimatedDuration, 0),
      estimatedRisk,
      estimatedSuccess: confidence,
      rollbackDepth: this._determineDepth(input),
      affectedModules: this._getAffectedModules(steps),
      dependencies: input.snapshot.dependencies,
      confidence,
      assumptions,
      supportingEvidence: evidence,
      explainability,
      createdAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _generateSteps(input: RecoveryPlanningInput): RecoveryStep[] {
    const steps: RecoveryStep[] = [];

    const rollbackableSteps = input.stepResults.filter(
      (s) => s.rollbackAvailable && s.status === 'completed',
    );

    if (rollbackableSteps.length > 0) {
      for (const stepResult of rollbackableSteps) {
        steps.push({
          id: generateRecoveryStepId(),
          title: `Rollback: ${stepResult.stepTitle}`,
          description: `Rollback step "${stepResult.stepTitle}" to its pre-optimization state using snapshot ${input.snapshotId}.`,
          recoveryType: input.recoveryType,
          module: stepResult.stepId,
          action: 'rollback_step',
          estimatedDuration: stepResult.durationMs > 0 ? stepResult.durationMs : 5000,
          estimatedRisk: 'low',
          rollbackAvailable: true,
          dependencies: [],
          futureMetadata: {},
        });
      }
    }

    if (steps.length === 0 && input.snapshot.providers.length > 0) {
      steps.push({
        id: generateRecoveryStepId(),
        title: `Full snapshot restore (${getRecoveryTypeLabel(input.recoveryType)})`,
        description: `Restore all system state from snapshot ${input.snapshotId} using providers: ${input.snapshot.providers.join(', ')}.`,
        recoveryType: input.recoveryType,
        module: 'system',
        action: 'restore_snapshot',
        estimatedDuration: 30000,
        estimatedRisk: 'medium',
        rollbackAvailable: true,
        dependencies: [],
        futureMetadata: {},
      });
    }

    return steps;
  }

  private _generateEvidence(input: RecoveryPlanningInput): Evidence[] {
    const evidence: Evidence[] = [];

    evidence.push({
      source: 'snapshot_catalog',
      metric: 'snapshot_available',
      value: input.snapshot.recoveryAvailable,
      timestamp: new Date().toISOString(),
      description: `Snapshot ${input.snapshotId} recovery availability: ${input.snapshot.recoveryAvailable}`,
      futureMetadata: {},
    });

    evidence.push({
      source: 'snapshot_catalog',
      metric: 'integrity_status',
      value: input.snapshot.integrityStatus,
      timestamp: new Date().toISOString(),
      description: `Snapshot integrity: ${input.snapshot.integrityStatus}`,
      futureMetadata: {},
    });

    evidence.push({
      source: 'execution_pipeline',
      metric: 'rollbackable_steps',
      value: input.stepResults.filter((s) => s.rollbackAvailable && s.status === 'completed').length,
      timestamp: new Date().toISOString(),
      description: `${input.stepResults.filter((s) => s.rollbackAvailable && s.status === 'completed').length} rollbackable step(s) found`,
      futureMetadata: {},
    });

    evidence.push({
      source: 'optimization_history',
      metric: 'history_entries',
      value: input.optimizationHistory.length,
      timestamp: new Date().toISOString(),
      description: `${input.optimizationHistory.length} optimization history entries available for analysis`,
      futureMetadata: {},
    });

    if (input.healthBefore !== input.healthAfter) {
      evidence.push({
        source: 'health_score',
        metric: 'health_delta',
        value: input.healthBefore - input.healthAfter,
        timestamp: new Date().toISOString(),
        description: `Health changed from ${input.healthBefore} to ${input.healthAfter}`,
        futureMetadata: {},
      });
    }

    return evidence;
  }

  private _generateAssumptions(input: RecoveryPlanningInput): RecoveryAssumption[] {
    const assumptions: RecoveryAssumption[] = [];

    assumptions.push({
      id: generateAssumptionId(),
      description: 'Snapshot providers can restore the system to its pre-optimization state',
      impact: 0.8,
      confidence: 0.9,
      category: 'infrastructure',
      futureMetadata: {},
    });

    if (input.stepResults.length === 0) {
      assumptions.push({
        id: generateAssumptionId(),
        description: 'No step results available — full snapshot restore will be used',
        impact: 0.5,
        confidence: 0.7,
        category: 'fallback',
        futureMetadata: {},
      });
    }

    if (input.optimizationHistory.length === 0) {
      assumptions.push({
        id: generateAssumptionId(),
        description: 'No optimization history — confidence based on snapshot integrity only',
        impact: 0.3,
        confidence: 0.6,
        category: 'data_gap',
        futureMetadata: {},
      });
    }

    return assumptions;
  }

  private _generateExplainability(
    input: RecoveryPlanningInput,
    steps: RecoveryStep[],
    evidence: Evidence[],
  ): RecoveryExplainability {
    const rollbackableCount = input.stepResults.filter((s) => s.rollbackAvailable && s.status === 'completed').length;
    const reason = `Recovery plan for ${getRecoveryTypeLabel(input.recoveryType)}: ${steps.length} step(s) targeting ${input.snapshot.providers.length} provider(s). ${rollbackableCount} rollbackable step(s) identified.`;

    const evidenceUsed = evidence.map((e) => `${e.source}:${e.metric}`);
    const affectedComponents = steps.map((s) => s.module);
    const estimatedOutcome = `Restore system to pre-optimization state using snapshot ${input.snapshotId}. Estimated health: ${input.healthBefore}.`;
    const potentialRisks: string[] = [];

    if (input.snapshot.integrityStatus === 'degraded') {
      potentialRisks.push('Snapshot integrity is degraded — recovery may be partial');
    }
    if (input.snapshot.dependencies.length > 0) {
      potentialRisks.push(`${input.snapshot.dependencies.length} unresolved dependencies may affect recovery`);
    }
    const highRiskSteps = steps.filter((s) => riskToScore(s.estimatedRisk) >= 3);
    if (highRiskSteps.length > 0) {
      potentialRisks.push(`${highRiskSteps.length} high-risk step(s) in recovery plan`);
    }

    const alternativeRecovery = steps.length > 1
      ? `Alternative: perform partial rollback of ${rollbackableCount} step(s) instead of full restore`
      : null;

    return {
      reason,
      evidenceUsed,
      affectedComponents,
      estimatedOutcome,
      confidence: this._estimateConfidence(input, steps),
      potentialRisks,
      alternativeRecovery,
      futureMetadata: {},
    };
  }

  private _estimateRisk(steps: RecoveryStep[]): RiskLevel {
    const maxRisk = Math.max(0, ...steps.map((s) => riskToScore(s.estimatedRisk)));
    if (maxRisk >= 4) return 'critical';
    if (maxRisk >= 3) return 'high';
    if (maxRisk >= 2) return 'medium';
    if (maxRisk >= 1) return 'low';
    return 'none';
  }

  private _estimateConfidence(input: RecoveryPlanningInput, steps: RecoveryStep[]): number {
    let confidence = 0.5;

    if (input.snapshot.integrityStatus === 'intact' || input.snapshot.integrityStatus === 'verified') {
      confidence += 0.2;
    } else if (input.snapshot.integrityStatus === 'degraded') {
      confidence += 0.05;
    }

    if (input.snapshot.providers.length > 0) confidence += 0.1;
    if (steps.length > 0) confidence += 0.1;
    if (input.optimizationHistory.length > 0) confidence += 0.05;

    return Math.min(1, confidence);
  }

  private _determineDepth(input: RecoveryPlanningInput): number {
    const rollbackable = input.stepResults.filter((s) => s.rollbackAvailable && s.status === 'completed').length;
    return Math.min(rollbackable > 0 ? rollbackable : 1, this._config.recoveryPolicyRules.maxRollbackDepth);
  }

  private _getAffectedModules(steps: RecoveryStep[]): string[] {
    const modules = new Set<string>();
    for (const step of steps) {
      modules.add(step.module);
    }
    return Array.from(modules);
  }
}
