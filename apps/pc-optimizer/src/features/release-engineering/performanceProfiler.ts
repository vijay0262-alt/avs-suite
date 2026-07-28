/**
 * Performance Profiler — EPIC 1
 *
 * Profiles the entire application:
 *   Cold startup, warm startup, memory usage, CPU usage,
 *   idle resource consumption, scan performance, optimization
 *   performance, dashboard refresh latency, AI Assistant
 *   response latency.
 *
 * Finds bottlenecks and generates a performance report.
 *
 * This module does NOT modify any existing architecture.
 * It builds on top of the existing PerformanceMonitor.
 */
import type {
  StartupMetric,
  StartupType,
  ResourceSnapshot,
  LatencyMetric,
  PerformanceReport,
} from './types';
import { average, formatMs } from './types';
import { releaseEvents } from './releaseEvents';

export class PerformanceProfiler {
  private _startupMetrics: StartupMetric[] = [];
  private _resourceSnapshots: ResourceSnapshot[] = [];
  private _latencyMetrics: LatencyMetric[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 500) {
    this._maxEntries = maxEntries;
  }

  recordStartup(type: StartupType, durationMs: number, stages: { name: string; durationMs: number }[]): void {
    this._startupMetrics.unshift({ type, durationMs, timestamp: new Date().toISOString(), stages });
    if (this._startupMetrics.length > this._maxEntries) {
      this._startupMetrics = this._startupMetrics.slice(0, this._maxEntries);
    }
  }

  recordResourceSnapshot(): ResourceSnapshot {
    interface PerformanceMemory {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    }
    const perf = typeof performance !== 'undefined' ? performance as Performance & { memory?: PerformanceMemory } : null;
    const mem = perf?.memory;
    const snapshot: ResourceSnapshot = {
      timestamp: new Date().toISOString(),
      usedJSHeapSize: mem?.usedJSHeapSize ?? 0,
      totalJSHeapSize: mem?.totalJSHeapSize ?? 0,
      jsHeapSizeLimit: mem?.jsHeapSizeLimit ?? 0,
      cpuCount: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 0 : 0,
    };
    this._resourceSnapshots.unshift(snapshot);
    if (this._resourceSnapshots.length > this._maxEntries) {
      this._resourceSnapshots = this._resourceSnapshots.slice(0, this._maxEntries);
    }
    return snapshot;
  }

  recordLatency(operation: string, durationMs: number, success: boolean = true): void {
    this._latencyMetrics.unshift({ operation, durationMs, timestamp: new Date().toISOString(), success });
    if (this._latencyMetrics.length > this._maxEntries) {
      this._latencyMetrics = this._latencyMetrics.slice(0, this._maxEntries);
    }
  }

  async measureLatency<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.recordLatency(operation, Date.now() - start, true);
      return result;
    } catch (err) {
      this.recordLatency(operation, Date.now() - start, false);
      throw err;
    }
  }

  findBottlenecks(): string[] {
    const bottlenecks: string[] = [];

    const coldStartups = this._startupMetrics.filter((m) => m.type === 'cold');
    if (coldStartups.length > 0) {
      const avgCold = average(coldStartups.map((m) => m.durationMs));
      if (avgCold > 5000) bottlenecks.push(`Cold startup is slow: avg ${formatMs(avgCold)} (target < 5s)`);
    }

    const scanLatencies = this._latencyMetrics.filter((m) => m.operation.includes('scan'));
    if (scanLatencies.length > 0) {
      const avgScan = average(scanLatencies.map((m) => m.durationMs));
      if (avgScan > 30000) bottlenecks.push(`Scan is slow: avg ${formatMs(avgScan)} (target < 30s)`);
    }

    const optLatencies = this._latencyMetrics.filter((m) => m.operation.includes('optim'));
    if (optLatencies.length > 0) {
      const avgOpt = average(optLatencies.map((m) => m.durationMs));
      if (avgOpt > 60000) bottlenecks.push(`Optimization is slow: avg ${formatMs(avgOpt)} (target < 60s)`);
    }

    const dashboardLatencies = this._latencyMetrics.filter((m) => m.operation.includes('dashboard'));
    if (dashboardLatencies.length > 0) {
      const avgDash = average(dashboardLatencies.map((m) => m.durationMs));
      if (avgDash > 500) bottlenecks.push(`Dashboard refresh is slow: avg ${formatMs(avgDash)} (target < 500ms)`);
    }

    const assistantLatencies = this._latencyMetrics.filter((m) => m.operation.includes('assistant'));
    if (assistantLatencies.length > 0) {
      const avgAssistant = average(assistantLatencies.map((m) => m.durationMs));
      if (avgAssistant > 2000) bottlenecks.push(`AI Assistant response is slow: avg ${formatMs(avgAssistant)} (target < 2s)`);
    }

    if (this._resourceSnapshots.length > 0) {
      const avgMem = average(this._resourceSnapshots.map((s) => s.usedJSHeapSize));
      const avgMemMB = avgMem / (1024 * 1024);
      if (avgMemMB > 500) bottlenecks.push(`Memory usage is high: avg ${avgMemMB.toFixed(1)}MB (target < 500MB)`);
    }

    return bottlenecks;
  }

  generateReport(): PerformanceReport {
    const coldStartups = this._startupMetrics.filter((m) => m.type === 'cold');
    const warmStartups = this._startupMetrics.filter((m) => m.type === 'warm');
    const scanLatencies = this._latencyMetrics.filter((m) => m.operation.includes('scan'));
    const optLatencies = this._latencyMetrics.filter((m) => m.operation.includes('optim'));
    const dashboardLatencies = this._latencyMetrics.filter((m) => m.operation.includes('dashboard'));
    const assistantLatencies = this._latencyMetrics.filter((m) => m.operation.includes('assistant'));

    const report: PerformanceReport = {
      startup: this._startupMetrics,
      resourceSnapshots: this._resourceSnapshots,
      latencyMetrics: this._latencyMetrics,
      bottlenecks: this.findBottlenecks(),
      summary: {
        avgColdStartupMs: average(coldStartups.map((m) => m.durationMs)),
        avgWarmStartupMs: average(warmStartups.map((m) => m.durationMs)),
        avgMemoryUsageMB: average(this._resourceSnapshots.map((s) => s.usedJSHeapSize)) / (1024 * 1024),
        avgScanLatencyMs: average(scanLatencies.map((m) => m.durationMs)),
        avgOptimizationLatencyMs: average(optLatencies.map((m) => m.durationMs)),
        avgDashboardRefreshMs: average(dashboardLatencies.map((m) => m.durationMs)),
        avgAssistantResponseMs: average(assistantLatencies.map((m) => m.durationMs)),
      },
      generatedAt: new Date().toISOString(),
    };

    releaseEvents.emit('performance_profiled', report);
    return report;
  }

  getStartupMetrics(): StartupMetric[] {
    return [...this._startupMetrics];
  }

  getResourceSnapshots(): ResourceSnapshot[] {
    return [...this._resourceSnapshots];
  }

  getLatencyMetrics(): LatencyMetric[] {
    return [...this._latencyMetrics];
  }

  clear(): void {
    this._startupMetrics = [];
    this._resourceSnapshots = [];
    this._latencyMetrics = [];
  }
}

export const performanceProfiler = new PerformanceProfiler();
