/**
 * SecurityEvents — event bus for AI Security Center lifecycle.
 *
 * Pub/sub pattern matching other AVS AI Shield event buses.
 */
import type { SecurityEvent } from './types';

type SecurityEventListener = (event: SecurityEvent) => void;

class SecurityEventBus {
  private listeners = new Set<SecurityEventListener>();

  subscribe(listener: SecurityEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: SecurityEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  emitScanStarted(scanId: string, scanType: string): void {
    this.emit({ type: 'security_scan_started', timestamp: Date.now(), scanId, message: `Scan started: ${scanType}` });
  }

  emitScanCompleted(scanId: string, threatsFound: number): void {
    this.emit({ type: 'security_scan_completed', timestamp: Date.now(), scanId, message: `Scan completed: ${threatsFound} threats found` });
  }

  emitScanFailed(scanId: string, error: string): void {
    this.emit({ type: 'security_scan_failed', timestamp: Date.now(), scanId, message: error });
  }

  emitThreatDetected(threatId: string, name: string): void {
    this.emit({ type: 'threat_detected', timestamp: Date.now(), threatId, message: `Threat detected: ${name}` });
  }

  emitThreatResolved(threatId: string): void {
    this.emit({ type: 'threat_resolved', timestamp: Date.now(), threatId, message: 'Threat resolved' });
  }

  emitProviderFailed(providerId: string, error: string): void {
    this.emit({ type: 'provider_failed', timestamp: Date.now(), providerId, message: error });
  }

  emitDefinitionsUpdated(version: string): void {
    this.emit({ type: 'definitions_updated', timestamp: Date.now(), message: `Definitions updated to ${version}` });
  }

  emitSnapshotUpdated(snapshotId: string): void {
    this.emit({ type: 'security_snapshot_updated', timestamp: Date.now(), message: `Snapshot updated: ${snapshotId}` });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const securityEventBus = new SecurityEventBus();
