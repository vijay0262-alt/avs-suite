/**
 * SecurityCache — caching layer for scan results and snapshot data.
 *
 * Reduces redundant work by caching provider results and computed
 * snapshots with TTL-based expiration.
 */
import type { SecurityCacheEntry } from './types';

export class SecurityCache {
  private cache = new Map<string, SecurityCacheEntry>();
  private defaultTtl: number;

  constructor(defaultTtl = 300000) {
    this.defaultTtl = defaultTtl;
  }

  set(key: string, value: unknown, ttl?: number): void {
    const entry: SecurityCacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    };
    this.cache.set(key, entry);
  }

  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    let count = 0;
    for (const entry of this.cache.values()) {
      if (!this.isExpired(entry)) count++;
    }
    return count;
  }

  cleanup(): number {
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private isExpired(entry: SecurityCacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }
}
