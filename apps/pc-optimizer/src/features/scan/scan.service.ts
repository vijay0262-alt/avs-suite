/**
 * scan.service.ts — frontend bridge to the scan-core RPC service.
 *
 * Uses the new `scan_core.scan.*` JSON-RPC methods directly. No call reaches
 * the OptimizationOrchestrator, so scans remain read-only.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface ScanStartResponse {
  session_id: string;
  started_at: string;
}

export interface ScanCancelResponse {
  session_id: string;
  cancelled: boolean;
}

export interface ScanService {
  scan(scope?: string[]): Promise<ScanStartResponse>;
  scan_quick(scope?: string[]): Promise<ScanStartResponse>;
  scan_full(scope?: string[]): Promise<ScanStartResponse>;
  cancel_scan(sessionId: string): Promise<ScanCancelResponse>;
  status(sessionId: string): Promise<Record<string, unknown>>;
  result(sessionId: string): Promise<Record<string, unknown>>;
}

export const scanService: ScanService = {
  scan: (scope?: string[]) => client().call(RPC_METHODS.SCAN_CORE_SCAN_QUICK, { scope }),
  scan_quick: (scope?: string[]) => client().call(RPC_METHODS.SCAN_CORE_SCAN_QUICK, { scope }),
  scan_full: (scope?: string[]) => client().call(RPC_METHODS.SCAN_CORE_SCAN_FULL, { scope }),
  cancel_scan: (sessionId: string) => client().call(RPC_METHODS.SCAN_CORE_SCAN_CANCEL, { session_id: sessionId }),
  status: (sessionId: string) => client().call(RPC_METHODS.SCAN_CORE_SCAN_STATUS, { session_id: sessionId }),
  result: (sessionId: string) => client().call(RPC_METHODS.SCAN_CORE_SCAN_RESULT, { session_id: sessionId }),
};
