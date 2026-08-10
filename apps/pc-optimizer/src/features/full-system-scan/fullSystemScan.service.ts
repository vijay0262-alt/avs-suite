/** Thin RPC wrapper for Full System Scan. */
import type {
  FullScanStatus,
  FullScanResult,
} from './fullSystemScan.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface FullSystemScanService {
  start(): Promise<{ scanId: string; status: string }>;
  getStatus(scanId: string): Promise<FullScanStatus>;
  getResult(scanId: string): Promise<FullScanResult>;
  cancel(scanId: string): Promise<{ cancelled: boolean }>;
}

export const fullSystemScanService: FullSystemScanService = {
  start: () => client().call('fullscan.start'),
  getStatus: (scanId: string) => client().call('fullscan.status', { scanId }),
  getResult: (scanId: string) => client().call('fullscan.result', { scanId }),
  cancel: (scanId: string) => client().call('fullscan.cancel', { scanId }),
};
