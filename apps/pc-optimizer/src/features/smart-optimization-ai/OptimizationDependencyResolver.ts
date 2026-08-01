/**
 * OptimizationDependencyResolver — resolves execution order for
 * optimization actions based on their declared dependencies.
 *
 * Uses topological sort to produce a valid execution order.
 */
import type {
  OptimizationAction,
  DependencyResolution,
  UnresolvedDependency,
} from './types';

export class OptimizationDependencyResolver {
  resolve(actions: OptimizationAction[]): DependencyResolution {
    const actionMap = new Map<string, OptimizationAction>();
    for (const action of actions) {
      actionMap.set(action.id, action);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];
    const unresolved: UnresolvedDependency[] = [];

    const visit = (actionId: string): boolean => {
      if (visited.has(actionId)) return true;
      if (visiting.has(actionId)) return false; // cycle detected

      const action = actionMap.get(actionId);
      if (!action) return false;

      visiting.add(actionId);

      for (const depId of action.dependencies) {
        if (!actionMap.has(depId)) {
          unresolved.push({
            actionId,
            missingDependency: depId,
            reason: `Dependency "${depId}" is not in the action set`,
          });
          continue;
        }
        if (!visit(depId)) {
          unresolved.push({
            actionId,
            missingDependency: depId,
            reason: `Circular dependency detected involving "${depId}"`,
          });
        }
      }

      visiting.delete(actionId);
      visited.add(actionId);
      order.push(actionId);
      return true;
    };

    for (const action of actions) {
      visit(action.id);
    }

    return {
      resolved: unresolved.length === 0,
      order,
      unresolvedDependencies: unresolved,
    };
  }
}
