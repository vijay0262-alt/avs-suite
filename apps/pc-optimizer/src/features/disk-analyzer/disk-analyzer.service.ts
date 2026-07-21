/**
 * Disk Analyzer service
 */

import type { DiskAnalysisResult, DriveInfo, DeleteFilesResult } from './disk-analyzer.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IDiskAnalyzerService {
  listDrives(): Promise<DriveInfo[]>;
  analyze(directory?: string, maxDepth?: number): Promise<DiskAnalysisResult>;
  deleteFiles(files: string[]): Promise<DeleteFilesResult>;
}

class DiskAnalyzerService implements IDiskAnalyzerService {
  async listDrives(): Promise<DriveInfo[]> {
    return await client().call('disk.listDrives');
  }

  async analyze(directory?: string, maxDepth?: number): Promise<DiskAnalysisResult> {
    const params = {
      directory,
      maxDepth,
    };
    return await client().call('disk.analyze', params);
  }

  async deleteFiles(files: string[]): Promise<DeleteFilesResult> {
    return await client().call('disk.deleteFiles', { files });
  }
}

export const diskAnalyzerService = new DiskAnalyzerService();
