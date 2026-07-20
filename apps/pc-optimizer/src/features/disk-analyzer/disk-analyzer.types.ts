/**
 * Disk Analyzer types
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

export interface DiskItem {
  name: string;
  path: string;
  size: number;
  type: string;
  modified: string;
}

export interface DirectoryAnalysis {
  path: string;
  totalSize: number;
  fileCount: number;
  directoryCount: number;
  largestFiles: DiskItem[];
  fileTypes: Record<string, number>;
  subdirectories: DirectoryAnalysis[];
}

export interface DiskAnalysisResult {
  rootPath: string;
  totalSize: number;
  fileCount: number;
  directoryCount: number;
  scanDurationMs: number;
  analysis: DirectoryAnalysis;
}

export interface DiskAnalyzerState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  analysisResult: DiskAnalysisResult | null;
  analyzing: boolean;
  directory: string;
  maxDepth: number;
  drives: DriveInfo[];
  selectedDrive: string | null;
}
