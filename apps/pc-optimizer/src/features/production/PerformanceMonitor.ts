/**
 * Performance Monitoring (Part 6) — Production Readiness Framework.
 *
 * Tracks internal performance metrics:
 *   - Scan duration
 *   - Cleaning duration
 *   - Dashboard refresh time
 *   - Health calculation time
 *   - Module initialization time
 *   - Memory consumption
 *   - Background task duration
 *
 * Data assists optimization and debugging.
 */

import { logger } from './Logger';

// ── Metric Types ────────────────────────────────────────────────────

export type MetricType =
  | 'scan_duration'
  | 'clean_duration'
  | 'optimize_duration'
  | 'dashboard_refresh'
  | 'health_calculation'
  | 'module_init'
  | 'background_task'
  | 'memory_usage';

export interface PerformanceMetric {
  id: string;
  type: MetricType;
  module?: string;
  action: string;
  durationMs: number;
  timestamp: string;
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
  /** Whether the operation succeeded. */
  success: boolean;
}

export interface MetricSummary {
  type: MetricType;
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  lastMs: number;
  successRate: number;
}

type MetricListener = (metric: PerformanceMetric) => void;

// ── Performance Monitor ─────────────────────────────────────────────

class PerformanceMonitorImpl {
  private metrics: PerformanceMetric[] = [];
  private listeners = new Set<MetricListener>();
  private maxMetrics = 2000;

  /**
   * Record a performance metric.
   */
  record(
    type: MetricType,
    action: string,
    durationMs: number,
    options?: {
      module?: string;
      success?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): PerformanceMetric {
    const metric: PerformanceMetric = {
      id: `perf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      module: options?.module,
      action,
      durationMs,
      timestamp: new Date().toISOString(),
      metadata: options?.metadata,
      success: options?.success ?? true,
    };

    this.metrics.unshift(metric);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(0, this.maxMetrics);
    }

    // Log at debug level
    logger.debug('PerformanceMonitor', action, `${type}: ${durationMs}ms`, {
      durationMs,
      result: metric.success ? 'success' : 'failure',
      data: { type, module: options?.module },
    });

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(metric);
      } catch {
        // ignore listener errors
      }
    }

    return metric;
  }

  /**
   * Measure an async operation and automatically record the metric.
   */
  async measure<T>(
    type: MetricType,
    action: string,
    operation: () => Promise<T>,
    options?: {
      module?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await operation();
      const duration = Date.now() - start;
      this.record(type, action, duration, {
        ...options,
        success: true,
      });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      this.record(type, action, duration, {
        ...options,
        success: false,
        metadata: { ...options?.metadata, error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  /**
   * Measure a sync operation and automatically record the metric.
   */
  measureSync<T>(
    type: MetricType,
    action: string,
    operation: () => T,
    options?: {
      module?: string;
      metadata?: Record<string, unknown>;
    },
  ): T {
    const start = Date.now();
    try {
      const result = operation();
      const duration = Date.now() - start;
      this.record(type, action, duration, { ...options, success: true });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      this.record(type, action, duration, {
        ...options,
        success: false,
        metadata: { ...options?.metadata, error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  /**
   * Record current memory usage snapshot.
   */
  recordMemoryUsage(): void {
    interface PerformanceMemory {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    }
    const perf = performance as Performance & { memory?: PerformanceMemory };
    if (perf.memory) {
      this.record('memory_usage', 'heap-snapshot', 0, {
        success: true,
        metadata: {
          usedJSHeapSize: perf.memory.usedJSHeapSize,
          totalJSHeapSize: perf.memory.totalJSHeapSize,
          jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
        },
      });
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getRecentMetrics(count: number): PerformanceMetric[] {
    return this.metrics.slice(0, count);
  }

  getMetricsByType(type: MetricType): PerformanceMetric[] {
    return this.metrics.filter((m) => m.type === type);
  }

  getMetricsByModule(module: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.module === module);
  }

  /**
   * Get a summary for a specific metric type.
   */
  getSummary(type: MetricType): MetricSummary | null {
    const typed = this.metrics.filter((m) => m.type === type);
    if (typed.length === 0) return null;

    const durations = typed.map((m) => m.durationMs);
    const successCount = typed.filter((m) => m.success).length;

    return {
      type,
      count: typed.length,
      minMs: Math.min(...durations),
      maxMs: Math.max(...durations),
      avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      lastMs: typed[0]!.durationMs,
      successRate: successCount / typed.length,
    };
  }

  /**
   * Get summaries for all metric types.
   */
  getAllSummaries(): MetricSummary[] {
    const types: MetricType[] = [
      'scan_duration', 'clean_duration', 'optimize_duration',
      'dashboard_refresh', 'health_calculation', 'module_init',
      'background_task', 'memory_usage',
    ];
    return types
      .map((t) => this.getSummary(t))
      .filter((s): s is MetricSummary => s !== null);
  }

  getMetricCount(): number {
    return this.metrics.length;
  }

  // ── Subscription ──────────────────────────────────────────────────

  subscribe(listener: MetricListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ── Maintenance ───────────────────────────────────────────────────

  clear(): void {
    this.metrics = [];
    this.listeners.clear();
  }

  /**
   * Export metrics as JSON for diagnostics.
   */
  exportMetrics(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      metricCount: this.metrics.length,
      summaries: this.getAllSummaries(),
      recentMetrics: this.getRecentMetrics(100),
    }, null, 2);
  }
}

export const performanceMonitor = new PerformanceMonitorImpl();
