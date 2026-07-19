/**
 * Duplicate Finder service
 */

import type { DuplicateScanResult, DuplicateDeleteResult, DuplicateFile } from './duplicate-finder.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IDuplicateFinderService {
  scan(directories?: string[], excludeDirs?: string[], minFileSize?: number): Promise<DuplicateScanResult>;
  delete(files: DuplicateFile[]): Promise<DuplicateDeleteResult>;
}

class DuplicateFinderService implements IDuplicateFinderService {
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
}

export const duplicateFinderService = new DuplicateFinderService();
