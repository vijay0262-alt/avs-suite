/**
 * Optimization History Analyzer — analyzes past optimizations for planning.
 *
 * Uses historical data to adjust future plans: avoid recently failed actions,
 * boost previously successful ones, identify patterns.
 */
import type {
  OptimizationHistoryEntry,
  SmartPlanAction,
  OptimizationGoal,
} from './types';

export class OptimizationHistoryAnalyzer {
  analyze(history: OptimizationHistoryEntry[]): HistoryAnalysis {
    if (history.length === 0) {
      return {
        recentlyCompleted: [],
        recentlyFailed: [],
        recentlySkipped: [],
        averageSuccessRate: 0,
        totalOptimizations: 0,
        recommendedAvoid: [],
        recommendedRepeat: [],
      };
    }

    const recentlyCompleted = this._getRecentlyCompleted(history);
    const recentlyFailed = this._getRecentlyFailed(history);
    const recentlySkipped = this._getRecentlySkipped(history);
    const averageSuccessRate = history.reduce((sum, h) => sum + h.successRate, 0) / history.length;

    return {
      recentlyCompleted,
      recentlyFailed,
      recentlySkipped,
      averageSuccessRate,
      totalOptimizations: history.length,
      recommendedAvoid: recentlyFailed,
      recommendedRepeat: recentlyCompleted.filter((id) => !recentlyFailed.includes(id)),
    };
  }

  adjustActions(
    actions: SmartPlanAction[],
    analysis: HistoryAnalysis,
  ): { adjusted: SmartPlanAction[]; avoided: SmartPlanAction[] } {
    const avoidSet = new Set(analysis.recommendedAvoid);
    const adjusted: SmartPlanAction[] = [];
    const avoided: SmartPlanAction[] = [];

    for (const action of actions) {
      if (avoidSet.has(action.id)) {
        avoided.push(action);
      } else {
        adjusted.push(action);
      }
    }

    return { adjusted, avoided };
  }

  getGoalHistory(history: OptimizationHistoryEntry[], goal: OptimizationGoal): OptimizationHistoryEntry[] {
    return history.filter((h) => h.goal === goal);
  }

  getSuccessRateForGoal(history: OptimizationHistoryEntry[], goal: OptimizationGoal): number {
    const goalHistory = this.getGoalHistory(history, goal);
    if (goalHistory.length === 0) return 0;
    return goalHistory.reduce((sum, h) => sum + h.successRate, 0) / goalHistory.length;
  }

  private _getRecentlyCompleted(history: OptimizationHistoryEntry[]): string[] {
    const recent = history.slice(-5);
    return recent.flatMap((h) => h.actionsCompleted);
  }

  private _getRecentlyFailed(history: OptimizationHistoryEntry[]): string[] {
    const recent = history.slice(-5);
    const failed: string[] = [];
    for (const entry of recent) {
      const skipped = entry.actionsSkipped;
      const completed = new Set(entry.actionsCompleted);
      for (const actionId of skipped) {
        if (!completed.has(actionId)) {
          failed.push(actionId);
        }
      }
    }
    return failed;
  }

  private _getRecentlySkipped(history: OptimizationHistoryEntry[]): string[] {
    const recent = history.slice(-5);
    return recent.flatMap((h) => h.actionsSkipped);
  }
}

export interface HistoryAnalysis {
  recentlyCompleted: string[];
  recentlyFailed: string[];
  recentlySkipped: string[];
  averageSuccessRate: number;
  totalOptimizations: number;
  recommendedAvoid: string[];
  recommendedRepeat: string[];
}
