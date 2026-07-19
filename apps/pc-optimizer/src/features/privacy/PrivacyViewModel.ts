/**
 * Privacy Cleaner ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { PrivacyItem, PrivacyScanResult, PrivacyCleanResult } from './privacy.types';
import type { IPrivacyService } from './privacy.service';
import { privacyService } from './privacy.service';

export interface PrivacyState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  scanResult: PrivacyScanResult | null;
  scanning: boolean;
  cleaning: boolean;
  selectedCategories: Set<string>;
  browsersDetected: string[];
  cleanResult: PrivacyCleanResult | null;
}

const ALL_CATEGORIES = [
  'windows_temp',
  'recent_files',
  'thumbnail_cache',
  'clipboard_history',
  'dns_cache',
  'run_history',
  'recent_documents',
  'recycle_bin',
  'chrome_history',
  'chrome_downloads',
  'chrome_cache',
  'chrome_session',
  'chrome_temp',
  'chrome_site_storage',
  'edge_history',
  'edge_downloads',
  'edge_cache',
  'edge_session',
  'edge_temp',
  'edge_site_storage',
  'firefox_history',
  'firefox_downloads',
  'firefox_cache',
  'firefox_session',
  'firefox_temp',
  'firefox_site_storage',
];

export class PrivacyViewModel extends ViewModel<PrivacyState> {
  constructor(private service: IPrivacyService = privacyService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      scanResult: null,
      scanning: false,
      cleaning: false,
      selectedCategories: new Set(ALL_CATEGORIES),
      browsersDetected: [],
      cleanResult: null,
    });
  }

  async bootstrap() {
    this.setState({ bootstrap: 'loading', bootstrapError: null });
    try {
      const browsers = await this.service.detectBrowsers();
      this.setState({ 
        browsersDetected: browsers.browsers,
        bootstrap: 'ready' 
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to detect browsers';
      this.setState({ bootstrap: 'error', bootstrapError: error });
      throw err;
    }
  }

  async scan() {
    this.setState({ scanning: true, scanResult: null });
    try {
      const categories = Array.from(this.state.selectedCategories);
      const result = await this.service.scan(categories);
      this.setState({ scanResult: result, scanning: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to scan';
      this.setState({ bootstrap: 'error', bootstrapError: error, scanning: false });
      throw err;
    }
  }

  async clean() {
    if (!this.state.scanResult) {
      return;
    }

    this.setState({ cleaning: true, cleanResult: null });
    try {
      const result = await this.service.clean(this.state.scanResult.items);
      this.setState({ cleanResult: result, cleaning: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to clean';
      this.setState({ bootstrap: 'error', bootstrapError: error, cleaning: false });
      throw err;
    }
  }

  toggleCategory(category: string) {
    const newSelected = new Set(this.state.selectedCategories);
    if (newSelected.has(category)) {
      newSelected.delete(category);
    } else {
      newSelected.add(category);
    }
    this.setState({ selectedCategories: newSelected });
  }

  selectAllCategories() {
    this.setState({ selectedCategories: new Set(ALL_CATEGORIES) });
  }

  deselectAllCategories() {
    this.setState({ selectedCategories: new Set() });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}
