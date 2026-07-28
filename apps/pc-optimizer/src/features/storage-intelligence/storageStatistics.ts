/**
 * Storage Statistics — computes aggregate statistics from the storage index.
 *
 * Provides data for:
 *   • Storage by category, extension, drive
 *   • File age distribution
 *   • Size distribution (average, median, largest, smallest)
 *
 * This module does NOT modify any existing architecture.
 */
import type { FileEntry, StorageStatistics, FileCategory } from './types';
import { StorageIndex } from './storageIndex';

const ALL_CATEGORIES: FileCategory[] = [
  'documents', 'images', 'videos', 'music', 'archives',
  'installers', 'temporary', 'logs', 'cache', 'code', 'system', 'other',
];

export class StorageStatisticsCalculator {
  private _index: StorageIndex;

  constructor(index?: StorageIndex) {
    this._index = index ?? new StorageIndex();
  }

  /**
   * Compute complete statistics from the index.
   */
  compute(): StorageStatistics {
    const files = this._index.getFiles();
    const folders = this._index.getDirectories();

    const sizes = files.map((f) => f.size).sort((a, b) => a - b);
    const totalSize = sizes.reduce((sum, s) => sum + s, 0);
    const fileCount = files.length;

    const byCategory = this._computeByCategory(files);
    const byExtension = this._computeByExtension(files);
    const byDrive = this._computeByDrive(files);

    const now = Date.now();
    const days30 = 30 * 24 * 60 * 60 * 1000;
    const days90 = 90 * 24 * 60 * 60 * 1000;
    const days365 = 365 * 24 * 60 * 60 * 1000;

    return {
      totalFiles: fileCount,
      totalFolders: folders.length,
      totalSize,
      averageFileSize: fileCount > 0 ? totalSize / fileCount : 0,
      medianFileSize: fileCount > 0 ? sizes[Math.floor(fileCount / 2)] ?? 0 : 0,
      largestFileSize: fileCount > 0 ? sizes[fileCount - 1] ?? 0 : 0,
      smallestFileSize: fileCount > 0 ? sizes[0] ?? 0 : 0,
      byCategory,
      byExtension,
      byDrive,
      filesOlderThan30Days: files.filter((f) => now - new Date(f.modifiedDate).getTime() > days30).length,
      filesOlderThan90Days: files.filter((f) => now - new Date(f.modifiedDate).getTime() > days90).length,
      filesOlderThan365Days: files.filter((f) => now - new Date(f.modifiedDate).getTime() > days365).length,
      computedAt: new Date().toISOString(),
    };
  }

  private _computeByCategory(files: FileEntry[]): Record<FileCategory, { count: number; size: number }> {
    const result = {} as Record<FileCategory, { count: number; size: number }>;
    for (const cat of ALL_CATEGORIES) {
      result[cat] = { count: 0, size: 0 };
    }
    for (const file of files) {
      const entry = result[file.category];
      if (entry) {
        entry.count++;
        entry.size += file.size;
      }
    }
    return result;
  }

  private _computeByExtension(files: FileEntry[]): Record<string, { count: number; size: number }> {
    const result: Record<string, { count: number; size: number }> = {};
    for (const file of files) {
      const ext = file.extension || '(none)';
      if (!result[ext]) {
        result[ext] = { count: 0, size: 0 };
      }
      result[ext].count++;
      result[ext].size += file.size;
    }
    return result;
  }

  private _computeByDrive(files: FileEntry[]): Record<string, { count: number; size: number }> {
    const result: Record<string, { count: number; size: number }> = {};
    for (const file of files) {
      if (!result[file.drive]) {
        result[file.drive] = { count: 0, size: 0 };
      }
      result[file.drive]!.count++;
      result[file.drive]!.size += file.size;
    }
    return result;
  }
}

export const storageStatisticsCalculator = new StorageStatisticsCalculator();
