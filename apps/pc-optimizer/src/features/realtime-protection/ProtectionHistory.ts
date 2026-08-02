/**
 * ProtectionHistory — records protection events for historical analysis.
 */
import type { ProtectionHistoryEntry, ProtectionHistoryData, SystemEvent } from './types';

export class ProtectionHistoryManager {
  private entries: ProtectionHistoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  record(event: SystemEvent, action: string, threatDetected: boolean, threatId: string | null, processingTime: number): ProtectionHistoryEntry {
    const entry: ProtectionHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: event.timestamp,
      eventType: event.type,
      eventCategory: event.category,
      severity: event.severity,
      status: event.status,
      target: event.target.name,
      action,
      threatDetected,
      threatId,
      processingTime,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    return entry;
  }

  getEntries(): ProtectionHistoryEntry[] {
    return [...this.entries];
  }

  getRecent(count: number): ProtectionHistoryEntry[] {
    return [...this.entries].sort((a, b) => b.timestamp - a.timestamp).slice(0, count);
  }

  getByCategory(category: SystemEvent['category']): ProtectionHistoryEntry[] {
    return this.entries.filter((e) => e.eventCategory === category);
  }

  getBySeverity(severity: SystemEvent['severity']): ProtectionHistoryEntry[] {
    return this.entries.filter((e) => e.severity === severity);
  }

  getThreats(): ProtectionHistoryEntry[] {
    return this.entries.filter((e) => e.threatDetected);
  }

  getSummary(): ProtectionHistoryData {
    const threats = this.entries.filter((e) => e.threatDetected);
    const blocked = this.entries.filter((e) => e.action === 'block');
    const investigated = this.entries.filter((e) => e.action === 'investigate');
    const avgProcessing = this.entries.length > 0
      ? this.entries.reduce((sum, e) => sum + e.processingTime, 0) / this.entries.length
      : 0;

    return {
      entries: [...this.entries],
      totalEvents: this.entries.length,
      totalThreats: threats.length,
      totalBlocked: blocked.length,
      totalInvestigations: investigated.length,
      averageProcessingTime: avgProcessing,
      lastEventAt: this.entries.length > 0 ? this.entries[this.entries.length - 1]!.timestamp : null,
    };
  }

  clear(): void {
    this.entries = [];
  }

  setMaxEntries(max: number): void {
    this.maxEntries = max;
    if (this.entries.length > max) {
      this.entries = this.entries.slice(-max);
    }
  }
}
