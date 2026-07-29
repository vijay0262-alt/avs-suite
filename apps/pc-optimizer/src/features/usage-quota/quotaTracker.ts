/**
 * Quota Tracker — records usage events for quotas.
 *
 * Tracks usage by:
 *   Feature, Capability, Action, Module, User, Device, Session
 *
 * Each record captures:
 *   Timestamp, Action, Amount Used, Remaining, Reset Date, Source Module
 */
import type { UsageRecord } from './types';

export class QuotaTracker {
  private _records: UsageRecord[] = [];
  private _maxRecords: number;

  constructor(maxRecords: number = 10000) {
    this._maxRecords = maxRecords;
  }

  /**
   * Record a usage event.
   */
  record(entry: Omit<UsageRecord, 'id'>): UsageRecord {
    const record: UsageRecord = {
      ...entry,
      id: this._generateId(),
    };
    this._records.push(record);

    // Trim if exceeding max records
    if (this._records.length > this._maxRecords) {
      this._records = this._records.slice(-this._maxRecords);
    }

    return record;
  }

  /**
   * Get all records.
   */
  getAllRecords(): UsageRecord[] {
    return [...this._records];
  }

  /**
   * Get records for a specific quota.
   */
  getRecordsByQuota(quotaId: string): UsageRecord[] {
    return this._records.filter((r) => r.quotaId === quotaId);
  }

  /**
   * Get records by feature.
   */
  getRecordsByFeature(feature: string): UsageRecord[] {
    return this._records.filter((r) => r.feature === feature);
  }

  /**
   * Get records by capability.
   */
  getRecordsByCapability(capability: string): UsageRecord[] {
    return this._records.filter((r) => r.capability === capability);
  }

  /**
   * Get records by action.
   */
  getRecordsByAction(action: string): UsageRecord[] {
    return this._records.filter((r) => r.action === action);
  }

  /**
   * Get records by source module.
   */
  getRecordsByModule(module: string): UsageRecord[] {
    return this._records.filter((r) => r.sourceModule === module);
  }

  /**
   * Get records by user.
   */
  getRecordsByUser(userId: string): UsageRecord[] {
    return this._records.filter((r) => r.userId === userId);
  }

  /**
   * Get records by device.
   */
  getRecordsByDevice(deviceId: string): UsageRecord[] {
    return this._records.filter((r) => r.deviceId === deviceId);
  }

  /**
   * Get records by session.
   */
  getRecordsBySession(sessionId: string): UsageRecord[] {
    return this._records.filter((r) => r.sessionId === sessionId);
  }

  /**
   * Get records within a time range.
   */
  getRecordsInRange(startISO: string, endISO: string): UsageRecord[] {
    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    return this._records.filter((r) => {
      const ts = new Date(r.timestamp).getTime();
      return ts >= start && ts <= end;
    });
  }

  /**
   * Get total usage amount for a quota.
   */
  getTotalUsage(quotaId: string): number {
    return this._records
      .filter((r) => r.quotaId === quotaId)
      .reduce((sum, r) => sum + r.amountUsed, 0);
  }

  /**
   * Get total usage amount for a quota within a time range.
   */
  getUsageInRange(quotaId: string, startISO: string, endISO: string): number {
    return this.getRecordsInRange(startISO, endISO)
      .filter((r) => r.quotaId === quotaId)
      .reduce((sum, r) => sum + r.amountUsed, 0);
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this._records = [];
  }

  /**
   * Get record count.
   */
  count(): number {
    return this._records.length;
  }

  /**
   * Load records from storage data.
   */
  loadRecords(records: UsageRecord[]): void {
    this._records = [...records];
  }

  /**
   * Export records for storage.
   */
  exportRecords(): UsageRecord[] {
    return [...this._records];
  }

  private _generateId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
