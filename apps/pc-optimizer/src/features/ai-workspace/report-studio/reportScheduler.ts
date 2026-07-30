/**
 * AI Report Studio — Scheduler
 *
 * EPIC 5 PHASE A PART 5
 *
 * Schedules report generation: one-time, daily, weekly, monthly,
 * quarterly, annual, event-driven. Supports future scheduling providers.
 */
import type { ReportSchedule, ReportType, ReportFilterSet, ScheduleFrequency } from './types';
import { generateScheduleId } from './types';

export class ReportScheduler {
  private _schedules: Map<string, ReportSchedule> = new Map();

  schedule(
    reportType: ReportType,
    frequency: ScheduleFrequency,
    filters?: ReportFilterSet,
  ): ReportSchedule {
    const id = generateScheduleId();
    const nextRunAt = this._calculateNextRun(frequency);

    const schedule: ReportSchedule = {
      id,
      reportType,
      frequency,
      filters: filters ?? { filters: [], futureMetadata: {} },
      nextRunAt,
      lastRunAt: null,
      enabled: true,
      futureMetadata: {},
    };

    this._schedules.set(id, schedule);
    return schedule;
  }

  cancel(scheduleId: string): boolean {
    return this._schedules.delete(scheduleId);
  }

  enable(scheduleId: string): boolean {
    const sched = this._schedules.get(scheduleId);
    if (!sched) return false;
    sched.enabled = true;
    return true;
  }

  disable(scheduleId: string): boolean {
    const sched = this._schedules.get(scheduleId);
    if (!sched) return false;
    sched.enabled = false;
    return true;
  }

  get(scheduleId: string): ReportSchedule | null {
    return this._schedules.get(scheduleId) ?? null;
  }

  getAll(): ReportSchedule[] {
    return Array.from(this._schedules.values());
  }

  getEnabled(): ReportSchedule[] {
    return this.getAll().filter((s) => s.enabled);
  }

  getDueSchedules(): ReportSchedule[] {
    const now = Date.now();
    return this.getEnabled().filter((s) => new Date(s.nextRunAt).getTime() <= now);
  }

  markRun(scheduleId: string): void {
    const sched = this._schedules.get(scheduleId);
    if (!sched) return;
    sched.lastRunAt = new Date().toISOString();
    sched.nextRunAt = this._calculateNextRun(sched.frequency);
  }

  count(): number {
    return this._schedules.size;
  }

  clearAll(): void {
    this._schedules.clear();
  }

  private _calculateNextRun(frequency: ScheduleFrequency): string {
    const now = new Date();

    switch (frequency) {
      case 'one_time':
        return now.toISOString();
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
      case 'quarterly':
        return new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()).toISOString();
      case 'annual':
        return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString();
      case 'event_driven':
        return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
  }
}
