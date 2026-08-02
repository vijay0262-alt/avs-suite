/**
 * ProtectionManager — manages all monitors for the real-time protection engine.
 *
 * Tracks monitor status, handles start/stop, and reports health.
 * In production, monitors would connect to OS-level notification systems
 * (ReadDirectoryChangesW, ETW, WMI events, etc.) instead of polling.
 */
import type { MonitorInfo, MonitorConfig, MonitorType, SystemEvent, SystemEventType, EventTarget, EventMetadata } from './types';
import { categorizeEventType } from './types';

export class ProtectionManager {
  private monitors = new Map<MonitorType, MonitorInfo>();
  private configs: MonitorConfig[];
  private eventCallback: ((event: SystemEvent) => void) | null = null;
  private running = false;

  constructor(configs: MonitorConfig[]) {
    this.configs = configs.map((c) => ({ ...c }));
    this.initializeMonitors();
  }

  setEventCallback(callback: (event: SystemEvent) => void): void {
    this.eventCallback = callback;
  }

  start(): void {
    this.running = true;
    for (const config of this.configs) {
      if (config.enabled) {
        const monitor = this.monitors.get(config.type);
        if (monitor && monitor.status !== 'active') {
          monitor.status = 'active';
          monitor.startedAt = Date.now();
        }
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const monitor of this.monitors.values()) {
      if (monitor.status === 'active') {
        monitor.status = 'inactive';
      }
    }
  }

  pause(type: MonitorType): void {
    const monitor = this.monitors.get(type);
    if (monitor && monitor.status === 'active') {
      monitor.status = 'paused';
    }
  }

  resume(type: MonitorType): void {
    const monitor = this.monitors.get(type);
    if (monitor && monitor.status === 'paused') {
      monitor.status = 'active';
    }
  }

  enable(type: MonitorType): void {
    const config = this.configs.find((c) => c.type === type);
    if (config) config.enabled = true;
    const monitor = this.monitors.get(type);
    if (monitor) {
      monitor.enabled = true;
      if (this.running) {
        monitor.status = 'active';
        monitor.startedAt = Date.now();
      }
    }
  }

  disable(type: MonitorType): void {
    const config = this.configs.find((c) => c.type === type);
    if (config) config.enabled = false;
    const monitor = this.monitors.get(type);
    if (monitor) {
      monitor.enabled = false;
      monitor.status = 'inactive';
    }
  }

  getMonitor(type: MonitorType): MonitorInfo | null {
    const monitor = this.monitors.get(type);
    return monitor ? { ...monitor } : null;
  }

  getAllMonitors(): MonitorInfo[] {
    return [...this.monitors.values()].map((m) => ({ ...m }));
  }

  getActiveMonitors(): MonitorInfo[] {
    return this.getAllMonitors().filter((m) => m.status === 'active');
  }

  getMonitorCount(): { active: number; total: number } {
    const all = this.getAllMonitors();
    return {
      active: all.filter((m) => m.status === 'active').length,
      total: all.length,
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  updateConfigs(configs: MonitorConfig[]): void {
    this.configs = configs.map((c) => ({ ...c }));
    for (const config of configs) {
      const monitor = this.monitors.get(config.type);
      if (monitor) {
        if (!config.enabled && monitor.status === 'active') {
          monitor.status = 'inactive';
        } else if (config.enabled && this.running && monitor.status === 'inactive') {
          monitor.status = 'active';
          monitor.startedAt = Date.now();
        }
      }
    }
  }

  // Simulate receiving an event from an OS-level monitor
  injectEvent(
    type: SystemEventType,
    target: EventTarget,
    metadata: EventMetadata,
    severity: SystemEvent['severity'] = 'info',
  ): SystemEvent {
    const event: SystemEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      category: categorizeEventType(type),
      severity,
      status: 'pending',
      timestamp: Date.now(),
      source: `monitor:${categorizeEventType(type)}`,
      target,
      metadata,
      normalized: false,
      classified: false,
      filtered: false,
      processingTime: null,
    };

    const monitor = this.monitors.get(event.category as MonitorType);
    if (monitor) {
      monitor.eventsProcessed++;
      monitor.lastEvent = Date.now();
    }

    if (this.eventCallback) {
      this.eventCallback(event);
    }

    return event;
  }

  recordMonitorError(type: MonitorType, error: string): void {
    const monitor = this.monitors.get(type);
    if (monitor) {
      monitor.status = 'error';
      monitor.lastError = error;
    }
  }

  recordDroppedEvent(type: MonitorType): void {
    const monitor = this.monitors.get(type);
    if (monitor) {
      monitor.eventsDropped++;
    }
  }

  private initializeMonitors(): void {
    for (const config of this.configs) {
      this.monitors.set(config.type, {
        type: config.type,
        status: 'inactive',
        enabled: config.enabled,
        eventsProcessed: 0,
        eventsDropped: 0,
        lastEvent: null,
        lastError: null,
        startedAt: null,
      });
    }

    // Ensure all monitor types are represented
    const allTypes: MonitorType[] = ['file_system', 'process', 'service', 'scheduled_task', 'startup', 'registry', 'browser', 'download', 'usb', 'network'];
    for (const type of allTypes) {
      if (!this.monitors.has(type)) {
        this.monitors.set(type, {
          type,
          status: 'inactive',
          enabled: false,
          eventsProcessed: 0,
          eventsDropped: 0,
          lastEvent: null,
          lastError: null,
          startedAt: null,
        });
      }
    }
  }

  clear(): void {
    this.monitors.clear();
    this.eventCallback = null;
    this.running = false;
    this.initializeMonitors();
  }
}
