/**
 * PrivacyPage - Main Privacy Cleaner page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleLoadingState, ModuleSuccessBanner, ModuleErrorBanner } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { UnifiedScanProgressCard, PRIVACY_SCAN_CONFIG } from '../unified-scan';
import { UnifiedCleanerResults } from '../unified-results';
import { useIsPro } from '../sync/syncStore';
import { PrivacyViewModel } from './PrivacyViewModel';
import { privacyService } from './privacy.service';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { CheckCircleIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

const CATEGORY_LABELS: Record<string, string> = {
  windows_temp: 'Windows Temporary Files',
  recent_files: 'Recent Files',
  thumbnail_cache: 'Thumbnail Cache',
  clipboard_history: 'Clipboard History',
  dns_cache: 'DNS Cache',
  run_history: 'Run History',
  recent_documents: 'Recent Documents',
  recycle_bin: 'Recycle Bin',
  chrome_history: 'Chrome History',
  chrome_downloads: 'Chrome Downloads',
  chrome_cache: 'Chrome Cache',
  chrome_session: 'Chrome Session',
  chrome_temp: 'Chrome Temporary Files',
  chrome_site_storage: 'Chrome Site Storage',
  edge_history: 'Edge History',
  edge_downloads: 'Edge Downloads',
  edge_cache: 'Edge Cache',
  edge_session: 'Edge Session',
  edge_temp: 'Edge Temporary Files',
  edge_site_storage: 'Edge Site Storage',
  firefox_history: 'Firefox History',
  firefox_downloads: 'Firefox Downloads',
  firefox_cache: 'Firefox Cache',
  firefox_session: 'Firefox Session',
  firefox_temp: 'Firefox Temporary Files',
  firefox_site_storage: 'Firefox Site Storage',
  brave_history: 'Brave History',
  brave_downloads: 'Brave Downloads',
  brave_cache: 'Brave Cache',
  brave_session: 'Brave Session',
  brave_temp: 'Brave Temporary Files',
  brave_site_storage: 'Brave Site Storage',
  opera_history: 'Opera History',
  opera_downloads: 'Opera Downloads',
  opera_cache: 'Opera Cache',
  opera_session: 'Opera Session',
  opera_temp: 'Opera Temporary Files',
  opera_site_storage: 'Opera Site Storage',
  vivaldi_history: 'Vivaldi History',
  vivaldi_downloads: 'Vivaldi Downloads',
  vivaldi_cache: 'Vivaldi Cache',
  vivaldi_session: 'Vivaldi Session',
  vivaldi_temp: 'Vivaldi Temporary Files',
  vivaldi_site_storage: 'Vivaldi Site Storage',
};

const BROWSER_CATEGORIES = [
  'chrome_history', 'chrome_downloads', 'chrome_cache', 'chrome_session', 'chrome_temp', 'chrome_site_storage',
  'edge_history', 'edge_downloads', 'edge_cache', 'edge_session', 'edge_temp', 'edge_site_storage',
  'firefox_history', 'firefox_downloads', 'firefox_cache', 'firefox_session', 'firefox_temp', 'firefox_site_storage',
  'brave_history', 'brave_downloads', 'brave_cache', 'brave_session', 'brave_temp', 'brave_site_storage',
  'opera_history', 'opera_downloads', 'opera_cache', 'opera_session', 'opera_temp', 'opera_site_storage',
  'vivaldi_history', 'vivaldi_downloads', 'vivaldi_cache', 'vivaldi_session', 'vivaldi_temp', 'vivaldi_site_storage',
];

const RISK_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  high: 'danger',
  medium: 'warning',
  low: 'success',
};

export default function PrivacyPage() {
  const vm = useMemo(() => new PrivacyViewModel(privacyService), []);
  const state = useViewModel(vm);
  const { guard, dialogElement } = useFeatureGuard();
  const isPro = useIsPro();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleScan = () => {
    void vm.scan();
  };

  const handleClean = () => {
    guard('privacy.clean', 'Privacy Cleaner', () => vm.clean());
  };

  const handleToggleCategory = (category: string) => {
    vm.toggleCategory(category);
  };

  return (
    <div data-testid="page-privacy-cleaner">
      <PageHeader
        title="Privacy Cleaner"
        description="Clear browser traces and Windows components that record activity"
        actions={<HelpButton text="The privacy cleaner removes browsing history, cache, cookies, and other traces from your browsers and Windows. Detected browsers are highlighted. A backup is created before cleaning." />}
      />

      {state.bootstrap === 'loading' && (
        <ModuleLoadingState message="Loading…" testId="privacy-loading" />
      )}

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message="Could not reach the backend service. Please try again."
          onRetry={() => vm.bootstrap()}
          testId="privacy-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {state.scanError && (
            <ModuleErrorBanner
              message="Scan encountered an issue. Please try again."
              onRetry={() => vm.scan()}
              onDismiss={() => vm.clearScanError()}
              testId="privacy-scan-error"
            />
          )}
          {state.cleanError && (
            <ModuleErrorBanner
              message="Cleaning encountered an issue. Please try again."
              onDismiss={() => vm.clearCleanError()}
              testId="privacy-clean-error"
            />
          )}

          {/* Detected Browsers — clickable pills */}
          <Card title="Detected Browsers" className="mb-4">
            {state.browsersLoading ? (
              <p className="text-small text-text-muted">Detecting browsers…</p>
            ) : state.browsersDetected.length === 0 ? (
              <p className="text-small text-text-muted">No browsers detected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {state.browsersDetected.map(browser => {
                  const browserCats = BROWSER_CATEGORIES.filter(c => c.startsWith(browser));
                  const allSelected = browserCats.every(c => state.selectedCategories.has(c));
                  return (
                    <button
                      key={browser}
                      onClick={() => {
                        if (allSelected) {
                          browserCats.forEach(c => {
                            if (state.selectedCategories.has(c)) vm.toggleCategory(c);
                          });
                        } else {
                          browserCats.forEach(c => {
                            if (!state.selectedCategories.has(c)) vm.toggleCategory(c);
                          });
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-[var(--avs-radius-md)] border-2 transition-all ${
                        allSelected
                          ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)] text-[var(--avs-brand-primary)]'
                          : 'border-[var(--avs-border)] bg-[var(--avs-surface)] text-text-secondary hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_40%,var(--avs-border))]'
                      }`}
                    >
                      {allSelected && <CheckCircleIcon className="h-4 w-4" />}
                      <span className="text-small font-medium">
                        {browser.charAt(0).toUpperCase() + browser.slice(1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Categories — clickable cards */}
          <Card
            title="Categories"
            className="mb-4"
            actions={
              <div className="flex gap-2">
                <button onClick={() => vm.selectAllCategories()} className="text-caption font-medium text-[var(--avs-brand-primary)] hover:underline">
                  Select all
                </button>
                <button onClick={() => vm.deselectAllCategories()} className="text-caption font-medium text-text-muted hover:text-text-primary">
                  Clear
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
                const isBrowserCategory = BROWSER_CATEGORIES.includes(category);
                const isBrowserDetected = state.browsersDetected.some(b => category.startsWith(b));
                const isDisabled = isBrowserCategory && !isBrowserDetected;
                const selected = state.selectedCategories.has(category);

                return (
                  <div
                    key={category}
                    onClick={() => !isDisabled && handleToggleCategory(category)}
                    className={`flex items-center gap-2 p-2.5 rounded-[var(--avs-radius-md)] border-2 transition-all ${
                      isDisabled
                        ? 'border-[var(--avs-border)] opacity-40 cursor-not-allowed'
                        : selected
                          ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)] cursor-pointer'
                          : 'border-[var(--avs-border)] bg-[var(--avs-surface)] cursor-pointer hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_30%,var(--avs-border))]'
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        selected
                          ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]'
                          : 'border-[var(--avs-border)] bg-transparent'
                      }`}
                    >
                      {selected && <CheckCircleIcon className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <span className="text-small text-text-primary truncate">{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <Button
                onClick={handleScan}
                disabled={state.scanning || state.selectedCategories.size === 0}
                className="w-full"
                leftIcon={<EyeSlashIcon className="h-4 w-4" />}
              >
                {state.scanning ? 'Scanning…' : 'Scan'}
              </Button>
            </div>
          </Card>

          {state.scanning && (
            <div className="mb-4">
              <UnifiedScanProgressCard
                config={PRIVACY_SCAN_CONFIG}
                isRunning={state.scanning}
                startTime={Date.now()}
                counters={{ privacyItems: state.scanResult?.items.length ?? 0 }}
              />
            </div>
          )}

          {state.scanResult && !state.cleaning && !state.cleanResult && (
            <div className="mb-4">
              <UnifiedCleanerResults
                data={{
                  moduleId: 'privacy',
                  moduleName: 'Privacy Cleaner',
                  moduleIcon: 'EyeSlashIcon',
                  timestamp: Date.now(),
                  durationMs: 3000,
                  itemsAnalyzed: state.scanResult.itemCount,
                  issuesFound: state.scanResult.itemCount,
                  recoverableSpace: state.scanResult.totalSize,
                  categoryBreakdown: state.scanResult.categoryBreakdown,
                  issues: state.scanResult.items.map((item, i) => ({
                    id: `privacy-${i}`,
                    description: item.description,
                    category: item.category,
                    severity: item.riskLevel,
                    location: item.path,
                  })),
                }}
                isPro={isPro}
                onClose={() => vm.clearResults()}
                onFix={() => vm.clean()}
                onRescan={() => vm.scan()}
              />
            </div>
          )}

          {state.scanResult && (
            <Card title="Scan Results" className="mb-4">
              {/* Compact stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Card variant="glass" padded={false} className="p-3">
                  <p className="text-statistic text-text-primary">{state.scanResult.itemCount}</p>
                  <p className="text-caption text-text-secondary">Items found</p>
                </Card>
                <Card variant="glass" padded={false} className="p-3">
                  <p className="text-statistic text-text-primary">{vm.formatBytes(state.scanResult.totalSize)}</p>
                  <p className="text-caption text-text-secondary">Recoverable</p>
                </Card>
                <Card variant="glass" padded={false} className="p-3">
                  <Badge tone={RISK_TONE[state.scanResult.riskLevel] ?? 'neutral'} className="text-small">
                    {state.scanResult.riskLevel.toUpperCase()}
                  </Badge>
                  <p className="text-caption text-text-secondary mt-1">Risk level</p>
                </Card>
                <Card variant="glass" padded={false} className="p-3">
                  <p className="text-statistic text-text-primary">{state.scanResult.categoriesFound.length}</p>
                  <p className="text-caption text-text-secondary">Categories</p>
                </Card>
              </div>

              {/* Category breakdown */}
              <div className="space-y-1.5 mb-4">
                {Object.entries(state.scanResult.categoryBreakdown).map(([category, size]) => (
                  <div key={category} className="flex justify-between items-center p-2 rounded-[var(--avs-radius-md)] hover:bg-[var(--avs-surface-muted)]/50">
                    <span className="text-small text-text-secondary">{CATEGORY_LABELS[category] || category}</span>
                    <Badge tone="neutral">{vm.formatBytes(size)}</Badge>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleClean}
                disabled={state.cleaning || state.scanResult.itemCount === 0}
                className="w-full"
                variant="danger"
              >
                {state.cleaning ? 'Cleaning…' : 'Clean All'}
              </Button>
            </Card>
          )}

          {state.cleanResult && (
            <ModuleSuccessBanner
              title={`Cleaned ${state.cleanResult.itemsCleaned} items, freed ${vm.formatBytes(state.cleanResult.spaceFreed)}`}
              testId="privacy-clean-result"
            />
          )}

          {state.cleanResult && state.cleanResult.errors.length > 0 && (
            <ModuleErrorBanner
              message={`${state.cleanResult.errors.length} error(s) occurred during cleaning.`}
              testId="privacy-clean-errors"
            />
          )}
        </>
      )}
      {dialogElement}
    </div>
  );
}
