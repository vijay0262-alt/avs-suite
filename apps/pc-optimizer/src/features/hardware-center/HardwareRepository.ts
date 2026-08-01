/**
 * HardwareRepository — data access layer for hardware snapshots.
 *
 * Abstracts persistence. In the Electron app, this delegates to the
 * RPC bridge. In tests, it can be mocked or use in-memory storage.
 */

import type { HardwareSnapshot, HardwareHistoryEntry } from './types';

export interface HardwareRepository {
  saveSnapshot(snapshot: HardwareSnapshot): Promise<void>;
  getSnapshots(limit: number): Promise<HardwareHistoryEntry[]>;
  getSnapshotById(id: string): Promise<HardwareSnapshot | null>;
  deleteSnapshotsOlderThan(timestamp: number): Promise<number>;
  clear(): Promise<void>;
}

export class InMemoryHardwareRepository implements HardwareRepository {
  private entries: HardwareHistoryEntry[] = [];

  async saveSnapshot(snapshot: HardwareSnapshot): Promise<void> {
    this.entries.push({ snapshot, storedAt: Date.now() });
  }

  async getSnapshots(limit: number): Promise<HardwareHistoryEntry[]> {
    return this.entries.slice(-limit);
  }

  async getSnapshotById(id: string): Promise<HardwareSnapshot | null> {
    const entry = this.entries.find((e) => e.snapshot.id === id);
    return entry ? entry.snapshot : null;
  }

  async deleteSnapshotsOlderThan(timestamp: number): Promise<number> {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.snapshot.timestamp >= timestamp);
    return before - this.entries.length;
  }

  async clear(): Promise<void> {
    this.entries = [];
  }
}
