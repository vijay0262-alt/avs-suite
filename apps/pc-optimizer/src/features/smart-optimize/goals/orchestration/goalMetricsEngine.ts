/**
 * Goal Orchestration Engine — Metrics Engine
 *
 * Generates orchestration analytics:
 * Goal Utilization, Conflict Frequency, Resource Allocation,
 * Completion Success, Goal Effectiveness, Average Completion Time.
 */
import type {
  Goal,
  OrchestrationMetrics,
  ResourceAllocationSummary,
  GoalEffectivenessMetric,
  ResourceAllocation,
  OrchestrationConflict,
  OrchestrationHistoryEntry,
  ResourceType,
} from './types';

export class GoalMetricsEngine {
  computeMetrics(
    goals: Goal[],
    history: OrchestrationHistoryEntry[],
    conflicts: OrchestrationConflict[],
    allocations: ResourceAllocation[],
  ): OrchestrationMetrics {
    const totalOrchestrations = history.filter((h) => h.action === 'orchestration_started').length;
    const completedOrchestrations = history.filter((h) => h.action === 'goal_completed').length;
    const failedOrchestrations = history.filter((h) => h.action === 'state_changed' && h.newValue === 'cancelled').length;
    const activeGoals = goals.filter((g) => g.status === 'started' || g.status === 'in_progress');

    const goalUtilization = this._computeGoalUtilization(goals, history);
    const conflictFrequency = this._computeConflictFrequency(conflicts);
    const resourceAllocationSummary = this._computeResourceSummary(allocations);
    const completionSuccessRate = totalOrchestrations > 0
      ? completedOrchestrations / totalOrchestrations
      : 0;
    const goalEffectiveness = this._computeGoalEffectiveness(goals, history);
    const averageCompletionTimeMs = this._computeAverageCompletionTime(goals);
    const averageOrchestrationTimeMs = this._computeAverageOrchestrationTime(history);

    return {
      totalOrchestrations,
      activeOrchestrations: activeGoals.length,
      completedOrchestrations,
      failedOrchestrations,
      averageOrchestrationTimeMs,
      goalUtilization,
      conflictFrequency,
      resourceAllocationSummary,
      completionSuccessRate,
      goalEffectiveness,
      averageCompletionTimeMs,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _computeGoalUtilization(goals: Goal[], history: OrchestrationHistoryEntry[]): Record<string, number> {
    const utilization: Record<string, number> = {};
    for (const goal of goals) {
      const entries = history.filter((h) => h.goalId === goal.id);
      utilization[goal.id] = entries.length;
    }
    return utilization;
  }

  private _computeConflictFrequency(conflicts: OrchestrationConflict[]): Record<string, number> {
    const frequency: Record<string, number> = {};
    for (const conflict of conflicts) {
      frequency[conflict.type] = (frequency[conflict.type] ?? 0) + 1;
    }
    return frequency;
  }

  private _computeResourceSummary(allocations: ResourceAllocation[]): ResourceAllocationSummary {
    const totalAllocated: Record<ResourceType, number> = {
      cpu_budget: 0,
      memory_budget: 0,
      disk_budget: 0,
      network_budget: 0,
      maintenance_window: 0,
      execution_slot: 0,
      future_resource: 0,
    };

    const totalAvailable: Record<ResourceType, number> = {
      cpu_budget: 100,
      memory_budget: 100,
      disk_budget: 100,
      network_budget: 100,
      maintenance_window: 2,
      execution_slot: 3,
      future_resource: 0,
    };

    for (const a of allocations) {
      totalAllocated[a.resourceType] += a.allocatedAmount;
    }

    const utilizationRate: Record<ResourceType, number> = {} as Record<ResourceType, number>;
    for (const key of Object.keys(totalAllocated) as ResourceType[]) {
      utilizationRate[key] = totalAvailable[key] > 0 ? totalAllocated[key] / totalAvailable[key] : 0;
    }

    return {
      totalAllocated,
      totalAvailable,
      utilizationRate,
      futureMetadata: {},
    };
  }

  private _computeGoalEffectiveness(goals: Goal[], history: OrchestrationHistoryEntry[]): GoalEffectivenessMetric[] {
    const metrics: GoalEffectivenessMetric[] = [];
    for (const goal of goals) {
      const goalHistory = history.filter((h) => h.goalId === goal.id);
      const total = goalHistory.filter((h) => h.action === 'orchestration_started').length;
      const completed = goalHistory.filter((h) => h.action === 'goal_completed').length;
      const effectiveness = total > 0 ? completed / total : 0;
      const avgTime = this._computeGoalCompletionTime(goal);

      metrics.push({
        goalId: goal.id,
        goalName: goal.name,
        goalType: goal.category,
        totalOrchestrations: total,
        completedOrchestrations: completed,
        effectiveness,
        averageCompletionTimeMs: avgTime,
        futureMetadata: {},
      });
    }
    return metrics;
  }

  private _computeAverageCompletionTime(goals: Goal[]): number {
    const completed = goals.filter((g) => g.completedAt && g.startedAt);
    if (completed.length === 0) return 0;
    const totalTime = completed.reduce((sum, g) => {
      const start = new Date(g.startedAt!).getTime();
      const end = new Date(g.completedAt!).getTime();
      return sum + (end - start);
    }, 0);
    return totalTime / completed.length;
  }

  private _computeGoalCompletionTime(goal: Goal): number {
    if (!goal.completedAt || !goal.startedAt) return 0;
    return new Date(goal.completedAt).getTime() - new Date(goal.startedAt).getTime();
  }

  private _computeAverageOrchestrationTime(_history: OrchestrationHistoryEntry[]): number {
    return 0; // Would be computed from orchestration start/end pairs
  }
}
