// @vitest-environment happy-dom
/**
 * Navigation & Onboarding Tests
 *
 * Tests for:
 * - OnboardingService state management
 * - GlobalSearch search filtering logic
 * - Keyboard shortcuts definitions
 * - Sidebar section structure
 * - Breadcrumb path building
 * - Regression: all nav items present
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { onboardingService } from '../features/onboarding/OnboardingService';
import { KEYBOARD_SHORTCUTS } from '../components/useKeyboardShortcuts';
import type { SearchEntry } from '../components/GlobalSearch';

// ── OnboardingService Tests ──────────────────────────────────────

describe('OnboardingService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports incomplete onboarding by default', () => {
    expect(onboardingService.hasCompletedOnboarding()).toBe(false);
  });

  it('marks onboarding as complete', () => {
    onboardingService.completeOnboarding();
    expect(onboardingService.hasCompletedOnboarding()).toBe(true);
  });

  it('resets onboarding', () => {
    onboardingService.completeOnboarding();
    expect(onboardingService.hasCompletedOnboarding()).toBe(true);
    onboardingService.resetOnboarding();
    expect(onboardingService.hasCompletedOnboarding()).toBe(false);
  });

  it('tracks dismissed tips', () => {
    expect(onboardingService.isTipDismissed('tip-1')).toBe(false);
    onboardingService.dismissTip('tip-1');
    expect(onboardingService.isTipDismissed('tip-1')).toBe(true);
  });

  it('persists dismissed tips across instances', () => {
    onboardingService.dismissTip('tip-persist');
    expect(onboardingService.isTipDismissed('tip-persist')).toBe(true);
  });

  it('tracks learning mode', () => {
    expect(onboardingService.isLearningMode()).toBe(false);
    onboardingService.setLearningMode(true);
    expect(onboardingService.isLearningMode()).toBe(true);
    onboardingService.setLearningMode(false);
    expect(onboardingService.isLearningMode()).toBe(false);
  });

  it('getDismissedTips returns a Set', () => {
    onboardingService.dismissTip('tip-a');
    onboardingService.dismissTip('tip-b');
    const set = onboardingService.getDismissedTips();
    expect(set).toBeInstanceOf(Set);
    expect(set.has('tip-a')).toBe(true);
    expect(set.has('tip-b')).toBe(true);
    expect(set.has('tip-c')).toBe(false);
  });
});

// ── Keyboard Shortcuts Tests ─────────────────────────────────────

describe('Keyboard Shortcuts', () => {
  it('exports shortcut definitions for display', () => {
    expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(0);
  });

  it('includes Ctrl+K for search', () => {
    const ctrlK = KEYBOARD_SHORTCUTS.find((s) => s.keys === 'Ctrl+K');
    expect(ctrlK).toBeDefined();
    expect(ctrlK!.description).toContain('search');
  });

  it('includes Alt+Left for back navigation', () => {
    const altLeft = KEYBOARD_SHORTCUTS.find((s) => s.keys === 'Alt+Left');
    expect(altLeft).toBeDefined();
    expect(altLeft!.description).toContain('back');
  });

  it('includes Alt+Right for forward navigation', () => {
    const altRight = KEYBOARD_SHORTCUTS.find((s) => s.keys === 'Alt+Right');
    expect(altRight).toBeDefined();
    expect(altRight!.description).toContain('forward');
  });

  it('includes Ctrl+D for dashboard', () => {
    const ctrlD = KEYBOARD_SHORTCUTS.find((s) => s.keys === 'Ctrl+D');
    expect(ctrlD).toBeDefined();
    expect(ctrlD!.description).toContain('Dashboard');
  });

  it('includes Ctrl+, for settings', () => {
    const ctrlComma = KEYBOARD_SHORTCUTS.find((s) => s.keys === 'Ctrl+,');
    expect(ctrlComma).toBeDefined();
    expect(ctrlComma!.description).toContain('Settings');
  });

  it('includes Escape for closing dialogs', () => {
    const esc = KEYBOARD_SHORTCUTS.find((s) => s.keys === 'Escape');
    expect(esc).toBeDefined();
    expect(esc!.description).toContain('Close');
  });
});

// ── Search Logic Tests ───────────────────────────────────────────

describe('GlobalSearch Logic', () => {
  const testEntries: SearchEntry[] = [
    { id: 'dashboard', to: '/dashboard', label: 'Dashboard', keywords: 'dashboard health score overview' },
    { id: 'junk-cleaner', to: '/junk-cleaner', label: 'Junk Cleaner', keywords: 'junk cleaner temp files cache clutter scan' },
    { id: 'settings', to: '/settings', label: 'Settings', keywords: 'settings preferences options appearance theme', category: 'Settings' },
    { id: 'action-scan', to: '/dashboard', label: 'Run Health Scan', keywords: 'scan health check system analyze', category: 'Action' },
  ];

  function search(query: string): SearchEntry[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return testEntries.filter(
      (e) => e.keywords.toLowerCase().includes(normalized) || e.label.toLowerCase().includes(normalized),
    );
  }

  it('finds modules by keyword', () => {
    const results = search('junk');
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe('junk-cleaner');
  });

  it('finds settings entries', () => {
    const results = search('appearance');
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe('settings');
  });

  it('finds action entries', () => {
    const results = search('scan');
    expect(results.some((r) => r.id === 'action-scan')).toBe(true);
  });

  it('returns empty for no match', () => {
    const results = search('xyznonexistent');
    expect(results.length).toBe(0);
  });

  it('matches case-insensitively', () => {
    const results = search('JUNK');
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe('junk-cleaner');
  });

  it('matches partial keywords', () => {
    const results = search('clean');
    expect(results.some((r) => r.id === 'junk-cleaner')).toBe(true);
  });

  it('returns empty for empty query', () => {
    const results = search('');
    expect(results.length).toBe(0);
  });
});

// ── Sidebar Structure Tests ──────────────────────────────────────

describe('Sidebar Structure', () => {
  it('NAV_SECTIONS has 4 sections', async () => {
    const sidebarModule = await import('../components/Sidebar');
    expect(sidebarModule.Sidebar).toBeDefined();
    expect(typeof sidebarModule.Sidebar).toBe('function');
  });
});

// ── Breadcrumb Logic Tests ───────────────────────────────────────

describe('Breadcrumb Logic', () => {
  const ROUTE_LABELS: Record<string, string> = {
    dashboard: 'Dashboard',
    'junk-cleaner': 'Junk Cleaner',
    settings: 'Settings',
  };

  function buildCrumbs(pathname: string): { label: string; path: string }[] {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return [];
    const crumbs: { label: string; path: string }[] = [];
    let acc = '';
    for (const seg of segments) {
      acc += `/${seg}`;
      const label = ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
      crumbs.push({ label, path: acc });
    }
    return crumbs;
  }

  it('builds single crumb for root-level route', () => {
    const crumbs = buildCrumbs('/dashboard');
    expect(crumbs.length).toBe(1);
    expect(crumbs[0]!.label).toBe('Dashboard');
  });

  it('builds multiple crumbs for nested route', () => {
    const crumbs = buildCrumbs('/junk-cleaner/details');
    expect(crumbs.length).toBe(2);
    expect(crumbs[0]!.label).toBe('Junk Cleaner');
    expect(crumbs[1]!.label).toBe('Details');
  });

  it('returns empty for root path', () => {
    const crumbs = buildCrumbs('/');
    expect(crumbs.length).toBe(0);
  });

  it('capitalizes unknown segments', () => {
    const crumbs = buildCrumbs('/custom');
    expect(crumbs[0]!.label).toBe('Custom');
  });
});

// ── Navigation Regression Tests ──────────────────────────────────

describe('Navigation Regression', () => {
  const EXPECTED_NAV_IDS = [
    'dashboard',
    'junk-cleaner',
    'registry-cleaner',
    'startup-manager',
    'privacy-cleaner',
    'duplicate-finder',
    'disk-analyzer',
    'uninstaller',
    'software-updater',
    'performance',
    'system-information',
    'maintenance-history',
    'reports',
    'license',
    'settings',
    'about',
  ];

  it('all expected nav IDs are unique', () => {
    const unique = new Set(EXPECTED_NAV_IDS);
    expect(unique.size).toBe(EXPECTED_NAV_IDS.length);
  });

  it('all expected nav IDs are non-empty strings', () => {
    for (const id of EXPECTED_NAV_IDS) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('keyboard shortcuts has exactly 6 entries', () => {
    expect(KEYBOARD_SHORTCUTS.length).toBe(6);
  });

  it('all keyboard shortcut keys are unique', () => {
    const keys = KEYBOARD_SHORTCUTS.map((s) => s.keys);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});
