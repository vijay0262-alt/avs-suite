/**
 * Storage Index — in-memory index of file entries.
 *
 * Provides efficient querying, filtering, and aggregation.
 * Designed for future persistence (localStorage or IndexedDB).
 *
 * This module does NOT modify any existing architecture.
 */
import type { FileEntry, FileCategory, FileFlag } from './types';

export class StorageIndex {
  private _entries: Map<string, FileEntry> = new Map();
  private _byCategory: Map<FileCategory, FileEntry[]> = new Map();
  private _byExtension: Map<string, FileEntry[]> = new Map();
  private _byDrive: Map<string, FileEntry[]> = new Map();
  private _byFlag: Map<FileFlag, FileEntry[]> = new Map();

  /**
   * Add a single entry to the index.
   */
  add(entry: FileEntry): void {
    if (this._entries.has(entry.id)) return;
    this._entries.set(entry.id, entry);
    this._indexBy(entry, 'category', this._byCategory);
    this._indexBy(entry, 'extension', this._byExtension);
    this._indexBy(entry, 'drive', this._byDrive);
    for (const flag of entry.flags) {
      let set = this._byFlag.get(flag);
      if (!set) {
        set = [];
        this._byFlag.set(flag, set);
      }
      set.push(entry);
    }
  }

  /**
   * Add multiple entries.
   */
  addAll(entries: FileEntry[]): void {
    for (const entry of entries) {
      this.add(entry);
    }
  }

  /**
   * Remove an entry by ID.
   */
  remove(id: string): boolean {
    const entry = this._entries.get(id);
    if (!entry) return false;
    this._entries.delete(id);
    this._removeFromIndex(entry, 'category', this._byCategory);
    this._removeFromIndex(entry, 'extension', this._byExtension);
    this._removeFromIndex(entry, 'drive', this._byDrive);
    for (const flag of entry.flags) {
      const set = this._byFlag.get(flag);
      if (set) {
        const idx = set.indexOf(entry);
        if (idx >= 0) set.splice(idx, 1);
      }
    }
    return true;
  }

  /**
   * Get an entry by ID.
   */
  getById(id: string): FileEntry | null {
    return this._entries.get(id) ?? null;
  }

  /**
   * Get all entries.
   */
  getAll(): FileEntry[] {
    return Array.from(this._entries.values());
  }

  /**
   * Get entries by category.
   */
  getByCategory(category: FileCategory): FileEntry[] {
    return [...(this._byCategory.get(category) ?? [])];
  }

  /**
   * Get entries by extension.
   */
  getByExtension(extension: string): FileEntry[] {
    return [...(this._byExtension.get(extension.toLowerCase()) ?? [])];
  }

  /**
   * Get entries by drive.
   */
  getByDrive(drive: string): FileEntry[] {
    return [...(this._byDrive.get(drive.toUpperCase()) ?? [])];
  }

  /**
   * Get entries by flag.
   */
  getByFlag(flag: FileFlag): FileEntry[] {
    return [...(this._byFlag.get(flag) ?? [])];
  }

  /**
   * Get entries by path prefix.
   */
  getByPathPrefix(prefix: string): FileEntry[] {
    return this.getAll().filter((e) => e.path.toLowerCase().startsWith(prefix.toLowerCase()));
  }

  /**
   * Get files only (not directories).
   */
  getFiles(): FileEntry[] {
    return this.getAll().filter((e) => !e.isDirectory);
  }

  /**
   * Get directories only.
   */
  getDirectories(): FileEntry[] {
    return this.getAll().filter((e) => e.isDirectory);
  }

  /**
   * Get the largest files.
   */
  getLargestFiles(limit: number): FileEntry[] {
    return this.getFiles()
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
  }

  /**
   * Get the smallest files.
   */
  getSmallestFiles(limit: number): FileEntry[] {
    return this.getFiles()
      .sort((a, b) => a.size - b.size)
      .slice(0, limit);
  }

  /**
   * Get total size of all entries.
   */
  getTotalSize(): number {
    return this.getAll().reduce((sum, e) => sum + e.size, 0);
  }

  /**
   * Get total file count.
   */
  getFileCount(): number {
    return this.getFiles().length;
  }

  /**
   * Get total folder count.
   */
  getFolderCount(): number {
    return this.getDirectories().length;
  }

  /**
   * Query entries with a filter function.
   */
  query(filter: (entry: FileEntry) => boolean): FileEntry[] {
    return this.getAll().filter(filter);
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this._entries.clear();
    this._byCategory.clear();
    this._byExtension.clear();
    this._byDrive.clear();
    this._byFlag.clear();
  }

  /**
   * Get the number of entries.
   */
  size(): number {
    return this._entries.size;
  }

  // ── Internal ────────────────────────────────────────────────

  private _indexBy<K extends keyof FileEntry>(
    entry: FileEntry,
    key: K,
    index: Map<FileEntry[K], FileEntry[]>,
  ): void {
    const value = entry[key];
    let set = index.get(value);
    if (!set) {
      set = [];
      index.set(value, set);
    }
    set.push(entry);
  }

  private _removeFromIndex<K extends keyof FileEntry>(
    entry: FileEntry,
    key: K,
    index: Map<FileEntry[K], FileEntry[]>,
  ): void {
    const value = entry[key];
    const set = index.get(value);
    if (set) {
      const idx = set.indexOf(entry);
      if (idx >= 0) set.splice(idx, 1);
    }
  }
}

export const storageIndex = new StorageIndex();
