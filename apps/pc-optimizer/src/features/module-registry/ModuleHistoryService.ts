/**
 * Module Health History (Part 10) — each module contributes historical data
 * for analytics and reporting.
 *
 * Records per-module: scan date, items found, items resolved, time taken,
 * storage recovered, health impact.
 *
 * This prepares the application for future analytics and reporting without
 * changing Dashboard or module code.
 */

import type { ModuleId } from '../health/HealthContribution';

export interface ModuleHistoryEntry {
  id: string;
  moduleId: ModuleId;
  moduleName: string;
  /** ISO timestamp of the scan/optimization. */
  timestamp: string;
  /** Items found during scan. */
  itemsFound: number;
  /** Items resolved (cleaned/fixed/optimized). */
  itemsResolved: number;
  /** Time taken in milliseconds. */
  durationMs: number;
  /** Bytes recovered. */
  bytesRecovered: number;
  /** Health score impact (positive = improvement). */
  healthImpact: number;
  /** Type of operation. */
  operation: 'scan' | 'clean' | 'optimize';
}

type HistoryListener = (entries: ModuleHistoryEntry[]) => void;

class ModuleHistoryServiceImpl {
  private entries: ModuleHistoryEntry[] = [];
  private maxEntries = 500;
  private listeners = new Set<HistoryListener>();

  /**
   * Record a module's historical entry.
   * Called automatically by BaseModuleAdapter after scan/clean/optimize.
   */
  record(entry: Omit<ModuleHistoryEntry, 'id'>): ModuleHistoryEntry {
    const fullEntry: ModuleHistoryEntry = {
      ...entry,
      id: `modhist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.entries.unshift(fullEntry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
    this.notifyListeners();
    return fullEntry;
  }

  getAllHistory(): ModuleHistoryEntry[] {
    return [...this.entries];
  }

  getModuleHistory(moduleId: ModuleId): ModuleHistoryEntry[] {
    return this.entries.filter((e) => e.moduleId === moduleId);
  }

  getRecent(count: number): ModuleHistoryEntry[] {
    return this.entries.slice(0, count);
  }

  getRecentForModule(moduleId: ModuleId, count: number): ModuleHistoryEntry[] {
    return this.entries.filter((e) => e.moduleId === moduleId).slice(0, count);
  }

  getCount(): number {
    return this.entries.length;
  }

  getModuleCount(moduleId: ModuleId): number {
    return this.entries.filter((e) => e.moduleId === moduleId).length;
  }

  clear(): void {
    this.entries = [];
    this.listeners.clear();
  }

  subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener([...this.entries]);
      } catch (err) {
        console.error('[ModuleHistoryService] listener error:', err);
      }
    }
  }
}

export const moduleHistoryService = new ModuleHistoryServiceImpl();
