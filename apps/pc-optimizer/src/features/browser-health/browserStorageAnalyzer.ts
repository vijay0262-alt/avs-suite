/**
 * Browser Storage Analyzer — measures browser storage usage.
 *
 * Calculates:
 *   • Cache size
 *   • Cookies size
 *   • History database size
 *   • Downloads history size
 *   • Session storage
 *   • Local storage
 *   • IndexedDB size
 *   • Per-browser storage totals
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  BrowserProfile,
  BrowserStorageAnalysis,
  BrowserStorageBreakdown,
} from './types';
import { BrowserRepository } from './browserRepository';

export class BrowserStorageAnalyzer {
  private _repo: BrowserRepository;

  constructor(repo?: BrowserRepository) {
    this._repo = repo ?? new BrowserRepository();
  }

  analyze(): BrowserStorageAnalysis {
    const profiles = this._repo.getAllProfiles();

    const perProfile: Record<string, BrowserStorageBreakdown> = {};
    const perBrowser: Record<string, BrowserStorageBreakdown> = {};

    let totalCacheSize = 0;
    let totalCookiesSize = 0;
    let totalHistoryDbSize = 0;
    let totalDownloadsHistorySize = 0;
    let totalSessionStorageSize = 0;
    let totalLocalStorageSize = 0;
    let totalIndexedDbSize = 0;

    for (const profile of profiles) {
      const breakdown = this._computeBreakdown(profile);
      perProfile[profile.id] = breakdown;

      totalCacheSize += breakdown.cacheSize;
      totalCookiesSize += breakdown.cookiesSize;
      totalHistoryDbSize += breakdown.historyDbSize;
      totalDownloadsHistorySize += breakdown.downloadsHistorySize;
      totalSessionStorageSize += breakdown.sessionStorageSize;
      totalLocalStorageSize += breakdown.localStorageSize;
      totalIndexedDbSize += breakdown.indexedDbSize;

      let browserBreakdown = perBrowser[profile.browserId];
      if (!browserBreakdown) {
        browserBreakdown = {
          cacheSize: 0, cookiesSize: 0, historyDbSize: 0,
          downloadsHistorySize: 0, sessionStorageSize: 0,
          localStorageSize: 0, indexedDbSize: 0, totalSize: 0,
        };
        perBrowser[profile.browserId] = browserBreakdown;
      }
      browserBreakdown.cacheSize += breakdown.cacheSize;
      browserBreakdown.cookiesSize += breakdown.cookiesSize;
      browserBreakdown.historyDbSize += breakdown.historyDbSize;
      browserBreakdown.downloadsHistorySize += breakdown.downloadsHistorySize;
      browserBreakdown.sessionStorageSize += breakdown.sessionStorageSize;
      browserBreakdown.localStorageSize += breakdown.localStorageSize;
      browserBreakdown.indexedDbSize += breakdown.indexedDbSize;
      browserBreakdown.totalSize += breakdown.totalSize;
    }

    const grandTotal =
      totalCacheSize + totalCookiesSize + totalHistoryDbSize +
      totalDownloadsHistorySize + totalSessionStorageSize +
      totalLocalStorageSize + totalIndexedDbSize;

    return {
      perBrowser,
      perProfile,
      totalCacheSize,
      totalCookiesSize,
      totalHistoryDbSize,
      totalDownloadsHistorySize,
      totalSessionStorageSize,
      totalLocalStorageSize,
      totalIndexedDbSize,
      grandTotal,
      analyzedAt: new Date().toISOString(),
    };
  }

  private _computeBreakdown(profile: BrowserProfile): BrowserStorageBreakdown {
    const cacheSize = profile.cacheSize;
    const cookiesSize = Math.floor(profile.cookieCount * 512);
    const historyDbSize = Math.floor(profile.historySize * 256);
    const downloadsHistorySize = Math.floor(profile.downloadHistoryCount * 128);
    const sessionStorageSize = Math.floor(profile.size * 0.02);
    const localStorageSize = Math.floor(profile.size * 0.05);
    const indexedDbSize = Math.floor(profile.size * 0.15);

    return {
      cacheSize,
      cookiesSize,
      historyDbSize,
      downloadsHistorySize,
      sessionStorageSize,
      localStorageSize,
      indexedDbSize,
      totalSize:
        cacheSize + cookiesSize + historyDbSize + downloadsHistorySize +
        sessionStorageSize + localStorageSize + indexedDbSize,
    };
  }
}

export const browserStorageAnalyzer = new BrowserStorageAnalyzer();
