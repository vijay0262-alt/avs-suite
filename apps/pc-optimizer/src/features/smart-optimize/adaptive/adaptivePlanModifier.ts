/**
 * Adaptive Plan Modifier — applies adaptation decisions to plans.
 *
 * Supports: Postpone Step, Skip Step, Reorder Step, Reduce Scope,
 * Increase Scope, Split Plan, Pause Plan, Resume Plan, Cancel Plan.
 */
import type {
  SmartPlan,
  AdaptationDecision,
} from './types';
import type { SmartPlanAction, ExcludedAction } from '../planner/types';

export class AdaptivePlanModifier {
  modify(plan: SmartPlan, decisions: AdaptationDecision[]): SmartPlan {
    if (decisions.length === 0) return plan;

    const modifiedPlan: SmartPlan = { ...plan };
    let recommendedActions = [...plan.recommendedActions];
    let deferredActions = [...plan.deferredActions];
    const excludedActions = [...plan.excludedActions];

    for (const decision of decisions) {
      const result = this._applyDecision(decision, recommendedActions, deferredActions, excludedActions, modifiedPlan);
      recommendedActions = result.recommended;
      deferredActions = result.deferred;
    }

    modifiedPlan.recommendedActions = recommendedActions;
    modifiedPlan.deferredActions = deferredActions;
    modifiedPlan.excludedActions = excludedActions;
    modifiedPlan.estimatedDuration = this._recalculateDuration(recommendedActions);
    modifiedPlan.futureMetadata = {
      ...modifiedPlan.futureMetadata,
      adapted: true,
      adaptationCount: decisions.length,
    };

    return modifiedPlan;
  }

  private _applyDecision(
    decision: AdaptationDecision,
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
    excluded: ExcludedAction[],
    plan: SmartPlan,
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    switch (decision.decision) {
      case 'postpone_step':
        return this._postponeSteps(recommended, deferred, decision.affectedActionIds);
      case 'skip_step':
        return this._skipSteps(recommended, deferred, excluded, decision.affectedActionIds);
      case 'reorder_step':
        return { recommended: this._reorderSteps(recommended, decision.affectedActionIds), deferred };
      case 'reduce_scope':
        return this._reduceScope(recommended, deferred);
      case 'increase_scope':
        return this._increaseScope(recommended, deferred);
      case 'split_plan':
        return this._splitPlan(recommended, deferred);
      case 'pause_plan':
        return this._pausePlan(recommended, deferred, plan);
      case 'resume_plan':
        return this._resumePlan(recommended, deferred, plan);
      case 'cancel_plan':
        return this._cancelPlan(recommended, deferred, excluded);
      default:
        return { recommended, deferred };
    }
  }

  private _postponeSteps(
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
    actionIds: string[],
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    const idSet = new Set(actionIds);
    const toPostpone = recommended.filter((a) => idSet.has(a.id));
    const remaining = recommended.filter((a) => !idSet.has(a.id));
    return { recommended: remaining, deferred: [...deferred, ...toPostpone] };
  }

  private _skipSteps(
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
    excluded: ExcludedAction[],
    actionIds: string[],
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    const idSet = new Set(actionIds);
    const toSkip = recommended.filter((a) => idSet.has(a.id));
    const remaining = recommended.filter((a) => !idSet.has(a.id));
    for (const action of toSkip) {
      excluded.push({
        id: action.id,
        title: action.title,
        reason: 'Skipped by adaptive engine',
        category: action.category,
      });
    }
    return { recommended: remaining, deferred };
  }

  private _reorderSteps(recommended: SmartPlanAction[], actionIds: string[]): SmartPlanAction[] {
    const idSet = new Set(actionIds);
    const toReorder = recommended.filter((a) => idSet.has(a.id));
    const remaining = recommended.filter((a) => !idSet.has(a.id));
    // Move affected actions to the end
    return [...remaining, ...toReorder];
  }

  private _reduceScope(
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    // Move lower half to deferred
    const midpoint = Math.ceil(recommended.length / 2);
    const kept = recommended.slice(0, midpoint);
    const moved = recommended.slice(midpoint);
    return { recommended: kept, deferred: [...deferred, ...moved] };
  }

  private _increaseScope(
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    // Move deferred actions back to recommended
    const moved = deferred.splice(0, Math.min(3, deferred.length));
    return { recommended: [...recommended, ...moved], deferred };
  }

  private _splitPlan(
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    // Keep only high-priority actions, defer the rest
    const highPriority = recommended.filter((a) => a.priority === 'critical' || a.priority === 'high');
    const rest = recommended.filter((a) => a.priority !== 'critical' && a.priority !== 'high');
    return { recommended: highPriority, deferred: [...deferred, ...rest] };
  }

  private _pausePlan(
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
    _plan: SmartPlan,
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    // Move all actions to deferred
    return { recommended: [], deferred: [...deferred, ...recommended] };
  }

  private _resumePlan(
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
    _plan: SmartPlan,
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    // Move deferred actions back to recommended
    return { recommended: [...recommended, ...deferred], deferred: [] };
  }

  private _cancelPlan(
    recommended: SmartPlanAction[],
    deferred: SmartPlanAction[],
    excluded: ExcludedAction[],
  ): { recommended: SmartPlanAction[]; deferred: SmartPlanAction[] } {
    for (const action of [...recommended, ...deferred]) {
      excluded.push({
        id: action.id,
        title: action.title,
        reason: 'Plan cancelled by adaptive engine',
        category: action.category,
      });
    }
    return { recommended: [], deferred: [] };
  }

  private _recalculateDuration(actions: SmartPlanAction[]): number {
    return actions.reduce((sum, a) => sum + a.estimatedDuration, 0);
  }

  isPlanPaused(plan: SmartPlan): boolean {
    return plan.recommendedActions.length === 0 && plan.deferredActions.length > 0;
  }

  isPlanCancelled(plan: SmartPlan): boolean {
    return plan.recommendedActions.length === 0 && plan.deferredActions.length === 0;
  }
}
