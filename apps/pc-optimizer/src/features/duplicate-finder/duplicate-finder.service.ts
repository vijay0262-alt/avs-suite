/**
 * Duplicate Finder service
 */

import type { DuplicateScanResult, DuplicateDeleteResult, DuplicateEstimateResult, DuplicateFile, DriveInfo, DuplicateScope } from './duplicate-finder.types';
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IDuplicateFinderService {
  listDrives(): Promise<DriveInfo[]>;
  scan(scope: DuplicateScope, directories?: string[], excludeDirs?: string[], minFileSize?: number): Promise<DuplicateScanResult>;
  delete(files: DuplicateFile[]): Promise<DuplicateDeleteResult>;
  estimate(scope: DuplicateScope, directories?: string[]): Promise<DuplicateEstimateResult>;
}

class DuplicateFinderService implements IDuplicateFinderService {
  async listDrives(): Promise<DriveInfo[]> {
    return await client().call(RPC_METHODS.DUPLICATE_LIST_DRIVES);
  }

  async scan(scope: DuplicateScope, directories?: string[], excludeDirs?: string[], minFileSize?: number): Promise<DuplicateScanResult> {
    const params = {
      scope,
      directories,
      excludeDirs,
      minFileSize,
    };
    return await client().call(RPC_METHODS.DUPLICATE_SCAN, params);
  }

  async delete(files: DuplicateFile[]): Promise<DuplicateDeleteResult> {
    return await client().call(RPC_METHODS.DUPLICATE_DELETE, { files });
  }

  async estimate(scope: DuplicateScope, directories?: string[]): Promise<DuplicateEstimateResult> {
    return await client().call(RPC_METHODS.DUPLICATE_ESTIMATE, { scope, directories });
  }
}

export const duplicateFinderService = new DuplicateFinderService();
