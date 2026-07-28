/**
 * Storage Intelligence Platform — Type Definitions
 *
 * Complete type system for the unified storage analysis engine.
 * This module is the foundation for all future storage-related features:
 * Large File Analyzer, Duplicate Finder, Download Cleanup, Old Installers,
 * Empty Folder Cleanup, Storage Heat Maps, AI Storage Recommendations.
 *
 * This module does NOT modify any existing architecture.
 */
import type { HealthCategoryId, Severity } from '../ai-health-engine/types';

// ── File Entry ────────────────────────────────────────────────

/**
 * Categories for classifying files.
 */
export type FileCategory =
  | 'documents'
  | 'images'
  | 'videos'
  | 'music'
  | 'archives'
  | 'installers'
  | 'temporary'
  | 'logs'
  | 'cache'
  | 'code'
  | 'system'
  | 'other';

/**
 * Flags that can be set on a file entry.
 */
export type FileFlag =
  | 'large'
  | 'duplicate'
  | 'old_installer'
  | 'unused'
  | 'temporary'
  | 'empty_folder'
  | 'in_recycle_bin'
  | 'in_downloads'
  | 'system_file'
  | 'cached';

/**
 * A single file entry in the storage index.
 */
export interface FileEntry {
  id: string;
  path: string;
  name: string;
  extension: string;
  size: number;
  category: FileCategory;
  createdDate: string;
  modifiedDate: string;
  accessDate: string;
  owner: string | null;
  hash: string | null;
  flags: FileFlag[];
  isDirectory: boolean;
  parentFolder: string;
  drive: string;
}

// ── Scan Sources ──────────────────────────────────────────────

/**
 * Storage scan source types.
 */
export type ScanSourceType =
  | 'downloads'
  | 'documents'
  | 'desktop'
  | 'pictures'
  | 'videos'
  | 'music'
  | 'recycle_bin'
  | 'temporary'
  | 'app_cache'
  | 'cloud_folder'
  | 'custom';

/**
 * Definition of a scan source.
 */
export interface ScanSource {
  type: ScanSourceType;
  path: string;
  displayName: string;
  enabled: boolean;
}

/**
 * Result of a storage scan.
 */
export interface ScanResult {
  entries: FileEntry[];
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  scanDurationMs: number;
  scannedAt: string;
  sources: ScanSource[];
  errors: string[];
}

// ── Storage Analysis ──────────────────────────────────────────

/**
 * Largest files result.
 */
export interface LargeFileEntry {
  entry: FileEntry;
  reason: string;
}

/**
 * Folder summary.
 */
export interface FolderSummary {
  path: string;
  name: string;
  fileCount: number;
  totalSize: number;
  subFolders: number;
  category: FileCategory;
}

/**
 * Empty folder result.
 */
export interface EmptyFolder {
  path: string;
  name: string;
  parentFolder: string;
  drive: string;
}

/**
 * Duplicate group placeholder.
 */
export interface DuplicateGroup {
  hash: string | null;
  entries: FileEntry[];
  totalSize: number;
  wastedSpace: number;
}

/**
 * Complete storage analysis result.
 */
export interface StorageAnalysis {
  largestFiles: LargeFileEntry[];
  largestFolders: FolderSummary[];
  storageByCategory: Record<FileCategory, number>;
  storageByExtension: Record<string, number>;
  recentlyAddedLargeFiles: LargeFileEntry[];
  unusedLargeFiles: LargeFileEntry[];
  emptyFolders: EmptyFolder[];
  duplicateGroups: DuplicateGroup[];
  cleanupCandidates: FileEntry[];
  totalAnalyzedSize: number;
  totalFileCount: number;
  totalFolderCount: number;
  analyzedAt: string;
}

// ── Statistics ────────────────────────────────────────────────

/**
 * Storage statistics summary.
 */
export interface StorageStatistics {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  averageFileSize: number;
  medianFileSize: number;
  largestFileSize: number;
  smallestFileSize: number;
  byCategory: Record<FileCategory, { count: number; size: number }>;
  byExtension: Record<string, { count: number; size: number }>;
  byDrive: Record<string, { count: number; size: number }>;
  filesOlderThan30Days: number;
  filesOlderThan90Days: number;
  filesOlderThan365Days: number;
  computedAt: string;
}

