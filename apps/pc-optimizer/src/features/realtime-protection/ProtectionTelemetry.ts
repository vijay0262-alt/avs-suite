/**
 * ProtectionTelemetry — local-only telemetry collection.
 *
 * Collects:
 *   - CPU usage (estimated)
 *   - Memory usage
 *   - Events per minute
 *   - Average latency
 *   - Queue depth
 *   - Monitor health
 *   - Provider failures
 *   - Dropped events
 *
 * All data stays local. No cloud, no external transmission.
 */
import type { ProtectionTelemetry, TelemetrySample, MonitorType } from './types';

export class ProtectionTelemetryCollector {
  private samples: TelemetrySample[] = [];
  private maxSamples: number;
  private enabled: boolean;
  private intervalMs: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // Counters for computing rates
  private eventCount = 0;
  private lastEventCountReset = Date.now();
  private providerFailures = 0;
  private droppedEvents = 0;

  // Current metrics
  private currentCpuUsage = 0;
  private currentMemoryUsage = 0;
  private currentLatencyMs = 0;
  private currentQueueDepth = 0;
  private monitorHealth = new Map<MonitorType, boolean>();

  constructor(maxSamples = 1440, enabled = true, intervalMs = 60000) {
    this.maxSamples = maxSamples;
    this.enabled = enabled;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (!this.enabled || this.intervalId) return;
    this.intervalId = setInterval(() => this.sample(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  recordEvent(): void {
    this.eventCount++;
  }

  recordProviderFailure(): void {
    this.providerFailures++;
  }

  recordDroppedEvent(): void {
    this.droppedEvents++;
  }

  updateCpuUsage(usage: number): void {
    this.currentCpuUsage = Math.max(0, Math.min(100, usage));
  }

  updateMemoryUsage(usageMB: number): void {
    this.currentMemoryUsage = Math.max(0, usageMB);
  }

  updateLatency(ms: number): void {
    this.currentLatencyMs = ms;
  }

  updateQueueDepth(depth: number): void {
    this.currentQueueDepth = depth;
  }

  updateMonitorHealth(type: MonitorType, healthy: boolean): void {
    this.monitorHealth.set(type, healthy);
  }

  sample(): TelemetrySample {
    const now = Date.now();
    const elapsed = now - this.lastEventCountReset;
    const eventsPerMinute = elapsed > 0 ? (this.eventCount / elapsed) * 60000 : 0;

    const sample: TelemetrySample = {
      timestamp: now,
      cpuUsage: this.currentCpuUsage,
      memoryUsage: this.currentMemoryUsage,
      eventsPerMinute,
      latencyMs: this.currentLatencyMs,
      queueDepth: this.currentQueueDepth,
    };

    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(-this.maxSamples);
    }

    // Reset event counter
    this.eventCount = 0;
    this.lastEventCountReset = now;

    return sample;
  }

  getSamples(): TelemetrySample[] {
    return [...this.samples];
  }

  getLatestSample(): TelemetrySample | null {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1]! : null;
  }

  getCurrent(): ProtectionTelemetry {
    const now = Date.now();
    const elapsed = now - this.lastEventCountReset;
    const eventsPerMinute = elapsed > 0 ? (this.eventCount / elapsed) * 60000 : 0;

    const monitorHealthObj: Record<string, boolean> = {};
    for (const [type, healthy] of this.monitorHealth) {
      monitorHealthObj[type] = healthy;
    }

    return {
      cpuUsage: this.currentCpuUsage,
      memoryUsage: this.currentMemoryUsage,
      eventsPerMinute,
      averageLatencyMs: this.currentLatencyMs,
      queueDepth: this.currentQueueDepth,
      monitorHealth: monitorHealthObj as Record<MonitorType, boolean>,
      providerFailures: this.providerFailures,
      droppedEvents: this.droppedEvents,
      uptime: this.samples.length > 0 ? now - this.samples[0]!.timestamp : 0,
      timestamp: now,
    };
  }

  getAverageCpuUsage(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, s) => sum + s.cpuUsage, 0) / this.samples.length;
  }

  getAverageMemoryUsage(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, s) => sum + s.memoryUsage, 0) / this.samples.length;
  }

  getPeakEventsPerMinute(): number {
    if (this.samples.length === 0) return 0;
    return Math.max(...this.samples.map((s) => s.eventsPerMinute));
  }

  getAverageLatency(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, s) => sum + s.latencyMs, 0) / this.samples.length;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  setMaxSamples(max: number): void {
    this.maxSamples = max;
    if (this.samples.length > max) {
      this.samples = this.samples.slice(-max);
    }
  }

  setInterval(intervalMs: number): void {
    this.intervalMs = intervalMs;
    if (this.intervalId) {
      this.stop();
      this.start();
    }
  }

  clear(): void {
    this.samples = [];
    this.eventCount = 0;
    this.providerFailures = 0;
    this.droppedEvents = 0;
    this.lastEventCountReset = Date.now();
    this.monitorHealth.clear();
  }
}
