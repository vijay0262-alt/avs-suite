/**
 * Optimization Sequence Builder — builds ordered execution sequences.
 *
 * Respects dependencies between actions and produces a valid execution order.
 */
import type { SmartPlanAction } from './types';

export class OptimizationSequenceBuilder {
  build(actions: SmartPlanAction[]): SmartPlanAction[] {
    if (actions.length === 0) return [];

    const actionMap = new Map(actions.map((a) => [a.id, a]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: SmartPlanAction[] = [];

    const visit = (actionId: string): void => {
      if (visited.has(actionId)) return;
      if (visiting.has(actionId)) return;

      const action = actionMap.get(actionId);
      if (!action) return;

      visiting.add(actionId);

      for (const depId of action.dependencies) {
        if (actionMap.has(depId)) {
          visit(depId);
        }
      }

      visiting.delete(actionId);
      visited.add(actionId);
      result.push(action);
    };

    for (const action of actions) {
      visit(action.id);
    }

    return result;
  }

  validateSequence(actions: SmartPlanAction[]): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    const executed = new Set<string>();

    for (const action of actions) {
      for (const depId of action.dependencies) {
        if (!executed.has(depId)) {
          violations.push(`Action "${action.title}" depends on "${depId}" which has not been executed yet`);
        }
      }
      executed.add(action.id);
    }

    return { valid: violations.length === 0, violations };
  }

  estimateTotalDuration(actions: SmartPlanAction[]): number {
    return actions.reduce((sum, a) => sum + a.estimatedDuration, 0);
  }
}
