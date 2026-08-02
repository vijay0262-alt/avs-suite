/**
 * PrivacyPage - Main Privacy Cleaner page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleLoadingState, ModuleSuccessBanner, ModuleErrorBanner } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { PrivacyViewModel } from './PrivacyViewModel';
import { privacyService } from './privacy.service';
import { useFeatureGuard } from '../licensing/useFeatureGuard';

export default function PrivacyPage() {
  const vm = useMemo(() => new PrivacyViewModel(privacyService), []);
  const state = useViewModel(vm);
  const { guard, dialogElement } = useFeatureGuard();

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

  const handleSelectAll = () => {
    vm.selectAllCategories();
  };

  const handleDeselectAll = () => {
    vm.deselectAllCategories();
  };

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

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div data-testid="page-privacy-cleaner">
      <PageHeader
        title="Privacy Cleaner"
        description="Clear browser traces and Windows components that record activity"
        actions={<HelpButton text="The privacy cleaner removes browsing history, cache, cookies, and other traces from your browsers and Windows. Detected browsers are highlighted. A backup is created before cleaning." />}
      />

      {state.bootstrap === 'loading' && (
        <ModuleLoadingState
          message="Loading…"
          testId="privacy-loading"
        />
      )}

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="privacy-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {state.scanError && (
            <ModuleErrorBanner
              message={state.scanError}
              onRetry={() => vm.scan()}
              onDismiss={() => vm.clearScanError()}
              testId="privacy-scan-error"
            />
          )}
          {state.cleanError && (
            <ModuleErrorBanner
              message={state.cleanError}
              onDismiss={() => vm.clearCleanError()}
              testId="privacy-clean-error"
            />
          )}
          <Card title="Detected Browsers" className="mb-4">
            {state.browsersLoading ? (
              <p className="text-text-secondary">Detecting browsers...</p>
            ) : state.browsersDetected.length === 0 ? (
              <p className="text-text-secondary">No browsers detected</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {state.browsersDetected.map(browser => {
                  const browserCats = BROWSER_CATEGORIES.filter(c => c.startsWith(browser));
                  const allSelected = browserCats.every(c => state.selectedCategories.has(c));
                  const handleBrowserToggle = () => {
                    if (allSelected) {
                      browserCats.forEach(c => {
                        if (state.selectedCategories.has(c)) vm.toggleCategory(c);
                      });
                    } else {
                      browserCats.forEach(c => {
                        if (!state.selectedCategories.has(c)) vm.toggleCategory(c);
                      });
                    }
                  };
                  return (
                    <label key={browser} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--avs-surface-muted)] rounded-lg cursor-pointer hover:bg-[var(--avs-surface-muted)]">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleBrowserToggle}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-text-primary font-medium">
                        {browser.charAt(0).toUpperCase() + browser.slice(1)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Select Categories to Scan" className="mb-4">
            <div className="mb-3 flex gap-2">
              <Button variant="secondary" size="sm" onClick={handleSelectAll}>Select All</Button>
              <Button variant="secondary" size="sm" onClick={handleDeselectAll}>Deselect All</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
                const isBrowserCategory = BROWSER_CATEGORIES.includes(category);
                const isBrowserDetected = state.browsersDetected.some(b => category.startsWith(b));
                const isDisabled = isBrowserCategory && !isBrowserDetected;
                
                return (
                  <label key={category} className={`flex items-center gap-2 p-2 rounded hover:bg-[var(--avs-surface-muted)] ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={state.selectedCategories.has(category)}
                      disabled={isDisabled}
                      onChange={() => handleToggleCategory(category)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-text-primary">{label}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4">
              <Button 
                onClick={handleScan} 
                disabled={state.scanning || state.selectedCategories.size === 0}
                className="w-full"
              >
                {state.scanning ? 'Scanning...' : 'Scan'}
              </Button>
            </div>
          </Card>

          {state.scanResult && (
            <Card title="Scan Results" className="mb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-2xl font-bold text-text-primary">{state.scanResult.itemCount}</p>
                  <p className="text-sm text-text-secondary">Items Found</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{vm.formatBytes(state.scanResult.totalSize)}</p>
                  <p className="text-sm text-text-secondary">Recoverable Space</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${getRiskColor(state.scanResult.riskLevel)}`}>
                    {state.scanResult.riskLevel.toUpperCase()}
                  </p>
                  <p className="text-sm text-text-secondary">Risk Level</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-text-primary">{state.scanResult.categoriesFound.length}</p>
                  <p className="text-sm text-text-secondary">Categories</p>
                </div>
              </div>

              <div className="mb-4">
                <h3 className="font-semibold text-text-primary mb-2">Category Breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(state.scanResult.categoryBreakdown).map(([category, size]) => (
                    <div key={category} className="flex justify-between items-center">
                      <span className="text-sm text-text-secondary">{CATEGORY_LABELS[category] || category}</span>
                      <span className="text-sm text-text-primary">{vm.formatBytes(size)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button 
                onClick={handleClean} 
                disabled={state.cleaning || state.scanResult.itemCount === 0}
                className="w-full"
              >
                {state.cleaning ? 'Cleaning...' : 'Clean All'}
              </Button>
            </Card>
          )}

          {state.cleanResult && (
            <ModuleSuccessBanner
              title={`Cleaned ${state.cleanResult.itemsCleaned} items, freed ${vm.formatBytes(state.cleanResult.spaceFreed)}`}
              message={`Duration: ${(state.cleanResult.durationMs / 1000).toFixed(2)}s · Categories: ${state.cleanResult.categoriesCleaned.join(', ')}`}
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
