/**
 * Thin RPC wrapper for the Junk Cleaner module.
 *
 * Kept in the feature folder (not `services/`) because these calls are
 * only used here. The interface is deliberately narrow so the
 * ViewModel can be unit-tested against a stubbed implementation.
 */
import { RPC_METHODS } from '@avs/shared/rpc';
import type {
  CleanerInfo,
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
  list(): Promise<CleanerInfo[]>;
  startScan(only?: string[]): Promise<{ taskId: string }>;
  getStatus(taskId?: string): Promise<ScanStatusSnapshot>;
  cancel(taskId: string): Promise<{ cancelled: boolean }>;
  getResults(taskId: string, cleanerId: string, offset: number, limit: number): Promise<ScanResultsPage>;
}

export const junkCleanerService: JunkCleanerService = {
  list: () => client().call(RPC_METHODS.CLEANER_LIST),
  startScan: (only) => client().call(RPC_METHODS.CLEANER_SCAN_START, only ? { only } : undefined),
  getStatus: (taskId) => client().call(RPC_METHODS.CLEANER_SCAN_STATUS, taskId ? { taskId } : undefined),
  cancel: (taskId) => client().call(RPC_METHODS.CLEANER_SCAN_CANCEL, { taskId }),
  getResults: (taskId, cleanerId, offset, limit) =>
    client().call(RPC_METHODS.CLEANER_SCAN_RESULTS, { taskId, cleanerId, offset, limit }),
};
