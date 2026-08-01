/**
 * HardwareHistory — ring buffer of historical hardware snapshots.
 *
 * Stores up to maxSnapshots entries with optional time-based retention.
 * Used for trend analysis and diagnostics.
 */

import type { HardwareSnapshot, HardwareHistoryEntry } from './types';

export class HardwareHistory {
  private entries: HardwareHistoryEntry[] = [];
  private readonly maxSnapshots: number;
  private readonly retentionMs: number;

  constructor(maxSnapshots: number = 1000, retentionMs: number = 24 * 60 * 60 * 1000) {
    this.maxSnapshots = maxSnapshots;
    this.retentionMs = retentionMs;
  }

  add(snapshot: HardwareSnapshot): void {
    const entry: HardwareHistoryEntry = {
      snapshot,
      storedAt: Date.now(),
    };
    this.entries.push(entry);
    this.evict();
  }

  getAll(): HardwareHistoryEntry[] {
    this.evict();
    return [...this.entries];
  }

  getRecent(count: number): HardwareHistoryEntry[] {
    this.evict();
    return this.entries.slice(-count);
  }

  getSince(timestamp: number): HardwareHistoryEntry[] {
    this.evict();
    return this.entries.filter((e) => e.snapshot.timestamp >= timestamp);
  }

  count(): number {
    this.evict();
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }

  private evict(): void {
    const now = Date.now();
    const cutoff = now - this.retentionMs;
    this.entries = this.entries.filter((e) => e.storedAt >= cutoff);
    if (this.entries.length > this.maxSnapshots) {
      this.entries = this.entries.slice(-this.maxSnapshots);
    }
  }
}
