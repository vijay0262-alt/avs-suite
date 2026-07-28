/**
 * Storage Analyzer — performs comprehensive analysis of the storage index.
 *
 * Computes:
 *   • Largest files and folders
 *   • Storage by category and extension
 *   • Recently added large files
 *   • Unused large files
 *   • Empty folders
 *   • Duplicate group placeholders
 *   • Cleanup candidates
 *
 * Also provides visualization data structures (treemap, sunburst, heat map).
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  FileEntry,
  StorageAnalysis,
  LargeFileEntry,
  FolderSummary,
  EmptyFolder,
  DuplicateGroup,
  FileCategory,
  TreemapNode,
  SunburstSegment,
  FolderHeatMapEntry,
} from './types';
import {
  LARGE_FILE_THRESHOLD,
  UNUSED_FILE_THRESHOLD_DAYS,
  RECENT_FILE_THRESHOLD_DAYS,
} from './types';
import { StorageIndex } from './storageIndex';
import { storageEvents } from './storageEvents';

export class StorageAnalyzer {
  private _index: StorageIndex;

  constructor(index?: StorageIndex) {
    this._index = index ?? new StorageIndex();
  }

  /**
   * Run a complete analysis and return the result.
   */
  analyze(): StorageAnalysis {
    const files = this._index.getFiles();
    const folders = this._index.getDirectories();

    const largestFiles = this._findLargestFiles(files, 50);
    const largestFolders = this._findLargestFolders(folders, files, 20);
    const storageByCategory = this._computeStorageByCategory(files);
    const storageByExtension = this._computeStorageByExtension(files);
    const recentlyAddedLargeFiles = this._findRecentlyAddedLargeFiles(files);
    const unusedLargeFiles = this._findUnusedLargeFiles(files);
    const emptyFolders = this._findEmptyFolders(folders, files);
    const duplicateGroups = this._findDuplicateGroups(files);
    const cleanupCandidates = this._findCleanupCandidates(files);

    const analysis: StorageAnalysis = {
      largestFiles,
      largestFolders,
      storageByCategory,
      storageByExtension,
      recentlyAddedLargeFiles,
      unusedLargeFiles,
      emptyFolders,
      duplicateGroups,
      cleanupCandidates,
      totalAnalyzedSize: files.reduce((sum, f) => sum + f.size, 0),
      totalFileCount: files.length,
      totalFolderCount: folders.length,
      analyzedAt: new Date().toISOString(),
    };

    storageEvents.emit('storage_analysis_completed', { analysis });
    return analysis;
  }

  /**
   * Build treemap visualization data.
   */
  buildTreemap(): TreemapNode {
    const files = this._index.getFiles();
    const root: TreemapNode = {
      name: 'Root',
      path: '/',
      size: 0,
      category: 'other',
      children: [],
    };

    const folderMap = new Map<string, TreemapNode>();

    for (const file of files) {
      const folderPath = file.parentFolder;
      let folderNode = folderMap.get(folderPath);
      if (!folderNode) {
        folderNode = {
          name: folderPath.split(/[\\/]/).pop() ?? folderPath,
          path: folderPath,
          size: 0,
          category: file.category,
          children: [],
        };
        folderMap.set(folderPath, folderNode);
        root.children.push(folderNode);
      }
      folderNode.size += file.size;
      folderNode.children.push({
        name: file.name,
        path: file.path,
        size: file.size,
        category: file.category,
        children: [],
      });
      root.size += file.size;
    }

    return root;
  }

  /**
   * Build sunburst visualization data.
   */
  buildSunburst(): SunburstSegment {
    const files = this._index.getFiles();
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const categoryMap = new Map<FileCategory, { size: number; files: FileEntry[] }>();
    for (const file of files) {
      let entry = categoryMap.get(file.category);
      if (!entry) {
        entry = { size: 0, files: [] };
        categoryMap.set(file.category, entry);
      }
      entry.size += file.size;
      entry.files.push(file);
    }

    const root: SunburstSegment = {
      name: 'Storage',
      category: 'other',
      size: totalSize,
      percentage: 100,
      children: [],
    };

    for (const [category, data] of categoryMap) {
      const extMap = new Map<string, number>();
      for (const file of data.files) {
        const ext = file.extension || '(none)';
        extMap.set(ext, (extMap.get(ext) ?? 0) + file.size);
      }

      const children: SunburstSegment[] = [];
      for (const [ext, size] of extMap) {
        children.push({
          name: ext,
          category,
          size,
          percentage: totalSize > 0 ? (size / totalSize) * 100 : 0,
          children: [],
        });
      }

      root.children.push({
        name: category,
        category,
        size: data.size,
        percentage: totalSize > 0 ? (data.size / totalSize) * 100 : 0,
        children,
      });
    }

    return root;
  }

  /**
   * Build folder heat map data.
   */
  buildHeatMap(): FolderHeatMapEntry[] {
    const files = this._index.getFiles();
    const folderMap = new Map<string, { size: number; count: number }>();

    for (const file of files) {
      const folder = file.parentFolder;
      let entry = folderMap.get(folder);
      if (!entry) {
        entry = { size: 0, count: 0 };
        folderMap.set(folder, entry);
      }
      entry.size += file.size;
      entry.count++;
    }

    const entries: FolderHeatMapEntry[] = [];
    const sizes = Array.from(folderMap.values()).map((v) => v.size).sort((a, b) => b - a);
    const max = sizes[0] ?? 0;
    const q75 = sizes[Math.floor(sizes.length * 0.25)] ?? 0;
    const q50 = sizes[Math.floor(sizes.length * 0.5)] ?? 0;

    for (const [path, data] of folderMap) {
      let heatLevel: FolderHeatMapEntry['heatLevel'] = 'cold';
      if (data.size >= max * 0.75) heatLevel = 'critical';
      else if (data.size >= q75) heatLevel = 'hot';
      else if (data.size >= q50) heatLevel = 'warm';

      entries.push({
        path,
        name: path.split(/[\\/]/).pop() ?? path,
        size: data.size,
        fileCount: data.count,
        heatLevel,
      });
    }

    return entries.sort((a, b) => b.size - a.size);
  }

  // ── Internal ────────────────────────────────────────────────

  private _findLargestFiles(files: FileEntry[], limit: number): LargeFileEntry[] {
    return files
      .sort((a, b) => b.size - a.size)
      .slice(0, limit)
      .map((entry) => ({
        entry,
        reason: entry.size > LARGE_FILE_THRESHOLD ? 'Exceeds large file threshold' : 'Among largest files',
      }));
  }

  private _findLargestFolders(
    folders: FileEntry[],
    files: FileEntry[],
    limit: number,
  ): FolderSummary[] {
    const folderMap = new Map<string, { fileCount: number; totalSize: number; subFolders: number }>();

    for (const folder of folders) {
      let entry = folderMap.get(folder.path);
      if (!entry) {
        entry = { fileCount: 0, totalSize: 0, subFolders: 0 };
        folderMap.set(folder.path, entry);
      }
    }

    for (const file of files) {
      let entry = folderMap.get(file.parentFolder);
      if (!entry) {
        entry = { fileCount: 0, totalSize: 0, subFolders: 0 };
        folderMap.set(file.parentFolder, entry);
      }
      entry.fileCount++;
      entry.totalSize += file.size;
    }

    // Count subfolders
    for (const folder of folders) {
      const parent = folder.parentFolder;
      const parentEntry = folderMap.get(parent);
      if (parentEntry) {
        parentEntry.subFolders++;
      }
    }

    return Array.from(folderMap.entries())
      .map(([path, data]) => ({
        path,
        name: path.split(/[\\/]/).pop() ?? path,
        fileCount: data.fileCount,
        totalSize: data.totalSize,
        subFolders: data.subFolders,
        category: this._inferFolderCategory(path),
      }))
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, limit);
  }

  private _inferFolderCategory(path: string): FileCategory {
    const lower = path.toLowerCase();
    if (lower.includes('download')) return 'installers';
    if (lower.includes('document')) return 'documents';
    if (lower.includes('picture') || lower.includes('image')) return 'images';
    if (lower.includes('video') || lower.includes('movie')) return 'videos';
    if (lower.includes('music') || lower.includes('audio')) return 'music';
    if (lower.includes('temp')) return 'temporary';
    if (lower.includes('cache')) return 'cache';
    if (lower.includes('log')) return 'logs';
    return 'other';
  }

  private _computeStorageByCategory(files: FileEntry[]): Record<FileCategory, number> {
    const result = {} as Record<FileCategory, number>;
    const categories: FileCategory[] = [
      'documents', 'images', 'videos', 'music', 'archives',
      'installers', 'temporary', 'logs', 'cache', 'code', 'system', 'other',
    ];
    for (const cat of categories) {
      result[cat] = 0;
    }
    for (const file of files) {
      result[file.category] += file.size;
    }
    return result;
  }

  private _computeStorageByExtension(files: FileEntry[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const file of files) {
      const ext = file.extension || '(none)';
      result[ext] = (result[ext] ?? 0) + file.size;
    }
    return result;
  }

  private _findRecentlyAddedLargeFiles(files: FileEntry[]): LargeFileEntry[] {
    const now = Date.now();
    const threshold = RECENT_FILE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    return files
      .filter((f) => f.size > LARGE_FILE_THRESHOLD && now - new Date(f.createdDate).getTime() < threshold)
      .map((entry) => ({
        entry,
        reason: 'Large file added recently',
      }));
  }

  private _findUnusedLargeFiles(files: FileEntry[]): LargeFileEntry[] {
    const now = Date.now();
    const threshold = UNUSED_FILE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    return files
      .filter((f) => f.size > LARGE_FILE_THRESHOLD && now - new Date(f.accessDate).getTime() > threshold)
      .map((entry) => ({
        entry,
        reason: `Not accessed in ${UNUSED_FILE_THRESHOLD_DAYS}+ days`,
      }));
  }

  private _findEmptyFolders(folders: FileEntry[], files: FileEntry[]): EmptyFolder[] {
    const fileParentFolders = new Set(files.map((f) => f.parentFolder));
    return folders
      .filter((f) => !fileParentFolders.has(f.path))
      .map((f) => ({
        path: f.path,
        name: f.name,
        parentFolder: f.parentFolder,
        drive: f.drive,
      }));
  }

  private _findDuplicateGroups(files: FileEntry[]): DuplicateGroup[] {
    // Placeholder: group by hash if available
    const hashMap = new Map<string, FileEntry[]>();
    for (const file of files) {
      if (file.hash) {
        let group = hashMap.get(file.hash);
        if (!group) {
          group = [];
          hashMap.set(file.hash, group);
        }
        group.push(file);
      }
    }

    const groups: DuplicateGroup[] = [];
    for (const [hash, entries] of hashMap) {
      if (entries.length > 1) {
        const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
        groups.push({
          hash,
          entries,
          totalSize,
          wastedSpace: totalSize - entries[0]!.size,
        });
      }
    }

    return groups.sort((a, b) => b.wastedSpace - a.wastedSpace);
  }

  private _findCleanupCandidates(files: FileEntry[]): FileEntry[] {
    return files.filter((f) =>
      f.flags.includes('temporary') ||
      f.flags.includes('old_installer') ||
      f.flags.includes('unused') ||
      f.flags.includes('in_recycle_bin') ||
      f.flags.includes('cached'),
    );
  }
}

export const storageAnalyzer = new StorageAnalyzer();
