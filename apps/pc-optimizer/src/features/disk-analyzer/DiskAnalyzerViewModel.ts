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
    this.setState({ analyzing: true, analysisResult: null });
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
