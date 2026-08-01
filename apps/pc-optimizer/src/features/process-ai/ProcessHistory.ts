/**
 * ProcessHistory — stores recent process snapshots for trend analysis.
 *
 * Maintains a ring buffer of snapshots up to maxSnapshots.
 * Provides query methods for trend analysis and comparison.
 */
import type { ProcessSnapshot, ProcessTrendDataPoint } from './types';

export class ProcessHistory {
  private snapshots: ProcessSnapshot[] = [];
  private readonly maxSnapshots: number;

  constructor(maxSnapshots = 500) {
    this.maxSnapshots = maxSnapshots;
  }

  add(snapshot: ProcessSnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getAll(): ProcessSnapshot[] {
    return [...this.snapshots];
  }

  getLatest(): ProcessSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1]! : null;
  }

  getPrevious(): ProcessSnapshot | null {
    return this.snapshots.length > 1 ? this.snapshots[this.snapshots.length - 2]! : null;
  }

  getTrendData(pid: number, maxPoints = 100): ProcessTrendDataPoint[] {
    const points: ProcessTrendDataPoint[] = [];
    for (const snapshot of this.snapshots) {
      const entry = snapshot.entries.find((e) => e.info.pid === pid);
      if (entry) {
        points.push({
          timestamp: snapshot.timestamp,
          cpuUsagePercent: entry.sensors.cpuUsagePercent,
          memoryMB: entry.sensors.memoryMB,
          diskReadMBps: entry.sensors.diskReadMBps,
          diskWriteMBps: entry.sensors.diskWriteMBps,
          networkMbps: entry.sensors.networkDownloadMbps + entry.sensors.networkUploadMbps,
        });
      }
      if (points.length >= maxPoints) break;
    }
    return points;
  }

  getProcessHistory(pid: number): ProcessSnapshot[] {
    return this.snapshots.filter((s) => s.entries.some((e) => e.info.pid === pid));
  }

  count(): number {
    return this.snapshots.length;
  }

  clear(): void {
    this.snapshots = [];
  }
}
