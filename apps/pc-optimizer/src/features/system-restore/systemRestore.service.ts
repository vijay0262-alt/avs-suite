/**
 * Thin RPC wrapper for System Restore Point operations.
 */
function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface RestorePointResult {
  success: boolean;
  description: string;
  sequenceNumber: number | null;
  error: string | null;
}

export interface RestoreStatus {
  enabled: boolean;
}

export interface SystemRestoreService {
  createRestorePoint(description?: string): Promise<RestorePointResult>;
  getStatus(): Promise<RestoreStatus>;
}

export const systemRestoreService: SystemRestoreService = {
  createRestorePoint: (description) =>
    client().call('restore.create', description ? { description } : undefined),
  getStatus: () =>
    client().call('restore.status'),
};
