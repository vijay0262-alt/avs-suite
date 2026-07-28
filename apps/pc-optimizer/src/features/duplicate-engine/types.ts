/**
 * Duplicate Detection Engine — Type Definitions
 *
 * Complete type system for duplicate file detection, hashing,
 * similarity analysis, grouping, recommendations, and execution.
 *
 * Reuses Storage Intelligence FileEntry wherever possible.
 *
 * This module does NOT modify any existing architecture.
 */
import type { FileEntry, FileCategory } from '../storage-intelligence/types';
import type { HealthCategoryId, Severity } from '../ai-health-engine/types';

// ── Hash Types ────────────────────────────────────────────────

export type HashAlgorithm = 'sha256' | 'blake3' | 'quick';
export type HashType = 'quick' | 'full';

export interface HashResult {
  fileEntryId: string;
  path: string;
  quickHash: string | null;
  fullHash: string | null;
  algorithm: HashAlgorithm;
  size: number;
  modifiedDate: string;
  computedAt: string;
}

export interface HashCacheEntry {
  path: string;
  size: number;
  modifiedDate: string;
  quickHash: string | null;
  fullHash: string | null;
  algorithm: HashAlgorithm;
  computedAt: string;
}

// ── Candidate Filtering ───────────────────────────────────────

export interface CandidateFilter {
  minSize: number;
  maxFiles: number;
  extensions: string[] | null;
  categories: FileCategory[] | null;
  directories: string[] | null;
  excludePaths: string[];
  ignoreHidden: boolean;
  ignoreSystem: boolean;
  ignoreZeroByte: boolean;
}

export const DEFAULT_CANDIDATE_FILTER: CandidateFilter = {
  minSize: 1024,
  maxFiles: 1_000_000,
  extensions: null,
  categories: null,
  directories: null,
  excludePaths: [],
  ignoreHidden: true,
  ignoreSystem: true,
  ignoreZeroByte: true,
};

// ── Duplicate File & Group ────────────────────────────────────

export interface DuplicateFile {
  id: string;
  path: string;
  name: string;
  size: number;
  extension: string;
  category: FileCategory;
  modifiedDate: string;
  createdDate: string;
  parentFolder: string;
  drive: string;
  hash: string | null;
  isPrimary: boolean;
  isSelected: boolean;
}

export type DuplicateReason = 'exact_hash' | 'same_name_size' | 'near_duplicate';
export type DuplicateConfidence = 'high' | 'medium' | 'low';

export interface DuplicateGroup {
  id: string;
  hash: string | null;
  reason: DuplicateReason;
  confidence: DuplicateConfidence;
  primaryFile: DuplicateFile;
  duplicateFiles: DuplicateFile[];
  allFiles: DuplicateFile[];
  totalSize: number;
  wastedSpace: number;
  fileCount: number;
  locations: string[];
}

// ── Similarity ────────────────────────────────────────────────

export type SimilarityType = 'exact' | 'same_filename' | 'same_content' | 'near_duplicate';

export interface SimilarityResult {
  type: SimilarityType;
  confidence: DuplicateConfidence;
  score: number;
  reason: string;
}

// ── Scan Result ───────────────────────────────────────────────

export interface DuplicateScanResult {
  groups: DuplicateGroup[];
  totalFilesScanned: number;
  totalDuplicates: number;
  totalWastedSpace: number;
  totalGroups: number;
  scanDurationMs: number;
  scannedAt: string;
  errors: string[];
  fromCache: boolean;
  cancelled: boolean;
}

export interface ScanProgress {
  phase: 'candidate_selection' | 'quick_hashing' | 'full_hashing' | 'grouping' | 'similarity' | 'completed';
  filesProcessed: number;
  totalFiles: number;
  bytesProcessed: number;
  totalBytes: number;
  percent: number;
  currentDirectory: string | null;
  elapsedMs: number;
}

// ── Analysis ──────────────────────────────────────────────────

export interface DuplicateAnalysisResult {
  score: number;
  issues: DuplicateHealthIssue[];
  insights: string[];
  totalDuplicateFiles: number;
  totalWastedSpace: number;
  totalGroups: number;
  largestGroups: DuplicateGroup[];
  recoverableSpace: number;
  analyzedAt: string;
}

export interface DuplicateHealthIssue {
  title: string;
  description: string;
  severity: Severity;
  impact: number;
  autoFixable: boolean;
  affectedPaths: string[];
}

// ── Recommendations ───────────────────────────────────────────

export type DuplicateRecommendationType =
  | 'remove_duplicates'
  | 'keep_newest'
  | 'keep_oldest'
  | 'keep_shortest_path'
  | 'keep_largest_folder'
  | 'manual_review';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

