/**
 * PUP Scanner service — wraps backend pup.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface PUPIndicator {
  type: string;
  description: string;
}

export interface PUPResult {
  name: string;
  publisher: string;
  version: string;
  installLocation: string;
  installDate: string;
  uninstallString: string;
  pupType: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  indicators: PUPIndicator[];
  indicatorCount: number;
  isStrong: boolean;
}

export interface PUPScanResponse {
  pups: PUPResult[];
  totalPrograms: number;
  pupCount: number;
  supported: boolean;
  scannedAt: string;
  summary: {
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    strongIndicators: number;
  };
}

export interface PUPSummaryResponse {
  pupCount: number;
  totalPrograms: number;
  supported: boolean;
  summary: PUPScanResponse['summary'];
  scannedAt: string;
}

export const pupScannerService = {
  async scan(): Promise<PUPScanResponse> {
    return client().call(RPC_METHODS.PUP_SCAN);
  },

  async getSummary(): Promise<PUPSummaryResponse> {
    return client().call(RPC_METHODS.PUP_SUMMARY);
  },

  async ignore(name: string): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.PUP_IGNORE, { name });
  },

  async unignore(name: string): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.PUP_UNIGNORE, { name });
  },
};
