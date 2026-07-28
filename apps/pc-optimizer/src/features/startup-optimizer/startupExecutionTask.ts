/**
 * Startup Execution Task — implements the MaintenanceTask interface
 * for safe startup optimization via the Execution Engine.
 *
 * Supports:
 *   • validate() — checks RPC availability, protected entries, config
 *   • execute() — disables/enables entries via the existing startupService
 *   • rollback() — restores previous state using backups
 *   • estimateDuration() — estimates execution time
 *
 * Safety:
 *   • Never disables protected entries
 *   • Every change is reversible via backups
 *   • Never permanently deletes entries
 *
 * This task integrates naturally into the existing Execution Engine
 * without modifying it.
 */
import type {
  TaskResult,
  ValidationResult,
} from '../maintenance-engine/types';
import { BaseMaintenanceTask, getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import type {
  StartupExecutionConfig,
  StartupEntry,
  StartupChangeRecord,
} from './types';
import { isProtectedApp } from './types';
import { startupService } from '../startup/startup.service';
import type { StartupEntry as RawStartupEntry } from '../startup/startup.types';
import { startupHistory, generateRecordId } from './startupHistory';
import { startupEvents } from './startupEvents';
import { StartupImpactCalculator } from './startupImpactCalculator';

export class StartupExecutionTask extends BaseMaintenanceTask {
  readonly displayName = 'Startup Optimizer';
  readonly description = 'Safely disables, enables, and restores startup applications to improve boot performance.';

  private _config: StartupExecutionConfig;
  private _entries: StartupEntry[];
  private _changes: StartupChangeRecord[] = [];
  private _impactCalculator: StartupImpactCalculator;

  constructor(config: StartupExecutionConfig, entries: StartupEntry[]) {
    super('startup-optimizer');
    this._config = config;
    this._entries = entries;
    this._impactCalculator = new StartupImpactCalculator();
  }

  estimateDuration(): number {
    const totalOps = this._config.disableEntryIds.length + this._config.enableEntryIds.length;
    return totalOps * 2000; // ~2 seconds per operation
  }

  async validate(): Promise<ValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isRpcAvailable()) {
      errors.push('RPC bridge is unavailable (outside Electron?)');
    }

    // Check for protected entries in the disable list
    for (const entryId of this._config.disableEntryIds) {
      const entry = this._entries.find((e) => e.id === entryId);
      if (!entry) {
        errors.push(`Entry "${entryId}" not found in the current entry list.`);
        continue;
      }
      if (entry.isProtected || isProtectedApp(entry.name)) {
        errors.push(`Cannot disable protected entry: "${entry.name}"`);
      }
    }

    // Check for entries that are already in the desired state
    for (const entryId of this._config.disableEntryIds) {
      const entry = this._entries.find((e) => e.id === entryId);
      if (entry && !entry.enabled) {
        warnings.push(`Entry "${entry.name}" is already disabled.`);
      }
    }

    for (const entryId of this._config.enableEntryIds) {
      const entry = this._entries.find((e) => e.id === entryId);
      if (entry && entry.enabled) {
        warnings.push(`Entry "${entry.name}" is already enabled.`);
      }
    }

    return { canRun: errors.length === 0, warnings, errors };
  }

  async execute(): Promise<TaskResult> {
    return this.runSafely(async () => {
      const rpc = getRpcBridge();
      if (!rpc) {
        this._errors.push('RPC bridge unavailable');
        return;
      }

      // Process disable operations
      for (const entryId of this._config.disableEntryIds) {
        await this._disableEntry(entryId);
      }

      // Process enable operations
      for (const entryId of this._config.enableEntryIds) {
        await this._enableEntry(entryId);
      }

      // Calculate total estimated improvement
      const totalImprovement = this._changes
        .filter((c) => c.success && c.action === 'disable')
        .reduce((sum, c) => sum + c.estimatedImprovementMs, 0);
      this._bytesRecovered = 0; // No disk space recovered, but boot time improved
      this._filesCleaned = this._changes.filter((c) => c.success).length;

      if (totalImprovement > 0) {
        this._warnings.push(
          `Estimated boot improvement: ~${(totalImprovement / 1000).toFixed(1)} seconds`,
        );
      }

      // Emit execution completed event
      const durationMs = this._startTime
        ? Date.now() - new Date(this._startTime).getTime()
        : 0;
      startupEvents.emit('startup_execution_completed', {
        changes: this._changes,
        durationMs,
      });
    });
  }

  /**
   * Rollback all changes made during this execution.
   * Uses the backup IDs from the startup service to restore state.
   */
  async rollback(): Promise<TaskResult> {
    return this.runSafely(async () => {
      const rpc = getRpcBridge();
      if (!rpc) {
        this._errors.push('RPC bridge unavailable');
        return;
      }

      // Rollback in reverse order
      const successfulChanges = [...this._changes].reverse().filter((c) => c.success);

      for (const change of successfulChanges) {
        try {
          if (change.action === 'disable' && change.backupId) {
            // Restore from backup
            await startupService.restoreBackup(change.backupId);
            this._recordChange(change.entryId, change.entryName, 'restore', change.previousState, true, null, change.backupId);
          } else if (change.action === 'enable') {
            // Re-disable
            const entry = this._entries.find((e) => e.id === change.entryId);
            if (entry) {
              const rawEntry = this._toRawEntry(entry);
              await startupService.disableEntry(rawEntry);
              this._recordChange(change.entryId, change.entryName, 'restore', change.previousState, false, null, null);
            }
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this._errors.push(`Rollback failed for "${change.entryName}": ${errorMsg}`);
        }
      }

      this._filesCleaned = this._changes.filter((c) => c.success).length;
    });
  }

  // ── Internal methods ────────────────────────────────────────

  private async _disableEntry(entryId: string): Promise<void> {
    const entry = this._entries.find((e) => e.id === entryId);
    if (!entry) {
      this._errors.push(`Entry "${entryId}" not found.`);
      return;
    }

    if (!entry.enabled) {
      // Already disabled, skip
      return;
    }

    // Safety check: never disable protected entries
    if (entry.isProtected || isProtectedApp(entry.name)) {
      this._errors.push(`Refused to disable protected entry: "${entry.name}"`);
      return;
    }

    try {
      const rawEntry = this._toRawEntry(entry);
      const result = await startupService.disableEntry(rawEntry);

      const impact = this._impactCalculator.calculate(entry);
      const improvement = entry.enabled ? impact.bootDelayMs : 0;

      this._recordChange(
        entryId,
        entry.name,
        'disable',
        true,
        result.success,
        result.error ?? null,
        result.backupId ?? null,
        improvement,
      );

      if (!result.success) {
        this._errors.push(`Failed to disable "${entry.name}": ${result.error ?? result.message ?? 'Unknown error'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this._errors.push(`Error disabling "${entry.name}": ${errorMsg}`);
      this._recordChange(entryId, entry.name, 'disable', true, false, errorMsg, null);
    }
  }

  private async _enableEntry(entryId: string): Promise<void> {
    const entry = this._entries.find((e) => e.id === entryId);
    if (!entry) {
      this._errors.push(`Entry "${entryId}" not found.`);
      return;
    }

    if (entry.enabled) {
      // Already enabled, skip
      return;
    }

    try {
      const rawEntry = this._toRawEntry(entry);
      const result = await startupService.enableEntry(rawEntry);

      this._recordChange(
        entryId,
        entry.name,
        'enable',
        false,
        result.success,
        result.success ? null : (result.message ?? 'Enable failed'),
        null,
        0,
      );

      if (!result.success) {
        this._errors.push(`Failed to enable "${entry.name}": ${result.message ?? 'Unknown error'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this._errors.push(`Error enabling "${entry.name}": ${errorMsg}`);
      this._recordChange(entryId, entry.name, 'enable', false, false, errorMsg, null);
    }
  }

  private _recordChange(
    entryId: string,
    entryName: string,
    action: 'disable' | 'enable' | 'restore',
    previousState: boolean,
    success: boolean,
    error: string | null,
    backupId: string | null,
    estimatedImprovementMs: number = 0,
  ): StartupChangeRecord {
    const record: StartupChangeRecord = {
      recordId: generateRecordId(),
      entryId,
      entryName,
      action,
      previousState,
      newState: action === 'disable' ? false : true,
      timestamp: new Date().toISOString(),
      backupId,
      success,
      error,
      estimatedImprovementMs,
    };
    this._changes.push(record);
    startupHistory.record(record);
    startupEvents.emit('startup_item_changed', { change: record });
    return record;
  }

  /**
   * Convert our enriched entry to the raw RPC entry format.
   */
  private _toRawEntry(entry: StartupEntry): RawStartupEntry {
    return {
      name: entry.name,
      publisher: entry.publisher,
      status: entry.enabled ? 'enabled' : 'disabled',
      impact: entry.impactLevel === 'very_high' ? 'high' : entry.impactLevel === 'none' ? 'unknown' : entry.impactLevel,
      source: entry.launchType === 'folder' ? 'folder' : entry.launchType === 'task' ? 'task' : 'registry',
      location: (entry.metadata?.location as string) ?? '',
      command: entry.commandLine,
      enabled: entry.enabled,
      signatureStatus: entry.signatureStatus,
      bootImpactMs: entry.estimatedBootDelayMs,
    };
  }

  /**
   * Get the changes made during this execution.
   */
  getChanges(): StartupChangeRecord[] {
    return [...this._changes];
  }
}
