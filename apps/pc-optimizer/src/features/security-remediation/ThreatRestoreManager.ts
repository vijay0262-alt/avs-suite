/**
 * ThreatRestoreManager — restores items from quarantine.
 *
 * Restores quarantined files to their original locations.
 * Integrates with the rollback system to ensure restorability.
 */
import type { ThreatQuarantineManager } from './ThreatQuarantineManager';

export interface RestoreResult {
  success: boolean;
  quarantineId: string;
  restoredPath: string | null;
  error: string | null;
  timestamp: number;
}

export class ThreatRestoreManager {
  constructor(private quarantineManager: ThreatQuarantineManager) {}

  restore(quarantineId: string): RestoreResult {
    const entry = this.quarantineManager.get(quarantineId);
    if (!entry) {
      return { success: false, quarantineId, restoredPath: null, error: 'Quarantine entry not found', timestamp: Date.now() };
    }

    if (entry.status !== 'quarantined') {
      return { success: false, quarantineId, restoredPath: null, error: `Cannot restore entry with status: ${entry.status}`, timestamp: Date.now() };
    }

    const restored = this.quarantineManager.restore(quarantineId);
    if (!restored) {
      return { success: false, quarantineId, restoredPath: null, error: 'Restore failed', timestamp: Date.now() };
    }

    return {
      success: true,
      quarantineId,
      restoredPath: entry.originalPath,
      error: null,
      timestamp: Date.now(),
    };
  }

  restoreByThreat(threatId: string): RestoreResult | null {
    const entry = this.quarantineManager.getByThreat(threatId);
    if (!entry) return null;
    return this.restore(entry.id);
  }

  restoreByInvestigation(investigationId: string): RestoreResult[] {
    const entries = this.quarantineManager.getByInvestigation(investigationId);
    return entries.map((e) => this.restore(e.id));
  }

  canRestore(quarantineId: string): boolean {
    const entry = this.quarantineManager.get(quarantineId);
    return entry !== null && entry.status === 'quarantined';
  }
}
