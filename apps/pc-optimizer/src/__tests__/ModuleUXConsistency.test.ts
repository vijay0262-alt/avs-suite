// @vitest-environment happy-dom
/**
 * Module UX Consistency Tests
 *
 * Verifies that every feature module page:
 * - Uses PageHeader with title and description
 * - Uses shared ModuleStates (loading, error, empty)
 * - Uses SharedConfirmDialog instead of inline modals
 * - Has a HelpButton for contextual help
 * - Has a data-testid for identification
 * - Follows consistent layout patterns
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FEATURES_DIR = path.resolve(__dirname, '../features');
const PAGES_DIR = path.resolve(__dirname, '../pages');

// ── Helper: read file content ────────────────────────────────────
function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

// ── Helper: find all page component files ─────────────────────────
function findPageFiles(dir: string): { name: string; fullPath: string; content: string }[] {
  const results: { name: string; fullPath: string; content: string }[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPageFiles(fullPath));
    } else if (entry.name.endsWith('Page.tsx') || entry.name.endsWith('Page.ts') || entry.name.endsWith('PageV2.tsx')) {
      const content = readFile(fullPath);
      if (content) results.push({ name: entry.name, fullPath, content });
    }
  }
  return results;
}

// ── Helper: find all page proxy files ─────────────────────────────
function findPageProxies(dir: string): { name: string; fullPath: string; content: string }[] {
  const results: { name: string; fullPath: string; content: string }[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      const fullPath = path.join(dir, entry.name);
      const content = readFile(fullPath);
      if (content && content.includes('PageHeader')) {
        results.push({ name: entry.name, fullPath, content });
      }
    }
  }
  return results;
}

// ── All page files ────────────────────────────────────────────────
const allPages = [
  ...findPageFiles(FEATURES_DIR),
  ...findPageProxies(PAGES_DIR),
];

// ── Module definitions for verification ───────────────────────────
const MODULES = [
  { name: 'JunkCleaner', file: 'JunkCleanerPage.tsx', testId: 'page-junk-cleaner' },
  { name: 'RegistryCleaner', file: 'RegistryCleanerPage.tsx', testId: 'page-registry-cleaner' },
  { name: 'StartupManager', file: 'StartupPage.tsx', testId: 'page-startup-manager' },
  { name: 'DiskAnalyzer', file: 'DiskAnalyzerPage.tsx', testId: 'page-disk-analyzer' },
  { name: 'DuplicateFinder', file: 'DuplicateFinderPage.tsx', testId: 'page-duplicate-finder' },
  { name: 'Performance', file: 'PerformancePage.tsx', testId: 'page-performance' },
  { name: 'PrivacyCleaner', file: 'PrivacyPage.tsx', testId: 'page-privacy-cleaner' },
  { name: 'SystemInfo', file: 'SystemInfoPage.tsx', testId: 'page-system-information' },
  { name: 'Uninstaller', file: 'UninstallerPage.tsx', testId: 'page-uninstaller' },
  { name: 'SoftwareUpdater', file: 'UpdaterPage.tsx', testId: 'page-software-updater' },
  { name: 'Reports', file: 'ReportsPage.tsx', testId: 'page-reports' },
  { name: 'MaintenanceHistory', file: 'MaintenanceHistoryPage.tsx', testId: 'page-maintenance-history' },
  { name: 'Dashboard', file: 'DashboardPageV2.tsx', testId: 'page-dashboard' },
  { name: 'Settings', file: 'SettingsPage.tsx', testId: 'page-settings' },
];

describe('Module UX Consistency', () => {
  describe('PageHeader usage', () => {
    // Dashboard V2 uses a custom hero layout (greeting + stat cards) instead of PageHeader
    const modulesWithPageHeader = MODULES.filter((m) => m.name !== 'Dashboard');
    modulesWithPageHeader.forEach((mod) => {
      it(`${mod.name}: uses PageHeader with title and description`, () => {
        const page = allPages.find((p) => p.name === mod.file);
        expect(page, `File ${mod.file} not found`).toBeDefined();
        expect(page!.content).toContain('PageHeader');
        expect(page!.content).toMatch(/title=["']/);
        expect(page!.content).toMatch(/description=["']/);
      });
    });

    it('Dashboard: uses custom hero layout (greeting + health score) instead of PageHeader', () => {
      const page = allPages.find((p) => p.name === 'DashboardPageV2.tsx');
      expect(page, 'File DashboardPageV2.tsx not found').toBeDefined();
      // Dashboard V2 has its own hero section with greeting and inline health score card.
      // V1.0: CollapsibleSection panels (System Health, Recent Activity) were removed
      // to simplify the dashboard — users have plenty of info from the primary cards.
      expect(page!.content).toContain('getGreeting');
    });
  });

  describe('data-testid identification', () => {
    MODULES.forEach((mod) => {
      it(`${mod.name}: has data-testid="${mod.testId}"`, () => {
        const page = allPages.find((p) => p.name === mod.file);
        expect(page, `File ${mod.file} not found`).toBeDefined();
        expect(page!.content).toContain(`data-testid="${mod.testId}"`);
      });
    });
  });

  describe('HelpButton usage', () => {
    const modulesWithHelp = [
      'JunkCleanerPage.tsx',
      'RegistryCleanerPage.tsx',
      'StartupPage.tsx',
      'DiskAnalyzerPage.tsx',
      'DuplicateFinderPage.tsx',
      'PerformancePage.tsx',
      'PrivacyPage.tsx',
      'SystemInfoPage.tsx',
      'UninstallerPage.tsx',
      'UpdaterPage.tsx',
      'ReportsPage.tsx',
      'MaintenanceHistoryPage.tsx',
      'SettingsPage.tsx',
    ];

    modulesWithHelp.forEach((fileName) => {
      it(`${fileName}: includes HelpButton`, () => {
        const page = allPages.find((p) => p.name === fileName);
        expect(page, `File ${fileName} not found`).toBeDefined();
        expect(page!.content).toContain('HelpButton');
      });
    });
  });

  describe('Shared ModuleStates usage', () => {
    const modulesWithErrorState = [
      'RegistryCleanerPage.tsx',
      'StartupPage.tsx',
      'DiskAnalyzerPage.tsx',
      'DuplicateFinderPage.tsx',
      'PerformancePage.tsx',
      'PrivacyPage.tsx',
      'SystemInfoPage.tsx',
      'UninstallerPage.tsx',
      'UpdaterPage.tsx',
    ];

    modulesWithErrorState.forEach((fileName) => {
      it(`${fileName}: uses ModuleErrorState`, () => {
        const page = allPages.find((p) => p.name === fileName);
        expect(page, `File ${fileName} not found`).toBeDefined();
        expect(page!.content).toContain('ModuleErrorState');
      });
    });

    const modulesWithLoadingState = [
      'StartupPage.tsx',
      'DiskAnalyzerPage.tsx',
      'DuplicateFinderPage.tsx',
      'PerformancePage.tsx',
      'PrivacyPage.tsx',
      'SystemInfoPage.tsx',
    ];

    modulesWithLoadingState.forEach((fileName) => {
      it(`${fileName}: uses ModuleLoadingState`, () => {
        const page = allPages.find((p) => p.name === fileName);
        expect(page, `File ${fileName} not found`).toBeDefined();
        expect(page!.content).toContain('ModuleLoadingState');
      });
    });

    const modulesWithEmptyState = [
      'RegistryCleanerPage.tsx',
      'StartupPage.tsx',
      'DuplicateFinderPage.tsx',
      'PerformancePage.tsx',
      'UninstallerPage.tsx',
      'UpdaterPage.tsx',
    ];

    modulesWithEmptyState.forEach((fileName) => {
      it(`${fileName}: uses ModuleEmptyState`, () => {
        const page = allPages.find((p) => p.name === fileName);
        expect(page, `File ${fileName} not found`).toBeDefined();
        expect(page!.content).toContain('ModuleEmptyState');
      });
    });
  });

  describe('SharedConfirmDialog usage', () => {
    const modulesWithConfirm = [
      'DiskAnalyzerPage.tsx',
      'UninstallerPage.tsx',
      'UpdaterPage.tsx',
    ];

    modulesWithConfirm.forEach((fileName) => {
      it(`${fileName}: uses SharedConfirmDialog (not inline modal)`, () => {
        const page = allPages.find((p) => p.name === fileName);
        expect(page, `File ${fileName} not found`).toBeDefined();
        expect(page!.content).toContain('SharedConfirmDialog');
        // Should NOT contain inline fixed inset-0 modal pattern
        expect(page!.content).not.toMatch(/fixed inset-0 z-50 flex items-center justify-center bg-black\/50/);
      });
    });
  });

  describe('No inline ad-hoc error states', () => {
    // After refactoring, no module should have the old pattern of
    // `<Card><div className="text-center py-8"><p className="text-red-500 mb-4">`
    const allModulePages = [
      'RegistryCleanerPage.tsx',
      'StartupPage.tsx',
      'DiskAnalyzerPage.tsx',
      'DuplicateFinderPage.tsx',
      'PerformancePage.tsx',
      'PrivacyPage.tsx',
      'SystemInfoPage.tsx',
      'UninstallerPage.tsx',
      'UpdaterPage.tsx',
    ];

    allModulePages.forEach((fileName) => {
      it(`${fileName}: does not use ad-hoc inline error state`, () => {
        const page = allPages.find((p) => p.name === fileName);
        expect(page, `File ${fileName} not found`).toBeDefined();
        // Check that the old pattern of inline error with text-red-500 mb-4 is gone
        expect(page!.content).not.toMatch(/text-red-500 mb-4/);
      });
    });
  });

  describe('No inline ad-hoc loading states', () => {
    const allModulePages = [
      'StartupPage.tsx',
      'DiskAnalyzerPage.tsx',
      'DuplicateFinderPage.tsx',
      'PerformancePage.tsx',
      'PrivacyPage.tsx',
      'SystemInfoPage.tsx',
    ];

    allModulePages.forEach((fileName) => {
      it(`${fileName}: does not use ad-hoc inline loading state`, () => {
        const page = allPages.find((p) => p.name === fileName);
        expect(page, `File ${fileName} not found`).toBeDefined();
        // Check that the old pattern of inline "Loading..." with text-text-secondary is gone
        // (ModuleLoadingState uses a spinner + message)
        const oldLoadingPattern = /text-center py-8[\s\S]*?Loading/;
        expect(page!.content).not.toMatch(oldLoadingPattern);
      });
    });
  });
});

describe('Shared Component Exports', () => {
  it('ModuleStates exports all expected components', async () => {
    const modulePath = path.resolve(__dirname, '../components/ModuleStates.tsx');
    const content = readFile(modulePath);
    expect(content).toContain('ModuleLoadingState');
    expect(content).toContain('ModuleErrorState');
    expect(content).toContain('ModuleEmptyState');
    expect(content).toContain('ModuleSuccessBanner');
    expect(content).toContain('ModuleErrorBanner');
    expect(content).toContain('ModuleInfoBanner');
  });

  it('SharedConfirmDialog exports the component', () => {
    const modulePath = path.resolve(__dirname, '../components/SharedConfirmDialog.tsx');
    const content = readFile(modulePath);
    expect(content).toContain('SharedConfirmDialog');
    expect(content).toContain('aria-modal');
    expect(content).toContain('role="dialog"');
  });

  it('HelpButton exports the component', () => {
    const modulePath = path.resolve(__dirname, '../components/HelpButton.tsx');
    const content = readFile(modulePath);
    expect(content).toContain('HelpButton');
    expect(content).toContain('QuestionMarkCircleIcon');
    expect(content).toContain('role="tooltip"');
  });

  it('ModuleToolbar exports the component', () => {
    const modulePath = path.resolve(__dirname, '../components/ModuleToolbar.tsx');
    const content = readFile(modulePath);
    expect(content).toContain('ModuleToolbar');
    expect(content).toContain('aria-label');
  });
});

describe('Accessibility in Shared Components', () => {
  it('ModuleErrorState has role=alert and aria-live=assertive', () => {
    const content = readFile(path.resolve(__dirname, '../components/ModuleStates.tsx'));
    expect(content).toContain('role="alert"');
    expect(content).toContain('aria-live="assertive"');
  });

  it('ModuleLoadingState has role=status and aria-live=polite', () => {
    const content = readFile(path.resolve(__dirname, '../components/ModuleStates.tsx'));
    expect(content).toContain('role="status"');
    expect(content).toContain('aria-live="polite"');
  });

  it('SharedConfirmDialog has aria-modal and role=dialog', () => {
    const content = readFile(path.resolve(__dirname, '../components/SharedConfirmDialog.tsx'));
    expect(content).toContain('aria-modal="true"');
    expect(content).toContain('role="dialog"');
    expect(content).toContain('aria-labelledby');
  });

  it('HelpButton has aria-label', () => {
    const content = readFile(path.resolve(__dirname, '../components/HelpButton.tsx'));
    expect(content).toContain('aria-label="Help"');
  });
});
