/**
 * Duplicate Finder ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { DuplicateFile, DuplicateScope, DuplicateFinderState } from './duplicate-finder.types';
import type { IDuplicateFinderService } from './duplicate-finder.service';
import { duplicateFinderService } from './duplicate-finder.service';

export class DuplicateFinderViewModel extends ViewModel<DuplicateFinderState> {
  constructor(private service: IDuplicateFinderService = duplicateFinderService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      scanResult: null,
      scanning: false,
      deleting: false,
      selectedFiles: new Set(),
      directories: [],
      drives: [],
      selectedDrive: null,
      customDirectories: '',
      deleteResult: null,
      scope: 'entire',
      estimate: null,
      estimateLoading: false,
    });
  }

  async bootstrap() {
    this.setState({ bootstrap: 'loading', bootstrapError: null });
    try {
      await this.loadDrives();
      this.setState({ bootstrap: 'ready' });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to initialize';
      this.setState({ bootstrap: 'error', bootstrapError: error });
      throw err;
    }
  }

  async loadDrives() {
    try {
      const drives = await this.service.listDrives();
      this.setState({ drives });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load drives';
      this.setState({ bootstrap: 'error', bootstrapError: error });
      throw err;
    }
  }

  getScanDirectories(): string[] | undefined {
    if (this.state.scope === 'custom') {
      const dirs = this.state.customDirectories
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d);
      return dirs.length ? dirs : undefined;
    }
    if (this.state.scope === 'entire' && this.state.selectedDrive) {
      return [this.state.selectedDrive];
    }
    return undefined;
  }

  async scan(excludeDirs?: string[], minFileSize?: number) {
    const directories = this.getScanDirectories();
    this.setState({ scanning: true, scanResult: null, selectedFiles: new Set(), deleteResult: null });
    try {
      const result = await this.service.scan(directories, excludeDirs, minFileSize);
      this.setState({ scanResult: result, directories: result.scannedDirectories, scanning: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to scan for duplicates';
      this.setState({ bootstrap: 'error', bootstrapError: error, scanning: false });
      throw err;
    }
  }

  async delete() {
    if (!this.state.scanResult) {
      return;
    }

    this.setState({ deleting: true, deleteResult: null });
    try {
      const filesToDelete = this.getFilesToDelete();
      const result = await this.service.delete(filesToDelete);
      this.setState({ deleteResult: result, deleting: false });
      
      // Re-scan after deletion
      if (result.deletedCount > 0) {
        await this.scan();
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to delete files';
      this.setState({ bootstrap: 'error', bootstrapError: error, deleting: false });
      throw err;
    }
  }

  toggleFileSelection(filePath: string) {
    const newSelected = new Set(this.state.selectedFiles);
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath);
    } else {
      newSelected.add(filePath);
    }
    this.setState({ selectedFiles: newSelected });
  }

  selectAllFiles() {
    if (!this.state.scanResult) {
      return;
    }
    
    const allFiles = new Set<string>();
    for (const group of this.state.scanResult.groups) {
      // Keep the first file in each group (the original), select the rest
      for (let i = 1; i < group.files.length; i++) {
        const file = group.files[i];
        if (file && file.path) {
          allFiles.add(file.path);
        }
      }
    }
    this.setState({ selectedFiles: allFiles });
  }

  deselectAllFiles() {
    this.setState({ selectedFiles: new Set() });
  }

  selectGroupFiles(groupIndex: number) {
    if (!this.state.scanResult) {
      return;
    }
    
    const group = this.state.scanResult.groups[groupIndex];
    if (!group) {
      return;
    }
    
    const newSelected = new Set(this.state.selectedFiles);
    
    // Keep the first file (the original), select the rest
    for (let i = 1; i < group.files.length; i++) {
      const file = group.files[i];
      if (file && file.path) {
        newSelected.add(file.path);
      }
    }
    
    this.setState({ selectedFiles: newSelected });
  }

  selectDrive(drive: string) {
    this.setState({ selectedDrive: drive, customDirectories: '', scope: 'entire' });
    void this.estimate();
  }

  setCustomDirectories(value: string) {
    this.setState({ customDirectories: value, selectedDrive: null, scope: 'custom' });
    void this.estimate();
  }

  setScope(scope: DuplicateScope) {
    this.setState({ scope });
    void this.estimate();
  }

  async estimate() {
    const directories = this.getScanDirectories();
    this.setState({ estimateLoading: true, estimate: null });
    try {
      const estimate = await this.service.estimate(this.state.scope, directories);
      this.setState({ estimate, estimateLoading: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to estimate files';
      this.setState({ estimateLoading: false, estimate: null });
      console.error('Estimate failed:', error);
    }
  }

  getFilesToDelete(): DuplicateFile[] {
    if (!this.state.scanResult) {
      return [];
    }
    
    const filesToDelete: DuplicateFile[] = [];
    for (const group of this.state.scanResult.groups) {
      for (const file of group.files) {
        if (this.state.selectedFiles.has(file.path)) {
          filesToDelete.push(file);
        }
      }
    }
    return filesToDelete;
  }

  getSelectedCount(): number {
    return this.state.selectedFiles.size;
  }

  getSelectedSize(): number {
    if (!this.state.scanResult) {
      return 0;
    }
    
    let totalSize = 0;
    for (const group of this.state.scanResult.groups) {
      for (const file of group.files) {
        if (this.state.selectedFiles.has(file.path)) {
          totalSize += file.size;
        }
      }
    }
    return totalSize;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}
