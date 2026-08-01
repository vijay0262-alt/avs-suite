/**
 * ProcessRepository — in-memory store for the latest process snapshot
 * and historical data. Provides query APIs for the analysis engine.
 */
import type { ProcessSnapshot, ProcessEntry } from './types';
import { ProcessHistory } from './ProcessHistory';

export class ProcessRepository {
  private current: ProcessSnapshot | null = null;
  private history: ProcessHistory;

  constructor(maxSnapshots = 500) {
    this.history = new ProcessHistory(maxSnapshots);
  }

  store(snapshot: ProcessSnapshot): void {
    this.current = snapshot;
    this.history.add(snapshot);
  }

  getCurrent(): ProcessSnapshot | null {
    return this.current;
  }

  getHistory(): ProcessHistory {
    return this.history;
  }

  getProcess(pid: number): ProcessEntry | null {
    if (!this.current) return null;
    return this.current.entries.find((e) => e.info.pid === pid) ?? null;
  }

  getProcessesByCategory(category: string): ProcessEntry[] {
    if (!this.current) return [];
    return this.current.entries.filter((e) => e.info.category === category);
  }

  getTopCPUConsumers(count: number): ProcessEntry[] {
    if (!this.current) return [];
    return [...this.current.entries]
      .sort((a, b) => b.sensors.cpuUsagePercent - a.sensors.cpuUsagePercent)
      .slice(0, count);
  }

  getTopMemoryConsumers(count: number): ProcessEntry[] {
    if (!this.current) return [];
    return [...this.current.entries]
      .sort((a, b) => b.sensors.memoryMB - a.sensors.memoryMB)
      .slice(0, count);
  }

  getStartupProcesses(): ProcessEntry[] {
    if (!this.current) return [];
    return this.current.entries.filter((e) => e.info.isStartupEntry);
  }

  getBackgroundProcesses(): ProcessEntry[] {
    if (!this.current) return [];
    return this.current.entries.filter((e) =>
      e.info.category === 'background' || e.info.category === 'updater' ||
      (e.sensors.cpuUsagePercent < 5 && !e.info.windowTitle),
    );
  }

  getDuplicateProcesses(): Map<string, ProcessEntry[]> {
    if (!this.current) return new Map();
    const groups = new Map<string, ProcessEntry[]>();
    for (const entry of this.current.entries) {
      const name = entry.info.name.toLowerCase();
      const group = groups.get(name) ?? [];
      group.push(entry);
      groups.set(name, group);
    }
    // Only return groups with more than 1 entry
    for (const [key, group] of groups) {
      if (group.length <= 1) groups.delete(key);
    }
    return groups;
  }

  clear(): void {
    this.current = null;
    this.history.clear();
  }
}
