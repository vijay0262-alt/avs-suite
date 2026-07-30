/**
 * Goals & Objectives Engine — Analytics
 *
 * Aggregates goal statistics: completion rate, average progress,
 * time to completion, success rate, blocked goals, goal effectiveness,
 * and historical trends.
 */
import type {
  Goal,
  GoalAnalytics,
  GoalEffectiveness,
  GoalTrendPoint,
  GoalType,
  GoalStatus,
  GoalPriority,
  GoalConfiguration,
} from './types';

export class GoalAnalyticsEngine {
  private _config: GoalConfiguration;

  constructor(config: GoalConfiguration) {
    this._config = config;
  }

  compute(goals: Goal[]): GoalAnalytics {
    const goalsByType = {} as Record<GoalType, number>;
    const goalsByStatus = {} as Record<GoalStatus, number>;
    const goalsByPriority = {} as Record<GoalPriority, number>;

    let activeGoals = 0;
    let completedGoals = 0;
    let blockedGoals = 0;
    let cancelledGoals = 0;
    let progressSum = 0;
    let completionTimeSum = 0;
    let completionCount = 0;
    let successCount = 0;

    const effectivenessMap = new Map<GoalType, GoalEffectiveness>();
    const trendMap = new Map<string, GoalTrendPoint>();

    for (const goal of goals) {
      goalsByType[goal.category] = (goalsByType[goal.category] ?? 0) + 1;
      goalsByStatus[goal.status] = (goalsByStatus[goal.status] ?? 0) + 1;
      goalsByPriority[goal.priority] = (goalsByPriority[goal.priority] ?? 0) + 1;
      progressSum += goal.progress;

      if (goal.status === 'started' || goal.status === 'in_progress') activeGoals++;
      if (goal.status === 'completed') {
        completedGoals++;
        successCount++;
        if (goal.completedAt && goal.startedAt) {
          completionTimeSum += new Date(goal.completedAt).getTime() - new Date(goal.startedAt).getTime();
          completionCount++;
        }
      }
      if (goal.status === 'blocked') blockedGoals++;
      if (goal.status === 'cancelled') cancelledGoals++;

      // Effectiveness by type
      if (!effectivenessMap.has(goal.category)) {
        effectivenessMap.set(goal.category, {
          goalType: goal.category,
          totalGoals: 0,
          completedGoals: 0,
          averageProgress: 0,
          averageTimeMs: 0,
          effectiveness: 0,
        });
      }
      const eff = effectivenessMap.get(goal.category)!;
      eff.totalGoals++;
      eff.averageProgress += goal.progress;
      if (goal.status === 'completed') {
        eff.completedGoals++;
        if (goal.completedAt && goal.startedAt) {
          eff.averageTimeMs += new Date(goal.completedAt).getTime() - new Date(goal.startedAt).getTime();
        }
      }

      // Trend by day
      const day = goal.updatedAt.slice(0, 10);
      if (!trendMap.has(day)) {
        trendMap.set(day, {
          timestamp: day,
          activeGoals: 0,
          completedGoals: 0,
          averageProgress: 0,
        });
      }
      const trend = trendMap.get(day)!;
      if (goal.status === 'started' || goal.status === 'in_progress') trend.activeGoals++;
      if (goal.status === 'completed') trend.completedGoals++;
      trend.averageProgress += goal.progress;
    }

    // Finalize effectiveness
    const goalEffectiveness: GoalEffectiveness[] = [];
    for (const eff of effectivenessMap.values()) {
      eff.averageProgress = eff.totalGoals > 0 ? eff.averageProgress / eff.totalGoals : 0;
      eff.averageTimeMs = eff.completedGoals > 0 ? eff.averageTimeMs / eff.completedGoals : 0;
      eff.effectiveness = eff.totalGoals > 0 ? eff.completedGoals / eff.totalGoals : 0;
      goalEffectiveness.push(eff);
    }

    // Finalize trends
    const historicalTrends = Array.from(trendMap.values())
      .map((t) => ({
        ...t,
        averageProgress: t.activeGoals > 0 ? t.averageProgress / t.activeGoals : 0,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const totalGoals = goals.length;
    const completionRate = totalGoals > 0 ? completedGoals / totalGoals : 0;
    const averageProgress = totalGoals > 0 ? progressSum / totalGoals : 0;
    const averageTimeToCompletionMs = completionCount > 0 ? completionTimeSum / completionCount : 0;
    const successRate = totalGoals > 0 ? successCount / totalGoals : 0;

    return {
      totalGoals,
      activeGoals,
      completedGoals,
      blockedGoals,
      cancelledGoals,
      completionRate,
      averageProgress,
      averageTimeToCompletionMs,
      successRate,
      goalsByType,
      goalsByStatus,
      goalsByPriority,
      goalEffectiveness,
      historicalTrends,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }
}
