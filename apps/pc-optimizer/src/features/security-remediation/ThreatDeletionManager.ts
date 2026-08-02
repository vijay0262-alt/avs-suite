/**
 * ThreatDeletionManager — permanently deletes quarantined items.
 *
 * Safety rules:
 *   - Never deletes immediately — always from quarantine
 *   - Requires observation period to have passed
 *   - Requires explicit user confirmation
 *   - Deletion is irreversible — no rollback
 */
import type { QuarantineEntry } from './types';
import type { ThreatQuarantineManager } from './ThreatQuarantineManager';

export interface DeleteResult {
  success: boolean;
  quarantineId: string;
  error: string | null;
  timestamp: number;
  irreversible: boolean;
}

export class ThreatDeletionManager {
  private quarantineManager: ThreatQuarantineManager;
  private observationPeriodMs: number;

  constructor(quarantineManager: ThreatQuarantineManager, observationPeriodMs = 86400000) {
    this.quarantineManager = quarantineManager;
    this.observationPeriodMs = observationPeriodMs;
  }

  delete(quarantineId: string, userConfirmed: boolean): DeleteResult {
    if (!userConfirmed) {
      return { success: false, quarantineId, error: 'User confirmation required for deletion', timestamp: Date.now(), irreversible: true };
    }

    const entry = this.quarantineManager.get(quarantineId);
    if (!entry) {
      return { success: false, quarantineId, error: 'Quarantine entry not found', timestamp: Date.now(), irreversible: true };
    }

    if (entry.status !== 'quarantined') {
      return { success: false, quarantineId, error: `Cannot delete entry with status: ${entry.status}`, timestamp: Date.now(), irreversible: true };
    }

    // Check observation period
    const timeInQuarantine = Date.now() - entry.quarantinedAt;
    if (timeInQuarantine < this.observationPeriodMs) {
      const remaining = this.observationPeriodMs - timeInQuarantine;
      return {
        success: false,
        quarantineId,
        error: `Observation period not yet elapsed. ${Math.ceil(remaining / 3600000)} hour(s) remaining.`,
        timestamp: Date.now(),
        irreversible: true,
      };
    }

    const deleted = this.quarantineManager.delete(quarantineId);
    if (!deleted) {
      return { success: false, quarantineId, error: 'Deletion failed', timestamp: Date.now(), irreversible: true };
    }

    return {
      success: true,
      quarantineId,
      error: null,
      timestamp: Date.now(),
      irreversible: true,
    };
  }

  canDelete(quarantineId: string): boolean {
    const entry = this.quarantineManager.get(quarantineId);
    if (!entry || entry.status !== 'quarantined') return false;
    const timeInQuarantine = Date.now() - entry.quarantinedAt;
    return timeInQuarantine >= this.observationPeriodMs;
  }

  getDeletionCandidates(): QuarantineEntry[] {
    return this.quarantineManager.getActive().filter((e) => {
      const timeInQuarantine = Date.now() - e.quarantinedAt;
      return timeInQuarantine >= this.observationPeriodMs;
    });
  }

  setObservationPeriod(ms: number): void {
    this.observationPeriodMs = ms;
  }
}
