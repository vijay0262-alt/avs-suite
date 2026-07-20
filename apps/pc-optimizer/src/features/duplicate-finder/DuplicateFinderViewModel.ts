/**
 * Duplicate Finder ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { DuplicateScanResult, DuplicateDeleteResult, DuplicateFile, DriveInfo } from './duplicate-finder.types';
import type { IDuplicateFinderService } from './duplicate-finder.service';
import { duplicateFinderService } from './duplicate-finder.service';

export interface DuplicateFinderState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  scanResult: DuplicateScanResult | null;
  scanning: boolean;
  deleting: boolean;
  selectedFiles: Set<string>;
  directories: string[];
  drives: DriveInfo[];
  selectedDrive: string | null;
  customDirectories: string;
  deleteResult: DuplicateDeleteResult | null;
}

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

  async scan(directories?: string[], excludeDirs?: string[], minFileSize?: number) {
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
        const directories = this.state.selectedDrive ? [this.state.selectedDrive] : undefined;
        await this.scan(directories);
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
    this.setState({ selectedDrive: drive, customDirectories: '' });
  }

  setCustomDirectories(value: string) {
    this.setState({ customDirectories: value, selectedDrive: null });
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