// ── Recommendations ───────────────────────────────────────────

/**
 * Recommendation type.
 */
export type RecommendationType =
  | 'large_file_cleanup'
  | 'old_installer_cleanup'
  | 'download_cleanup'
  | 'empty_folder_cleanup'
  | 'old_log_cleanup'
  | 'temp_cleanup'
  | 'duplicate_cleanup'
  | 'cache_cleanup';

/**
 * Risk level for recommendations.
 */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

/**
 * Priority for recommendations.
 */
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * A storage cleanup recommendation.
 */
export interface StorageRecommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  estimatedRecovery: number;
  risk: RiskLevel;
  priority: RecommendationPriority;
  reason: string;
  affectedPaths: string[];
  affectedFileCount: number;
  autoFixable: boolean;
  reviewRequired: boolean;
}

// ── Execution ─────────────────────────────────────────────────

/**
 * Operations the StorageExecutionTask can perform.
 */
export type StorageOperationType =
  | 'empty_folder_cleanup'
  | 'old_log_cleanup'
  | 'temp_cleanup';

/**
 * A single storage operation.
 */
export interface StorageOperation {
  type: StorageOperationType;
  paths: string[];
}

/**
 * Configuration for the StorageExecutionTask.
 */
export interface StorageExecutionConfig {
  operations: StorageOperation[];
}

/**
 * Record of a completed storage action (for rollback).
 */
export interface StorageActionRecord {
  id: string;
  operationType: StorageOperationType;
  path: string;
  action: 'deleted' | 'moved';
  originalPath: string;
  backupPath: string | null;
  size: number;
  timestamp: string;
}

// ── Health Integration ────────────────────────────────────────

/**
 * Storage health contribution for the AI Health Engine.
 */
export interface StorageHealthContribution {
  categoryId: HealthCategoryId;
  categoryName: string;
  score: number;
  severity: Severity;
  issues: StorageHealthIssue[];
  insights: string[];
  recommendations: string[];
  estimatedRecoverableSpace: number;
  confidence: number;
  analyzedAt: string;
}

/**
 * A storage-specific health issue.
 */
export interface StorageHealthIssue {
  title: string;
  description: string;
  severity: Severity;
  impact: number;
  autoFixable: boolean;
}

// ── Visualization Support ─────────────────────────────────────

/**
 * Treemap node for visualization.
 */
export interface TreemapNode {
  name: string;
  path: string;
  size: number;
  category: FileCategory;
  children: TreemapNode[];
}

/**
 * Sunburst segment for visualization.
 */
export interface SunburstSegment {
  name: string;
  category: FileCategory;
  size: number;
  percentage: number;
  children: SunburstSegment[];
}

/**
 * Folder heat map entry.
 */
export interface FolderHeatMapEntry {
  path: string;
  name: string;
  size: number;
  fileCount: number;
  heatLevel: 'cold' | 'warm' | 'hot' | 'critical';
}

/**
 * Storage timeline entry for visualization.
 */
export interface StorageTimelineEntry {
  timestamp: string;
  totalSize: number;
  fileCount: number;
  changeInBytes: number;
}

// ── Events ────────────────────────────────────────────────────

export type StorageEventType =
  | 'storage_scan_started'
  | 'storage_scan_completed'
  | 'storage_analysis_completed'
  | 'storage_recommendations_generated'
  | 'storage_execution_completed';

export interface StorageEventPayloads {
  storage_scan_started: { sources: ScanSource[] };
  storage_scan_completed: { result: ScanResult };
  storage_analysis_completed: { analysis: StorageAnalysis };
  storage_recommendations_generated: { recommendations: StorageRecommendation[] };
  storage_execution_completed: { records: StorageActionRecord[] };
}

export type StorageEventListener = (payload: unknown) => void;

// ── Helper Functions ──────────────────────────────────────────

/**
 * Extension to category mapping.
 */
