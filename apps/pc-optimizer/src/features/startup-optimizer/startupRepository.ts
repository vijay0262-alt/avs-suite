/**
 * Startup Repository — in-memory store for startup entries
 * with optional localStorage persistence.
 *
 * The repository caches scan results and tracks the current state
 * of each entry. It does NOT modify any external service.
 */
import type { StartupEntry } from './types';

const STORAGE_KEY = 'avs_startup_optimizer_entries';

export class StartupRepository {
  private _entries: Map<string, StartupEntry> = new Map();
  private _persistEnabled: boolean;

  constructor(persistEnabled: boolean = true) {
    this._persistEnabled = persistEnabled;
  }

  /**
   * Store entries from a scan.
   */
  store(entries: StartupEntry[]): void {
    this._entries.clear();
    for (const entry of entries) {
      this._entries.set(entry.id, entry);
    }
    this._persist();
  }

  /**
   * Get all entries.
   */
  getAll(): StartupEntry[] {
    return Array.from(this._entries.values());
  }

  /**
   * Get an entry by ID.
   */
  getById(id: string): StartupEntry | null {
    return this._entries.get(id) ?? null;
  }

  /**
   * Get all enabled entries.
   */
  getEnabled(): StartupEntry[] {
    return this.getAll().filter((e) => e.enabled);
  }

  /**
   * Get all disabled entries.
   */
  getDisabled(): StartupEntry[] {
    return this.getAll().filter((e) => !e.enabled);
  }

  /**
   * Update a single entry.
   */
  update(entry: StartupEntry): void {
    this._entries.set(entry.id, entry);
    this._persist();
  }

  /**
   * Update the enabled state of an entry.
   */
  setEnabled(id: string, enabled: boolean): StartupEntry | null {
    const entry = this._entries.get(id);
    if (!entry) return null;
    const updated = { ...entry, enabled };
    this._entries.set(id, updated);
    this._persist();
    return updated;
  }

  /**
   * Remove an entry from the repository.
   */
  remove(id: string): boolean {
    const deleted = this._entries.delete(id);
    if (deleted) this._persist();
    return deleted;
  }

  /**
   * Get the number of entries.
   */
  count(): number {
    return this._entries.size;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this._entries.clear();
    this._persist();
  }

  /**
   * Load entries from localStorage.
   */
  load(): void {
    if (!this._persistEnabled) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw) as StartupEntry[];
      this._entries.clear();
      for (const entry of entries) {
        this._entries.set(entry.id, entry);
      }
    } catch {
      // non-fatal
    }
  }

  /**
   * Persist entries to localStorage.
   */
  private _persist(): void {
    if (!this._persistEnabled) return;
    try {
      const entries = this.getAll();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // non-fatal
    }
  }
}

/**
 * Default singleton instance.
 */
export const startupRepository = new StartupRepository();
