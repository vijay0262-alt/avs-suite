/**
 * DTOs mirroring the Python-side JSON returned by ``cleaner.*`` RPC
 * methods.
 */

export type ScanStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type CleanerCategory = 'system' | 'user' | 'applications' | 'browsers' | 'logs';

/** Terminal outcome of a cleaning operation. */
export type CleaningActionResult =
  | 'success'
  | 'partial'
  | 'nothing'
  | 'cancelled'
  | 'failed'
  | 'pending';

export interface CleanerInfo {
  id: string;
  name: string;
  description: string;
  category: CleanerCategory;
}

export interface CleanerSummary extends CleanerInfo {
  status: ScanStatus;
  totalFiles: number;
  totalBytes: number;
  errors: string[];
  elapsedMs: number;
  progress?: number;
}

export interface ScanStatusSnapshot {
  present: boolean;
  taskId?: string;
  status?: ScanStatus;
  startedAt?: number;
  finishedAt?: number | null;
  progress?: number;
  currentCleaner?: string | null;
  currentPath?: string | null;
  cleaners?: CleanerSummary[];
  totalFiles?: number;
  totalItems?: number;
  totalBytes?: number;
  errorCount?: number;
  durationMs?: number;
  etaMs?: number | null;
}

export interface ScanItem {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  category: CleanerCategory;
  cleanerId: string;
}

export interface ScanResultsPage {
  offset: number;
  limit: number;
  items: ScanItem[];
}

/* ------------------------------------------------------------------ */
/* Cleaning DTOs                                                       */
/* ------------------------------------------------------------------ */

export interface CleaningWarning {
  path: string;
  reason: string;
  detail: string;
}

export interface CleaningCategoryPreview {
  id: string;
  name: string;
  category: CleanerCategory;
  totalFiles: number;
  totalBytes: number;
  warnings: CleaningWarning[];
  warningCount: number;
}

export interface CleaningPreview {
  totalFiles: number;
  totalBytes: number;
  warningCount: number;
  cleaners: CleaningCategoryPreview[];
}

export interface CleaningCategorySummary {
  id: string;
  name: string;
  category: CleanerCategory;
  result: CleaningActionResult;
  filesRemoved: number;
  bytesRecovered: number;
  filesSkipped: number;
  filesFailed: number;
  errors: string[];
  elapsedMs: number;
  progress: number;
  totalCandidates: number;
}

export interface CleaningStatusSnapshot {
  present: boolean;
  cleaningTaskId?: string;
  scanTaskId?: string;
  status?: ScanStatus;
  startedAt?: number;
  finishedAt?: number | null;
  progress?: number;
  currentCleaner?: string | null;
  currentFile?: string | null;
  cleaners?: CleaningCategorySummary[];
  totalFilesRemoved?: number;
  totalBytesRecovered?: number;
  totalFilesSkipped?: number;
  totalFilesFailed?: number;
  durationMs?: number;
  etaMs?: number | null;
}

export interface CleaningLogEntry {
  id: number;
  started_at: string;
  finished_at: string;
  cleaner_id: string;
  cleaner_name: string;
  category: string;
  action: string;
  result: string;
  files_removed: number;
  bytes_recovered: number;
  files_skipped: number;
  files_failed: number;
  duration_ms: number;
  errors: { count: number; sample: string[] };
}

export interface CleaningLogPage {
  total: number;
  offset: number;
  limit: number;
  entries: CleaningLogEntry[];
}
