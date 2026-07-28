/**
 * HealthCache — caches analysis results and invalidates when
 * relevant system data changes.
 *
 * The cache stores:
 *   - The last complete health report
 *   - Per-category results (for partial cache hits)
 *   - A content hash of the input data that produced the cache
 *
 * Cache is invalidated when:
 *   - The input metrics change significantly
 *   - New execution history is added
 *   - Explicit invalidation is requested
 *   - The TTL expires
 */
import type { HealthReport, CategoryResult, HealthAnalysisInput } from './types';

/**
 * Cache entry for a complete health report.
 */
interface CacheEntry {
  report: HealthReport;
  inputHash: string;
  timestamp: number;
}

/**
 * Default cache TTL: 5 minutes.
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class HealthCache {
  private _entry: CacheEntry | null = null;
  private _ttlMs: number;
  private _categoryCache: Map<string, CategoryResult> = new Map();

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this._ttlMs = ttlMs;
  }

  /**
   * Get a cached report if it's still valid for the given input.
   */
  get(input: HealthAnalysisInput): HealthReport | null {
    if (!this._entry) return null;

    const age = Date.now() - this._entry.timestamp;
    if (age > this._ttlMs) {
      this.invalidate();
      return null;
    }

    const currentHash = this._hashInput(input);
    if (currentHash !== this._entry.inputHash) {
      this.invalidate();
      return null;
    }

    return { ...this._entry.report, fromCache: true };
  }

  /**
   * Store a report in the cache.
   */
  set(report: HealthReport, input: HealthAnalysisInput): void {
    const inputHash = this._hashInput(input);
    this._entry = {
      report: { ...report, fromCache: false },
      inputHash,
      timestamp: Date.now(),
    };

    // Cache individual category results
    for (const category of report.categories) {
      this._categoryCache.set(category.categoryId, category);
    }
  }

  /**
   * Get a cached category result.
   */
  getCategoryResult(categoryId: string): CategoryResult | null {
    return this._categoryCache.get(categoryId) ?? null;
  }

  /**
   * Invalidate the entire cache.
   */
  invalidate(): void {
    this._entry = null;
    this._categoryCache.clear();
  }

  /**
   * Check if the cache has a valid entry.
   */
  isValid(): boolean {
    if (!this._entry) return false;
    return (Date.now() - this._entry.timestamp) <= this._ttlMs;
  }

  /**
   * Get the age of the cache entry in milliseconds.
   */
  getAge(): number | null {
    if (!this._entry) return null;
    return Date.now() - this._entry.timestamp;
  }

  /**
   * Set the cache TTL.
   */
  setTtl(ttlMs: number): void {
    this._ttlMs = ttlMs;
  }

  /**
   * Produce a lightweight hash of the input data.
   * This determines whether the cached result is still valid.
   */
  private _hashInput(input: HealthAnalysisInput): string {
    const parts: string[] = [];

    // Hash metrics (if available)
    if (input.metrics) {
      const m = input.metrics;
      parts.push(`cpu:${m.cpu.usage.toFixed(1)}`);
      parts.push(`mem:${m.memory.usage.toFixed(1)}`);
      parts.push(`proc:${m.cpu.processes}`);
      parts.push(`startup:${m.performance.startupApps}`);
      parts.push(`temp:${m.performance.temporaryFilesSize}`);
      parts.push(`bin:${m.performance.recycleBinSize}`);
      parts.push(`cache:${m.performance.browserCacheSize}`);
      for (const drive of m.storage) {
        parts.push(`drv:${drive.mount}:${drive.usage.toFixed(1)}`);
      }
      parts.push(`def:${m.security.defender.enabled}`);
      parts.push(`fw:${m.security.firewall.enabled}`);
    } else {
      parts.push('metrics:null');
    }

    // Hash execution history (count + last record ID)
    parts.push(`hist:${input.executionHistory.length}`);
    if (input.executionHistory.length > 0) {
      const last = input.executionHistory[input.executionHistory.length - 1]!;
      parts.push(`last:${last.id}`);
    }

    // Hash statistics
    parts.push(`total:${input.executionStatistics.totalExecutions}`);
    parts.push(`failed:${input.executionStatistics.failedExecutions}`);
    parts.push(`lastRun:${input.executionStatistics.lastRunAt ?? 'null'}`);

    return parts.join('|');
  }
}

/**
 * Default singleton instance.
 */
export const healthCache = new HealthCache();
