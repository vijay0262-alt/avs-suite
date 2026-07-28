/**
 * Hash Engine — file hashing with quick hash, full SHA-256,
 * streaming for large files, and hash caching.
 *
 * Never hashes the same unchanged file twice.
 *
 * Uses RPC backend for actual file hashing (renderer cannot
 * access the filesystem directly).
 *
 * This module does NOT modify any existing architecture.
 */
import type { FileEntry } from '../storage-intelligence/types';
import type { HashResult, HashCacheEntry, HashAlgorithm, HashType } from './types';
import { QUICK_HASH_SIZE, STREAMING_THRESHOLD } from './types';
import { getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';

export class HashEngine {
  private _cache: Map<string, HashCacheEntry> = new Map();
  private _maxCacheSize: number;

  constructor(maxCacheSize: number = 100_000) {
    this._maxCacheSize = maxCacheSize;
  }

  async hashFile(entry: FileEntry, type: HashType = 'quick'): Promise<HashResult> {
    const cached = this._getCached(entry, type);
    if (cached) {
      return this._cacheToResult(entry.id, entry.path, cached, type);
    }

    if (!isRpcAvailable()) {
      return this._emptyResult(entry, type);
    }

    const rpc = getRpcBridge();
    if (!rpc) {
      return this._emptyResult(entry, type);
    }

    try {
      const method = type === 'quick' ? 'file.quickHash' : 'file.fullHash';
      const params = type === 'quick'
        ? { path: entry.path, size: QUICK_HASH_SIZE }
        : { path: entry.path, streaming: entry.size > STREAMING_THRESHOLD };

      const result = await rpc.call(method, params) as { hash?: string; algorithm?: string };

      const algorithm: HashAlgorithm = (result.algorithm as HashAlgorithm) ?? (type === 'quick' ? 'quick' : 'sha256');
      const hash = result.hash ?? null;

      const cacheEntry: HashCacheEntry = {
        path: entry.path,
        size: entry.size,
        modifiedDate: entry.modifiedDate,
        quickHash: type === 'quick' ? hash : null,
        fullHash: type === 'full' ? hash : null,
        algorithm,
        computedAt: new Date().toISOString(),
      };
      this._setCached(entry.path, cacheEntry);

      return {
        fileEntryId: entry.id,
        path: entry.path,
        quickHash: type === 'quick' ? hash : null,
        fullHash: type === 'full' ? hash : null,
        algorithm,
        size: entry.size,
        modifiedDate: entry.modifiedDate,
        computedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[HashEngine] Hash failed:', err);
      return this._emptyResult(entry, type);
    }
  }

  async hashFiles(entries: FileEntry[], type: HashType = 'quick'): Promise<Map<string, HashResult>> {
    const results = new Map<string, HashResult>();
    for (const entry of entries) {
      const result = await this.hashFile(entry, type);
      results.set(entry.id, result);
    }
    return results;
  }

  async hashFilesParallel(entries: FileEntry[], type: HashType = 'quick', maxParallel: number = 4): Promise<Map<string, HashResult>> {
    const results = new Map<string, HashResult>();
    const batches: FileEntry[][] = [];
    for (let i = 0; i < entries.length; i += maxParallel) {
      batches.push(entries.slice(i, i + maxParallel));
    }
    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map((e) => this.hashFile(e, type)));
      for (let i = 0; i < batch.length; i++) {
        results.set(batch[i]!.id, batchResults[i]!);
      }
    }
    return results;
  }

  getCacheSize(): number {
    return this._cache.size;
  }

  clearCache(): void {
    this._cache.clear();
  }

  evictOldEntries(maxAge: number): number {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this._cache) {
      if (now - new Date(entry.computedAt).getTime() > maxAge) {
        this._cache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  hasCached(path: string, size: number, modifiedDate: string): boolean {
    const entry = this._cache.get(path);
    if (!entry) return false;
    return entry.size === size && entry.modifiedDate === modifiedDate;
  }

  private _getCached(entry: FileEntry, type: HashType): HashCacheEntry | null {
    const cached = this._cache.get(entry.path);
    if (!cached) return null;
    if (cached.size !== entry.size || cached.modifiedDate !== entry.modifiedDate) return null;
    if (type === 'quick' && cached.quickHash === null) return null;
    if (type === 'full' && cached.fullHash === null) return null;
    return cached;
  }

  private _setCached(path: string, entry: HashCacheEntry): void {
    if (this._cache.size >= this._maxCacheSize) {
      const firstKey = this._cache.keys().next().value;
      if (firstKey) this._cache.delete(firstKey);
    }
    const existing = this._cache.get(path);
    if (existing) {
      this._cache.set(path, {
        ...existing,
        quickHash: entry.quickHash ?? existing.quickHash,
        fullHash: entry.fullHash ?? existing.fullHash,
        algorithm: entry.algorithm,
        computedAt: entry.computedAt,
      });
    } else {
      this._cache.set(path, entry);
    }
  }

  private _cacheToResult(fileEntryId: string, path: string, cached: HashCacheEntry, type: HashType): HashResult {
    return {
      fileEntryId,
      path,
      quickHash: type === 'quick' ? cached.quickHash : cached.quickHash,
      fullHash: type === 'full' ? cached.fullHash : cached.fullHash,
      algorithm: cached.algorithm,
      size: cached.size,
      modifiedDate: cached.modifiedDate,
      computedAt: cached.computedAt,
    };
  }

  private _emptyResult(entry: FileEntry, type: HashType): HashResult {
    return {
      fileEntryId: entry.id,
      path: entry.path,
      quickHash: type === 'quick' ? null : null,
      fullHash: type === 'full' ? null : null,
      algorithm: type === 'quick' ? 'quick' : 'sha256',
      size: entry.size,
      modifiedDate: entry.modifiedDate,
      computedAt: new Date().toISOString(),
    };
  }
}

export const hashEngine = new HashEngine();
