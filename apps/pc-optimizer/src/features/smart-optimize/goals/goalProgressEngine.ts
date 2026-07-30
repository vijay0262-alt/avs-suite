/**
 * Goals & Objectives Engine — Progress Engine
 *
 * Tracks goal progress over time, computes progress percentages,
 * and determines when goals are completed, blocked, or need attention.
 */
import type {
  Goal,
  GoalProgress,
  GoalConfiguration,
  GoalStatus,
} from './types';

export class GoalProgressEngine {
  private _config: GoalConfiguration;
  private _progressHistory: Map<string, GoalProgress[]> = new Map();

  constructor(config: GoalConfiguration) {
    this._config = config;
  }

  updateProgress(goal: Goal, measurement: GoalProgress): GoalProgress {
    // Store in history
    if (!this._progressHistory.has(goal.id)) {
      this._progressHistory.set(goal.id, []);
    }
    this._progressHistory.get(goal.id)!.push(measurement);

    // Update goal fields
    goal.currentValue = measurement.currentValue;
    goal.progress = measurement.progress;
    goal.updatedAt = new Date().toISOString();

    // Determine new status
    const newStatus = this._determineStatus(goal, measurement);
    if (newStatus !== goal.status) {
      goal.status = newStatus;
      if (newStatus === 'completed') {
        goal.completedAt = new Date().toISOString();
      }
    }

    return measurement;
  }

  getProgress(goalId: string): GoalProgress[] {
    return this._progressHistory.get(goalId) ?? [];
  }

  getLatestProgress(goalId: string): GoalProgress | null {
    const history = this._progressHistory.get(goalId);
    if (!history || history.length === 0) return null;
    return history[history.length - 1]!;
  }

  getProgressTrend(goalId: string): { improving: boolean; deltaRate: number } {
    const history = this._progressHistory.get(goalId);
    if (!history || history.length < 2) return { improving: false, deltaRate: 0 };
    const recent = history.slice(-5);
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;
    const deltaRate = (last.progress - first.progress) / recent.length;
    return { improving: deltaRate > 0, deltaRate };
  }

  computeEstimatedCompletion(goal: Goal): string | null {
    const trend = this.getProgressTrend(goal.id);
    if (trend.deltaRate <= 0) return null;
    const remaining = 1 - goal.progress;
    const intervalsNeeded = remaining / trend.deltaRate;
    if (intervalsNeeded <= 0 || !isFinite(intervalsNeeded)) return null;
    const msNeeded = intervalsNeeded * this._config.measurementRules.measurementIntervalMs;
    return new Date(Date.now() + msNeeded).toISOString();
  }

  isStalled(goalId: string): boolean {
    const trend = this.getProgressTrend(goalId);
    return !trend.improving && trend.deltaRate === 0;
  }

  isNearCompletion(goal: Goal): boolean {
    return goal.progress >= 0.9 && goal.progress < 1;
  }

  private _determineStatus(goal: Goal, measurement: GoalProgress): GoalStatus {
    if (measurement.progress >= 1) return 'completed';
    if (goal.status === 'paused' || goal.status === 'cancelled') return goal.status;
    if (goal.status === 'blocked') return goal.status;
    if (measurement.progress > 0) return 'in_progress';
    return goal.status;
  }

  clear(): void {
    this._progressHistory.clear();
  }

  clearForGoal(goalId: string): void {
    this._progressHistory.delete(goalId);
  }
}
