/**
 * ProcessMonitorService — monitors target applications (browsers, Explorer)
 * and emits events when they close.
 *
 * Used by BackgroundCleanupService to trigger deferred cleanup automatically
 * when the blocking application is no longer running.
 *
 * Polls the backend's `performance.monitor.getTopProcesses` RPC every
 * `POLL_INTERVAL_MS` milliseconds. When a tracked process transitions
 * from running → not-running, emits a `processClosed` event.
 */

import { RPC_METHODS } from '@avs/shared/rpc';
import { log } from './LogService';

function rpcClient() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

interface ProcessEntry {
  pid: number;
  name: string;
}

export interface ProcessClosedEvent {
  processName: string;
  timestamp: number;
}

export type ProcessMonitorListener = (event: ProcessClosedEvent) => void;

/** Target process names to monitor (lowercase, without .exe). */
const TARGET_PROCESSES: Record<string, string[]> = {
  chrome: ['chrome'],
  msedge: ['msedge'],
  firefox: ['firefox'],
  brave: ['brave'],
  explorer: ['explorer'],
};

/** Flattened list of process name patterns to watch. */
const WATCH_PATTERNS = Object.values(TARGET_PROCESSES).flat();

const POLL_INTERVAL_MS = 5000;

class ProcessMonitorServiceImpl {
  private listeners = new Set<ProcessMonitorListener>();
  private runningProcesses = new Map<string, number>(); // processName → pid
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private polling = false;

  /**
   * Start monitoring. Safe to call multiple times — only starts once.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.intervalId = setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);
    // Do an immediate poll so we know the initial state
    void this.poll();
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.started = false;
    this.runningProcesses.clear();
  }

  /**
   * Subscribe to process-closed events.
   * Returns an unsubscribe function.
   */
  subscribe(listener: ProcessMonitorListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Check if a specific application is currently running.
   */
  isRunning(appKey: string): boolean {
    const names = TARGET_PROCESSES[appKey];
    if (!names) return false;
    return names.some((n) => this.runningProcesses.has(n));
  }

  /**
   * Get the list of currently running target process names.
   */
  getRunningTargets(): string[] {
    return [...this.runningProcesses.keys()];
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const result = await rpcClient().call(RPC_METHODS.PERFORMANCE_MONITOR_TOP_PROCESSES, {
        sortBy: 'name',
        limit: 200,
        search: '',
      }) as { processes: ProcessEntry[] };

      const currentNames = new Set(
        (result.processes ?? [])
          .map((p) => p.name.toLowerCase().replace('.exe', ''))
      );

      // Detect newly closed processes
      const closed: string[] = [];
      for (const [procName] of this.runningProcesses) {
        if (!currentNames.has(procName)) {
          closed.push(procName);
        }
      }

      // Update running set
      for (const closedName of closed) {
        this.runningProcesses.delete(closedName);
      }
      for (const name of currentNames) {
        if (WATCH_PATTERNS.some((p) => name.includes(p))) {
          if (!this.runningProcesses.has(name)) {
            this.runningProcesses.set(name, 0);
          }
        }
      }

      // Emit events for closed processes
      for (const closedName of closed) {
        const event: ProcessClosedEvent = {
          processName: closedName,
          timestamp: Date.now(),
        };
        this.listeners.forEach((l) => l(event));
      }
    } catch (err) {
      // Phase 23: Log polling failure — will retry on next interval
      log.warning(
        `Process monitor poll failed: ${err instanceof Error ? err.message : String(err)}`,
        'process-monitor',
        'poll',
      );
    } finally {
      this.polling = false;
    }
  }

  /** Reset state (for testing). */
  reset(): void {
    this.stop();
    this.listeners.clear();
  }
}

export const processMonitorService = new ProcessMonitorServiceImpl();
export { ProcessMonitorServiceImpl };
