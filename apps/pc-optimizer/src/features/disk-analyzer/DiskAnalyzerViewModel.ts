/**
 * Disk Analyzer ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { DiskAnalyzerState } from './disk-analyzer.types';
import type { IDiskAnalyzerService } from './disk-analyzer.service';
import { diskAnalyzerService } from './disk-analyzer.service';

export class DiskAnalyzerViewModel extends ViewModel<DiskAnalyzerState> {
  constructor(private service: IDiskAnalyzerService = diskAnalyzerService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      analysisResult: null,
      analyzing: false,
      directory: '',
      maxDepth: 2,
      drives: [],
      selectedDrives: [],
      customDirectory: '',
      selectedFiles: new Set<string>(),
      expandedCategory: null,
      deleting: false,
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

  async analyze(maxDepth?: number) {
    const directory = this.state.customDirectory || this.state.selectedDrives[0] || undefined;
    this.setState({ analyzing: true, analysisResult: null, selectedFiles: new Set(), deleteResult: null });
    try {
      const result = await this.service.analyze(directory, maxDepth);
      this.setState({ 
        analysisResult: result, 
        analyzing: false,
        directory: result.rootPath,
        maxDepth: maxDepth || 2,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to analyze disk';
      this.setState({ bootstrap: 'error', bootstrapError: error, analyzing: false });
      throw err;
    }
  }

  async deleteSelectedFiles() {
    const files = Array.from(this.state.selectedFiles);
    if (files.length === 0) return;
    this.setState({ deleting: true, deleteResult: null });
    try {
      const result = await this.service.deleteFiles(files);
      this.setState({ deleting: false, deleteResult: result });
      // Clear selection after deletion
      this.setState({ selectedFiles: new Set() });
      // Re-analyze to refresh the file list
      await this.analyze(this.state.maxDepth);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to delete files';
      this.setState({ deleting: false, bootstrapError: error });
    }
  }

  toggleDrive(mountpoint: string) {
    const selected = new Set(this.state.selectedDrives);
    if (selected.has(mountpoint)) {
      selected.delete(mountpoint);
    } else {
      selected.add(mountpoint);
    }
    this.setState({ selectedDrives: Array.from(selected) });
  }

  setCustomDirectory(directory: string) {
    this.setState({ customDirectory: directory });
  }

  toggleFileSelection(filePath: string) {
    const selected = new Set(this.state.selectedFiles);
    if (selected.has(filePath)) {
      selected.delete(filePath);
    } else {
      selected.add(filePath);
    }
    this.setState({ selectedFiles: selected });
  }

  toggleCategory(category: string) {
    this.setState({
      expandedCategory: this.state.expandedCategory === category ? null : category,
    });
  }

  selectAllInCategory(category: string, select: boolean) {
    const selected = new Set(this.state.selectedFiles);
    const files = this.state.analysisResult?.categorizedFiles[category] || [];
    if (select) {
      for (const f of files) {
        selected.add(f.path);
      }
    } else {
      for (const f of files) {
        selected.delete(f.path);
      }
    }
    this.setState({ selectedFiles: selected });
  }

  clearSelection() {
    this.setState({ selectedFiles: new Set(), deleteResult: null });
  }

  getSelectedFilesSize(): number {
    if (!this.state.analysisResult) return 0;
    let total = 0;
    for (const [, files] of Object.entries(this.state.analysisResult.categorizedFiles)) {
      for (const f of files) {
        if (this.state.selectedFiles.has(f.path)) {
          total += f.size;
        }
      }
    }
    return total;
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  getExtensionLabel(ext: string): string {
    if (ext === 'no_extension') return 'No Extension';
    return ext.toUpperCase().replace('.', '');
  }
}
