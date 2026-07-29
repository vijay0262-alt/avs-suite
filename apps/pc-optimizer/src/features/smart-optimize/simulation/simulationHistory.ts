/**
 * Simulation History — tracks simulation lifecycle events (generated, viewed,
 * compared, accepted, rejected, executed, expired).
 */
import type { SimulationHistoryEntry, SimulationStatus } from './types';
import { generateSimulationHistoryId } from './types';

export class SimulationHistory {
  private _entries: SimulationHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries = 500) {
    this._maxEntries = maxEntries;
  }

  record(simulationId: string, planId: string, status: SimulationStatus, metadata: Record<string, unknown> = {}): SimulationHistoryEntry {
    const entry: SimulationHistoryEntry = {
      id: generateSimulationHistoryId(),
      simulationId,
      planId,
      status,
      timestamp: new Date().toISOString(),
      metadata,
      futureMetadata: {},
    };
    this._entries.push(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }
    return entry;
  }

  getAll(): SimulationHistoryEntry[] {
    return [...this._entries];
  }

  getBySimulation(simulationId: string): SimulationHistoryEntry[] {
    return this._entries.filter((e) => e.simulationId === simulationId);
  }

  getByPlan(planId: string): SimulationHistoryEntry[] {
    return this._entries.filter((e) => e.planId === planId);
  }

  getByStatus(status: SimulationStatus): SimulationHistoryEntry[] {
    return this._entries.filter((e) => e.status === status);
  }

  getLatest(): SimulationHistoryEntry | null {
    return this._entries.length > 0 ? this._entries[this._entries.length - 1]! : null;
  }

  getLatestBySimulation(simulationId: string): SimulationHistoryEntry | null {
    const entries = this.getBySimulation(simulationId);
    return entries.length > 0 ? entries[entries.length - 1]! : null;
  }

  updateStatus(simulationId: string, status: SimulationStatus, metadata: Record<string, unknown> = {}): void {
    this.record(simulationId, '', status, metadata);
  }

  clear(): void {
    this._entries = [];
  }

  get count(): number {
    return this._entries.length;
  }

  setMaxEntries(max: number): void {
    this._maxEntries = max;
    if (this._entries.length > max) {
      this._entries = this._entries.slice(-max);
    }
  }
}
