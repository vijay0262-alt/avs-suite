/**
 * Quarantine service — wraps backend quarantine.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface QuarantineItem {
  id: string;
  originalPath: string;
  threatName: string;
  threatType: string;
  source: string;
  fileSize: number;
  fileHash: string;
  quarantinedAt: string;
  quarantinedPath: string;
}

export interface QuarantineListResponse {
  items: QuarantineItem[];
  count: number;
  totalSize: number;
  supported: boolean;
  vaultPath: string;
}

export interface QuarantineSummaryResponse {
  count: number;
  totalSize: number;
  byType: Record<string, number>;
  supported: boolean;
}

export interface QuarantineActionResult {
  success: boolean;
  message: string;
}

export interface QuarantineAddResult {
  success: boolean;
  item?: QuarantineItem;
  message?: string;
}

export interface QuarantineClearResult {
  success: boolean;
  message: string;
  deletedCount: number;
  failedCount: number;
}

export const quarantineService = {
  async list(): Promise<QuarantineListResponse> {
    return client().call(RPC_METHODS.QUARANTINE_LIST);
  },

  async getSummary(): Promise<QuarantineSummaryResponse> {
    return client().call(RPC_METHODS.QUARANTINE_SUMMARY);
  },

  async add(filePath: string, threatName: string, threatType: string, source: string): Promise<QuarantineAddResult> {
    return client().call(RPC_METHODS.QUARANTINE_ADD, { filePath, threatName, threatType, source });
  },

  async restore(itemId: string): Promise<QuarantineActionResult> {
    return client().call(RPC_METHODS.QUARANTINE_RESTORE, { itemId });
  },

  async delete(itemId: string): Promise<QuarantineActionResult> {
    return client().call(RPC_METHODS.QUARANTINE_DELETE, { itemId });
  },

  async clear(): Promise<QuarantineClearResult> {
    return client().call(RPC_METHODS.QUARANTINE_CLEAR);
  },
};
