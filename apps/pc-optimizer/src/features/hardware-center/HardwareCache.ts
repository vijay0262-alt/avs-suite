/**
 * HardwareCache — time-based cache for hardware snapshots.
 *
 * Prevents redundant hardware scans within the TTL window.
 * Thread-safe via single-threaded JS event loop.
 */

import type { HardwareSnapshot } from './types';

interface CacheEntry {
  snapshot: HardwareSnapshot;
  storedAt: number;
  expiresAt: number;
}

export class HardwareCache {
  private entry: CacheEntry | null = null;
  private readonly ttlMs: number;

  constructor(ttlMs: number = 3000) {
    this.ttlMs = ttlMs;
  }

  get(): HardwareSnapshot | null {
    if (!this.entry) return null;
    if (Date.now() > this.entry.expiresAt) {
      this.entry = null;
      return null;
    }
    return this.entry.snapshot;
  }

  set(snapshot: HardwareSnapshot): void {
    const now = Date.now();
    this.entry = {
      snapshot,
      storedAt: now,
      expiresAt: now + this.ttlMs,
    };
  }

  invalidate(): void {
    this.entry = null;
  }

  isFresh(): boolean {
    return this.entry !== null && Date.now() <= this.entry.expiresAt;
  }

  ageMs(): number | null {
    if (!this.entry) return null;
    return Date.now() - this.entry.storedAt;
  }

  setTtl(_ttlMs: number): void {
    this.invalidate();
  }
}