const EXTENSION_CATEGORY_MAP: Record<string, FileCategory> = {
  // Documents
  pdf: 'documents', doc: 'documents', docx: 'documents', txt: 'documents',
  rtf: 'documents', odt: 'documents', xls: 'documents', xlsx: 'documents',
  ppt: 'documents', pptx: 'documents', csv: 'documents', md: 'documents',
  // Images
  jpg: 'images', jpeg: 'images', png: 'images', gif: 'images',
  bmp: 'images', svg: 'images', webp: 'images', tiff: 'images',
  ico: 'images', heic: 'images',
  // Videos
  mp4: 'videos', avi: 'videos', mkv: 'videos', mov: 'videos',
  wmv: 'videos', flv: 'videos', webm: 'videos', m4v: 'videos',
  // Music
  mp3: 'music', wav: 'music', flac: 'music', aac: 'music',
  ogg: 'music', wma: 'music', m4a: 'music',
  // Archives
  zip: 'archives', rar: 'archives', '7z': 'archives', tar: 'archives',
  gz: 'archives', bz2: 'archives', xz: 'archives',
  // Installers
  exe: 'installers', msi: 'installers', dmg: 'installers',
  deb: 'installers', rpm: 'installers', apk: 'installers',
  // Temporary
  tmp: 'temporary', temp: 'temporary', bak: 'temporary', old: 'temporary',
  // Logs
  log: 'logs',
  // Cache
  cache: 'cache', dat: 'cache',
  // Code
  js: 'code', ts: 'code', py: 'code', java: 'code', cpp: 'code',
  c: 'code', h: 'code', cs: 'code', go: 'code', rs: 'code',
  html: 'code', css: 'code', json: 'code', xml: 'code', yml: 'code',
  yaml: 'code',
  // System
  sys: 'system', dll: 'system', ini: 'system', cfg: 'system',
  reg: 'system',
};

/**
 * Classify a file extension into a category.
 */
export function categorizeByExtension(extension: string): FileCategory {
  const ext = extension.toLowerCase().replace(/^\./, '');
  return EXTENSION_CATEGORY_MAP[ext] ?? 'other';
}

/**
 * Generate a unique file entry ID.
 */
export function generateFileEntryId(path: string): string {
  return `file-${path.replace(/[^a-zA-Z0-9]/g, '_')}-${path.length}`;
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Check if a file is an installer based on extension.
 */
export function isInstallerFile(extension: string): boolean {
  const ext = extension.toLowerCase().replace(/^\./, '');
  return ['exe', 'msi', 'dmg', 'deb', 'rpm', 'apk'].includes(ext);
}

/**
 * Check if a file is a temporary/log file.
 */
export function isTempOrLogFile(extension: string): boolean {
  const ext = extension.toLowerCase().replace(/^\./, '');
  return ['tmp', 'temp', 'bak', 'old', 'log'].includes(ext);
}

/**
 * Default scan sources.
 */
export const DEFAULT_SCAN_SOURCES: readonly ScanSource[] = [
  { type: 'downloads', path: '~/Downloads', displayName: 'Downloads', enabled: true },
  { type: 'documents', path: '~/Documents', displayName: 'Documents', enabled: true },
  { type: 'desktop', path: '~/Desktop', displayName: 'Desktop', enabled: true },
  { type: 'pictures', path: '~/Pictures', displayName: 'Pictures', enabled: true },
  { type: 'videos', path: '~/Videos', displayName: 'Videos', enabled: true },
  { type: 'music', path: '~/Music', displayName: 'Music', enabled: true },
  { type: 'recycle_bin', path: 'recycle-bin', displayName: 'Recycle Bin', enabled: true },
  { type: 'temporary', path: '%TEMP%', displayName: 'Temporary Files', enabled: true },
  { type: 'app_cache', path: 'app-cache', displayName: 'Application Caches', enabled: false },
  { type: 'cloud_folder', path: 'cloud', displayName: 'Cloud Folders', enabled: false },
];

/**
 * Threshold for "large" files (100 MB).
 */
export const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;

/**
 * Threshold for "unused" files (not accessed in 90 days).
 */
export const UNUSED_FILE_THRESHOLD_DAYS = 90;

/**
 * Threshold for "recently added" files (within 7 days).
 */
export const RECENT_FILE_THRESHOLD_DAYS = 7;
