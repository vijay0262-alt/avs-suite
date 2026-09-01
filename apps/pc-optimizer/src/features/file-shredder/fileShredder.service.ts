/**
 * File Shredder service — wraps the backend wiper.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface ShredResultItem {
  path: string;
  success: boolean;
  message: string;
  passes: number;
  bytesShredded: number;
}

export interface ShredResponse {
  success: boolean;
  message: string;
  method: string;
  results: ShredResultItem[];
  edition: string;
  totalShredded: number;
  totalFailed: number;
  error_code?: string;
  required_edition?: string;
  current_edition?: string;
  file_limit?: number;
  files_requested?: number;
}

export interface DriveInfo {
  letter: string;
  label: string;
  fileSystem: string;
  totalBytes: number;
  freeBytes: number;
}

export type ShredMethod = 'quick' | 'dod' | 'gutmann' | 'random';

export const fileShredderService = {
  async shred(
    paths: string[],
    method: ShredMethod = 'dod',
    passes?: number,
    zeros?: boolean,
  ): Promise<ShredResponse> {
    return client().call(RPC_METHODS.WIPER_SHRED, { paths, method, passes, zeros });
  },

  async listDrives(): Promise<{ drives: DriveInfo[] }> {
    return client().call(RPC_METHODS.WIPER_DRIVES);
  },

  async wipeFreeSpace(
    drive: string,
    passes?: number,
    zeros?: boolean,
  ): Promise<{ success: boolean; message: string; bytesProcessed: number; drive: string }> {
    return client().call(RPC_METHODS.WIPER_WIPE_FREE_SPACE, { drive, passes, zeros });
  },
};
