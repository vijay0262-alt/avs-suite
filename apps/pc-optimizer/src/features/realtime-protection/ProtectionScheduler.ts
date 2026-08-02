/**
 * ProtectionScheduler — schedules periodic tasks for the protection engine.
 *
 * Uses setTimeout-based scheduling (not polling for events — those are
 * event-driven). This handles:
 *   - Telemetry sampling
 *   - Health checks
 *   - Queue drain
 *   - Statistics aggregation
 *   - Session heartbeat
 */
import type { ProtectionConfiguration } from './types';

export interface ScheduledTask {
  id: string;
  name: string;
  intervalMs: number;
  callback: () => void;
  enabled: boolean;
  lastRun: number | null;
  nextRun: number | null;
  running: boolean;
}

export class ProtectionScheduler {
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;

  register(id: string, name: string, intervalMs: number, callback: () => void): void {
    const task: ScheduledTask = {
      id,
      name,
      intervalMs,
      callback,
      enabled: true,
      lastRun: null,
      nextRun: null,
      running: false,
    };
    this.tasks.set(id, task);
  }

  unregister(id: string): void {
    this.stopTask(id);
    this.tasks.delete(id);
  }

  start(): void {
    this.running = true;
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const id of this.timers.keys()) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
    }
  }

  enableTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.enabled = true;
      if (this.running) {
        this.scheduleTask(task);
      }
    }
  }

  disableTask(id: string): void {
    this.stopTask(id);
    const task = this.tasks.get(id);
    if (task) {
      task.enabled = false;
    }
  }

  getTasks(): ScheduledTask[] {
    return [...this.tasks.values()];
  }

  isRunning(): boolean {
    return this.running;
  }

  applyConfig(config: ProtectionConfiguration): void {
    if (config.telemetryEnabled) {
      this.enableTask('telemetry');
    } else {
      this.disableTask('telemetry');
    }
  }

  private scheduleTask(task: ScheduledTask): void {
    if (!this.running || !task.enabled) return;

    const timer = setTimeout(() => {
      this.executeTask(task);
    }, task.intervalMs);

    this.timers.set(task.id, timer);
    task.nextRun = Date.now() + task.intervalMs;
  }

  private executeTask(task: ScheduledTask): void {
    if (!task.enabled) return;

    task.running = true;
    task.lastRun = Date.now();

    try {
      task.callback();
    } catch {
      // task errors are non-fatal
    } finally {
      task.running = false;
      this.timers.delete(task.id);
      if (this.running && task.enabled) {
        this.scheduleTask(task);
      }
    }
  }

  private stopTask(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  clear(): void {
    this.stop();
    this.tasks.clear();
  }
}
