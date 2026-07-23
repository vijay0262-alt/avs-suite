/**
 * Optimization History Service (Part 8).
 *
 * Stores optimization history records for reporting and analytics.
 * Each optimization records: date, time, health before/after, storage
 * recovered, registry fixed, startup optimized, privacy cleaned,
 * duplicate files removed, and duration.
 *
 * Storage is in-memory by default; future versions can swap in
 * a persistent backend (IndexedDB, SQLite, etc.) by implementing
 * the OptimizationHistoryStore interface.
 */

export interface OptimizationHistoryEntry {
  id: string;
  /** ISO timestamp of when the optimization completed. */
  timestamp: string;
  /** Health score before optimization (0–100). */
  healthBefore: number;
  /** Health score after optimization (0–100). */
  healthAfter: number;
  /** Bytes recovered from storage (temp files, recycle bin, browser cache). */
  storageRecovered: number;
  /** Number of registry issues fixed. */
  registryFixed: number;
  /** Number of startup applications disabled/optimized. */
  startupOptimized: number;
  /** Number of privacy items cleaned. */
  privacyCleaned: number;
  /** Number of duplicate files removed. */
  duplicateFilesRemoved: number;
  /** Optimization duration in milliseconds. */
  durationMs: number;
  /** Whether the optimization was successful, partial, or cancelled. */
  result: 'success' | 'partial' | 'cancelled';
  /** List of module IDs that participated in the optimization. */
  modulesUsed: string[];
}

export interface OptimizationHistoryStore {
  add(entry: OptimizationHistoryEntry): void;
  getAll(): OptimizationHistoryEntry[];
  getRecent(count: number): OptimizationHistoryEntry[];
  clear(): void;
  getCount(): number;
}

/**
 * In-memory implementation. Future versions can replace with
 * a persistent store (IndexedDB, SQLite, etc.).
 */
export class InMemoryOptimizationHistoryStore implements OptimizationHistoryStore {
  private entries: OptimizationHistoryEntry[] = [];
  private maxEntries = 1000;

  add(entry: OptimizationHistoryEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries);
    }
  }

  getAll(): OptimizationHistoryEntry[] {
    return [...this.entries];
  }

  getRecent(count: number): OptimizationHistoryEntry[] {
    return this.entries.slice(0, count);
  }

  clear(): void {
    this.entries = [];
  }

  getCount(): number {
    return this.entries.length;
  }
}

export class OptimizationHistoryService {
  constructor(private store: OptimizationHistoryStore = new InMemoryOptimizationHistoryStore()) {}

  recordOptimization(entry: Omit<OptimizationHistoryEntry, 'id'>): OptimizationHistoryEntry {
    const fullEntry: OptimizationHistoryEntry = {
      ...entry,
      id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.store.add(fullEntry);
    return fullEntry;
  }

  getHistory(): OptimizationHistoryEntry[] {
    return this.store.getAll();
  }

  getRecentHistory(count: number): OptimizationHistoryEntry[] {
    return this.store.getRecent(count);
  }

  getHistoryCount(): number {
    return this.store.getCount();
  }

  clearHistory(): void {
    this.store.clear();
  }
}

export const optimizationHistoryService = new OptimizationHistoryService();
