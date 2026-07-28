/**
 * Browser Repository — in-memory store for browser and profile data.
 *
 * Provides efficient querying, filtering, and CRUD operations.
 * Designed for future persistence.
 *
 * This module does NOT modify any existing architecture.
 */
import type { BrowserInfo, BrowserProfile, BrowserType } from './types';

export class BrowserRepository {
  private _browsers: Map<string, BrowserInfo> = new Map();
  private _profiles: Map<string, BrowserProfile> = new Map();
  private _profilesByBrowser: Map<string, string[]> = new Map();

  addBrowser(browser: BrowserInfo): void {
    this._browsers.set(browser.id, browser);
    if (!this._profilesByBrowser.has(browser.id)) {
      this._profilesByBrowser.set(browser.id, []);
    }
  }

  addProfile(profile: BrowserProfile): void {
    this._profiles.set(profile.id, profile);
    let list = this._profilesByBrowser.get(profile.browserId);
    if (!list) {
      list = [];
      this._profilesByBrowser.set(profile.browserId, list);
    }
    if (!list.includes(profile.id)) {
      list.push(profile.id);
    }
  }

  getBrowserById(id: string): BrowserInfo | null {
    return this._browsers.get(id) ?? null;
  }

  getProfileById(id: string): BrowserProfile | null {
    return this._profiles.get(id) ?? null;
  }

  getAllBrowsers(): BrowserInfo[] {
    return Array.from(this._browsers.values());
  }

  getAllProfiles(): BrowserProfile[] {
    return Array.from(this._profiles.values());
  }

  getProfilesByBrowser(browserId: string): BrowserProfile[] {
    const ids = this._profilesByBrowser.get(browserId) ?? [];
    return ids.map((id) => this._profiles.get(id)).filter((p): p is BrowserProfile => p !== null);
  }

  getInstalledBrowsers(): BrowserInfo[] {
    return this.getAllBrowsers().filter((b) => b.isInstalled);
  }

  getDefaultBrowser(): BrowserInfo | null {
    return this.getAllBrowsers().find((b) => b.isDefault) ?? null;
  }

  getBrowsersByType(type: BrowserType): BrowserInfo[] {
    return this.getAllBrowsers().filter((b) => b.type === type);
  }

  getActiveProfiles(): BrowserProfile[] {
    return this.getAllProfiles().filter((p) => p.isActive);
  }

  getUnusedProfiles(thresholdDays: number): BrowserProfile[] {
    const now = Date.now();
    const threshold = thresholdDays * 24 * 60 * 60 * 1000;
    return this.getAllProfiles().filter((p) => {
      if (!p.lastUsed) return true;
      return now - new Date(p.lastUsed).getTime() > threshold;
    });
  }

  removeBrowser(id: string): boolean {
    const profileIds = this._profilesByBrowser.get(id) ?? [];
    for (const pid of profileIds) {
      this._profiles.delete(pid);
    }
    this._profilesByBrowser.delete(id);
    return this._browsers.delete(id);
  }

  removeProfile(id: string): boolean {
    const profile = this._profiles.get(id);
    if (profile) {
      const list = this._profilesByBrowser.get(profile.browserId);
      if (list) {
        const idx = list.indexOf(id);
        if (idx >= 0) list.splice(idx, 1);
      }
    }
    return this._profiles.delete(id);
  }

  clear(): void {
    this._browsers.clear();
    this._profiles.clear();
    this._profilesByBrowser.clear();
  }

  browserCount(): number {
    return this._browsers.size;
  }

  profileCount(): number {
    return this._profiles.size;
  }

  loadFromScanResult(result: { browsers: BrowserInfo[]; profiles: BrowserProfile[] }): void {
    this.clear();
    for (const b of result.browsers) this.addBrowser(b);
    for (const p of result.profiles) this.addProfile(p);
  }
}

export const browserRepository = new BrowserRepository();
