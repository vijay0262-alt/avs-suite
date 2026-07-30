/**
 * Goal Orchestration Engine — Dependency Resolver
 *
 * Manages goal chains, prerequisites, parent/child goals,
 * mutually exclusive goals, and shared objectives.
 * Builds a dependency graph and computes execution order.
 */
import type {
  Goal,
  DependencyResolution,
  DependencyGraph,
  DependencyGraphNode,
  DependencyGraphEdge,
  OrchestrationDependencyType,
  OrchestrationState,
} from './types';

export class GoalDependencyResolver {
  resolve(goal: Goal, allGoals: Map<string, Goal>): DependencyResolution {
    const blocking: string[] = [];
    const resolved: string[] = [];
    const unresolved: string[] = [];

    for (const dep of goal.dependencies) {
      if (!dep.required) continue;
      const depGoal = allGoals.get(dep.goalId);
      if (!depGoal) {
        unresolved.push(dep.goalId);
        continue;
      }

      if (dep.type === 'blocking' || dep.type === 'prerequisite') {
        if (depGoal.status === 'completed') {
          resolved.push(dep.goalId);
        } else {
          blocking.push(dep.goalId);
          unresolved.push(dep.goalId);
        }
      } else {
        if (depGoal.status === 'completed' || depGoal.status === 'in_progress') {
          resolved.push(dep.goalId);
        } else {
          unresolved.push(dep.goalId);
        }
      }
    }

    const canExecute = blocking.length === 0;
    const reason = canExecute
      ? 'All required dependencies are resolved'
      : `Blocked by ${blocking.length} dependencies: ${blocking.join(', ')}`;

    return {
      goalId: goal.id,
      canExecute,
      blockingDependencies: blocking,
      resolvedDependencies: resolved,
      unresolvedDependencies: unresolved,
      executionOrder: 0,
      reason,
      futureMetadata: {},
    };
  }

  resolveAll(goals: Goal[], allGoals: Map<string, Goal>): DependencyResolution[] {
    const resolutions = goals.map((g) => this.resolve(g, allGoals));

    // Compute execution order based on dependency chains
    const order = this._computeExecutionOrder(goals, allGoals);
    for (const r of resolutions) {
      r.executionOrder = order.indexOf(r.goalId) + 1;
    }

    return resolutions;
  }

  buildGraph(goals: Goal[], allGoals: Map<string, Goal>): DependencyGraph {
    const nodes: DependencyGraphNode[] = goals.map((g) => ({
      goalId: g.id,
      goalName: g.name,
      state: this._goalStatusToOrchestrationState(g.status),
      futureMetadata: {},
    }));

    const edges: DependencyGraphEdge[] = [];
    const visited = new Set<string>();

    for (const goal of goals) {
      for (const dep of goal.dependencies) {
        const edgeKey = `${goal.id}->${dep.goalId}`;
        if (visited.has(edgeKey)) continue;
        visited.add(edgeKey);

        edges.push({
          from: goal.id,
          to: dep.goalId,
          type: this._mapDependencyType(dep.type),
          required: dep.required,
          futureMetadata: {},
        });
      }
    }

    const cycles = this._detectCycles(nodes, edges);
    const executionOrder = this._computeExecutionOrder(goals, allGoals);

    return {
      nodes,
      edges,
      cycles,
      executionOrder,
      futureMetadata: {},
    };
  }

  getDependents(goalId: string, allGoals: Map<string, Goal>): Goal[] {
    const dependents: Goal[] = [];
    for (const g of allGoals.values()) {
      if (g.dependencies.some((d) => d.goalId === goalId)) {
        dependents.push(g);
      }
    }
    return dependents;
  }

  getMutuallyExclusive(goal: Goal, allGoals: Map<string, Goal>): Goal[] {
    const exclusive: Goal[] = [];
    for (const dep of goal.dependencies) {
      if (dep.type === 'blocking' && dep.required) {
        const depGoal = allGoals.get(dep.goalId);
        if (depGoal) exclusive.push(depGoal);
      }
    }
    return exclusive;
  }

  getSharedObjectives(goal: Goal, allGoals: Map<string, Goal>): Goal[] {
    const shared: Goal[] = [];
    for (const g of allGoals.values()) {
      if (g.id === goal.id) continue;
      if (g.targetMetric === goal.targetMetric) {
        shared.push(g);
      }
    }
    return shared;
  }

  private _computeExecutionOrder(goals: Goal[], _allGoals: Map<string, Goal>): string[] {
    const sorted: Goal[] = [...goals].sort((a, b) => {
      const aDeps = a.dependencies.filter((d) => d.required).length;
      const bDeps = b.dependencies.filter((d) => d.required).length;
      return aDeps - bDeps;
    });
    return sorted.map((g) => g.id);
  }

  private _detectCycles(nodes: DependencyGraphNode[], edges: DependencyGraphEdge[]): string[][] {
    const adj = new Map<string, string[]>();
    for (const node of nodes) {
      adj.set(node.goalId, []);
    }
    for (const edge of edges) {
      if (adj.has(edge.from)) {
        adj.get(edge.from)!.push(edge.to);
      }
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      if (path.includes(node)) {
        const cycleStart = path.indexOf(node);
        cycles.push([...path.slice(cycleStart), node]);
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      path.push(node);
      for (const neighbor of adj.get(node) ?? []) {
        dfs(neighbor);
      }
      path.pop();
    };

    for (const node of nodes) {
      dfs(node.goalId);
    }

    return cycles;
  }

  private _mapDependencyType(type: Goal['dependencies'][number]['type']): OrchestrationDependencyType {
    switch (type) {
      case 'parent': return 'parent';
      case 'child': return 'child';
      case 'chain': return 'chain';
      case 'prerequisite': return 'prerequisite';
      case 'blocking': return 'mutually_exclusive';
      case 'optional': return 'shared_objective';
      default: return 'future_dependency';
    }
  }

  private _goalStatusToOrchestrationState(status: Goal['status']): OrchestrationState {
    switch (status) {
      case 'draft': return 'pending';
      case 'started': return 'planning';
      case 'in_progress': return 'executing';
      case 'paused': return 'paused';
      case 'completed': return 'completed';
      case 'cancelled': return 'cancelled';
      case 'blocked': return 'blocked';
      default: return 'future_state';
    }
  }
}
