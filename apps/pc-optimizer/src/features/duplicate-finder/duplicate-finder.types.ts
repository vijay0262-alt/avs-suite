/**
 * Duplicate Finder types
 */

export interface DriveInfo {
  device: string;
  mountpoint: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface DuplicateFile {
  path: string;
  size: number;
  name: string;
  modified: string;
}

export interface DuplicateGroup {
  hash: string;
  files: DuplicateFile[];
  totalSize: number;
  fileCount: number;
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[];
  totalFiles: number;
  totalDuplicates: number;
  recoverableSpace: number;
  scanDurationMs: number;
  scannedDirectories: string[];
}

export interface DuplicateDeleteResult {
  deletedCount: number;
  spaceFreed: number;
  errors: string[];
}

export interface DuplicateEstimateResult {
  directories: string[];
  estimatedFiles: number;
  estimatedBytes: number;
}

export type DuplicateScope = 'entire' | 'pictures' | 'videos' | 'music' | 'documents' | 'downloads' | 'desktop' | 'custom';

export interface DuplicateFinderState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  scanResult: DuplicateScanResult | null;
  scanning: boolean;
  deleting: boolean;
  selectedFiles: Set<string>;
  directories: string[];
  drives: DriveInfo[];
  selectedDrive: string | null;
  customDirectories: string;
  deleteResult: DuplicateDeleteResult | null;
  scope: DuplicateScope;
  estimate: DuplicateEstimateResult | null;
  estimateLoading: boolean;
}
