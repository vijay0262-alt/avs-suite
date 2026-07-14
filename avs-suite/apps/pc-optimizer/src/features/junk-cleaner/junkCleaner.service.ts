/**
 * Thin RPC wrapper for Junk Cleaner scan + safe-clean methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';
import type {
  CleanerInfo,
  CleaningLogPage,
  CleaningPreview,
  CleaningStatusSnapshot,
  ScanResultsPage,
  ScanStatusSnapshot,
} from './junkCleaner.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface JunkCleanerService {
  // Scan
  list(): Promise<CleanerInfo[]>;
  startScan(only?: string[]): Promise<{ taskId: string }>;
  getStatus(taskId?: string): Promise<ScanStatusSnapshot>;
  cancel(taskId: string): Promise<{ cancelled: boolean }>;
  getResults(taskId: string, cleanerId: string, offset: number, limit: number): Promise<ScanResultsPage>;
  // Clean
  previewClean(taskId: string, only?: string[]): Promise<CleaningPreview>;
  executeClean(taskId: string, only?: string[]): Promise<{ cleaningTaskId: string }>;
  getCleaningStatus(cleaningTaskId?: string): Promise<CleaningStatusSnapshot>;
  cancelClean(cleaningTaskId: string): Promise<{ cancelled: boolean }>;
  getLogs(params: {
    query?: string;
    category?: string;
    result?: string;
    offset?: number;
    limit?: number;
  }): Promise<CleaningLogPage>;
}

export const junkCleanerService: JunkCleanerService = {
  // Scan
  list: () => client().call(RPC_METHODS.CLEANER_LIST),
  startScan: (only) => client().call(RPC_METHODS.CLEANER_SCAN_START, only ? { only } : undefined),
  getStatus: (taskId) => client().call(RPC_METHODS.CLEANER_SCAN_STATUS, taskId ? { taskId } : undefined),
  cancel: (taskId) => client().call(RPC_METHODS.CLEANER_SCAN_CANCEL, { taskId }),
  getResults: (taskId, cleanerId, offset, limit) =>
    client().call(RPC_METHODS.CLEANER_SCAN_RESULTS, { taskId, cleanerId, offset, limit }),
  // Clean
  previewClean: (taskId, only) =>
    client().call(RPC_METHODS.CLEANER_CLEAN_PREVIEW, only ? { taskId, only } : { taskId }),
  executeClean: (taskId, only) =>
    client().call(RPC_METHODS.CLEANER_CLEAN_EXECUTE, only ? { taskId, only } : { taskId }),
  getCleaningStatus: (cleaningTaskId) =>
    client().call(
      RPC_METHODS.CLEANER_CLEAN_STATUS,
      cleaningTaskId ? { cleaningTaskId } : undefined,
    ),
  cancelClean: (cleaningTaskId) =>
    client().call(RPC_METHODS.CLEANER_CLEAN_CANCEL, { cleaningTaskId }),
  getLogs: (params) => client().call(RPC_METHODS.CLEANER_CLEAN_LOGS, params),
};
