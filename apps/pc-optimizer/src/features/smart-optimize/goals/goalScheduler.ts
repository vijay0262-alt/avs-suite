/**
 * Goals & Objectives Engine — Scheduler
 *
 * Schedules goal evaluations and measurements based on
 * strategy type and configuration.
 */
import type { Goal, GoalSchedule, GoalConfiguration } from './types';

export class GoalScheduler {
  private _config: GoalConfiguration;
  private _schedules: Map<string, GoalSchedule> = new Map();

  constructor(config: GoalConfiguration) {
    this._config = config;
  }

  schedule(goal: Goal): GoalSchedule {
    const intervalMs = this._getInterval(goal);
    const nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    const schedule: GoalSchedule = {
      goalId: goal.id,
      nextRunAt,
      intervalMs,
      recurring: goal.strategy.type !== 'one_time',
      futureMetadata: {},
    };
    this._schedules.set(goal.id, schedule);
    return schedule;
  }

  unschedule(goalId: string): boolean {
    return this._schedules.delete(goalId);
  }

  getSchedule(goalId: string): GoalSchedule | null {
    return this._schedules.get(goalId) ?? null;
  }

  getAllSchedules(): GoalSchedule[] {
    return Array.from(this._schedules.values());
  }

  getDueSchedules(now: string = new Date().toISOString()): GoalSchedule[] {
    return this.getAllSchedules().filter((s) => s.nextRunAt <= now);
  }

  updateNextRun(goalId: string): GoalSchedule | null {
    const schedule = this._schedules.get(goalId);
    if (!schedule) return null;
    if (!schedule.recurring) {
      this._schedules.delete(goalId);
      return null;
    }
    schedule.nextRunAt = new Date(Date.now() + schedule.intervalMs).toISOString();
    return schedule;
  }

  clear(): void {
    this._schedules.clear();
  }

  private _getInterval(goal: Goal): number {
    switch (goal.strategy.type) {
      case 'one_time':
        return 0;
      case 'continuous':
        return this._config.measurementRules.measurementIntervalMs;
      case 'scheduled':
        return this._config.measurementRules.measurementIntervalMs * 6;
      case 'adaptive':
        return this._config.measurementRules.measurementIntervalMs;
      case 'event_driven':
        return this._config.measurementRules.measurementIntervalMs * 12;
      case 'maintenance_assisted':
        return this._config.measurementRules.measurementIntervalMs * 3;
      case 'automation_assisted':
        return this._config.measurementRules.measurementIntervalMs * 2;
      case 'prediction_driven':
        return this._config.measurementRules.measurementIntervalMs;
      default:
        return this._config.measurementRules.measurementIntervalMs;
    }
  }
}