export interface DuplicateRecommendation {
  id: string;
  type: DuplicateRecommendationType;
  title: string;
  description: string;
  estimatedRecovery: number;
  risk: RiskLevel;
  priority: RecommendationPriority;
  confidence: DuplicateConfidence;
  reviewRequired: boolean;
  affectedGroupIds: string[];
  affectedFileCount: number;
}

// ── Execution ─────────────────────────────────────────────────

export type DeletionMode = 'recycle_bin' | 'avs_recovery_folder';

export interface DuplicateExecutionConfig {
  selectedFileIds: string[];
  deletionMode: DeletionMode;
  avsRecoveryPath: string | null;
  excludePaths: string[];
}

export interface DuplicateActionRecord {
  id: string;
  fileId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  groupId: string;
  action: 'moved' | 'deleted';
  deletionMode: DeletionMode;
  destinationPath: string | null;
  backupPath: string | null;
  timestamp: string;
  rolledBack: boolean;
}

// ── History ───────────────────────────────────────────────────

export type DuplicateHistoryEntryType = 'scan' | 'cleanup' | 'rollback' | 'health_change';

export interface DuplicateHistoryEntry {
  id: string;
  type: DuplicateHistoryEntryType;
  timestamp: string;
  description: string;
  groupsRemoved: number;
  filesRemoved: number;
  spaceRecovered: number;
  durationMs: number;
  success: boolean;
}

// ── Health Integration ────────────────────────────────────────

export interface DuplicateHealthContribution {
  categoryId: HealthCategoryId;
  categoryName: string;
  score: number;
  severity: Severity;
  issues: DuplicateHealthIssue[];
  insights: string[];
  recommendations: string[];
  estimatedRecoverableSpace: number;
  confidence: number;
  analyzedAt: string;
}

// ── Dashboard Integration ─────────────────────────────────────

export interface DuplicateDashboardCard {
  totalDuplicateFiles: number;
  recoverableSpace: number;
  largestGroupSize: number;
  totalGroups: number;
  recentCleanupSpace: number;
  quickActions: { label: string; action: string }[];
}

// ── Events ────────────────────────────────────────────────────

export type DuplicateEventType =
  | 'duplicate_scan_started'
  | 'duplicate_scan_progress'
  | 'duplicate_scan_completed'
  | 'duplicate_group_created'
  | 'duplicate_cleanup_started'
  | 'duplicate_cleanup_completed'
  | 'duplicate_cleanup_failed';

export interface DuplicateEventPayloads {
  duplicate_scan_started: { timestamp: string };
  duplicate_scan_progress: { progress: ScanProgress };
  duplicate_scan_completed: { result: DuplicateScanResult };
  duplicate_group_created: { group: DuplicateGroup };
  duplicate_cleanup_started: { fileIds: string[] };
  duplicate_cleanup_completed: { records: DuplicateActionRecord[] };
  duplicate_cleanup_failed: { error: string; partialRecords: DuplicateActionRecord[] };
}

export type DuplicateEventListener = (payload: unknown) => void;

// ── Protected Paths ───────────────────────────────────────────

export const PROTECTED_PATH_PATTERNS: readonly string[] = [
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
  'c:\\$recycle.bin',
  'c:\\system volume information',
  'c:\\users\\all users',
  'c:\\users\\default',
  'c:\\users\\public',
  '\\avs',
  'avs-suite',
  'avs-shield',
  'avsshield',
];

export function isProtectedPath(path: string): boolean {
  const lower = path.toLowerCase();
  return PROTECTED_PATH_PATTERNS.some((p) => lower.includes(p));
}

export function isSystemFile(entry: FileEntry): boolean {
  return entry.category === 'system' || entry.flags.includes('system_file');
}

export function isHiddenFile(name: string): boolean {
  return name.startsWith('.') || name.startsWith('~');
}

export function isZeroByteFile(size: number): boolean {
  return size === 0;
}

// ── Helper Functions ──────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function generateGroupId(hash: string | null, index: number): string {
  return `dup-group-${hash ? hash.substring(0, 12) : 'nohash'}-${index}`;
}

export function generateDuplicateFileId(path: string): string {
  return `dup-file-${path.replace(/[^a-zA-Z0-9]/g, '_')}-${path.length}`;
}

export function generateRecId(): string {
  return `dup-rec-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

// ── Thresholds ────────────────────────────────────────────────

export const QUICK_HASH_SIZE = 4096;
export const STREAMING_THRESHOLD = 100 * 1024 * 1024;
export const LARGE_GROUP_THRESHOLD = 10;
export const MANY_DUPLICATES_THRESHOLD = 100;
export const LARGE_WASTED_SPACE_THRESHOLD = 1024 * 1024 * 1024;
export const CACHE_TTL_MS = 60_000;
export const MAX_PARALLEL_HASHES = 4;
