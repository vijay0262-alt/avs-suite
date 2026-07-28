/**
 * Storage Scanner — discovers files from various scan sources.
 *
 * Uses the existing RPC bridge to call disk.analyze and duplicate.listDrives
 * for backend file enumeration. Converts raw RPC results into FileEntry objects.
 *
 * This module does NOT modify any existing service.
 */
import type { FileEntry, ScanResult, ScanSource, FileCategory, FileFlag } from './types';
import {
  DEFAULT_SCAN_SOURCES,
  categorizeByExtension,
  generateFileEntryId,
  isInstallerFile,
  isTempOrLogFile,
} from './types';
import { storageEvents } from './storageEvents';
import { getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import { RPC_METHODS } from '@avs/shared/rpc';

interface RawFileEntry {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  extension?: string;
  createdDate?: string;
  modifiedDate?: string;
  accessDate?: string;
  owner?: string;
  hash?: string;
}

export class StorageScanner {
  private _sources: ScanSource[];

  constructor(sources?: ScanSource[]) {
    this._sources = sources ? [...sources] : [...DEFAULT_SCAN_SOURCES];
  }

  /**
   * Get the configured scan sources.
   */
  getSources(): ScanSource[] {
    return [...this._sources];
  }

  /**
   * Enable or disable a scan source.
   */
  setSourceEnabled(type: string, enabled: boolean): void {
    const source = this._sources.find((s) => s.type === type);
    if (source) {
      source.enabled = enabled;
    }
  }

  /**
   * Add a custom scan source.
   */
  addSource(source: ScanSource): void {
    if (!this._sources.some((s) => s.type === source.type)) {
      this._sources.push(source);
    }
  }

  /**
   * Scan all enabled sources and return a complete result.
   */
  async scan(): Promise<ScanResult> {
    const enabledSources = this._sources.filter((s) => s.enabled);
    storageEvents.emit('storage_scan_started', { sources: enabledSources });

    const startTime = Date.now();
    const errors: string[] = [];
    const allEntries: FileEntry[] = [];
    let totalFolders = 0;

    if (!isRpcAvailable()) {
      errors.push('RPC bridge is unavailable (outside Electron?)');
      return this._buildResult(allEntries, totalFolders, startTime, enabledSources, errors);
    }

    const rpc = getRpcBridge();
    if (!rpc) {
      errors.push('RPC bridge is null');
      return this._buildResult(allEntries, totalFolders, startTime, enabledSources, errors);
    }

    try {
      // Use disk.analyze RPC to get file entries
      const rawResult = await rpc.call(RPC_METHODS.DISK_ANALYZE, {
        sources: enabledSources.map((s) => ({ type: s.type, path: s.path })),
      }) as { entries?: RawFileEntry[]; errors?: string[] };

      if (rawResult.errors) {
        errors.push(...rawResult.errors);
      }

      if (rawResult.entries) {
        for (const raw of rawResult.entries) {
          const entry = this._convertEntry(raw);
          if (entry) {
            allEntries.push(entry);
            if (entry.isDirectory) {
              totalFolders++;
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Scan failed: ${msg}`);
    }

    const result = this._buildResult(allEntries, totalFolders, startTime, enabledSources, errors);
    storageEvents.emit('storage_scan_completed', { result });
    return result;
  }

  /**
   * Convert a raw RPC file entry to a FileEntry.
   */
  private _convertEntry(raw: RawFileEntry): FileEntry | null {
    if (!raw.path || !raw.name) return null;

    const extension = raw.extension ?? this._extractExtension(raw.name);
    const category: FileCategory = categorizeByExtension(extension);
    const flags: FileFlag[] = this._computeFlags(raw, extension, category);

    return {
      id: generateFileEntryId(raw.path),
      path: raw.path,
      name: raw.name,
      extension,
      size: raw.size ?? 0,
      category,
      createdDate: raw.createdDate ?? new Date().toISOString(),
      modifiedDate: raw.modifiedDate ?? new Date().toISOString(),
      accessDate: raw.accessDate ?? new Date().toISOString(),
      owner: raw.owner ?? null,
      hash: raw.hash ?? null,
      flags,
      isDirectory: raw.isDirectory ?? false,
      parentFolder: this._extractParentFolder(raw.path),
      drive: this._extractDrive(raw.path),
    };
  }

  private _extractExtension(name: string): string {
    const idx = name.lastIndexOf('.');
    if (idx <= 0) return '';
    return name.substring(idx + 1).toLowerCase();
  }

  private _extractParentFolder(path: string): string {
    const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
    if (idx <= 0) return '';
    return path.substring(0, idx);
  }

  private _extractDrive(path: string): string {
    if (path.length >= 2 && path[1] === ':') {
      return path.substring(0, 2).toUpperCase();
    }
    return 'C:';
  }

  private _computeFlags(raw: RawFileEntry, extension: string, category: FileCategory): FileFlag[] {
    const flags: FileFlag[] = [];

    if (raw.size > 100 * 1024 * 1024) flags.push('large');
    if (isInstallerFile(extension)) flags.push('old_installer');
    if (isTempOrLogFile(extension)) flags.push('temporary');
    if (category === 'cache') flags.push('cached');

    // Check if in downloads
    if (raw.path.toLowerCase().includes('download')) flags.push('in_downloads');
    // Check if in recycle bin
    if (raw.path.toLowerCase().includes('recycle') || raw.path.toLowerCase().includes('$recycle')) {
      flags.push('in_recycle_bin');
    }

    // Check if unused (access date older than 90 days)
    if (raw.accessDate) {
      const accessTime = new Date(raw.accessDate).getTime();
      const daysSinceAccess = (Date.now() - accessTime) / (1000 * 60 * 60 * 24);
      if (daysSinceAccess > 90) flags.push('unused');
    }

    return flags;
  }

  private _buildResult(
    entries: FileEntry[],
    totalFolders: number,
    startTime: number,
    sources: ScanSource[],
    errors: string[],
  ): ScanResult {
    const totalFiles = entries.filter((e) => !e.isDirectory).length;
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    return {
      entries,
      totalFiles,
      totalFolders,
      totalSize,
      scanDurationMs: Date.now() - startTime,
      scannedAt: new Date().toISOString(),
      sources,
      errors,
    };
  }
}

export const storageScanner = new StorageScanner();
