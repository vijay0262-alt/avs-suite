/**
 * ProtectionEvents — pub/sub event bus for real-time protection lifecycle.
 */
import type { ProtectionEvent, ProtectionEventListener, ProtectionMode, MonitorType } from './types';

class ProtectionEventBus {
  private listeners = new Set<ProtectionEventListener>();

  subscribe(listener: ProtectionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ProtectionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  emitProtectionStarted(mode: ProtectionMode): void {
    this.emit({ type: 'protection_started', timestamp: Date.now(), mode, message: `Protection started in ${mode} mode` });
  }

  emitProtectionStopped(): void {
    this.emit({ type: 'protection_stopped', timestamp: Date.now(), message: 'Protection stopped' });
  }

  emitProtectionPaused(): void {
    this.emit({ type: 'protection_paused', timestamp: Date.now(), message: 'Protection paused' });
  }

  emitProtectionResumed(): void {
    this.emit({ type: 'protection_resumed', timestamp: Date.now(), message: 'Protection resumed' });
  }

  emitProtectionError(error: string): void {
    this.emit({ type: 'protection_error', timestamp: Date.now(), message: error });
  }

  emitProtectionRestarted(): void {
    this.emit({ type: 'protection_restarted', timestamp: Date.now(), message: 'Protection restarted' });
  }

  emitModeChanged(mode: ProtectionMode): void {
    this.emit({ type: 'mode_changed', timestamp: Date.now(), mode, message: `Mode changed to ${mode}` });
  }

  emitEventReceived(eventId: string, message?: string): void {
    this.emit({ type: 'event_received', timestamp: Date.now(), eventId, message });
  }

  emitEventProcessed(eventId: string, message?: string): void {
    this.emit({ type: 'event_processed', timestamp: Date.now(), eventId, message });
  }

  emitEventFiltered(eventId: string, message?: string): void {
    this.emit({ type: 'event_filtered', timestamp: Date.now(), eventId, message });
  }

  emitEventDropped(eventId: string, message?: string): void {
    this.emit({ type: 'event_dropped', timestamp: Date.now(), eventId, message });
  }

  emitThreatDetected(eventId: string, threatId: string, message?: string): void {
    this.emit({ type: 'threat_detected', timestamp: Date.now(), eventId, threatId, message });
  }

  emitInvestigationTriggered(eventId: string, message?: string): void {
    this.emit({ type: 'investigation_triggered', timestamp: Date.now(), eventId, message });
  }

  emitNotificationSent(eventId: string, message?: string): void {
    this.emit({ type: 'notification_sent', timestamp: Date.now(), eventId, message });
  }

  emitMonitorStarted(monitorType: MonitorType): void {
    this.emit({ type: 'monitor_started', timestamp: Date.now(), monitorType, message: `Monitor started: ${monitorType}` });
  }

  emitMonitorStopped(monitorType: MonitorType): void {
    this.emit({ type: 'monitor_stopped', timestamp: Date.now(), monitorType, message: `Monitor stopped: ${monitorType}` });
  }

  emitMonitorFailed(monitorType: MonitorType, error: string): void {
    this.emit({ type: 'monitor_failed', timestamp: Date.now(), monitorType, message: error });
  }

  emitQueueOverflow(message: string): void {
    this.emit({ type: 'queue_overflow', timestamp: Date.now(), message });
  }

  emitHealthDegraded(message: string): void {
    this.emit({ type: 'health_degraded', timestamp: Date.now(), message });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const protectionEventBus = new ProtectionEventBus();
