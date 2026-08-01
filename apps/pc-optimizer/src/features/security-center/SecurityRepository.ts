/**
 * SecurityRepository — data persistence layer for security center.
 *
 * Stores snapshots, scan results, and threat data. Provides
 * query methods for retrieval. In-memory implementation —
 * future versions may persist to disk.
 */
import type { SecuritySnapshot, ScanResult, Threat } from './types';

export class SecurityRepository {
  private snapshots: SecuritySnapshot[] = [];
  private scanResults: ScanResult[] = [];
  private threats: Map<string, Threat> = new Map();
  private maxSnapshots: number;
  private maxScanResults: number;

  constructor(maxSnapshots = 50, maxScanResults = 100) {
    this.maxSnapshots = maxSnapshots;
    this.maxScanResults = maxScanResults;
  }

  saveSnapshot(snapshot: SecuritySnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  getLatestSnapshot(): SecuritySnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1]! : null;
  }

  getSnapshot(id: string): SecuritySnapshot | null {
    return this.snapshots.find((s) => s.id === id) ?? null;
  }

  getAllSnapshots(): SecuritySnapshot[] {
    return [...this.snapshots];
  }

  saveScanResult(result: ScanResult): void {
    this.scanResults.push(result);
    if (this.scanResults.length > this.maxScanResults) {
      this.scanResults.shift();
    }
  }

  getScanResult(scanId: string): ScanResult | null {
    return this.scanResults.find((r) => r.scanId === scanId) ?? null;
  }

  getRecentScanResults(count = 10): ScanResult[] {
    return this.scanResults.slice(-count);
  }

  saveThreat(threat: Threat): void {
    this.threats.set(threat.id, threat);
  }

  saveThreats(threats: Threat[]): void {
    for (const threat of threats) {
      this.threats.set(threat.id, threat);
    }
  }

  getThreat(threatId: string): Threat | null {
    return this.threats.get(threatId) ?? null;
  }

  getAllThreats(): Threat[] {
    return Array.from(this.threats.values());
  }

  getActiveThreats(): Threat[] {
    return this.getAllThreats().filter((t) => t.status === 'active');
  }

  updateThreatStatus(threatId: string, status: Threat['status']): boolean {
    const threat = this.threats.get(threatId);
    if (!threat) return false;
    threat.status = status;
    return true;
  }

  clear(): void {
    this.snapshots = [];
    this.scanResults = [];
    this.threats.clear();
  }

  snapshotCount(): number {
    return this.snapshots.length;
  }

  scanResultCount(): number {
    return this.scanResults.length;
  }

  threatCount(): number {
    return this.threats.size;
  }
}
