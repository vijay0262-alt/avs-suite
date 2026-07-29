/**
 * AI Context Cache — configurable memory cache with expiration.
 *
 * Features:
 *   Memory cache
 *   Expiration (TTL)
 *   Manual refresh
 *   Force rebuild
 *   Cache statistics
 *   Future persistent cache support (interface ready)
 */
import type { AIContext, CacheEntry, CacheStatistics } from './types';

export class AIContextCache {
  private _entry: CacheEntry | null = null;
  private _stats: CacheStatistics;
  private _enabled: boolean = true;
  private _ttlMs: number;

  constructor(ttlMs: number = 30_000, enabled: boolean = true) {
    this._ttlMs = ttlMs;
    this._enabled = enabled;
    this._stats = {
      totalHits: 0,
      totalMisses: 0,
      totalBuilds: 0,
      totalRefreshes: 0,
      hitRate: 0,
      currentCacheSize: 0,
      lastCachedAt: null,
      lastBuildTimeMs: 0,
    };
  }

  /**
   * Get cached context if valid and not expired.
   */
  get(): AIContext | null {
    if (!this._enabled || !this._entry) {
      this._stats.totalMisses++;
      this._updateHitRate();
      return null;
    }

    const now = Date.now();
    if (now > new Date(this._entry.expiresAt).getTime()) {
      this._entry = null;
      this._stats.currentCacheSize = 0;
      this._stats.totalMisses++;
      this._updateHitRate();
      return null;
    }

    this._entry.hitCount++;
    this._stats.totalHits++;
    this._updateHitRate();
    return this._entry.context;
  }

  /**
   * Store context in cache.
   */
  set(context: AIContext, buildTimeMs: number): void {
    if (!this._enabled) return;

    const now = new Date();
    const expires = new Date(now.getTime() + this._ttlMs);

    this._entry = {
      context,
      cachedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      hitCount: 0,
    };

    this._stats.totalBuilds++;
    this._stats.currentCacheSize = 1;
    this._stats.lastCachedAt = now.toISOString();
    this._stats.lastBuildTimeMs = buildTimeMs;
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this._entry = null;
    this._stats.currentCacheSize = 0;
  }

  /**
   * Check if cache is valid (has entry and not expired).
   */
  isValid(): boolean {
    if (!this._enabled || !this._entry) return false;
    return Date.now() <= new Date(this._entry.expiresAt).getTime();
  }

  /**
   * Get cache entry info (without the full context).
   */
  getInfo(): Omit<CacheEntry, 'context'> | null {
    if (!this._entry) return null;
    return {
      cachedAt: this._entry.cachedAt,
      expiresAt: this._entry.expiresAt,
      hitCount: this._entry.hitCount,
    };
  }

  /**
   * Get cache statistics.
   */
  getStatistics(): CacheStatistics {
    return { ...this._stats };
  }

  /**
   * Record a refresh event.
   */
  recordRefresh(): void {
    this._stats.totalRefreshes++;
  }

  /**
   * Record a cache miss.
   */
  recordMiss(): void {
    this._stats.totalMisses++;
    this._updateHitRate();
  }

  /**
   * Update TTL.
   */
  setTtl(ttlMs: number): void {
    this._ttlMs = ttlMs;
  }

  /**
   * Enable/disable cache.
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) this.clear();
  }

  /**
   * Check if cache is enabled.
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Reset statistics.
   */
  resetStatistics(): void {
    this._stats = {
      totalHits: 0,
      totalMisses: 0,
      totalBuilds: 0,
      totalRefreshes: 0,
      hitRate: 0,
      currentCacheSize: this._entry ? 1 : 0,
      lastCachedAt: this._stats.lastCachedAt,
      lastBuildTimeMs: this._stats.lastBuildTimeMs,
    };
  }

  // ── Private ────────────────────────────────────────────────

  private _updateHitRate(): void {
    const total = this._stats.totalHits + this._stats.totalMisses;
    this._stats.hitRate = total > 0 ? this._stats.totalHits / total : 0;
  }
}
