/**
 * HardwareMonitor — real-time polling of hardware sensors.
 *
 * Uses the scanner for the initial full scan, then polls providers
 * for incremental sensor updates at the configured interval.
 * Emits snapshot_updated events on each poll cycle.
 */

import type {
  HardwareSnapshot,
  HardwareComponent,
  HardwareConfiguration,
} from './types';
import { HardwareScanner } from './HardwareScanner';
import { HardwareCache } from './HardwareCache';
import { HardwareHistory } from './HardwareHistory';
import { hardwareRegistry } from './HardwareRegistry';
import { hardwareEventBus } from './HardwareEvents';

export class HardwareMonitor {
  private readonly scanner: HardwareScanner;
  private readonly cache: HardwareCache;
  private readonly history: HardwareHistory;
  private readonly config: HardwareConfiguration;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot: HardwareSnapshot | null = null;
  private polling = false;

  constructor(config: HardwareConfiguration) {
    this.config = config;
    this.scanner = new HardwareScanner(config);
    this.cache = new HardwareCache(config.cacheTtlMs);
    this.history = new HardwareHistory(config.maxSnapshots, config.historyRetentionMs);
  }

  async start(): Promise<HardwareSnapshot> {
    const snapshot = await this.scanner.scan();
    this.lastSnapshot = snapshot;
    this.cache.set(snapshot);
    this.history.add(snapshot);
    hardwareEventBus.emitSnapshotUpdated(snapshot.id);

    if (this.config.enablePolling) {
      this.startPolling();
    }

    return snapshot;
  }

  stop(): void {
    this.stopPolling();
  }

  getSnapshot(): HardwareSnapshot | null {
    const cached = this.cache.get();
    if (cached) return cached;
    return this.lastSnapshot;
  }

  getHistory(): HardwareSnapshot[] {
    return this.history.getAll().map((e) => e.snapshot);
  }

  getRecentHistory(count: number): HardwareSnapshot[] {
    return this.history.getRecent(count).map((e) => e.snapshot);
  }

  isPolling(): boolean {
    return this.polling;
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.polling = true;
    this.pollTimer = setInterval(() => {
      void this.pollCycle();
    }, this.config.pollIntervalMs);
  }

  private stopPolling(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollCycle(): Promise<void> {
    if (!this.lastSnapshot) return;

    try {
      const updates = await this.pollProviders();
      const merged = this.mergeUpdates(this.lastSnapshot, updates);
      merged.id = `hw-snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      merged.timestamp = Date.now();

      this.lastSnapshot = merged;
      this.cache.set(merged);
      this.history.add(merged);
      hardwareEventBus.emitSnapshotUpdated(merged.id);
    } catch {
      // polling errors are non-fatal — next cycle will retry
    }
  }

  private async pollProviders(): Promise<Partial<HardwareComponent>[]> {
    const allUpdates: Partial<HardwareComponent>[] = [];
    const providers = hardwareRegistry.getAllProviders();

    const results = await Promise.allSettled(
      providers.filter((p) => p.isAvailable()).map((p) => p.poll()),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allUpdates.push(...result.value);
      }
    }

    return allUpdates;
  }

  private mergeUpdates(
    base: HardwareSnapshot,
    updates: Partial<HardwareComponent>[],
  ): HardwareSnapshot {
    const components = [...base.components];

    for (const update of updates) {
      if (!update.category) continue;
      const idx = components.findIndex((c) => c.category === update.category);
      if (idx >= 0) {
        components[idx] = { ...components[idx], ...update } as HardwareComponent;
      }
    }

    return {
      ...base,
      components,
    };
  }
}
