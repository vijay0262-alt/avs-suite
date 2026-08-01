/**
 * HardwareEvents — event bus for the Hardware Intelligence Center.
 *
 * Publishes hardware lifecycle events that other subsystems can subscribe to.
 * Follows the same pattern as ModuleEventBus.
 */

import type { HardwareEvent, HardwareEventTypeName } from './types';

type HardwareEventListener = (event: HardwareEvent) => void;

class HardwareEventBusImpl {
  private listeners = new Set<HardwareEventListener>();

  subscribe(listener: HardwareEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: HardwareEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors must not crash the bus
      }
    }
  }

  emitScanStarted(): void {
    this.emit({
      type: 'hardware_scan_started' as HardwareEventTypeName,
      timestamp: Date.now(),
    });
  }

  emitScanCompleted(snapshotId: string, scanDurationMs: number, componentCount: number): void {
    this.emit({
      type: 'hardware_scan_completed' as HardwareEventTypeName,
      timestamp: Date.now(),
      data: { snapshotId, scanDurationMs, componentCount },
    });
  }

  emitSnapshotUpdated(snapshotId: string): void {
    this.emit({
      type: 'hardware_snapshot_updated' as HardwareEventTypeName,
      timestamp: Date.now(),
      data: { snapshotId },
    });
  }

  emitProviderFailed(
    providerSource: string,
    category: string,
    error: string,
  ): void {
    this.emit({
      type: 'hardware_provider_failed' as HardwareEventTypeName,
      timestamp: Date.now(),
      category: category as never,
      providerSource: providerSource as never,
      data: { error },
    });
  }

  emitSensorMissing(category: string, sensorName: string): void {
    this.emit({
      type: 'hardware_sensor_missing' as HardwareEventTypeName,
      timestamp: Date.now(),
      category: category as never,
      data: { sensorName },
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const hardwareEventBus = new HardwareEventBusImpl();
