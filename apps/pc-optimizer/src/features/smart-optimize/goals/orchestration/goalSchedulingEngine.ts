/**
 * Goal Orchestration Engine — Scheduling Engine
 *
 * Manages scheduling of goal evaluations and executions
 * based on strategy type, priority, and configuration.
 */
import type {
  Goal,
  OrchestrationSchedule,
  OrchestrationState,
  OrchestrationConfiguration,
} from './types';
import { generateOrchestrationScheduleId } from './types';

export class GoalSchedulingEngine {
  private _config: OrchestrationConfiguration;
  private _schedules: Map<string, OrchestrationSchedule> = new Map();

  constructor(config: OrchestrationConfiguration) {
    this._config = config;
  }

  schedule(goal: Goal, priority: number): OrchestrationSchedule {
    const intervalMs = this._computeInterval(goal);
    const now = Date.now();
    const recurring = goal.strategy.type === 'continuous' || goal.strategy.type === 'adaptive';

    const sched: OrchestrationSchedule = {
      id: generateOrchestrationScheduleId(),
      goalId: goal.id,
      scheduledAt: new Date(now).toISOString(),
      nextRunAt: new Date(now + intervalMs).toISOString(),
      intervalMs,
      recurring,
      priority,
      state: 'pending',
      futureMetadata: {},
    };

    this._schedules.set(goal.id, sched);
    return sched;
  }

  unschedule(goalId: string): boolean {
    return this._schedules.delete(goalId);
  }

  getSchedule(goalId: string): OrchestrationSchedule | undefined {
    return this._schedules.get(goalId);
  }

  getAllSchedules(): OrchestrationSchedule[] {
    return [...this._schedules.values()];
  }

  getDueSchedules(asOf: string): OrchestrationSchedule[] {
    const asOfMs = new Date(asOf).getTime();
    return [...this._schedules.values()].filter((s) => {
      const nextRun = new Date(s.nextRunAt).getTime();
      return nextRun <= asOfMs && s.state !== 'completed' && s.state !== 'cancelled';
    });
  }

  updateNextRun(goalId: string): OrchestrationSchedule | null {
    const sched = this._schedules.get(goalId);
    if (!sched) return null;

    if (!sched.recurring) {
      this._schedules.delete(goalId);
      return null;
    }

    sched.nextRunAt = new Date(Date.now() + sched.intervalMs).toISOString();
    return sched;
  }

  setState(goalId: string, state: OrchestrationState): boolean {
    const sched = this._schedules.get(goalId);
    if (!sched) return false;
    sched.state = state;
    return true;
  }

  getPendingSchedules(): OrchestrationSchedule[] {
    return [...this._schedules.values()].filter((s) => s.state === 'pending');
  }

  getExecutingSchedules(): OrchestrationSchedule[] {
    return [...this._schedules.values()].filter((s) => s.state === 'executing');
  }

  getMaxConcurrent(): number {
    return this._config.schedulingRules.maxConcurrentExecutions;
  }

  canScheduleMore(): boolean {
    const executing = this.getExecutingSchedules().length;
    return executing < this._config.schedulingRules.maxConcurrentExecutions;
  }

  clear(): void {
    this._schedules.clear();
  }

  private _computeInterval(goal: Goal): number {
    const rules = this._config.schedulingRules;

    switch (goal.strategy.type) {
      case 'continuous':
        return rules.defaultIntervalMs;
      case 'adaptive':
        return rules.defaultIntervalMs;
      case 'scheduled':
        return Math.min(rules.maxIntervalMs, Math.max(rules.minIntervalMs, rules.defaultIntervalMs));
      case 'one_time':
        return rules.minIntervalMs;
      case 'event_driven':
        return rules.defaultIntervalMs;
      default:
        return rules.defaultIntervalMs;
    }
  }
}
