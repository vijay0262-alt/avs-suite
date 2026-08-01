/**
 * ProcessEvents — event bus for process AI engine lifecycle events.
 */
import type { ProcessEvent } from './types';

type ProcessEventListener = (event: ProcessEvent) => void;

class ProcessEventBus {
  private listeners = new Set<ProcessEventListener>();

  subscribe(listener: ProcessEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ProcessEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  emitScanStarted(): void {
    this.emit({ type: 'process_scan_started', timestamp: Date.now() });
  }

  emitScanCompleted(snapshotId: string, durationMs: number, processCount: number): void {
    this.emit({
      type: 'process_scan_completed',
      timestamp: Date.now(),
      data: { snapshotId, scanDurationMs: durationMs, processCount },
    });
  }

  emitHighCpu(pid: number, name: string, cpuPercent: number): void {
    this.emit({
      type: 'process_high_cpu_detected',
      timestamp: Date.now(),
      pid,
      processName: name,
      data: { cpuUsagePercent: cpuPercent },
    });
  }

  emitMemoryLeak(pid: number, name: string, memoryMB: number): void {
    this.emit({
      type: 'process_memory_leak_suspected',
      timestamp: Date.now(),
      pid,
      processName: name,
      data: { memoryMB },
    });
  }

  emitSuspicious(pid: number, name: string, message: string): void {
    this.emit({
      type: 'process_suspicious_detected',
      timestamp: Date.now(),
      pid,
      processName: name,
      data: { message },
    });
  }

  emitIdle(pid: number, name: string): void {
    this.emit({
      type: 'process_idle_detected',
      timestamp: Date.now(),
      pid,
      processName: name,
    });
  }

  emitDuplicate(name: string, count: number): void {
    this.emit({
      type: 'process_duplicate_detected',
      timestamp: Date.now(),
      processName: name,
      data: { message: `${count} instances of ${name} detected` },
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const processEventBus = new ProcessEventBus();
