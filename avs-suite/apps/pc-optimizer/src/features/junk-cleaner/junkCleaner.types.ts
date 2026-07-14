/**
 * DTOs mirroring the Python-side JSON returned by ``cleaner.*`` RPC
 * methods. Kept in this feature folder because they are not consumed
 * outside the Junk Cleaner module.
 */

export type ScanStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type CleanerCategory = 'system' | 'user' | 'applications' | 'browsers' | 'logs';

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
  /** Present in status responses — 0..100 while running. */
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
  cleaners?: CleanerSummary[];
  totalFiles?: number;
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
  /** POSIX timestamp in seconds. */
  modifiedAt: number;
  category: CleanerCategory;
  cleanerId: string;
}

export interface ScanResultsPage {
  offset: number;
  limit: number;
  items: ScanItem[];
}
