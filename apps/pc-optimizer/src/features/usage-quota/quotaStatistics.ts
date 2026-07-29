/**
 * Quota Statistics — provides usage statistics APIs.
 *
 * Provides:
 *   Today's usage, Weekly usage, Monthly usage, Lifetime usage
 *   Most used features, Least used features
 *   Quota consumption history, Reset schedule
 */
import type { QuotaStatistics, UsageRecord, QuotaState } from './types';
import type { QuotaTracker } from './quotaTracker';
import type { QuotaRegistry } from './quotaRegistry';

export class QuotaStatisticsService {
  private _tracker: QuotaTracker;
  private _registry: QuotaRegistry;

  constructor(tracker: QuotaTracker, registry: QuotaRegistry) {
    this._tracker = tracker;
    this._registry = registry;
  }

  /**
   * Generate full statistics report.
   */
  generateStatistics(states: Map<string, QuotaState>): QuotaStatistics {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setMonth(monthStart.getMonth() - 1);

    const todayISO = todayStart.toISOString();
    const weekISO = weekStart.toISOString();
    const monthISO = monthStart.toISOString();

    const allRecords = this._tracker.getAllRecords();

    const todayUsage = this._sumUsage(this._tracker.getRecordsInRange(todayISO, now.toISOString()));
    const weeklyUsage = this._sumUsage(this._tracker.getRecordsInRange(weekISO, now.toISOString()));
    const monthlyUsage = this._sumUsage(this._tracker.getRecordsInRange(monthISO, now.toISOString()));
    const lifetimeUsage = this._sumUsage(allRecords);

    const mostUsed = this._mostUsed(allRecords, 10);
    const leastUsed = this._leastUsed(allRecords, 10);

    const resetSchedule = this._buildResetSchedule(states);

    return {
      todayUsage,
      weeklyUsage,
      monthlyUsage,
      lifetimeUsage,
      mostUsed,
      leastUsed,
      history: allRecords.slice(-100),
      resetSchedule,
    };
  }

  /**
   * Get today's usage total.
   */
  getTodayUsage(): number {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    return this._sumUsage(this._tracker.getRecordsInRange(todayStart.toISOString(), now.toISOString()));
  }

  /**
   * Get weekly usage total.
   */
  getWeeklyUsage(): number {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    return this._sumUsage(this._tracker.getRecordsInRange(weekStart.toISOString(), now.toISOString()));
  }

  /**
   * Get monthly usage total.
   */
  getMonthlyUsage(): number {
    const now = new Date();
    const monthStart = new Date(now);
    monthStart.setMonth(monthStart.getMonth() - 1);
    return this._sumUsage(this._tracker.getRecordsInRange(monthStart.toISOString(), now.toISOString()));
  }

  /**
   * Get lifetime usage total.
   */
  getLifetimeUsage(): number {
    return this._sumUsage(this._tracker.getAllRecords());
  }

  /**
   * Get usage for a specific quota.
   */
  getQuotaUsage(quotaId: string): number {
    return this._tracker.getTotalUsage(quotaId);
  }

  /**
   * Get most used quotas.
   */
  getMostUsed(limit: number = 10): { quotaId: string; totalUsed: number }[] {
    return this._mostUsed(this._tracker.getAllRecords(), limit);
  }

  /**
   * Get least used quotas.
   */
  getLeastUsed(limit: number = 10): { quotaId: string; totalUsed: number }[] {
    return this._leastUsed(this._tracker.getAllRecords(), limit);
  }

  /**
   * Get usage history (all records).
   */
  getHistory(): UsageRecord[] {
    return this._tracker.getAllRecords();
  }

  /**
   * Get reset schedule for all quotas.
   */
  getResetSchedule(states: Map<string, QuotaState>): { quotaId: string; nextResetAt: string | null }[] {
    return this._buildResetSchedule(states);
  }

  // ── Private ────────────────────────────────────────────────

  private _sumUsage(records: UsageRecord[]): number {
    return records.reduce((sum, r) => sum + r.amountUsed, 0);
  }

  private _mostUsed(records: UsageRecord[], limit: number): { quotaId: string; totalUsed: number }[] {
    const totals = new Map<string, number>();
    for (const r of records) {
      totals.set(r.quotaId, (totals.get(r.quotaId) ?? 0) + r.amountUsed);
    }
    return Array.from(totals.entries())
      .map(([quotaId, totalUsed]) => ({ quotaId, totalUsed }))
      .sort((a, b) => b.totalUsed - a.totalUsed)
      .slice(0, limit);
  }

  private _leastUsed(records: UsageRecord[], limit: number): { quotaId: string; totalUsed: number }[] {
    const totals = new Map<string, number>();
    for (const r of records) {
      totals.set(r.quotaId, (totals.get(r.quotaId) ?? 0) + r.amountUsed);
    }
    // Include all registered quotas, even those with zero usage
    for (const quota of this._registry.getAllQuotas()) {
      if (!totals.has(quota.id)) {
        totals.set(quota.id, 0);
      }
    }
    return Array.from(totals.entries())
      .map(([quotaId, totalUsed]) => ({ quotaId, totalUsed }))
      .sort((a, b) => a.totalUsed - b.totalUsed)
      .slice(0, limit);
  }

  private _buildResetSchedule(states: Map<string, QuotaState>): { quotaId: string; nextResetAt: string | null }[] {
    const schedule: { quotaId: string; nextResetAt: string | null }[] = [];
    for (const [id, state] of states) {
      schedule.push({ quotaId: id, nextResetAt: state.nextResetAt });
    }
    return schedule.sort((a, b) => {
      if (!a.nextResetAt) return 1;
      if (!b.nextResetAt) return -1;
      return new Date(a.nextResetAt).getTime() - new Date(b.nextResetAt).getTime();
    });
  }
}
