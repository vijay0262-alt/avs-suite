/**
 * Adaptive Planner — orchestrates the full adaptation pipeline.
 *
 * Pipeline:
 *   System State → Condition Evaluator → Policy Engine →
 *   Decision Engine → Plan Modifier → Validator → Adapted Plan
 */
import type {
  SmartPlan,
  SystemState,
  AdaptationResult,
  AdaptationDecision,
  Condition,
  EvaluationContext,
  AdaptiveConfiguration,
  AdaptiveUserPreferences,
  AdaptiveHistoryEntry,
  RiskLevel,
  OptimizationGoal,
} from './types';
import { AdaptiveConditionEvaluator } from './adaptiveConditionEvaluator';
import { AdaptivePolicyEngine } from './adaptivePolicyEngine';
import { AdaptiveDecisionEngine } from './adaptiveDecisionEngine';
import { AdaptivePlanModifier } from './adaptivePlanModifier';
import { AdaptiveValidator } from './adaptiveValidator';
import { AdaptiveConditionRegistry } from './adaptiveConditionRegistry';

export class AdaptivePlanner {
  private _config: AdaptiveConfiguration;
  private _registry: AdaptiveConditionRegistry;
  private _evaluator: AdaptiveConditionEvaluator;
  private _policyEngine: AdaptivePolicyEngine;
  private _decisionEngine: AdaptiveDecisionEngine;
  private _modifier: AdaptivePlanModifier;
  private _validator: AdaptiveValidator;

  constructor(config: AdaptiveConfiguration) {
    this._config = config;
    this._registry = new AdaptiveConditionRegistry(config);
    this._evaluator = new AdaptiveConditionEvaluator(this._registry, config);
    this._policyEngine = new AdaptivePolicyEngine(this._registry, config);
    this._decisionEngine = new AdaptiveDecisionEngine(this._policyEngine, config);
    this._modifier = new AdaptivePlanModifier();
    this._validator = new AdaptiveValidator();
  }

  adapt(plan: SmartPlan, state: SystemState, options?: {
    goal?: OptimizationGoal;
    deviceProfileType?: string;
    riskTolerance?: RiskLevel;
    userPreferences?: AdaptiveUserPreferences | null;
    historicalOutcomes?: AdaptiveHistoryEntry[];
  }): AdaptationResult {
    const context: EvaluationContext = {
      systemState: state,
      plan,
      goal: options?.goal ?? plan.optimizationGoal,
      deviceProfileType: options?.deviceProfileType ?? plan.deviceProfile.profileType,
      riskTolerance: options?.riskTolerance ?? plan.estimatedRisk,
      userPreferences: options?.userPreferences ?? null,
      historicalOutcomes: options?.historicalOutcomes ?? [],
    };

    const conditions = this._evaluator.evaluateWithContext(context);
    const decisions = this._decisionEngine.decide(conditions, context);
    const adaptedPlan = this._modifier.modify(plan, decisions);

    const adapted = JSON.stringify(adaptedPlan.recommendedActions) !== JSON.stringify(plan.recommendedActions) ||
      JSON.stringify(adaptedPlan.deferredActions) !== JSON.stringify(plan.deferredActions);

    const summary = this._generateSummary(conditions, decisions, adapted);

    return {
      originalPlan: plan,
      adaptedPlan,
      decisions,
      conditions,
      adapted,
      summary,
      adaptedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  evaluateConditions(state: SystemState): Condition[] {
    return this._evaluator.evaluate(state);
  }

  validateAdaptation(result: AdaptationResult) {
    return this._validator.validateResult(result);
  }

  get registry(): AdaptiveConditionRegistry {
    return this._registry;
  }

  private _generateSummary(conditions: Condition[], decisions: AdaptationDecision[], adapted: boolean): string {
    if (!adapted) return 'No adaptations needed';
    const parts: string[] = [];
    parts.push(`${decisions.length} adaptation(s) applied`);
    if (conditions.length > 0) {
      parts.push(`${conditions.length} condition(s) detected`);
    }
    const actionCounts: Record<string, number> = {};
    for (const d of decisions) {
      actionCounts[d.decision] = (actionCounts[d.decision] ?? 0) + 1;
    }
    const actionSummary = Object.entries(actionCounts)
      .map(([action, count]) => `${count} ${action}`)
      .join(', ');
    if (actionSummary) parts.push(actionSummary);
    return parts.join(', ');
  }
}
