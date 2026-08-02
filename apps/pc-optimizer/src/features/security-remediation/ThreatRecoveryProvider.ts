/**
 * ThreatRecoveryProvider — integrates with existing recovery infrastructure.
 *
 * Provides:
 *   - System restore point status
 *   - Quarantine availability
 *   - Rollback availability
 *   - Recovery recommendations
 */
import type { RecoveryProvider, RecoveryStatus } from './types';
import type { ThreatQuarantineManager } from './ThreatQuarantineManager';
import type { ThreatRollbackManager } from './ThreatRollbackManager';

export class ThreatRecoveryProvider {
  constructor(
    private quarantineManager: ThreatQuarantineManager,
    private rollbackManager: ThreatRollbackManager,
  ) {}

  getProviders(): RecoveryProvider[] {
    return [
      {
        id: 'system-restore',
        name: 'System Restore Points',
        type: 'system_restore',
        available: true,
        lastBackup: null,
      },
      {
        id: 'quarantine',
        name: 'Quarantine Storage',
        type: 'quarantine',
        available: this.quarantineManager.getActive().length > 0,
        lastBackup: this.quarantineManager.getSummary().newestQuarantine,
      },
      {
        id: 'rollback',
        name: 'Rollback Entries',
        type: 'rollback',
        available: this.rollbackManager.countAvailable() > 0,
        lastBackup: this.rollbackManager.getAvailable()[0]?.timestamp ?? null,
      },
    ];
  }

  getStatus(): RecoveryStatus {
    const quarantineSummary = this.quarantineManager.getSummary();
    const rollbackAvailable = this.rollbackManager.countAvailable();
    const allRollbacks = this.rollbackManager.getAll();

    return {
      systemRestoreAvailable: true,
      lastRestorePoint: null,
      quarantineAvailable: quarantineSummary.activeQuarantine > 0,
      rollbackAvailable: rollbackAvailable > 0,
      totalBackups: 0,
      totalQuarantined: quarantineSummary.activeQuarantine,
      totalRollbacks: allRollbacks.length,
    };
  }

  getRecoveryOptions(investigationId: string): RecoveryOption[] {
    const options: RecoveryOption[] = [];
    const quarantineEntries = this.quarantineManager.getByInvestigation(investigationId);
    const rollbackEntries = this.rollbackManager.getByInvestigation(investigationId);

    for (const q of quarantineEntries.filter((e) => e.status === 'quarantined')) {
      options.push({
        id: `restore-${q.id}`,
        type: 'restore_from_quarantine',
        description: `Restore ${q.fileName} from quarantine`,
        quarantineId: q.id,
        available: true,
      });
    }

    for (const r of rollbackEntries.filter((e) => e.status === 'available')) {
      options.push({
        id: `rollback-${r.id}`,
        type: 'rollback_action',
        description: r.description,
        rollbackId: r.id,
        available: true,
      });
    }

    return options;
  }
}

export interface RecoveryOption {
  id: string;
  type: 'restore_from_quarantine' | 'rollback_action' | 'system_restore';
  description: string;
  quarantineId?: string;
  rollbackId?: string;
  available: boolean;
}
