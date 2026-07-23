/**
 * Privacy Cleaner ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { PrivacyScanResult, PrivacyCleanResult } from './privacy.types';
import type { IPrivacyService } from './privacy.service';
import { privacyService } from './privacy.service';
import { optimizationEventBus } from '../health';

export interface PrivacyState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  scanResult: PrivacyScanResult | null;
  scanning: boolean;
  cleaning: boolean;
  selectedCategories: Set<string>;
  browsersDetected: string[];
  browsersLoading: boolean;
  browsersError: string | null;
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
  'brave_history',
  'brave_downloads',
  'brave_cache',
  'brave_session',
  'brave_temp',
  'brave_site_storage',
  'opera_history',
  'opera_downloads',
  'opera_cache',
  'opera_session',
  'opera_temp',
  'opera_site_storage',
  'vivaldi_history',
  'vivaldi_downloads',
  'vivaldi_cache',
  'vivaldi_session',
  'vivaldi_temp',
  'vivaldi_site_storage',
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
      browsersLoading: false,
      browsersError: null,
      cleanResult: null,
    });
  }

  async bootstrap() {
    // Render the shell instantly; detect browsers in the background.
    this.setState({
      bootstrap: 'ready',
      bootstrapError: null,
      browsersLoading: true,
      browsersError: null,
    });
    void this.loadBrowsers();
  }

  private async loadBrowsers(): Promise<void> {
    try {
      const browsers = await this.service.detectBrowsers();
      this.setState({ browsersDetected: browsers.browsers, browsersLoading: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to detect browsers';
      this.setState({ browsersLoading: false, browsersError: error });
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
      // Emit optimization event so Dashboard refreshes health score
      optimizationEventBus.emit({
        moduleId: 'privacy',
        action: 'clean',
        bytesRecovered: result.spaceFreed,
        itemsProcessed: result.itemsCleaned,
        timestamp: Date.now(),
      });
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
