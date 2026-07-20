/**
 * Privacy Cleaner service
 */

import type { PrivacyItem, PrivacyScanResult, PrivacyCleanResult } from './privacy.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IPrivacyService {
  scan(categories?: string[]): Promise<PrivacyScanResult>;
  clean(items: PrivacyItem[]): Promise<PrivacyCleanResult>;
  detectBrowsers(): Promise<{ browsers: string[] }>;
}

class PrivacyService implements IPrivacyService {
  private browserCache: { browsers: string[]; timestamp: number } | null = null;
  private readonly BROWSER_CACHE_TTL_MS = 60_000;

  async scan(categories?: string[]): Promise<PrivacyScanResult> {
    const params = categories ? { categories } : undefined;
    return await client().call('privacy.scan', params);
  }

  async clean(items: PrivacyItem[]): Promise<PrivacyCleanResult> {
    return await client().call('privacy.clean', { items });
  }

  async detectBrowsers(): Promise<{ browsers: string[] }> {
    const now = Date.now();
    if (this.browserCache && now - this.browserCache.timestamp < this.BROWSER_CACHE_TTL_MS) {
      return { browsers: this.browserCache.browsers };
    }
    const result = (await client().call('privacy.detectBrowsers')) as { browsers: string[] };
    this.browserCache = { browsers: result.browsers, timestamp: now };
    return result;
  }
}

export const privacyService = new PrivacyService();
