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
  async scan(categories?: string[]): Promise<PrivacyScanResult> {
    const params = categories ? { categories } : undefined;
    return await client().call('privacy.scan', params);
  }

  async clean(items: PrivacyItem[]): Promise<PrivacyCleanResult> {
    return await client().call('privacy.clean', { items });
  }

  async detectBrowsers(): Promise<{ browsers: string[] }> {
    return await client().call('privacy.detectBrowsers');
  }
}

export const privacyService = new PrivacyService();
