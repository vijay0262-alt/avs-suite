/**
 * Duplicate Execution Task — implements the MaintenanceTask interface
 * for safe duplicate file removal.
 *
 * Only deletes files explicitly selected by the user.
 * Never automatically chooses files.
 *
 * Moves removed files to:
 *   • Recycle Bin (default)
 *   • AVS Recovery Folder (optional)
 *
 * Never permanently deletes by default.
 *
 * Safety — never removes:
 *   • System files
 *   • Windows folders
 *   • Program Files
 *   • AppData critical paths
 *   • AVS folders
 *   • Protected paths
 *   • Locked files
 *   • Open files
 *
 * This module does NOT modify the Execution Engine architecture.
 */
import { BaseMaintenanceTask, getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import type { ValidationResult, TaskResult } from '../maintenance-engine/types';
import { registerTask } from '../maintenance-engine/tasks/index';
import type {
  DuplicateExecutionConfig,
  DuplicateActionRecord,
  DuplicateFile,
} from './types';
import { isProtectedPath } from './types';
import { duplicateEvents } from './duplicateEvents';
import { DuplicateIndex } from './duplicateIndex';
import { RPC_METHODS } from '@avs/shared/rpc';

let _actionCounter = 0;

function generateActionId(): string {
  _actionCounter += 1;
  return `dup-action-${Date.now().toString(36)}-${_actionCounter}`;
}

export class DuplicateExecutionTask extends BaseMaintenanceTask {
  readonly displayName = 'Duplicate File Cleanup';
  readonly description = 'Removes user-selected duplicate files. Moves to Recycle Bin or AVS Recovery Folder. Never auto-selects files.';

  private _config: DuplicateExecutionConfig | null = null;
  private _actionRecords: DuplicateActionRecord[] = [];
  private _index: DuplicateIndex;

  constructor(index?: DuplicateIndex) {
    super('duplicate-engine');
    this._index = index ?? new DuplicateIndex();
  }

  setConfig(config: DuplicateExecutionConfig): void {
    this._config = config;
  }

  getActionRecords(): DuplicateActionRecord[] {
    return [...this._actionRecords];
  }

  estimateDuration(): number {
    if (!this._config) return 0;
    return this._config.selectedFileIds.length * 500;
  }

  async validate(): Promise<ValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isRpcAvailable()) {
      errors.push('RPC bridge is unavailable (outside Electron?)');
    }

    if (!this._config) {
      errors.push('No execution configuration set');
    } else if (this._config.selectedFileIds.length === 0) {
      warnings.push('No files selected for removal');
    } else {
      for (const fileId of this._config.selectedFileIds) {
        const file = this._findFile(fileId);
        if (!file) {
          errors.push(`File ${fileId} not found in index`);
          continue;
        }
        if (isProtectedPath(file.path)) {
          errors.push(`File ${file.path} is in a protected path and cannot be removed`);
        }
        if (file.isPrimary) {
          errors.push(`File ${file.path} is the primary file and cannot be removed`);
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

      this._actionRecords = [];
      duplicateEvents.emit('duplicate_cleanup_started', { fileIds: this._config.selectedFileIds });

      try {
        for (const fileId of this._config.selectedFileIds) {
          await this._removeFile(rpc, fileId);
        }

        duplicateEvents.emit('duplicate_cleanup_completed', { records: this._actionRecords });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        duplicateEvents.emit('duplicate_cleanup_failed', { error: msg, partialRecords: this._actionRecords });
        this._errors.push(msg);
      }
    });
  }

  async rollback(): Promise<boolean> {
    const rpc = getRpcBridge();
    if (!rpc || this._actionRecords.length === 0) return false;

    let restored = 0;
    for (const record of this._actionRecords) {
      if (record.rolledBack) continue;
      if (record.backupPath) {
        try {
          await rpc.call(RPC_METHODS.CLEANER_CLEAN_UNDO, {
            backupPath: record.backupPath,
            originalPath: record.filePath,
          });
          record.rolledBack = true;
          restored++;
        } catch (err) {
          console.error(`[DuplicateExecutionTask] Rollback failed for ${record.filePath}:`, err);
        }
      }
    }

    return restored > 0;
  }

  private async _removeFile(
    rpc: { call: (method: string, params?: unknown) => Promise<unknown> },
    fileId: string,
  ): Promise<void> {
    const file = this._findFile(fileId);
    if (!file) {
      this._errors.push(`File ${fileId} not found`);
      return;
    }

    if (isProtectedPath(file.path)) {
      this._errors.push(`File ${file.path} is protected`);
      return;
    }

    const groupId = this._findGroupId(fileId);
    try {
      const result = await rpc.call(RPC_METHODS.DUPLICATE_DELETE, {
        files: [{ path: file.path, size: file.size, name: file.name }],
        mode: this._config!.deletionMode,
        recoveryPath: this._config!.avsRecoveryPath,
      }) as { deleted?: string[]; backupPath?: string; errors?: string[]; spaceFreed?: number };

      if (result.errors && result.errors.length > 0) {
        this._warnings.push(...result.errors);
      }

      const record: DuplicateActionRecord = {
        id: generateActionId(),
        fileId,
        filePath: file.path,
        fileName: file.name,
        fileSize: file.size,
        groupId: groupId ?? '',
        action: 'moved',
        deletionMode: this._config!.deletionMode,
        destinationPath: this._config!.deletionMode === 'avs_recovery_folder'
          ? this._config!.avsRecoveryPath
          : null,
        backupPath: result.backupPath ?? null,
        timestamp: new Date().toISOString(),
        rolledBack: false,
      };
      this._actionRecords.push(record);

      if (result.spaceFreed) {
        this._bytesRecovered += result.spaceFreed;
      }
      this._filesCleaned += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._errors.push(`Failed to remove ${file.path}: ${msg}`);
    }
  }

  private _findFile(fileId: string): DuplicateFile | null {
    for (const group of this._index.getGroups()) {
      const file = group.allFiles.find((f) => f.id === fileId);
      if (file) return file;
    }
    return null;
  }

  private _findGroupId(fileId: string): string | null {
    for (const group of this._index.getGroups()) {
      if (group.allFiles.some((f) => f.id === fileId)) {
        return group.id;
      }
    }
    return null;
  }
}

export const DUPLICATE_TASK_ID = 'duplicate_engine';

registerTask(DUPLICATE_TASK_ID, () => new DuplicateExecutionTask());
