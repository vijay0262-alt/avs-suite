/**
 * Tests for Browser Health & Privacy Platform (Phase 3.6).
 *
 * Covers:
 * - Helper functions: formatBytes, daysSince, generateBrowserId, generateProfileId
 * - Scanner: definitions, custom registration, scan with RPC unavailable
 * - Repository: add/remove browsers/profiles, query, filter, unused profiles
 * - Privacy Analyzer: tracking cookies, history age, notifications, suspicious extensions
 * - Storage Analyzer: cache, cookies, history DB, downloads, session/local/IndexedDB
 * - Browser Analyzer: health/performance/privacy/storage/security scores, issues
 * - Recommendation Engine: 8 recommendation types, filter, sort, recovery
 * - Execution Task: validate, config, safety checks, estimateDuration
 * - Browser History: record, rollback, totals, filter
 * - Health Integration: browser + privacy contributions
 * - Events: emit, subscribe, listener count
 * - Regression: all exports, task registered, no forbidden modifications
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  BrowserInfo,
  BrowserProfile,
  BrowserHealthResult,
  PrivacyAnalysis,
  BrowserStorageAnalysis,
} from '../types';
import {
  formatBytes,
  daysSince,
  generateBrowserId,
  generateProfileId,
  getBrowserDefinition,
  BROWSER_DEFINITIONS,
  LARGE_CACHE_THRESHOLD,
  EXCESSIVE_COOKIE_THRESHOLD,
} from '../types';
import { BrowserScanner } from '../browserScanner';
import { BrowserRepository } from '../browserRepository';
import { PrivacyAnalyzer } from '../privacyAnalyzer';
import { BrowserStorageAnalyzer } from '../browserStorageAnalyzer';
import { BrowserAnalyzer } from '../browserAnalyzer';
import { BrowserRecommendationEngine } from '../browserRecommendationEngine';
import { BrowserExecutionTask, BROWSER_TASK_ID } from '../browserExecutionTask';
import { BrowserHistory } from '../browserHistory';
import { BrowserHealthIntegration } from '../browserHealthIntegration';
import { BrowserEventEmitter } from '../browserEvents';
import { isTaskRegistered } from '../../maintenance-engine/tasks/index';

// ── Test Helpers ──────────────────────────────────────────────

function makeBrowser(overrides: Partial<BrowserInfo> = {}): BrowserInfo {
  return {
    id: generateBrowserId('chrome'),
    type: 'chrome',
    name: 'Google Chrome',
    version: '120.0',
    installPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    isDefault: true,
    isInstalled: true,
    lastUsed: new Date().toISOString(),
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<BrowserProfile> = {}): BrowserProfile {
  return {
    id: generateProfileId(generateBrowserId('chrome'), 'Default'),
    browserId: generateBrowserId('chrome'),
    name: 'Default',
    path: 'C:\\Users\\Test\\AppData\\Local\\Google\\Chrome\\User Data\\Default',
    size: 100 * 1024 * 1024,
    lastUsed: new Date().toISOString(),
    isActive: true,
    extensionCount: 5,
    extensions: [],
    bookmarkCount: 100,
    historySize: 500,
    cookieCount: 200,
    cacheSize: 50 * 1024 * 1024,
    downloadHistoryCount: 30,
    savedPasswordCount: 10,
    autofillEntryCount: 15,
    notificationPermissions: [],
    ...overrides,
  };
}

function makeHealthResult(overrides: Partial<BrowserHealthResult> = {}): BrowserHealthResult {
  return {
    overallScore: 80,
    performanceScore: 85,
    privacyScore: 70,
    storageScore: 75,
    securityScore: 90,
    issues: [],
    insights: ['Found 1 browsers with 1 profiles.'],
    browserCount: 1,
    totalStorageUsed: 100 * 1024 * 1024,
    totalRecoverableSpace: 50 * 1024 * 1024,
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePrivacyAnalysis(overrides: Partial<PrivacyAnalysis> = {}): PrivacyAnalysis {
  return {
    score: 75,
    issues: [],
    insights: ['Privacy is adequate.'],
    recommendations: ['Privacy settings are adequate.'],
    trackingCookieCount: 30,
    thirdPartyCookieCount: 100,
    totalCookieCount: 200,
    historyAgeDays: 10,
    downloadHistoryCount: 30,
    notificationPermissionCount: 5,
    suspiciousExtensionCount: 0,
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeStorageAnalysis(overrides: Partial<BrowserStorageAnalysis> = {}): BrowserStorageAnalysis {
  return {
    perBrowser: {},
    perProfile: {},
    totalCacheSize: 50 * 1024 * 1024,
    totalCookiesSize: 200 * 512,
    totalHistoryDbSize: 500 * 256,
    totalDownloadsHistorySize: 30 * 128,
    totalSessionStorageSize: 2 * 1024 * 1024,
    totalLocalStorageSize: 5 * 1024 * 1024,
    totalIndexedDbSize: 15 * 1024 * 1024,
    grandTotal: 72 * 1024 * 1024 + 200 * 512 + 500 * 256 + 30 * 128,
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Helper Function Tests ─────────────────────────────────────

describe('Helper Functions', () => {
  it('formatBytes formats correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('daysSince computes days from date', () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(old)).toBe(10);
  });

  it('daysSince returns Infinity for null', () => {
    expect(daysSince(null)).toBe(Infinity);
  });

  it('generateBrowserId produces consistent IDs', () => {
    expect(generateBrowserId('chrome')).toBe('browser-chrome');
    expect(generateBrowserId('edge')).toBe('browser-edge');
  });

  it('generateProfileId produces consistent IDs', () => {
    const id = generateProfileId('browser-chrome', 'Default');
    expect(id).toBe('profile-browser-chrome-Default');
  });

  it('getBrowserDefinition returns definition for known types', () => {
    expect(getBrowserDefinition('chrome')?.displayName).toBe('Google Chrome');
    expect(getBrowserDefinition('edge')?.displayName).toBe('Microsoft Edge');
    expect(getBrowserDefinition('firefox')?.displayName).toBe('Mozilla Firefox');
    expect(getBrowserDefinition('brave')?.displayName).toBe('Brave');
    expect(getBrowserDefinition('opera')?.displayName).toBe('Opera');
  });

  it('getBrowserDefinition returns null for unknown type', () => {
    expect(getBrowserDefinition('custom')).toBeNull();
  });

  it('BROWSER_DEFINITIONS has 5 built-in browsers', () => {
    expect(BROWSER_DEFINITIONS.length).toBe(5);
  });

  it('LARGE_CACHE_THRESHOLD is 200MB', () => {
    expect(LARGE_CACHE_THRESHOLD).toBe(200 * 1024 * 1024);
  });

  it('EXCESSIVE_COOKIE_THRESHOLD is 500', () => {
    expect(EXCESSIVE_COOKIE_THRESHOLD).toBe(500);
  });
});

// ── Scanner Tests ─────────────────────────────────────────────

describe('BrowserScanner', () => {
  let scanner: BrowserScanner;

  beforeEach(() => {
    scanner = new BrowserScanner();
  });

  it('has built-in browser definitions', () => {
    expect(scanner.getAllDefinitions().length).toBeGreaterThanOrEqual(5);
  });

  it('registerBrowser adds custom definition', () => {
    scanner.registerBrowser({
      type: 'vivaldi',
      displayName: 'Vivaldi',
      windowsInstallPaths: ['C:\\Program Files\\Vivaldi\\Application\\vivaldi.exe'],
      macInstallPaths: ['/Applications/Vivaldi.app'],
      linuxInstallPaths: ['/usr/bin/vivaldi'],
      profilePathPatterns: ['%LOCALAPPDATA%\\Vivaldi\\User Data'],
      executableNames: ['vivaldi.exe', 'vivaldi'],
    });
    expect(scanner.getAllDefinitions().some((d) => d.type === 'vivaldi')).toBe(true);
  });

  it('scan returns errors when RPC unavailable', async () => {
    const result = await scanner.scan();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.browsers).toEqual([]);
  });
});

// ── Repository Tests ──────────────────────────────────────────

describe('BrowserRepository', () => {
  let repo: BrowserRepository;

  beforeEach(() => {
    repo = new BrowserRepository();
  });

  it('adds and retrieves browsers', () => {
    const browser = makeBrowser();
    repo.addBrowser(browser);
    expect(repo.getBrowserById(browser.id)).toEqual(browser);
    expect(repo.browserCount()).toBe(1);
  });

  it('adds and retrieves profiles', () => {
    const browser = makeBrowser();
    const profile = makeProfile();
    repo.addBrowser(browser);
    repo.addProfile(profile);
    expect(repo.getProfileById(profile.id)).toEqual(profile);
    expect(repo.profileCount()).toBe(1);
  });

  it('getProfilesByBrowser returns profiles for a browser', () => {
    const browser = makeBrowser();
    const profile = makeProfile();
    repo.addBrowser(browser);
    repo.addProfile(profile);
    const profiles = repo.getProfilesByBrowser(browser.id);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.id).toBe(profile.id);
  });

  it('getInstalledBrowsers filters by isInstalled', () => {
    repo.addBrowser(makeBrowser({ id: 'b1', isInstalled: true }));
    repo.addBrowser(makeBrowser({ id: 'b2', isInstalled: false }));
    expect(repo.getInstalledBrowsers()).toHaveLength(1);
  });

  it('getDefaultBrowser returns default browser', () => {
    repo.addBrowser(makeBrowser({ id: 'b1', isDefault: false }));
    repo.addBrowser(makeBrowser({ id: 'b2', isDefault: true }));
    const def = repo.getDefaultBrowser();
    expect(def?.id).toBe('b2');
  });

  it('getBrowsersByType filters by type', () => {
    repo.addBrowser(makeBrowser({ id: 'b1', type: 'chrome' }));
    repo.addBrowser(makeBrowser({ id: 'b2', type: 'edge' }));
    expect(repo.getBrowsersByType('chrome')).toHaveLength(1);
  });

  it('getUnusedProfiles filters by lastUsed', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ id: 'p1', lastUsed: old }));
    repo.addProfile(makeProfile({ id: 'p2', lastUsed: new Date().toISOString() }));
    expect(repo.getUnusedProfiles(30)).toHaveLength(1);
  });

  it('removeBrowser removes browser and its profiles', () => {
    const browser = makeBrowser();
    const profile = makeProfile();
    repo.addBrowser(browser);
    repo.addProfile(profile);
    repo.removeBrowser(browser.id);
    expect(repo.getBrowserById(browser.id)).toBeNull();
    expect(repo.getProfileById(profile.id)).toBeNull();
  });

  it('removeProfile removes profile only', () => {
    const browser = makeBrowser();
    const profile = makeProfile();
    repo.addBrowser(browser);
    repo.addProfile(profile);
    repo.removeProfile(profile.id);
    expect(repo.getProfileById(profile.id)).toBeNull();
    expect(repo.getBrowserById(browser.id)).not.toBeNull();
  });

  it('clear removes everything', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile());
    repo.clear();
    expect(repo.browserCount()).toBe(0);
    expect(repo.profileCount()).toBe(0);
  });

  it('loadFromScanResult populates from scan data', () => {
    const browsers = [makeBrowser()];
    const profiles = [makeProfile()];
    repo.loadFromScanResult({ browsers, profiles });
    expect(repo.browserCount()).toBe(1);
    expect(repo.profileCount()).toBe(1);
  });
});

// ── Privacy Analyzer Tests ────────────────────────────────────

describe('PrivacyAnalyzer', () => {
  let repo: BrowserRepository;
  let analyzer: PrivacyAnalyzer;

  beforeEach(() => {
    repo = new BrowserRepository();
    analyzer = new PrivacyAnalyzer(repo);
  });

  it('computes privacy score', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ cookieCount: 100 }));
    const result = analyzer.analyze();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('detects excessive tracking cookies', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ cookieCount: 1000 }));
    const result = analyzer.analyze();
    expect(result.trackingCookieCount).toBeGreaterThan(50);
    expect(result.issues.some((i) => i.title === 'Excessive tracking cookies')).toBe(true);
  });

  it('detects old browsing history', () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ lastUsed: old }));
    const result = analyzer.analyze();
    expect(result.historyAgeDays).toBeGreaterThan(90);
    expect(result.issues.some((i) => i.title === 'Old browsing history')).toBe(true);
  });

  it('detects suspicious extensions', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile({
      ...makeProfile(),
      extensions: [
        { id: 'ext1', name: 'Bad Extension', version: '1.0', enabled: true, permissions: ['tabs'], isSuspicious: true },
      ],
    });
    const result = analyzer.analyze();
    expect(result.suspiciousExtensionCount).toBe(1);
    expect(result.issues.some((i) => i.title === 'Suspicious browser extensions')).toBe(true);
  });

  it('generates insights', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile());
    const result = analyzer.analyze();
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it('handles empty repository', () => {
    const result = analyzer.analyze();
    expect(result.score).toBe(100);
    expect(result.totalCookieCount).toBe(0);
  });
});

// ── Storage Analyzer Tests ────────────────────────────────────

describe('BrowserStorageAnalyzer', () => {
  let repo: BrowserRepository;
  let analyzer: BrowserStorageAnalyzer;

  beforeEach(() => {
    repo = new BrowserRepository();
    analyzer = new BrowserStorageAnalyzer(repo);
  });

  it('computes storage breakdown per profile', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ cacheSize: 100 * 1024 * 1024, cookieCount: 200 }));
    const result = analyzer.analyze();
    expect(result.totalCacheSize).toBe(100 * 1024 * 1024);
    expect(result.totalCookiesSize).toBe(200 * 512);
  });

  it('computes grand total', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ cacheSize: 50 * 1024 * 1024, size: 200 * 1024 * 1024 }));
    const result = analyzer.analyze();
    expect(result.grandTotal).toBeGreaterThan(0);
  });

  it('handles empty repository', () => {
    const result = analyzer.analyze();
    expect(result.grandTotal).toBe(0);
    expect(result.totalCacheSize).toBe(0);
  });

  it('aggregates per browser', () => {
    repo.addBrowser(makeBrowser({ id: 'browser-chrome' }));
    repo.addProfile(makeProfile({ id: 'p1', cacheSize: 30 * 1024 * 1024 }));
    repo.addProfile(makeProfile({ id: 'p2', cacheSize: 20 * 1024 * 1024 }));
    const result = analyzer.analyze();
    expect(result.perBrowser['browser-chrome']!.cacheSize).toBe(50 * 1024 * 1024);
  });
});

// ── Browser Analyzer Tests ────────────────────────────────────

describe('BrowserAnalyzer', () => {
  let repo: BrowserRepository;
  let analyzer: BrowserAnalyzer;

  beforeEach(() => {
    repo = new BrowserRepository();
    analyzer = new BrowserAnalyzer(repo);
  });

  it('computes overall health score', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile());
    const result = analyzer.analyze();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('computes sub-scores', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile());
    const result = analyzer.analyze();
    expect(result.performanceScore).toBeGreaterThanOrEqual(0);
    expect(result.privacyScore).toBeGreaterThanOrEqual(0);
    expect(result.storageScore).toBeGreaterThanOrEqual(0);
    expect(result.securityScore).toBeGreaterThanOrEqual(0);
  });

  it('detects large cache issue', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ cacheSize: 300 * 1024 * 1024 }));
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'large_cache')).toBe(true);
  });

  it('detects excessive cookies issue', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ cookieCount: 600 }));
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'excessive_cookies')).toBe(true);
  });

  it('detects unused profile issue', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile({ lastUsed: old }));
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'unused_profile')).toBe(true);
  });

  it('detects outdated browser issue', () => {
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    repo.addBrowser(makeBrowser({ lastUsed: old }));
    repo.addProfile(makeProfile());
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'outdated_browser')).toBe(true);
  });

  it('detects suspicious extension issue', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile({
      ...makeProfile(),
      extensions: [
        { id: 'ext1', name: 'Bad', version: '1.0', enabled: true, permissions: [], isSuspicious: true },
      ],
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'suspicious_extension')).toBe(true);
  });

  it('generates insights', () => {
    repo.addBrowser(makeBrowser());
    repo.addProfile(makeProfile());
    const result = analyzer.analyze();
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it('handles empty repository', () => {
    const result = analyzer.analyze();
    expect(result.browserCount).toBe(0);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });
});

// ── Recommendation Engine Tests ───────────────────────────────

describe('BrowserRecommendationEngine', () => {
  let engine: BrowserRecommendationEngine;

  beforeEach(() => {
    engine = new BrowserRecommendationEngine();
  });

  it('generates cache cleanup recommendation', () => {
    const recs = engine.generate(makeHealthResult(), makePrivacyAnalysis(), makeStorageAnalysis());
    const cacheRec = recs.find((r) => r.type === 'cache_cleanup');
    expect(cacheRec).toBeDefined();
    expect(cacheRec!.estimatedRecovery).toBeGreaterThan(0);
  });

  it('generates cookie cleanup recommendation', () => {
    const recs = engine.generate(makeHealthResult(), makePrivacyAnalysis(), makeStorageAnalysis());
    const cookieRec = recs.find((r) => r.type === 'cookie_cleanup');
    expect(cookieRec).toBeDefined();
    expect(cookieRec!.requiresConfirmation).toBe(true);
  });

  it('generates history cleanup recommendation when history is old', () => {
    const recs = engine.generate(
      makeHealthResult(),
      makePrivacyAnalysis({ historyAgeDays: 120 }),
      makeStorageAnalysis(),
    );
    const historyRec = recs.find((r) => r.type === 'history_cleanup');
    expect(historyRec).toBeDefined();
    expect(historyRec!.requiresConfirmation).toBe(true);
  });

  it('generates download history cleanup recommendation', () => {
    const recs = engine.generate(makeHealthResult(), makePrivacyAnalysis({ downloadHistoryCount: 50 }), makeStorageAnalysis());
    const dlRec = recs.find((r) => r.type === 'download_history_cleanup');
    expect(dlRec).toBeDefined();
  });

  it('generates extension review recommendation for suspicious extensions', () => {
    const recs = engine.generate(
      makeHealthResult({
        issues: [{
          type: 'suspicious_extension',
          title: 'Suspicious extension: Bad',
          description: 'Bad extension',
          severity: 'high',
          impact: 15,
          autoFixable: false,
          affectedBrowserIds: ['browser-chrome'],
        }],
      }),
      makePrivacyAnalysis(),
      makeStorageAnalysis(),
    );
    const extRec = recs.find((r) => r.type === 'extension_review');
    expect(extRec).toBeDefined();
    expect(extRec!.reviewRequired).toBe(true);
  });

  it('generates browser update recommendation for outdated browsers', () => {
    const recs = engine.generate(
      makeHealthResult({
        issues: [{
          type: 'outdated_browser',
          title: 'Outdated browser: Chrome',
          description: 'Chrome is outdated',
          severity: 'medium',
          impact: 8,
          autoFixable: false,
          affectedBrowserIds: ['browser-chrome'],
        }],
      }),
      makePrivacyAnalysis(),
      makeStorageAnalysis(),
    );
    const updateRec = recs.find((r) => r.type === 'browser_update');
    expect(updateRec).toBeDefined();
  });

  it('generates notification review recommendation', () => {
    const recs = engine.generate(
      makeHealthResult(),
      makePrivacyAnalysis({ notificationPermissionCount: 30 }),
      makeStorageAnalysis(),
    );
    const notifRec = recs.find((r) => r.type === 'notification_review');
    expect(notifRec).toBeDefined();
  });

  it('recommendations are sorted by priority', () => {
    const recs = engine.generate(makeHealthResult(), makePrivacyAnalysis(), makeStorageAnalysis());
    const priorities = recs.map((r) => r.priority);
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i]!]).toBeGreaterThanOrEqual(order[priorities[i - 1]!]);
    }
  });

  it('filterByType filters correctly', () => {
    const recs = engine.generate(makeHealthResult(), makePrivacyAnalysis(), makeStorageAnalysis());
    const cacheRecs = engine.filterByType(recs, 'cache_cleanup');
    expect(cacheRecs.every((r) => r.type === 'cache_cleanup')).toBe(true);
  });

  it('getTotalEstimatedRecovery sums recovery', () => {
    const recs = engine.generate(makeHealthResult(), makePrivacyAnalysis(), makeStorageAnalysis());
    const total = engine.getTotalEstimatedRecovery(recs);
    expect(total).toBeGreaterThan(0);
  });
});

// ── Execution Task Tests ──────────────────────────────────────

describe('BrowserExecutionTask', () => {
  let task: BrowserExecutionTask;

  beforeEach(() => {
    task = new BrowserExecutionTask();
  });

  it('has correct display name', () => {
    expect(task.displayName).toBe('Browser Health & Privacy Cleanup');
  });

  it('estimates zero duration for no config', () => {
    expect(task.estimateDuration()).toBe(0);
  });

  it('estimates duration based on operations', () => {
    task.setConfig({
      operations: [
        { type: 'cache_cleanup', browserIds: ['b1'], profileIds: ['p1'] },
      ],
      confirmHistoryCleanup: false,
      confirmCookieCleanup: false,
    });
    expect(task.estimateDuration()).toBeGreaterThan(0);
  });

  it('validates and rejects when no config', async () => {
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors).toContain('No execution configuration set');
  });

  it('validates and warns about empty operations', async () => {
    task.setConfig({ operations: [], confirmHistoryCleanup: false, confirmCookieCleanup: false });
    const result = await task.validate();
    expect(result.warnings).toContain('No operations configured');
  });

  it('rejects history cleanup without confirmation', async () => {
    task.setConfig({
      operations: [{ type: 'history_cleanup', browserIds: ['b1'], profileIds: [] }],
      confirmHistoryCleanup: false,
      confirmCookieCleanup: false,
    });
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors.some((e) => e.includes('History cleanup requires explicit confirmation'))).toBe(true);
  });

  it('rejects cookie cleanup without confirmation', async () => {
    task.setConfig({
      operations: [{ type: 'cookie_cleanup', browserIds: ['b1'], profileIds: [] }],
      confirmHistoryCleanup: false,
      confirmCookieCleanup: false,
    });
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors.some((e) => e.includes('Cookie cleanup requires explicit confirmation'))).toBe(true);
  });

  it('allows history cleanup with confirmation', async () => {
    task.setConfig({
      operations: [{ type: 'history_cleanup', browserIds: ['b1'], profileIds: [] }],
      confirmHistoryCleanup: true,
      confirmCookieCleanup: false,
    });
    const result = await task.validate();
    expect(result.errors.some((e) => e.includes('History cleanup requires explicit confirmation'))).toBe(false);
  });

  it('allows cookie cleanup with confirmation', async () => {
    task.setConfig({
      operations: [{ type: 'cookie_cleanup', browserIds: ['b1'], profileIds: [] }],
      confirmHistoryCleanup: false,
      confirmCookieCleanup: true,
    });
    const result = await task.validate();
    expect(result.errors.some((e) => e.includes('Cookie cleanup requires explicit confirmation'))).toBe(false);
  });

  it('rejects forbidden operations', async () => {
    task.setConfig({
      operations: [{ type: 'bookmark_cleanup' as never, browserIds: ['b1'], profileIds: [] }],
      confirmHistoryCleanup: true,
      confirmCookieCleanup: true,
    });
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors.some((e) => e.includes('forbidden'))).toBe(true);
  });

  it('getCleanupRecords returns empty before execution', () => {
    expect(task.getCleanupRecords()).toEqual([]);
  });
});

// ── Browser History Tests ─────────────────────────────────────

describe('BrowserHistory', () => {
  let history: BrowserHistory;

  beforeEach(() => {
    history = new BrowserHistory();
  });

  it('records cleanup operations', () => {
    const entry = history.record(
      'cache_cleanup', 'browser-chrome', 'Google Chrome', null,
      100, 50 * 1024 * 1024, 5, 5000,
    );
    expect(entry.operationType).toBe('cache_cleanup');
    expect(entry.itemsRemoved).toBe(100);
    expect(history.size()).toBe(1);
  });

  it('getRecent returns most recent entries', () => {
    history.record('cache_cleanup', 'b1', 'Chrome', null, 10, 100, 1, 1000);
    history.record('cookie_cleanup', 'b1', 'Chrome', null, 20, 200, 5, 2000);
    const recent = history.getRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.operationType).toBe('cookie_cleanup');
  });

  it('getByBrowser filters by browser ID', () => {
    history.record('cache_cleanup', 'b1', 'Chrome', null, 10, 100, 1, 1000);
    history.record('cache_cleanup', 'b2', 'Edge', null, 20, 200, 5, 2000);
    expect(history.getByBrowser('b1')).toHaveLength(1);
  });

  it('getByOperationType filters by type', () => {
    history.record('cache_cleanup', 'b1', 'Chrome', null, 10, 100, 1, 1000);
    history.record('cookie_cleanup', 'b1', 'Chrome', null, 20, 200, 5, 2000);
    expect(history.getByOperationType('cache_cleanup')).toHaveLength(1);
  });

  it('getTotalBytesRecovered sums non-rolled-back entries', () => {
    history.record('cache_cleanup', 'b1', 'Chrome', null, 10, 100, 1, 1000);
    history.record('cookie_cleanup', 'b1', 'Chrome', null, 20, 200, 5, 2000);
    expect(history.getTotalBytesRecovered()).toBe(300);
  });

  it('markRolledBack marks entry as rolled back', () => {
    const entry = history.record('cache_cleanup', 'b1', 'Chrome', null, 10, 100, 1, 1000);
    expect(history.markRolledBack(entry.id)).toBe(true);
    expect(entry.rolledBack).toBe(true);
    expect(entry.rollbackTimestamp).not.toBeNull();
  });

  it('getTotalBytesRecovered excludes rolled-back entries', () => {
    const entry = history.record('cache_cleanup', 'b1', 'Chrome', null, 10, 100, 1, 1000);
    history.record('cookie_cleanup', 'b1', 'Chrome', null, 20, 200, 5, 2000);
    history.markRolledBack(entry.id);
    expect(history.getTotalBytesRecovered()).toBe(200);
  });

  it('clear removes all entries', () => {
    history.record('cache_cleanup', 'b1', 'Chrome', null, 10, 100, 1, 1000);
    history.clear();
    expect(history.size()).toBe(0);
  });
});

// ── Health Integration Tests ──────────────────────────────────

describe('BrowserHealthIntegration', () => {
  let integration: BrowserHealthIntegration;

  beforeEach(() => {
    integration = new BrowserHealthIntegration();
  });

  it('builds browser health contribution', () => {
    const contribution = integration.buildBrowserContribution(makeHealthResult());
    expect(contribution.categoryId).toBe('browser');
    expect(contribution.score).toBe(80);
    expect(typeof contribution.confidence).toBe('number');
  });

  it('builds privacy health contribution', () => {
    const contribution = integration.buildPrivacyContribution(makePrivacyAnalysis());
    expect(contribution.categoryId).toBe('privacy');
    expect(contribution.score).toBe(75);
  });

  it('sets confidence based on browser count', () => {
    const contribution = integration.buildBrowserContribution(makeHealthResult({ browserCount: 0 }));
    expect(contribution.confidence).toBe(0.3);
  });

  it('sets confidence based on cookie count', () => {
    const contribution = integration.buildPrivacyContribution(makePrivacyAnalysis({ totalCookieCount: 0 }));
    expect(contribution.confidence).toBe(0.4);
  });
});

// ── Events Tests ──────────────────────────────────────────────

describe('BrowserEvents', () => {
  let emitter: BrowserEventEmitter;

  beforeEach(() => {
    emitter = new BrowserEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('browser_scan_started', listener);
    emitter.emit('browser_scan_started', { timestamp: 'test' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('browser_scan_completed', listener);
    unsub();
    emitter.emit('browser_scan_completed', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not crash when listener throws', () => {
    emitter.on('browser_analysis_completed', () => {
      throw new Error('test');
    });
    expect(() => emitter.emit('browser_analysis_completed', {})).not.toThrow();
  });

  it('tracks listener count', () => {
    emitter.on('browser_scan_started', () => {});
    emitter.on('browser_scan_started', () => {});
    expect(emitter.listenerCount('browser_scan_started')).toBe(2);
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.browserScanner).toBeDefined();
    expect(mod.browserRepository).toBeDefined();
    expect(mod.browserAnalyzer).toBeDefined();
    expect(mod.privacyAnalyzer).toBeDefined();
    expect(mod.browserStorageAnalyzer).toBeDefined();
    expect(mod.browserRecommendationEngine).toBeDefined();
    expect(mod.browserHistory).toBeDefined();
    expect(mod.browserHealthIntegration).toBeDefined();
    expect(mod.BrowserScanner).toBeDefined();
    expect(mod.BrowserRepository).toBeDefined();
    expect(mod.BrowserAnalyzer).toBeDefined();
    expect(mod.PrivacyAnalyzer).toBeDefined();
    expect(mod.BrowserStorageAnalyzer).toBeDefined();
    expect(mod.BrowserRecommendationEngine).toBeDefined();
    expect(mod.BrowserExecutionTask).toBeDefined();
    expect(mod.BrowserHistory).toBeDefined();
    expect(mod.BrowserHealthIntegration).toBeDefined();
    expect(mod.BrowserEventEmitter).toBeDefined();
    expect(mod.BROWSER_TASK_ID).toBeDefined();
  });

  it('task is registered in the execution engine registry', () => {
    expect(isTaskRegistered(BROWSER_TASK_ID)).toBe(true);
  });

  it('BROWSER_TASK_ID is correct', () => {
    expect(BROWSER_TASK_ID).toBe('browser_health_cleanup');
  });

  it('health contributions are compatible with health engine types', () => {
    const integration = new BrowserHealthIntegration();
    const browserContribution = integration.buildBrowserContribution(makeHealthResult());
    expect(browserContribution.categoryId).toBe('browser');
    expect(typeof browserContribution.score).toBe('number');
    expect(Array.isArray(browserContribution.issues)).toBe(true);
    expect(Array.isArray(browserContribution.insights)).toBe(true);

    const privacyContribution = integration.buildPrivacyContribution(makePrivacyAnalysis());
    expect(privacyContribution.categoryId).toBe('privacy');
    expect(typeof privacyContribution.score).toBe('number');
  });

  it('supports all 5 built-in browsers', () => {
    const types = BROWSER_DEFINITIONS.map((d) => d.type);
    expect(types).toContain('chrome');
    expect(types).toContain('edge');
    expect(types).toContain('firefox');
    expect(types).toContain('brave');
    expect(types).toContain('opera');
  });

  it('scanner supports pluggable browser registration', () => {
    const scanner = new BrowserScanner();
    scanner.registerBrowser({
      type: 'vivaldi',
      displayName: 'Vivaldi',
      windowsInstallPaths: [],
      macInstallPaths: [],
      linuxInstallPaths: [],
      profilePathPatterns: [],
      executableNames: [],
    });
    expect(scanner.getAllDefinitions().some((d) => d.type === 'vivaldi')).toBe(true);
  });
});
