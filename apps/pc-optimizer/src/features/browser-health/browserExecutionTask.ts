/**
 * Browser Execution Task — implements the MaintenanceTask interface
 * for safe browser data cleanup.
 *
 * Executes only safe operations:
 *   • Cache cleanup
 *   • Temporary browser storage cleanup
 *   • Download history cleanup
 *   • Cookie cleanup (optional by configuration)
 *   • History cleanup (only when explicitly confirmed)
 *
 * NEVER removes:
 *   • Bookmarks
 *   • Saved passwords
 *   • Autofill
 *   • Extensions
 *   • Profiles
 *
 * Requires explicit confirmation before:
 *   • History cleanup
 *   • Cookie cleanup
 *
 * Supports rollback where supported via cleaner.clean.undo RPC.
 *
 * This module does NOT modify the Execution Engine architecture.
 */
import { BaseMaintenanceTask, getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import type { ValidationResult, TaskResult } from '../maintenance-engine/types';
import { registerTask } from '../maintenance-engine/tasks/index';
import type {
  BrowserExecutionConfig,
  BrowserCleanupOperation,
  BrowserCleanupRecord,
} from './types';
import { browserEvents } from './browserEvents';
import { RPC_METHODS } from '@avs/shared/rpc';

let _actionCounter = 0;

function generateActionId(): string {
  _actionCounter += 1;
  return `browser-action-${Date.now().toString(36)}-${_actionCounter}`;
}

export class BrowserExecutionTask extends BaseMaintenanceTask {
  readonly displayName = 'Browser Health & Privacy Cleanup';
  readonly description = 'Cleans browser cache, temp storage, download history, cookies, and history (with confirmation).';

  private _config: BrowserExecutionConfig | null = null;
  private _cleanupRecords: BrowserCleanupRecord[] = [];

  constructor() {
    super('browser-health');
  }

  setConfig(config: BrowserExecutionConfig): void {
    this._config = config;
  }

  getCleanupRecords(): BrowserCleanupRecord[] {
    return [...this._cleanupRecords];
  }

  estimateDuration(): number {
    if (!this._config) return 0;
    let total = 0;
    for (const op of this._config.operations) {
      total += Math.max(5000, op.browserIds.length * 3000 + op.profileIds.length * 2000);
    }
    return total;
  }

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
      for (const op of this._config.operations) {
        if (op.browserIds.length === 0 && op.profileIds.length === 0) {
          warnings.push(`Operation ${op.type} has no browser or profile targets`);
        }

        // Safety: history cleanup requires explicit confirmation
        if (op.type === 'history_cleanup' && !this._config.confirmHistoryCleanup) {
          errors.push('History cleanup requires explicit confirmation (confirmHistoryCleanup must be true)');
        }

        // Safety: cookie cleanup requires explicit confirmation
        if (op.type === 'cookie_cleanup' && !this._config.confirmCookieCleanup) {
          errors.push('Cookie cleanup requires explicit confirmation (confirmCookieCleanup must be true)');
        }

        // Safety: never allow bookmark/password/autofill/extension/profile operations
        const forbidden: string[] = ['bookmark_cleanup', 'password_cleanup', 'autofill_cleanup', 'extension_cleanup', 'profile_cleanup'];
        if (forbidden.includes(op.type)) {
          errors.push(`Operation ${op.type} is forbidden — this task never removes bookmarks, passwords, autofill, extensions, or profiles`);
        }
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

      if (!this._config) {
        this._errors.push('No configuration set');
        return;
      }

      this._cleanupRecords = [];
      browserEvents.emit('browser_cleanup_started', { operations: this._config.operations });

      try {
        for (const op of this._config.operations) {
          await this._executeOperation(rpc, op);
        }

        browserEvents.emit('browser_cleanup_completed', { records: this._cleanupRecords });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        browserEvents.emit('browser_cleanup_failed', { error: msg, partialRecords: this._cleanupRecords });
        this._errors.push(msg);
      }
    });
  }

  async rollback(): Promise<boolean> {
    const rpc = getRpcBridge();
    if (!rpc || this._cleanupRecords.length === 0) return false;

    let restored = 0;
    for (const record of this._cleanupRecords) {
      if (record.backupPath) {
        try {
          await rpc.call(RPC_METHODS.CLEANER_CLEAN_UNDO, {
            backupPath: record.backupPath,
          });
          record.rolledBack = true;
          restored++;
        } catch (err) {
          console.error(`[BrowserExecutionTask] Rollback failed:`, err);
        }
      }
    }

    return restored > 0;
  }

  private async _executeOperation(
    rpc: { call: (method: string, params?: unknown) => Promise<unknown> },
    op: BrowserCleanupOperation,
  ): Promise<void> {
    try {
      const result = await rpc.call(RPC_METHODS.PRIVACY_CLEAN, {
        type: op.type,
        browserIds: op.browserIds,
        profileIds: op.profileIds,
      }) as { itemsRemoved?: number; bytesRecovered?: number; backupPath?: string; errors?: string[] };

      if (result.errors) {
        this._warnings.push(...result.errors);
      }

      const itemsRemoved = result.itemsRemoved ?? 0;
      const bytesRecovered = result.bytesRecovered ?? 0;

      this._filesCleaned += itemsRemoved;
      this._bytesRecovered += bytesRecovered;

      for (const browserId of op.browserIds) {
        this._cleanupRecords.push({
          id: generateActionId(),
          operationType: op.type,
          browserId,
          profileId: op.profileIds.length > 0 ? op.profileIds[0] ?? null : null,
          itemsRemoved,
          bytesRecovered,
          timestamp: new Date().toISOString(),
          backupPath: result.backupPath ?? null,
          rolledBack: false,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._errors.push(`Operation ${op.type} failed: ${msg}`);
    }
  }
}

export const BROWSER_TASK_ID = 'browser_health_cleanup';

registerTask(BROWSER_TASK_ID, () => new BrowserExecutionTask());
