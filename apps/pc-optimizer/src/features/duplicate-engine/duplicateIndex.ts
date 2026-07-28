/**
 * Duplicate Index — in-memory store for duplicate groups and files.
 *
 * Provides efficient querying, filtering, and CRUD operations.
 *
 * This module does NOT modify any existing architecture.
 */
import type { DuplicateGroup, DuplicateFile } from './types';

export class DuplicateIndex {
  private _groups: Map<string, DuplicateGroup> = new Map();
  private _filesByPath: Map<string, DuplicateFile> = new Map();
  private _filesByGroupId: Map<string, DuplicateFile[]> = new Map();

  addGroup(group: DuplicateGroup): void {
    this._groups.set(group.id, group);
    this._filesByGroupId.set(group.id, [...group.allFiles]);
    for (const file of group.allFiles) {
      this._filesByPath.set(file.path, file);
    }
  }

  addGroups(groups: DuplicateGroup[]): void {
    for (const group of groups) {
      this.addGroup(group);
    }
  }

  getGroupById(id: string): DuplicateGroup | null {
    return this._groups.get(id) ?? null;
  }

  getGroups(): DuplicateGroup[] {
    return Array.from(this._groups.values());
  }

  getFilesByGroupId(groupId: string): DuplicateFile[] {
    return this._filesByGroupId.get(groupId) ?? [];
  }

  getFileByPath(path: string): DuplicateFile | null {
    return this._filesByPath.get(path) ?? null;
  }

  getLargestGroups(limit: number): DuplicateGroup[] {
    return this.getGroups()
      .sort((a, b) => b.wastedSpace - a.wastedSpace)
      .slice(0, limit);
  }

  getGroupsByMinWastedSpace(minBytes: number): DuplicateGroup[] {
    return this.getGroups().filter((g) => g.wastedSpace >= minBytes);
  }

  getGroupsByConfidence(confidence: DuplicateGroup['confidence']): DuplicateGroup[] {
    return this.getGroups().filter((g) => g.confidence === confidence);
  }

  getGroupsByReason(reason: DuplicateGroup['reason']): DuplicateGroup[] {
    return this.getGroups().filter((g) => g.reason === reason);
  }

  getGroupsByExtension(extension: string): DuplicateGroup[] {
    return this.getGroups().filter((g) =>
      g.allFiles.some((f) => f.extension === extension.toLowerCase()),
    );
  }

  getGroupsByDirectory(directory: string): DuplicateGroup[] {
    const lower = directory.toLowerCase();
    return this.getGroups().filter((g) =>
      g.locations.some((loc) => loc.toLowerCase().startsWith(lower)),
    );
  }

  getTotalWastedSpace(): number {
    return this.getGroups().reduce((sum, g) => sum + g.wastedSpace, 0);
  }

  getTotalDuplicateFiles(): number {
    return this.getGroups().reduce((sum, g) => sum + g.duplicateFiles.length, 0);
  }

  getTotalGroups(): number {
    return this._groups.size;
  }

  getAllDuplicateFiles(): DuplicateFile[] {
    const files: DuplicateFile[] = [];
    for (const group of this.getGroups()) {
      files.push(...group.duplicateFiles);
    }
    return files;
  }

  removeGroup(id: string): boolean {
    const group = this._groups.get(id);
    if (!group) return false;
    for (const file of group.allFiles) {
      this._filesByPath.delete(file.path);
    }
    this._filesByGroupId.delete(id);
    return this._groups.delete(id);
  }

  updateFileSelection(fileId: string, selected: boolean): boolean {
    for (const group of this.getGroups()) {
      const file = group.allFiles.find((f) => f.id === fileId);
      if (file) {
        file.isSelected = selected;
        return true;
      }
    }
    return false;
  }

  getSelectedFiles(): DuplicateFile[] {
    return this.getAllDuplicateFiles().filter((f) => f.isSelected);
  }

  clear(): void {
    this._groups.clear();
    this._filesByPath.clear();
    this._filesByGroupId.clear();
  }

  size(): number {
    return this._groups.size;
  }

  loadFromScanResult(result: { groups: DuplicateGroup[] }): void {
    this.clear();
    this.addGroups(result.groups);
  }
}

export const duplicateIndex = new DuplicateIndex();
