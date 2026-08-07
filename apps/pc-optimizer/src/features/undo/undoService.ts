/**
 * Undo & Restore Service — RPC wrapper for the backend undo/restore system.
 *
 * Provides:
 *   - List available backups
 *   - Restore from a backup
 *   - Check restore availability
 *   - Delete a backup
 *   - Create system restore points
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface BackupEntry {
  id: string;
  backupType: string;
  originalPath: string;
  backupPath: string;
  timestamp: string;
  operation: string;
  module: string;
  size: number;
  details?: Record<string, unknown> | string;
}

export interface RestoreResult {
  status: string;
  backupId: string;
  message: string;
  restoredPath: string | null;
  errors: string[];
}

export interface UndoService {
  listBackups(): Promise<{ backups: BackupEntry[]; count: number }>;
  restore(backupId: string): Promise<RestoreResult>;
  checkAvailability(backupId: string): Promise<{ status: string; backupId: string }>;
  deleteBackup(backupId: string): Promise<{ success: boolean }>;
  createRestorePoint(description: string): Promise<BackupEntry>;
}

export const undoService: UndoService = {
  listBackups: () => client().call(RPC_METHODS.UNDO_LIST),
  restore: (backupId: string) => client().call(RPC_METHODS.UNDO_RESTORE, { id: backupId }),
  checkAvailability: (backupId: string) => client().call(RPC_METHODS.UNDO_CHECK, { id: backupId }),
  deleteBackup: (backupId: string) => client().call(RPC_METHODS.UNDO_DELETE, { id: backupId }),
  createRestorePoint: (description: string) =>
    client().call(RPC_METHODS.UNDO_BACKUP_RESTORE_POINT, { description }),
};
