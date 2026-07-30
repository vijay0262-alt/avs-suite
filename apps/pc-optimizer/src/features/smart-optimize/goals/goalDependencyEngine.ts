/**
 * Goals & Objectives Engine — Dependency Engine
 *
 * Manages parent/child goals, chains, prerequisites, and blocking dependencies.
 */
import type { Goal, GoalDependency, DependencyType } from './types';
import { generateDependencyId } from './types';

export class GoalDependencyEngine {
  addDependency(goal: Goal, dependency: Omit<GoalDependency, 'id'>): GoalDependency {
    const dep: GoalDependency = { ...dependency, id: generateDependencyId() };
    goal.dependencies.push(dep);
    return dep;
  }

  removeDependency(goal: Goal, dependencyId: string): boolean {
    const idx = goal.dependencies.findIndex((d) => d.id === dependencyId);
    if (idx === -1) return false;
    goal.dependencies.splice(idx, 1);
    return true;
  }

  getDependencies(goal: Goal, type?: DependencyType): GoalDependency[] {
    if (type) return goal.dependencies.filter((d) => d.type === type);
    return goal.dependencies;
  }

  getBlockingDependencies(goal: Goal): GoalDependency[] {
    return goal.dependencies.filter((d) => d.type === 'blocking' && d.required);
  }

  getPrerequisites(goal: Goal): GoalDependency[] {
    return goal.dependencies.filter((d) => d.type === 'prerequisite' && d.required);
  }

  isBlocked(goal: Goal, allGoals: Map<string, Goal>): boolean {
    const blocking = this.getBlockingDependencies(goal);
    for (const dep of blocking) {
      const depGoal = allGoals.get(dep.goalId);
      if (!depGoal) continue;
      if (depGoal.status !== 'completed') return true;
    }
    const prereqs = this.getPrerequisites(goal);
    for (const dep of prereqs) {
      const depGoal = allGoals.get(dep.goalId);
      if (!depGoal) continue;
      if (depGoal.status !== 'completed' && depGoal.status !== 'in_progress') return true;
    }
    return false;
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

  getDependencyChain(goalId: string, allGoals: Map<string, Goal>): Goal[] {
    const visited = new Set<string>();
    const chain: Goal[] = [];
    this._traverseChain(goalId, allGoals, visited, chain);
    return chain;
  }

  private _traverseChain(
    goalId: string,
    allGoals: Map<string, Goal>,
    visited: Set<string>,
    chain: Goal[],
  ): void {
    if (visited.has(goalId)) return;
    visited.add(goalId);
    const goal = allGoals.get(goalId);
    if (!goal) return;
    chain.push(goal);
    for (const dep of goal.dependencies) {
      if (dep.type === 'prerequisite' || dep.type === 'chain') {
        this._traverseChain(dep.goalId, allGoals, visited, chain);
      }
    }
  }

  canStart(goal: Goal, allGoals: Map<string, Goal>): boolean {
    return !this.isBlocked(goal, allGoals);
  }

  resolveDependencies(goal: Goal, allGoals: Map<string, Goal>): { resolved: string[]; unresolved: string[] } {
    const resolved: string[] = [];
    const unresolved: string[] = [];
    for (const dep of goal.dependencies) {
      if (!dep.required) continue;
      const depGoal = allGoals.get(dep.goalId);
      if (!depGoal) {
        unresolved.push(dep.goalId);
        continue;
      }
      if (depGoal.status === 'completed') {
        resolved.push(dep.goalId);
      } else {
        unresolved.push(dep.goalId);
      }
    }
    return { resolved, unresolved };
  }
}
