/**
 * Duplicate Scanner — the scan pipeline that reuses Storage Intelligence.
 *
 * Pipeline:
 *   Storage Scanner → Candidate Selection → Quick Hash →
 *   Full Hash Verification → Duplicate Groups → Similarity Analysis
 *
 * Uses existing `duplicate.scan` RPC for backend duplicate detection.
 * Falls back to Storage Intelligence scanner + Hash Engine when
 * the duplicate RPC is not available.
 *
 * Supports cancellation, progress reporting, and incremental scans.
 *
 * This module does NOT modify Storage Intelligence architecture.
 */
import type { FileEntry, ScanResult } from '../storage-intelligence/types';
import type {
  DuplicateScanResult,
  DuplicateGroup,
  DuplicateFile,
  CandidateFilter,
  ScanProgress,
  HashResult,
} from './types';
import {
  DEFAULT_CANDIDATE_FILTER,
  generateGroupId,
  generateDuplicateFileId,
  isProtectedPath,
  isSystemFile,
  isHiddenFile,
  isZeroByteFile,
} from './types';
import { StorageScanner } from '../storage-intelligence';
import { HashEngine } from './hashEngine';
import { SimilarityEngine } from './similarityEngine';
import { duplicateEvents } from './duplicateEvents';
import { getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import { RPC_METHODS } from '@avs/shared/rpc';

interface RawDuplicateGroup {
  hash: string;
  files: Array<{ path: string; size: number; name: string; modified: string }>;
  totalSize: number;
  fileCount: number;
}

export class DuplicateScanner {
  private _storageScanner: StorageScanner;
  private _hashEngine: HashEngine;
  private _similarityEngine: SimilarityEngine;
  private _filter: CandidateFilter;
  private _cancelled: boolean;
  private _progress: ScanProgress | null;

  constructor(
    storageScanner?: StorageScanner,
    hashEngine?: HashEngine,
    similarityEngine?: SimilarityEngine,
  ) {
    this._storageScanner = storageScanner ?? new StorageScanner();
    this._hashEngine = hashEngine ?? new HashEngine();
    this._similarityEngine = similarityEngine ?? new SimilarityEngine();
    this._filter = { ...DEFAULT_CANDIDATE_FILTER };
    this._cancelled = false;
    this._progress = null;
  }

  setFilter(filter: Partial<CandidateFilter>): void {
    this._filter = { ...this._filter, ...filter };
  }

  getFilter(): CandidateFilter {
    return { ...this._filter };
  }

  cancel(): void {
    this._cancelled = true;
  }

  getProgress(): ScanProgress | null {
    return this._progress;
  }

  async scan(): Promise<DuplicateScanResult> {
    const startTime = Date.now();
    this._cancelled = false;
    duplicateEvents.emit('duplicate_scan_started', { timestamp: new Date().toISOString() });

    const errors: string[] = [];

    // Try the dedicated duplicate.scan RPC first
    if (isRpcAvailable()) {
      const rpc = getRpcBridge();
      if (rpc) {
        try {
          const rawResult = await rpc.call(RPC_METHODS.DUPLICATE_SCAN, {
            minFileSize: this._filter.minSize,
            excludeDirs: this._filter.excludePaths,
          }) as { groups?: RawDuplicateGroup[]; errors?: string[]; cancelled?: boolean };

          if (rawResult.errors) {
            errors.push(...rawResult.errors);
          }

          if (rawResult.groups) {
            const groups = this._convertRpcGroups(rawResult.groups);
            const result = this._buildResult(groups, 0, startTime, errors, false, this._cancelled);
            duplicateEvents.emit('duplicate_scan_completed', { result });
            return result;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Duplicate RPC scan failed: ${msg}`);
        }
      }
    }

    // Fallback: use Storage Intelligence + Hash Engine pipeline
    return this._scanWithStorageIntelligence(startTime, errors);
  }

  private async _scanWithStorageIntelligence(startTime: number, errors: string[]): Promise<DuplicateScanResult> {
    // Step 1: Storage Scanner
    this._updateProgress('candidate_selection', 0, 0, 0, 0, null, startTime);
    const scanResult: ScanResult = await this._storageScanner.scan();

    if (this._cancelled) {
      return this._buildResult([], scanResult.totalFiles, startTime, errors, false, true);
    }

    // Step 2: Candidate Selection
    const candidates = this._selectCandidates(scanResult.entries);
    const totalFiles = candidates.length;
    const totalBytes = candidates.reduce((sum, e) => sum + e.size, 0);

    if (candidates.length === 0) {
      const result = this._buildResult([], 0, startTime, errors, false, false);
      duplicateEvents.emit('duplicate_scan_completed', { result });
      return result;
    }

    // Step 3: Quick Hash
    this._updateProgress('quick_hashing', 0, totalFiles, 0, totalBytes, null, startTime);
    const quickHashes = await this._hashEngine.hashFilesParallel(candidates, 'quick');

    if (this._cancelled) {
      return this._buildResult([], totalFiles, startTime, errors, false, true);
    }

    // Step 4: Group by quick hash + size
    const sizeHashGroups = this._groupBySizeAndQuickHash(candidates, quickHashes);

    // Step 5: Full Hash Verification (only for groups with >1 file)
    this._updateProgress('full_hashing', 0, totalFiles, 0, totalBytes, null, startTime);
    const fullHashGroups: FileEntry[][] = [];
    for (const group of sizeHashGroups) {
      if (group.length > 1) {
        const fullHashes = await this._hashEngine.hashFilesParallel(group, 'full');
        const subGroups = this._groupByFullHash(group, fullHashes);
        for (const sub of subGroups) {
          if (sub.length > 1) fullHashGroups.push(sub);
        }
      }
    }

    if (this._cancelled) {
      return this._buildResult([], totalFiles, startTime, errors, false, true);
    }

    // Step 6: Build Duplicate Groups
    this._updateProgress('grouping', 0, totalFiles, 0, totalBytes, null, startTime);
    const groups = this._buildDuplicateGroups(fullHashGroups);

    // Step 7: Similarity Analysis
    this._updateProgress('similarity', 0, totalFiles, 0, totalBytes, null, startTime);
    for (const group of groups) {
      const similarity = this._similarityEngine.analyze(group);
      group.confidence = similarity.confidence;
      duplicateEvents.emit('duplicate_group_created', { group });
    }

    this._updateProgress('completed', totalFiles, totalFiles, totalBytes, totalBytes, null, startTime);
    const result = this._buildResult(groups, totalFiles, startTime, errors, false, this._cancelled);
    duplicateEvents.emit('duplicate_scan_completed', { result });
    return result;
  }

  private _selectCandidates(entries: FileEntry[]): FileEntry[] {
    return entries.filter((entry) => {
      if (entry.isDirectory) return false;
      if (this._filter.ignoreZeroByte && isZeroByteFile(entry.size)) return false;
      if (this._filter.ignoreHidden && isHiddenFile(entry.name)) return false;
      if (this._filter.ignoreSystem && isSystemFile(entry)) return false;
      if (isProtectedPath(entry.path)) return false;
      if (entry.size < this._filter.minSize) return false;

      if (this._filter.extensions && this._filter.extensions.length > 0) {
        if (!this._filter.extensions.includes(entry.extension)) return false;
      }

      if (this._filter.categories && this._filter.categories.length > 0) {
        if (!this._filter.categories.includes(entry.category)) return false;
      }

      if (this._filter.excludePaths && this._filter.excludePaths.length > 0) {
        for (const exclude of this._filter.excludePaths) {
          if (entry.path.toLowerCase().startsWith(exclude.toLowerCase())) return false;
        }
      }

      return true;
    });
  }

  private _groupBySizeAndQuickHash(entries: FileEntry[], hashes: Map<string, HashResult>): FileEntry[][] {
    const groups = new Map<string, FileEntry[]>();
    for (const entry of entries) {
      const hash = hashes.get(entry.id);
      const quickHash = hash?.quickHash ?? 'no-hash';
      const key = `${entry.size}:${quickHash}`;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(entry);
    }
    return Array.from(groups.values()).filter((g) => g.length > 1);
  }

  private _groupByFullHash(entries: FileEntry[], hashes: Map<string, HashResult>): FileEntry[][] {
    const groups = new Map<string, FileEntry[]>();
    for (const entry of entries) {
      const hash = hashes.get(entry.id);
      const fullHash = hash?.fullHash ?? `no-hash-${entry.id}`;
      let group = groups.get(fullHash);
      if (!group) {
        group = [];
        groups.set(fullHash, group);
      }
      group.push(entry);
    }
    return Array.from(groups.values()).filter((g) => g.length > 1);
  }

  private _buildDuplicateGroups(fileGroups: FileEntry[][]): DuplicateGroup[] {
    const result: DuplicateGroup[] = [];
    let index = 0;
    for (const group of fileGroups) {
      if (group.length < 2) continue;

      const sorted = [...group].sort((a, b) => a.path.length - b.path.length);
      const primary = sorted[0]!;
      const duplicates = sorted.slice(1);

      const allFiles: DuplicateFile[] = sorted.map((entry, i) => ({
        id: generateDuplicateFileId(entry.path),
        path: entry.path,
        name: entry.name,
        size: entry.size,
        extension: entry.extension,
        category: entry.category,
        modifiedDate: entry.modifiedDate,
        createdDate: entry.createdDate,
        parentFolder: entry.parentFolder,
        drive: entry.drive,
        hash: entry.hash,
        isPrimary: i === 0,
        isSelected: false,
      }));

      const wastedSpace = duplicates.reduce((sum, f) => sum + f.size, 0);
      const locations = [...new Set(sorted.map((e) => e.parentFolder))];

      const groupId = generateGroupId(primary.hash ?? `size-${primary.size}`, index);
      result.push({
        id: groupId,
        hash: primary.hash,
        reason: 'exact_hash',
        confidence: 'high',
        primaryFile: allFiles[0]!,
        duplicateFiles: allFiles.slice(1),
        allFiles,
        totalSize: primary.size * sorted.length,
        wastedSpace,
        fileCount: sorted.length,
        locations,
      });
      index++;
    }
    return result;
  }

  private _convertRpcGroups(rawGroups: RawDuplicateGroup[]): DuplicateGroup[] {
    return rawGroups.map((raw, index) => {
      const files = raw.files.map((f) => ({
        id: generateDuplicateFileId(f.path),
        path: f.path,
        name: f.name,
        size: f.size,
        extension: f.name.split('.').pop()?.toLowerCase() ?? '',
        category: 'other' as const,
        modifiedDate: f.modified,
        createdDate: f.modified,
        parentFolder: f.path.substring(0, Math.max(f.path.lastIndexOf('\\'), f.path.lastIndexOf('/'))),
        drive: f.path.substring(0, 2).toUpperCase(),
        hash: raw.hash,
        isPrimary: false,
        isSelected: false,
      }));

      files.sort((a, b) => a.path.length - b.path.length);
      files[0]!.isPrimary = true;

      const wastedSpace = files.slice(1).reduce((sum, f) => sum + f.size, 0);
      const locations = [...new Set(files.map((f) => f.parentFolder))];

      return {
        id: generateGroupId(raw.hash, index),
        hash: raw.hash,
        reason: 'exact_hash' as const,
        confidence: 'high' as const,
        primaryFile: files[0]!,
        duplicateFiles: files.slice(1),
        allFiles: files,
        totalSize: raw.totalSize,
        wastedSpace,
        fileCount: raw.fileCount,
        locations,
      };
    });
  }

  private _updateProgress(
    phase: ScanProgress['phase'],
    filesProcessed: number,
    totalFiles: number,
    bytesProcessed: number,
    totalBytes: number,
    currentDirectory: string | null,
    startTime: number,
  ): void {
    const percent = totalFiles > 0 ? Math.round((filesProcessed / totalFiles) * 100) : 0;
    this._progress = {
      phase,
      filesProcessed,
      totalFiles,
      bytesProcessed,
      totalBytes,
      percent,
      currentDirectory,
      elapsedMs: Date.now() - startTime,
    };
    duplicateEvents.emit('duplicate_scan_progress', { progress: this._progress });
  }

  private _buildResult(
    groups: DuplicateGroup[],
    totalFilesScanned: number,
    startTime: number,
    errors: string[],
    fromCache: boolean,
    cancelled: boolean,
  ): DuplicateScanResult {
    const totalDuplicates = groups.reduce((sum, g) => g.duplicateFiles.length, 0);
    const totalWastedSpace = groups.reduce((sum, g) => sum + g.wastedSpace, 0);
    return {
      groups,
      totalFilesScanned,
      totalDuplicates,
      totalWastedSpace,
      totalGroups: groups.length,
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
      errors,
      fromCache,
      cancelled,
    };
  }
}

export const duplicateScanner = new DuplicateScanner();
