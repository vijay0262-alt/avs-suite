/**
 * Disk Analyzer types
 */

export interface DriveInfo {
  device: string;
  mountpoint: string;
  /** Volume label, when available from the OS */
  label?: string;
  /** Whether this is the Windows system drive */
  isSystemDrive?: boolean;
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
  categorizedFiles: Record<string, CategorizedFile[]>;
  categorySummary: CategorySummary[];
}

export interface CategorizedFile {
  name: string;
  path: string;
  size: number;
  extension: string;
  modified: string;
}

export interface CategorySummary {
  category: string;
  fileCount: number;
  totalSize: number;
}

export interface DeleteFilesResult {
  deleted: number;
  failed: number;
  bytesFreed: number;
  errors: { path: string; error: string }[];
}

export interface DiskAnalyzerState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  analysisResult: DiskAnalysisResult | null;
  analyzing: boolean;
  directory: string;
  maxDepth: number;
  drives: DriveInfo[];
  selectedDrives: string[];
  customDirectory: string;
  selectedFiles: Set<string>;
  expandedCategory: string | null;
  deleting: boolean;
  deleteResult: DeleteFilesResult | null;
}
