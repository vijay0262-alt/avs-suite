/**
 * Quota Storage — storage abstraction for quota state and usage records.
 *
 * Supports:
 *   - In-memory storage (default, for testing)
 *   - Local storage (browser localStorage)
 *   - Future cloud storage / account synchronization
 *
 * The storage adapter is replaceable without affecting the engine.
 */
import type { QuotaStorageAdapter, QuotaStorageData } from './types';

const STORAGE_KEY = 'avs-shield-quotas';
const STORAGE_VERSION = 1;

/**
 * In-memory storage adapter (default).
 * Used for testing and as a fallback when no persistent storage is available.
 */
export class MemoryQuotaStorage implements QuotaStorageAdapter {
  private _data: QuotaStorageData = { states: {}, records: [] };

  async load(): Promise<QuotaStorageData> {
    return {
      states: { ...this._data.states },
      records: [...this._data.records],
    };
  }

  async save(data: QuotaStorageData): Promise<void> {
    this._data = {
      states: { ...data.states },
      records: [...data.records],
    };
  }

  async clear(): Promise<void> {
    this._data = { states: {}, records: [] };
  }
}

/**
 * Local storage adapter (browser localStorage).
 * Persists quota data to localStorage with versioning.
 */
export class LocalQuotaStorage implements QuotaStorageAdapter {
  private _key: string;

  constructor(key: string = STORAGE_KEY) {
    this._key = key;
  }

  async load(): Promise<QuotaStorageData> {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(this._key) : null;
      if (!raw) return { states: {}, records: [] };
      const parsed = JSON.parse(raw);
      if (parsed.version !== STORAGE_VERSION) {
        return { states: {}, records: [] };
      }
      return parsed.data as QuotaStorageData;
    } catch {
      return { states: {}, records: [] };
    }
  }

  async save(data: QuotaStorageData): Promise<void> {
    try {
      const payload = JSON.stringify({ version: STORAGE_VERSION, data });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this._key, payload);
      }
    } catch {
      // Storage full or unavailable — fail silently
    }
  }

  async clear(): Promise<void> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this._key);
      }
    } catch {
      // Fail silently
    }
  }
}

/**
 * Factory: create a storage adapter based on environment.
 * Uses localStorage if available, falls back to in-memory.
 */
export function createDefaultStorage(): QuotaStorageAdapter {
  if (typeof localStorage !== 'undefined') {
    return new LocalQuotaStorage();
  }
  return new MemoryQuotaStorage();
}
