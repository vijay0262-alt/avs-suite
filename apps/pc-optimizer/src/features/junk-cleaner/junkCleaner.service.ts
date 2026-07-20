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

// Add logging wrapper
function withLogging<T>(methodName: string, fn: () => Promise<T>): Promise<T> {
  console.log(`[JunkCleanerService] ${methodName} called`);
  const start = performance.now();
  return fn().then(
    (result) => {
      console.log(`[JunkCleanerService] ${methodName} completed in ${(performance.now() - start).toFixed(2)}ms`, result);
      return result;
    },
    (error) => {
      console.error(`[JunkCleanerService] ${methodName} failed after ${(performance.now() - start).toFixed(2)}ms`, error);
      throw error;
    }
  );
}

export interface JunkCleanerService {
  // Scan
  list(): Promise<CleanerInfo[]>;
  startScan(only?: string[]): Promise<{ taskId: string }>;
  refreshCache(): Promise<{ refreshed: boolean }>;
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
  undoClean(): Promise<{ success: boolean; message: string; filesRestored: number; bytesRestored: number }>;
}

export const junkCleanerService: JunkCleanerService = {
  // Scan
  list: () => withLogging('list', () => client().call(RPC_METHODS.CLEANER_LIST)),
  startScan: (only) => withLogging('startScan', () => 
    client().call(RPC_METHODS.CLEANER_SCAN_START, only ? { only } : undefined)),
  refreshCache: () => withLogging('refreshCache', () =>
    client().call('cleaner.scan.refreshCache')),
  getStatus: (taskId) => withLogging('getStatus', () => 
    client().call(RPC_METHODS.CLEANER_SCAN_STATUS, taskId ? { taskId } : undefined)),
  cancel: (taskId) => withLogging('cancel', () => 
    client().call(RPC_METHODS.CLEANER_SCAN_CANCEL, { taskId })),
  getResults: (taskId, cleanerId, offset, limit) =>
    withLogging('getResults', () =>
      client().call(RPC_METHODS.CLEANER_SCAN_RESULTS, { taskId, cleanerId, offset, limit })),
  // Clean
  previewClean: (taskId, only) =>
    withLogging('previewClean', () =>
      client().call(RPC_METHODS.CLEANER_CLEAN_PREVIEW, only ? { taskId, only } : { taskId })),
  executeClean: (taskId, only) =>
    withLogging('executeClean', () =>
      client().call(RPC_METHODS.CLEANER_CLEAN_EXECUTE, only ? { taskId, only } : { taskId })),
  getCleaningStatus: (cleaningTaskId) =>
    withLogging('getCleaningStatus', () =>
      client().call(
        RPC_METHODS.CLEANER_CLEAN_STATUS,
        cleaningTaskId ? { cleaningTaskId } : undefined,
      )),
  cancelClean: (cleaningTaskId) =>
    withLogging('cancelClean', () =>
      client().call(RPC_METHODS.CLEANER_CLEAN_CANCEL, { cleaningTaskId })),
  getLogs: (params) => withLogging('getLogs', () => 
    client().call(RPC_METHODS.CLEANER_CLEAN_LOGS, params)),
  undoClean: () => withLogging('undoClean', () => 
    client().call(RPC_METHODS.CLEANER_CLEAN_UNDO)),
};
