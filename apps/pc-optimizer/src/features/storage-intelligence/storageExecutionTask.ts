/**
 * Storage Execution Task — implements the MaintenanceTask interface
 * for safe storage cleanup operations.
 *
 * Initially executes only:
 *   • Empty folder cleanup
 *   • Old log cleanup
 *   • Temporary storage cleanup
 *
 * Large file actions remain review-only (not executed by this task).
 *
 * Supports:
 *   • validate() — checks RPC availability and config
 *   • execute() — performs cleanup via RPC
 *   • rollback() — restores deleted items from backup
 *   • estimateDuration() — estimates based on operation count
 *
 * This module does NOT modify the Execution Engine architecture.
 */
import { BaseMaintenanceTask, getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import type { ValidationResult, TaskResult } from '../maintenance-engine/types';
import { registerTask } from '../maintenance-engine/tasks/index';
import type { StorageExecutionConfig, StorageActionRecord, StorageOperation } from './types';
import { storageEvents } from './storageEvents';
import { RPC_METHODS } from '@avs/shared/rpc';

let _actionCounter = 0;

function generateActionId(): string {
  _actionCounter += 1;
  return `storage-action-${Date.now().toString(36)}-${_actionCounter}`;
}

export class StorageExecutionTask extends BaseMaintenanceTask {
  readonly displayName = 'Storage Intelligence Cleanup';
  readonly description = 'Cleans empty folders, old logs, and temporary files. Large file actions are review-only.';

  private _config: StorageExecutionConfig | null = null;
  private _actionRecords: StorageActionRecord[] = [];

  constructor() {
    super('storage-intelligence');
  }

  /**
   * Set the execution configuration.
   */
  setConfig(config: StorageExecutionConfig): void {
    this._config = config;
  }

  /**
   * Get action records from the last execution.
   */
  getActionRecords(): StorageActionRecord[] {
    return [...this._actionRecords];
  }

  /**
   * Estimate duration based on operations.
   */
  estimateDuration(): number {
    if (!this._config) return 0;
    let total = 0;
    for (const op of this._config.operations) {
      // 500ms per path, minimum 5 seconds per operation
      total += Math.max(5000, op.paths.length * 500);
    }
    return total;
  }

  /**
   * Validate that the task can run.
   */
  async validate(): Promise<ValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isRpcAvailable()) {
      errors.push('RPC bridge is unavailable (outside Electron?)');
    }

    if (!this._config) {
      errors.push('No execution configuration set');
    } else if (this._config.operations.length === 0) {
      warnings.push('No operations configured');
    } else {
      // Validate each operation
      for (const op of this._config.operations) {
        if (op.paths.length === 0) {
          warnings.push(`Operation ${op.type} has no paths`);
        }
        // Safety: large_file_cleanup is not supported
        if ((op as StorageOperation).type === 'large_file_cleanup' as unknown) {
          errors.push('Large file cleanup is review-only and cannot be executed');
        }
      }
    }

    return { canRun: errors.length === 0, warnings, errors };
  }

  /**
   * Execute the storage cleanup.
   */
  async execute(): Promise<TaskResult> {
    return this.runSafely(async () => {
      const rpc = getRpcBridge();
      if (!rpc) {
        this._errors.push('RPC bridge unavailable');
        return;
      }

      if (!this._config) {
        this._errors.push('No configuration set');
        return;
      }

      this._actionRecords = [];

      for (const op of this._config.operations) {
        await this._executeOperation(rpc, op);
      }

      // Emit completion event
      if (this._actionRecords.length > 0) {
        storageEvents.emit('storage_execution_completed', { records: this._actionRecords });
      }
    });
  }

  /**
   * Rollback the last execution by restoring deleted items.
   */
  async rollback(): Promise<boolean> {
    const rpc = getRpcBridge();
    if (!rpc || this._actionRecords.length === 0) return false;

    let restored = 0;
    for (const record of this._actionRecords) {
      if (record.backupPath) {
        try {
          await rpc.call(RPC_METHODS.CLEANER_CLEAN_UNDO, {
            backupPath: record.backupPath,
            originalPath: record.originalPath,
          });
          restored++;
        } catch (err) {
          console.error(`[StorageExecutionTask] Rollback failed for ${record.originalPath}:`, err);
        }
      }
    }

    return restored > 0;
  }

  // ── Internal ────────────────────────────────────────────────

  private async _executeOperation(
    rpc: { call: (method: string, params?: unknown) => Promise<unknown> },
    op: StorageOperation,
  ): Promise<void> {
    try {
      const result = await rpc.call(RPC_METHODS.CLEANER_CLEAN_EXECUTE, {
        type: op.type,
        paths: op.paths,
      }) as { deleted?: string[]; backupPath?: string; bytesRecovered?: number; errors?: string[] };

      if (result.errors) {
        this._warnings.push(...result.errors);
      }

      if (result.deleted) {
        for (const path of result.deleted) {
          const record: StorageActionRecord = {
            id: generateActionId(),
            operationType: op.type,
            path,
            action: 'deleted',
            originalPath: path,
            backupPath: result.backupPath ?? null,
            size: 0,
            timestamp: new Date().toISOString(),
          };
          this._actionRecords.push(record);
        }
      }

      if (result.bytesRecovered) {
        this._bytesRecovered += result.bytesRecovered;
        this._filesCleaned += result.deleted?.length ?? 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._errors.push(`Operation ${op.type} failed: ${msg}`);
    }
  }
}

// ── Task Registration ─────────────────────────────────────────

export const STORAGE_TASK_ID = 'storage_intelligence';

registerTask(STORAGE_TASK_ID, () => new StorageExecutionTask());
