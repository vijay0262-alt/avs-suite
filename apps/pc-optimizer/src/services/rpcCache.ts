/**
 * RpcCache — TTL-based cache for read-only RPC calls.
 *
 * Prevents redundant IPC → Python round-trips for data that doesn't
 * change frequently (system info, drive lists, startup entries, etc).
 *
 * Cache keys are method+params. Each entry has:
 *   - data: the cached result
 *   - expiresAt: timestamp when the entry becomes stale
 *   - pendingPromise: in-flight request (deduplicates concurrent calls)
 *
 * Usage:
 *   const result = await rpcCache.get('system.info', undefined, 30_000);
 *   rpcCache.invalidate('system.info');
 *   rpcCache.clear();
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  pendingPromise: Promise<T> | null;
}

const DEFAULT_TTL_MS = 30_000;

class RpcCacheImpl {
  private cache = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;
  private sets = 0;

  private makeKey(method: string, params: unknown): string {
    if (params === undefined || params === null) return method;
    return `${method}:${JSON.stringify(params)}`;
  }

  /**
   * Get a cached result or execute the fetcher.
   * Concurrent calls for the same key share a single in-flight promise.
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<T> {
    const cacheKey = key;
    const now = Date.now();
    const entry = this.cache.get(cacheKey) as CacheEntry<T> | undefined;

    if (entry && entry.expiresAt > now) {
      this.hits++;
      return entry.data;
    }

    if (entry?.pendingPromise) {
      this.hits++;
      return entry.pendingPromise;
    }

    this.misses++;
    const promise = fetcher().then((data) => {
      this.sets++;
      this.cache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttlMs,
        pendingPromise: null,
      });
      return data;
    }).catch((err) => {
      this.cache.delete(cacheKey);
      throw err;
    });

    if (entry) {
      entry.pendingPromise = promise;
    } else {
      this.cache.set(cacheKey, {
        data: undefined as unknown as T,
        expiresAt: 0,
        pendingPromise: promise,
      });
    }

    return promise;
  }

  /**
   * Invalidate a specific cache key.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): { size: number; hits: number; misses: number; sets: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Check if a key is cached and fresh.
   */
  isFresh(key: string): boolean {
    const entry = this.cache.get(key);
    return !!entry && entry.expiresAt > Date.now();
  }
}

export const rpcCache = new RpcCacheImpl();
