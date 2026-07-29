/**
 * Optimization Conflict Resolver — detects and resolves action conflicts.
 *
 * Detects: Duplicate Actions, Conflicting Optimizations,
 * Dependency Violations, Mutually Exclusive Steps, Unsupported Modules.
 * Resolves automatically where possible.
 */
import type {
  SmartPlanAction,
  ConflictResolutionResult,
  Conflict,
  ResolvedConflict,
  RecommendationCategory,
} from './types';

export class OptimizationConflictResolver {
  resolve(actions: SmartPlanAction[]): ConflictResolutionResult {
    const conflicts = this._detectConflicts(actions);
    const resolvedConflicts: ResolvedConflict[] = [];
    const unresolvedConflicts: Conflict[] = [];

    for (const conflict of conflicts) {
      const resolution = this._resolveConflict(conflict, actions);
      if (resolution) {
        resolvedConflicts.push(resolution);
      } else {
        unresolvedConflicts.push(conflict);
      }
    }

    return { conflicts, resolvedConflicts, unresolvedConflicts };
  }

  private _detectConflicts(actions: SmartPlanAction[]): Conflict[] {
    const conflicts: Conflict[] = [];

    conflicts.push(...this._detectDuplicates(actions));
    conflicts.push(...this._detectMutuallyExclusive(actions));
    conflicts.push(...this._detectDependencyViolations(actions));
    conflicts.push(...this._detectUnsupportedModules(actions));

    return conflicts;
  }

  private _detectDuplicates(actions: SmartPlanAction[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const seen = new Map<string, SmartPlanAction[]>();

    for (const action of actions) {
      const key = action.title.toLowerCase();
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(action);
    }

    for (const [, group] of seen) {
      if (group.length > 1) {
        conflicts.push({
          type: 'duplicate',
          actionIds: group.map((a) => a.id),
          description: `Duplicate actions detected: "${group[0]!.title}"`,
        });
      }
    }

    return conflicts;
  }

  private _detectMutuallyExclusive(actions: SmartPlanAction[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const exclusivePairs: Array<[RecommendationCategory, RecommendationCategory]> = [
      ['performance', 'privacy'],
    ];

    for (const [catA, catB] of exclusivePairs) {
      const aActions = actions.filter((a) => a.category === catA);
      const bActions = actions.filter((a) => a.category === catB);

      if (aActions.length > 0 && bActions.length > 0) {
        const aIds = aActions.map((a) => a.id);
        const bIds = bActions.map((a) => a.id);
        conflicts.push({
          type: 'mutually_exclusive',
          actionIds: [...aIds, ...bIds],
          description: `Actions in "${catA}" and "${catB}" may conflict`,
        });
      }
    }

    return conflicts;
  }

  private _detectDependencyViolations(actions: SmartPlanAction[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const actionIds = new Set(actions.map((a) => a.id));

    for (const action of actions) {
      for (const depId of action.dependencies) {
        if (!actionIds.has(depId)) {
          conflicts.push({
            type: 'dependency_violation',
            actionIds: [action.id],
            description: `Action "${action.title}" depends on missing action "${depId}"`,
          });
        }
      }
    }

    return conflicts;
  }

  private _detectUnsupportedModules(actions: SmartPlanAction[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const unsupportedCategories: RecommendationCategory[] = [];

    for (const action of actions) {
      if (unsupportedCategories.includes(action.category)) {
        conflicts.push({
          type: 'unsupported_module',
          actionIds: [action.id],
          description: `Action "${action.title}" uses unsupported category "${action.category}"`,
        });
      }
    }

    return conflicts;
  }

  private _resolveConflict(conflict: Conflict, actions: SmartPlanAction[]): ResolvedConflict | null {
    switch (conflict.type) {
      case 'duplicate': {
        const conflictActions = actions.filter((a) => conflict.actionIds.includes(a.id));
        conflictActions.sort((a, b) => b.priorityScore - a.priorityScore);
        const keepId = conflictActions[0]!.id;
        const removeIds = conflict.actionIds.filter((id) => id !== keepId);
        return {
          conflict,
          resolution: `Kept highest-priority action, removed ${removeIds.length} duplicate(s)`,
          resolvedActionIds: removeIds,
        };
      }
      case 'mutually_exclusive': {
        const conflictActions = actions.filter((a) => conflict.actionIds.includes(a.id));
        const keepIds = new Set<string>();
        const categoriesSeen = new Set<string>();
        for (const action of conflictActions.sort((a, b) => b.priorityScore - a.priorityScore)) {
          if (!categoriesSeen.has(action.category)) {
            keepIds.add(action.id);
            categoriesSeen.add(action.category);
          }
        }
        const removeIds = conflict.actionIds.filter((id) => !keepIds.has(id));
        return {
          conflict,
          resolution: `Kept highest-priority action per category, removed ${removeIds.length} conflicting action(s)`,
          resolvedActionIds: removeIds,
        };
      }
      case 'dependency_violation': {
        return {
          conflict,
          resolution: `Removed action with unresolvable dependency`,
          resolvedActionIds: conflict.actionIds,
        };
      }
      case 'unsupported_module': {
        return {
          conflict,
          resolution: `Removed action with unsupported module`,
          resolvedActionIds: conflict.actionIds,
        };
      }
      default:
        return null;
    }
  }

  removeActions(actions: SmartPlanAction[], idsToRemove: string[]): SmartPlanAction[] {
    const removeSet = new Set(idsToRemove);
    return actions.filter((a) => !removeSet.has(a.id));
  }
}
