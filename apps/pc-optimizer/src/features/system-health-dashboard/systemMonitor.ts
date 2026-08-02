/**
 * System Monitor — polls live system metrics at configurable intervals.
 *
 * Uses the existing `dashboardService.getLiveMetrics()` RPC call.
 * Throttles updates to avoid unnecessary CPU load.
 *
 * This module does NOT modify the dashboard service or any business logic.
 */
import type { SystemLiveMetrics } from './types';
import { dashboardService } from '../dashboard/dashboard.service';
import { extractLiveMetrics } from './types';

export class SystemMonitor {
  private _intervalMs: number;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _running: boolean = false;
  private _lastMetrics: SystemLiveMetrics | null = null;
  private _lastFetchAt: number = 0;
  private _minFetchIntervalMs: number;
  private _listeners: Set<(metrics: SystemLiveMetrics) => void> = new Set();
  private _errorListeners: Set<(error: string) => void> = new Set();

  constructor(options?: {
    intervalMs?: number;
    minFetchIntervalMs?: number;
  }) {
    this._intervalMs = options?.intervalMs ?? 5000; // 5 seconds default
    this._minFetchIntervalMs = options?.minFetchIntervalMs ?? 2000; // min 2 seconds between fetches
  }

  /**
   * Start monitoring.
   */
  start(): void {
    if (this._running) return;
    this._running = true;
    this._fetch(); // immediate first fetch
    this._timer = setInterval(() => this._fetch(), this._intervalMs);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Force an immediate refresh (respecting min fetch interval).
   */
  async refresh(): Promise<SystemLiveMetrics | null> {
    return this._fetch(true);
  }

  /**
   * Get the last fetched metrics.
   */
  getLastMetrics(): SystemLiveMetrics | null {
    return this._lastMetrics;
  }

  /**
   * Check if monitoring is active.
   */
  isRunning(): boolean {
    return this._running;
  }

  /**
   * Set the polling interval.
   */
  setIntervalMs(intervalMs: number): void {
    this._intervalMs = Math.max(1000, intervalMs);
    if (this._running) {
      this.stop();
      this.start();
    }
  }

  /**
   * Subscribe to metrics updates.
   */
  onMetrics(listener: (metrics: SystemLiveMetrics) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Subscribe to error events.
   */
  onError(listener: (error: string) => void): () => void {
    this._errorListeners.add(listener);
    return () => this._errorListeners.delete(listener);
  }

  /**
   * Fetch metrics from the dashboard service.
   */
  private async _fetch(force: boolean = false): Promise<SystemLiveMetrics | null> {
    const now = Date.now();
    if (!force && now - this._lastFetchAt < this._minFetchIntervalMs) {
      return this._lastMetrics;
    }
    this._lastFetchAt = now;

    try {
      // LiveMetrics doesn't have performance/windows data, so we need full metrics
      // for startupPrograms, backgroundServices, etc.
      const metrics = await dashboardService.getMetrics();

      const liveMetrics = extractLiveMetrics(metrics);
      this._lastMetrics = liveMetrics;

      for (const listener of this._listeners) {
        try {
          listener(liveMetrics);
        } catch (err) {
          console.error('[SystemMonitor] Listener error:', err);
        }
      }

      return liveMetrics;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[SystemMonitor] Fetch failed:', errorMsg);
      for (const listener of this._errorListeners) {
        try {
          listener(errorMsg);
        } catch {
          // ignore
        }
      }
      return null;
    }
  }
}

/**
 * Default singleton instance.
 */
export const systemMonitor = new SystemMonitor();
