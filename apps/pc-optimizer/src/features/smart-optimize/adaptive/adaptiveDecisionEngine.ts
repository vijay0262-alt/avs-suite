/**
 * Adaptive Decision Engine — makes adaptation decisions based on conditions and policies.
 *
 * Each decision includes: id, condition, decision, reason, confidence, priority,
 * estimatedImpact, estimatedDelay, rollbackAvailable, futureMetadata.
 */
import type {
  Condition,
  AdaptationDecision,
  AdaptationAction,
  RecommendationPriority,
  EvaluationContext,
  AdaptiveConfiguration,
} from './types';
import { generateDecisionId, severityToScore } from './types';
import type { AdaptivePolicyEngine, PolicyEvaluationResult } from './adaptivePolicyEngine';

export class AdaptiveDecisionEngine {
  private _policyEngine: AdaptivePolicyEngine;
  private _config: AdaptiveConfiguration;

  constructor(policyEngine: AdaptivePolicyEngine, config: AdaptiveConfiguration) {
    this._policyEngine = policyEngine;
    this._config = config;
  }

  decide(conditions: Condition[], context: EvaluationContext): AdaptationDecision[] {
    const decisions: AdaptationDecision[] = [];

    for (const condition of conditions) {
      const policyResult = this._policyEngine.evaluate([condition], context);
      if (policyResult.action === 'no_action') continue;

      const decision = this._createDecision(condition, policyResult, context);
      decisions.push(decision);
    }

    // Sort by severity (highest first)
    decisions.sort((a, b) => {
      const sevA = conditions.find((c) => c.name === a.condition)?.severity ?? 'none';
      const sevB = conditions.find((c) => c.name === b.condition)?.severity ?? 'none';
      return severityToScore(sevB) - severityToScore(sevA);
    });

    return decisions;
  }

  private _createDecision(
    condition: Condition,
    policyResult: PolicyEvaluationResult,
    context: EvaluationContext,
  ): AdaptationDecision {
    const priority = this._determinePriority(condition);
    const estimatedImpact = this._estimateImpact(condition, policyResult.action, context);
    const estimatedDelay = this._estimateDelay(condition, policyResult.action);
    const affectedActionIds = this._determineAffectedActions(condition, policyResult.action, context);

    return {
      id: generateDecisionId(),
      condition: condition.name,
      conditionType: condition.type,
      decision: policyResult.action,
      reason: policyResult.reason,
      confidence: policyResult.confidence,
      priority,
      estimatedImpact,
      estimatedDelay,
      rollbackAvailable: context.plan.rollbackAvailable,
      affectedActionIds,
      futureMetadata: {},
    };
  }

  private _determinePriority(condition: Condition): RecommendationPriority {
    switch (condition.severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'informational';
    }
  }

  private _estimateImpact(condition: Condition, action: AdaptationAction, _context: EvaluationContext): number {
    const severityScore = severityToScore(condition.severity);
    const actionImpact: Record<AdaptationAction, number> = {
      cancel_plan: 1.0,
      pause_plan: 0.8,
      postpone_step: 0.5,
      skip_step: 0.6,
      reduce_scope: 0.4,
      reorder_step: 0.3,
      increase_scope: 0.2,
      split_plan: 0.5,
      resume_plan: 0.3,
      no_action: 0,
      future_adaptation: 0,
    };
    const baseImpact = actionImpact[action] ?? 0.5;
    return Math.round((severityScore * 0.5 + baseImpact * 0.5) * 100) / 100;
  }

  private _estimateDelay(condition: Condition, action: AdaptationAction): number {
    const delays: Record<AdaptationAction, number> = {
      postpone_step: 300,
      pause_plan: 600,
      reduce_scope: 0,
      skip_step: 0,
      reorder_step: 0,
      increase_scope: 0,
      split_plan: 0,
      cancel_plan: 0,
      resume_plan: 0,
      no_action: 0,
      future_adaptation: 0,
    };
    const baseDelay = delays[action] ?? 0;
    const severityMultiplier = 1 + severityToScore(condition.severity);
    return Math.round(baseDelay * severityMultiplier);
  }

  private _determineAffectedActions(
    condition: Condition,
    action: AdaptationAction,
    context: EvaluationContext,
  ): string[] {
    if (action === 'cancel_plan' || action === 'pause_plan') {
      return context.plan.recommendedActions.map((a) => a.id);
    }
    if (action === 'skip_step' || action === 'postpone_step') {
      // Affect actions that match the condition type
      return context.plan.recommendedActions
        .filter((a) => this._actionMatchesCondition(a.category, condition.type))
        .map((a) => a.id);
    }
    if (action === 'reduce_scope') {
      // Affect the lower-priority actions
      return context.plan.recommendedActions
        .slice(Math.ceil(context.plan.recommendedActions.length / 2))
        .map((a) => a.id);
    }
    return [];
  }

  private _actionMatchesCondition(category: string, conditionType: string): boolean {
    const matches: Record<string, string[]> = {
      cpu_usage: ['performance'],
      memory_usage: ['performance', 'memory'],
      disk_activity: ['storage'],
      windows_update: ['maintenance', 'security'],
      thermal_state: ['performance'],
    };
    return matches[conditionType]?.includes(category) ?? false;
  }
}
