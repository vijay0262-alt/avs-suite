/**
 * Duplicate Finder service
 */

import type { DuplicateScanResult, DuplicateDeleteResult, DuplicateEstimateResult, DuplicateFile, DriveInfo, DuplicateScope } from './duplicate-finder.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IDuplicateFinderService {
  listDrives(): Promise<DriveInfo[]>;
  scan(directories?: string[], excludeDirs?: string[], minFileSize?: number): Promise<DuplicateScanResult>;
  delete(files: DuplicateFile[]): Promise<DuplicateDeleteResult>;
  estimate(scope: DuplicateScope, directories?: string[]): Promise<DuplicateEstimateResult>;
}

class DuplicateFinderService implements IDuplicateFinderService {
  async listDrives(): Promise<DriveInfo[]> {
    return await client().call('duplicate.listDrives');
  }

  async scan(directories?: string[], excludeDirs?: string[], minFileSize?: number): Promise<DuplicateScanResult> {
    const params = {
      directories,
      excludeDirs,
      minFileSize,
    };
    return await client().call('duplicate.scan', params);
  }

  async delete(files: DuplicateFile[]): Promise<DuplicateDeleteResult> {
    return await client().call('duplicate.delete', { files });
  }

  async estimate(scope: DuplicateScope, directories?: string[]): Promise<DuplicateEstimateResult> {
    return await client().call('duplicate.estimate', { scope, directories });
  }
}

export const duplicateFinderService = new DuplicateFinderService();
