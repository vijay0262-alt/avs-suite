import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import {
  BoltIcon,
  StopIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '../../components/PageHeader';
import { JunkCleanerViewModel } from './JunkCleanerViewModel';
import { junkCleanerService } from './junkCleaner.service';
import { CategoryRow } from './components/CategoryRow';
import { ScanProgress } from './components/ScanProgress';
import { DetailsTable } from './components/DetailsTable';
import { PreviewDialog } from './components/PreviewDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { CleaningProgress } from './components/CleaningProgress';
import { CleaningSummary } from './components/CleaningSummary';
import { CleaningLog } from './components/CleaningLog';

/**
 * JunkCleanerPage — top-level view for the module.
 *
 * The View is intentionally thin: it renders state read from the
 * ViewModel and forwards user gestures. All logic (scan / clean /
 * poll / paging / history) lives in the ViewModel.
 */
export default function JunkCleanerPage() {
  const vm = useMemo(() => new JunkCleanerViewModel(junkCleanerService), []);
  const state = useViewModel(vm);
  const [scanIssuedOnce, setScanIssuedOnce] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const autoScan = searchParams.get('autoScan') === 'true';
  const autoScanIntentRef = useRef(false);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  // Track auto-scan intent from URL params
  useEffect(() => {
    if (autoScan) {
      autoScanIntentRef.current = true;
      console.log('[JunkCleanerPage] Auto-scan intent detected');
    }
  }, [autoScan]);

  // Auto-start scan when bootstrap is ready and auto-scan was requested
  useEffect(() => {
    if (autoScanIntentRef.current && !scanIssuedOnce && state.bootstrap === 'ready') {
      console.log('[JunkCleanerPage] Auto-starting scan');
      void vm.startScan();
      setScanIssuedOnce(true);
      autoScanIntentRef.current = false; // Clear intent after starting
    }
  }, [scanIssuedOnce, state.bootstrap, vm]);

  useEffect(() => {
    if (historyOpen) void vm.loadHistory(true);
  }, [historyOpen, vm]);

  // Reload history when filters change (already open).
  useEffect(() => {
    if (historyOpen) void vm.loadHistory(true);
  }, [historyOpen, state.historyQuery, state.historyCategory, state.historyResultFilter, vm]);

  const running = state.snapshot.status === 'running';
  const hasResults =
    state.snapshot.present && !running && Boolean(state.snapshot.cleaners?.length);
  const scanEverStarted = scanIssuedOnce || state.snapshot.present;

  const anySelected = state.selected.size > 0;
  const allSelected = state.selected.size === state.catalog.length && state.catalog.length > 0;

  const activeDetailsCleaner = state.detailsCleanerId
    ? state.catalog.find((c) => c.id === state.detailsCleanerId)
    : null;

  // Enable "Clean" once a scan finished with at least one file found.
  const canClean =
    hasResults &&
    (state.snapshot.totalFiles ?? 0) > 0 &&
    state.cleaningStep === 'closed' &&
    !state.cleaningSnapshot.present;

  return (
    <div data-testid="page-junk-cleaner">
      <PageHeader
        title="Junk Cleaner"
        description="Scan, preview, and safely remove temporary files, caches, and other clutter."
        actions={
          <div className="flex items-center gap-2">
            {!running ? (
              <>
                <Button
                  onClick={() => {
                    setScanIssuedOnce(true);
                    void vm.startScan();
                  }}
                  disabled={!anySelected || state.bootstrap !== 'ready'}
                  leftIcon={<BoltIcon className="h-4 w-4" />}
                  data-testid="junk-scan-btn"
                >
                  Scan
                </Button>
                {hasResults && (
                  <Button
                    variant="secondary"
                    onClick={() => void vm.rescan()}
                    leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                    data-testid="junk-rescan-btn"
                  >
                    Rescan
                  </Button>
                )}
                {canClean && (
                  <Button
                    variant="danger"
                    onClick={() => void vm.openPreview()}
                    leftIcon={<SparklesIcon className="h-4 w-4" />}
                    data-testid="junk-clean-btn"
                  >
                    Clean…
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setHistoryOpen((v) => !v)}
                  data-testid="junk-history-toggle"
                >
                  {historyOpen ? 'Hide history' : 'View history'}
                </Button>
              </>
            ) : (
              <Button
                variant="danger"
                onClick={() => void vm.cancelScan()}
                leftIcon={<StopIcon className="h-4 w-4" />}
                data-testid="junk-stop-btn"
              >
                Stop
              </Button>
            )}
          </div>
        }
      />

      {state.bootstrap === 'loading' && (
        <Card>
          <div className="py-6 text-sm text-text-muted" data-testid="junk-bootstrap-loading">
            Loading cleaner catalog…
          </div>
        </Card>
      )}

      {state.bootstrap === 'error' && (
        <Card>
          <div className="flex items-start gap-3 py-4" role="alert" data-testid="junk-bootstrap-error">
            <ExclamationTriangleIcon className="h-5 w-5 text-semantic-danger" />
            <div>
              <div className="text-sm font-medium text-text-primary">
                Could not reach the backend service.
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {state.bootstrapError ?? 'Unknown error.'}
              </div>
            </div>
          </div>
        </Card>
      )}

      {(state.lastScanError || state.lastCleaningError) && (
        <Card className="mb-4">
          <div
            role="alert"
            className="flex items-start gap-3 py-1 text-sm text-semantic-danger"
            data-testid="junk-error-banner"
          >
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
            <span>{state.lastScanError ?? state.lastCleaningError}</span>
          </div>
        </Card>
      )}

      {state.bootstrap === 'ready' && (
        <>
          {scanEverStarted && <ScanProgress snapshot={state.snapshot} />}

          <Card
            title="Categories"
            actions={
              <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-primary"
                  checked={allSelected}
                  onChange={(e) => vm.setAllSelected(e.target.checked)}
                  disabled={running}
                  data-testid="junk-select-all"
                />
                Select all
              </label>
            }
          >
            {state.catalog.length === 0 ? (
              <div className="py-6 text-sm text-text-muted" data-testid="junk-empty-catalog">
                No cleaners registered.
              </div>
            ) : (
              <div className="space-y-2">
                {state.catalog.map((c) => (
                  <CategoryRow
                    key={c.id}
                    id={c.id}
                    name={c.name}
                    description={c.description}
                    category={c.category}
                    summary={vm.currentCleanerSummary(c.id)}
                    selected={state.selected.has(c.id)}
                    disabled={running}
                    detailsAvailable={Boolean(state.activeTaskId) && !running}
                    onToggle={(id) => vm.toggleSelection(id)}
                    onViewDetails={(id) => void vm.openDetails(id)}
                  />
                ))}
              </div>
            )}
          </Card>

          {activeDetailsCleaner && (
            <DetailsTable
              items={state.detailsItems}
              loading={state.detailsLoading}
              error={state.detailsError}
              cleanerName={activeDetailsCleaner.name}
              onClose={() => vm.closeDetails()}
            />
          )}

          {historyOpen && (
            <CleaningLog
              entries={state.historyEntries}
              total={state.historyTotal}
              loading={state.historyLoading}
              error={state.historyError}
              query={state.historyQuery}
              categoryFilter={state.historyCategory}
              resultFilter={state.historyResultFilter}
              onQueryChange={(q) => vm.setHistoryQuery(q)}
              onCategoryChange={(c) => vm.setHistoryCategory(c)}
              onResultChange={(r) => vm.setHistoryResultFilter(r)}
              onReload={() => void vm.loadHistory(true)}
            />
          )}
        </>
      )}

      {/* Cleaning flow — modals live here */}
      <PreviewDialog
        open={state.cleaningStep === 'preview'}
        loading={state.cleaningPreviewLoading}
        error={state.cleaningPreviewError}
        preview={state.cleaningPreview}
        onCancel={() => vm.cancelCleaningFlow()}
        onProceed={() => vm.advanceToConfirm()}
      />
      <ConfirmDialog
        open={state.cleaningStep === 'confirm'}
        preview={state.cleaningPreview}
        onBack={() => vm.cancelCleaningFlow()}
        onConfirm={() => void vm.confirmAndExecute()}
      />
      <CleaningProgress
        open={state.cleaningStep === 'running'}
        snapshot={state.cleaningSnapshot}
        onCancel={() => void vm.cancelCleaning()}
      />
      <CleaningSummary
        open={state.cleaningStep === 'summary'}
        snapshot={state.cleaningSnapshot}
        onClose={() => vm.closeCleaningSummary()}
        onUndo={() => void vm.undoLastClean()}
      />
    </div>
  );
}
