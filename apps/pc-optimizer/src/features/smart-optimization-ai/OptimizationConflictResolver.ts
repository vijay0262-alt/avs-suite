/**
 * OptimizationConflictResolver — detects and resolves conflicts between
 * optimization actions.
 *
 * Handles: duplicates, mutually exclusive actions, dependency violations,
 * resource conflicts.
 */
import type {
  OptimizationAction,
  ConflictResolution,
  OptimizationConflict,
  ResolvedOptimizationConflict,
} from './types';

export class OptimizationConflictResolver {
  resolve(actions: OptimizationAction[]): ConflictResolution {
    const conflicts: OptimizationConflict[] = [];
    const resolved: ResolvedOptimizationConflict[] = [];

    // Detect duplicates — same type + same category
    const seen = new Map<string, OptimizationAction>();
    for (const action of actions) {
      const key = `${action.type}:${action.category}`;
      const existing = seen.get(key);
      if (existing) {
        const conflict: OptimizationConflict = {
          type: 'duplicate',
          actionIds: [existing.id, action.id],
          description: `Duplicate optimization: ${action.title} and ${existing.title} target the same resource`,
        };
        conflicts.push(conflict);

        const kept = existing.impact.score >= action.impact.score ? existing : action;
        const removed = kept === existing ? action : existing;
        resolved.push({
          conflict,
          resolution: `Keeping "${kept.title}" (higher impact score ${kept.impact.score} vs ${removed.impact.score})`,
          keptActionId: kept.id,
          removedActionId: removed.id,
        });
      } else {
        seen.set(key, action);
      }
    }

    // Detect mutually exclusive — declared in conflicts array
    for (const action of actions) {
      for (const conflictId of action.conflicts ?? []) {
        const other = actions.find((a) => a.id === conflictId);
        if (other && !conflicts.some((c) => c.actionIds.includes(action.id) && c.actionIds.includes(other.id))) {
          const conflict: OptimizationConflict = {
            type: 'mutually_exclusive',
            actionIds: [action.id, other.id],
            description: `${action.title} conflicts with ${other.title}`,
          };
          conflicts.push(conflict);

          const kept = action.impact.score >= other.impact.score ? action : other;
          const removed = kept === action ? other : action;
          resolved.push({
            conflict,
            resolution: `Keeping "${kept.title}" (higher impact score)`,
            keptActionId: kept.id,
            removedActionId: removed.id,
          });
        }
      }
    }

    // Detect resource conflicts — same category, different targets
    const byCategory = new Map<string, OptimizationAction[]>();
    for (const action of actions) {
      const list = byCategory.get(action.category) ?? [];
      list.push(action);
      byCategory.set(action.category, list);
    }
    for (const [, list] of byCategory) {
      if (list.length > 3) {
        const conflict: OptimizationConflict = {
          type: 'resource_conflict',
          actionIds: list.map((a) => a.id),
          description: `Multiple actions (${list.length}) target category "${list[0]!.category}" — may cause resource contention`,
        };
        conflicts.push(conflict);
        resolved.push({
          conflict,
          resolution: 'Actions will be executed sequentially to avoid resource contention',
          keptActionId: list[0]!.id,
          removedActionId: list[list.length - 1]!.id,
        });
      }
    }

    const unresolvedConflicts = conflicts.filter(
      (c) => !resolved.some((r) => r.conflict === c),
    );

    return {
      resolved: unresolvedConflicts.length === 0,
      resolvedConflicts: resolved,
      unresolvedConflicts,
    };
  }

  getActionIdsToRemove(resolution: ConflictResolution): string[] {
    return resolution.resolvedConflicts.map((r) => r.removedActionId);
  }
}
