import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import {
  BoltIcon,
  StopIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  CalendarDaysIcon,
  ClockIcon,
  LightBulbIcon,
  ArrowPathRoundedSquareIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { JunkCleanerViewModel } from './JunkCleanerViewModel';
import { junkCleanerService } from './junkCleaner.service';
import { CategoryRow } from './components/CategoryRow';
import { UnifiedScanProgressCard, JUNK_SCAN_CONFIG } from '../unified-scan';
import { ScanProgress } from './components/ScanProgress';
import { DetailsTable } from './components/DetailsTable';
import { PreviewDialog } from './components/PreviewDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { CleaningProgress } from './components/CleaningProgress';
import { CleaningSummary } from './components/CleaningSummary';
import { CleaningLog } from './components/CleaningLog';
import { canUse, currentEdition } from '../licensing/FeatureGate';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { useIsPro } from '../sync/syncStore';
import { ProOnlySection, ProFeatureIndicator } from '../licensing/ProStatusBadge';
import { schedulerBackendService } from '../maintenance-engine/schedulerBackendService';

const FREE_CLEAN_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

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
    }
  }, [autoScan]);

  // Auto-start scan when bootstrap is ready and auto-scan was requested
  useEffect(() => {
    if (autoScanIntentRef.current && !scanIssuedOnce && state.bootstrap === 'ready') {
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
  const { guard, dialogElement } = useFeatureGuard();
  const isPro = useIsPro();
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFreq, setScheduleFreq] = useState('weekly');
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [bgCleanupEnabled, setBgCleanupEnabled] = useState(false);
  const hasResults =
    state.snapshot.present && !running && Boolean(state.snapshot.cleaners?.length);
  const scanEverStarted = scanIssuedOnce || state.snapshot.present;

  // Load existing scheduled junk cleanup task on mount (Pro only)
  useEffect(() => {
    if (!isPro) return;
    void (async () => {
      try {
        const result = await schedulerBackendService.listTasks();
        const junkTask = result.tasks.find((t) => t.action === 'junk_clean');
        if (junkTask) {
          setScheduleEnabled(true);
          const freq = junkTask.nextRun ? 'weekly' : 'weekly';
          setScheduleFreq(freq);
        }
      } catch { /* ignore - backend may not be available */ }
    })();
  }, [isPro]);

  const handleScheduleToggle = useCallback(async (enabled: boolean) => {
    setScheduleEnabled(enabled);
    if (!enabled) {
      try {
        setScheduleLoading(true);
        await schedulerBackendService.deleteTask('junk_clean');
      } catch { /* ignore */ } finally {
        setScheduleLoading(false);
      }
    } else {
      try {
        setScheduleLoading(true);
        await schedulerBackendService.createTask({
          action: 'junk_clean',
          schedule: scheduleFreq,
          time: '03:00',
        });
      } catch { /* ignore */ } finally {
        setScheduleLoading(false);
      }
    }
  }, [scheduleFreq]);

  const handleScheduleFreqChange = useCallback(async (freq: string) => {
    setScheduleFreq(freq);
    if (scheduleEnabled) {
      try {
        setScheduleLoading(true);
        await schedulerBackendService.updateTask({
          action: 'junk_clean',
          schedule: freq,
          time: '03:00',
        });
      } catch { /* ignore */ } finally {
        setScheduleLoading(false);
      }
    }
  }, [scheduleEnabled]);

  // Smart recommendations: sort cleaners by bytes (largest first) for Pro users
  const smartRecommendations = useMemo(() => {
    if (!isPro || !state.snapshot.present || !state.snapshot.cleaners) return [];
    return [...state.snapshot.cleaners]
      .filter((c) => c.totalBytes > 0)
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, 3);
  }, [isPro, state.snapshot]);

  const anySelected = state.selected.size > 0;
  const allSelected = state.selected.size === state.catalog.length && state.catalog.length > 0;

  const activeDetailsCleaner = state.detailsCleanerId
    ? state.catalog.find((c) => c.id === state.detailsCleanerId)
    : null;

  // Enable "Clean" once a scan finished with at least one file found.
  const totalJunkBytes = state.snapshot.totalBytes ?? 0;
  const isFreeEdition = currentEdition() === 'free';
  const hasUnlimitedClean = canUse('junk.clean_unlimited');
  const exceedsFreeLimit = isFreeEdition && !hasUnlimitedClean && totalJunkBytes > FREE_CLEAN_LIMIT_BYTES;
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
            <HelpButton text="The Junk Cleaner scans for temporary files, caches, logs, and other clutter. Preview files before cleaning. All items can be restored from the cleaning log." />
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
                {exceedsFreeLimit && (
                  <button
                    className="text-caption text-semantic-warning flex items-center gap-1 hover:underline"
                    onClick={() => guard('junk.clean_unlimited', 'Junk Cleaner', () => {})}
                  >
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    Free edition cleans up to 500 MB. {(totalJunkBytes / (1024 * 1024)).toFixed(0)} MB detected — click to upgrade.
                  </button>
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

      {/* Safety guardrail banner */}
      <div
        className="mb-4 rounded-[var(--avs-radius-md)] border border-[color-mix(in_srgb,var(--avs-brand-primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)] px-4 py-3"
        data-testid="junk-safety-banner"
      >
        <div className="flex items-start gap-2">
          <ShieldCheckIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
          <div className="text-caption text-text-secondary">
            <span className="font-semibold text-text-primary">Safety Guardrails:</span>{' '}
            AVS Shield never touches <strong>C:\Windows\System32</strong>,{' '}
            <strong>Windows Search Index</strong> (Windows.edb), or{' '}
            <strong>active system registry keys</strong>. Browser cookies &amp; history
            are opt-in (unchecked by default). A{' '}
            <strong>System Restore Point</strong> is automatically created before
            every cleaning operation.
          </div>
        </div>
      </div>

      {state.bootstrap === 'loading' && (
        <Card>
          <div className="py-6 text-small text-text-muted" data-testid="junk-bootstrap-loading">
            Loading cleaner catalog…
          </div>
        </Card>
      )}

      {state.bootstrap === 'error' && (
        <Card>
          <div className="flex items-start gap-3 py-4" role="alert" data-testid="junk-bootstrap-error">
            <ExclamationTriangleIcon className="h-5 w-5 text-semantic-danger" />
            <div>
              <div className="text-small font-medium text-text-primary">
                Could not reach the backend service.
              </div>
              <div className="mt-1 text-caption text-text-muted">
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
            className="flex items-start gap-3 py-1 text-small text-semantic-danger"
            data-testid="junk-error-banner"
          >
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
            <span>{state.lastScanError ?? state.lastCleaningError}</span>
          </div>
        </Card>
      )}

      {state.bootstrap === 'ready' && (
        <>
          {/* Free edition limit notice */}
          {!isPro && hasResults && totalJunkBytes > FREE_CLEAN_LIMIT_BYTES && (
            <div className="rounded-[var(--avs-radius-md)] bg-semantic-warning/10 border border-semantic-warning/20 px-4 py-3" data-testid="junk-free-limit-notice">
              <div className="flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0" />
                <div>
                  <span className="text-small font-medium text-text-primary">
                    Free edition cleans up to 500 MB per session
                  </span>
                  <p className="text-caption text-text-secondary mt-0.5">
                    {(totalJunkBytes / (1024 * 1024)).toFixed(0)} MB detected. Only the largest categories under 500 MB will be cleaned. Upgrade to Professional for unlimited cleaning.
                  </p>
                </div>
              </div>
            </div>
          )}

          {scanEverStarted && state.snapshot.status === 'running' && (
            <div className="mb-4">
              <UnifiedScanProgressCard
                config={JUNK_SCAN_CONFIG}
                isRunning={state.snapshot.status === 'running'}
                progress={state.snapshot.progress ?? 0}
                currentFile={state.snapshot.currentPath ?? null}
                startTime={state.snapshot.startedAt ?? null}
                counters={{
                  filesScanned: state.snapshot.totalFiles ?? 0,
                  junkFiles: state.snapshot.totalItems ?? 0,
                  junkSize: state.snapshot.totalBytes ?? 0,
                }}
              />
            </div>
          )}
          {scanEverStarted && state.snapshot.status !== 'running' && <ScanProgress snapshot={state.snapshot} />}

          <Card
            title="Categories"
            actions={
              <label className="flex cursor-pointer select-none items-center gap-2 text-caption text-text-secondary">
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
              <div className="py-6 text-small text-text-muted" data-testid="junk-empty-catalog">
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

          {/* Pro-only: Smart Cleanup Recommendations */}
          <ProOnlySection>
            {smartRecommendations.length > 0 && (
              <Card title="Smart Cleanup Recommendations" variant="glass">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <LightBulbIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
                    <span className="text-small font-medium text-[var(--avs-text-primary)]">
                      AI-powered recommendations based on scan results
                    </span>
                  </div>
                  {smartRecommendations.map((rec, idx) => {
                    const cleaner = state.catalog.find((c) => c.id === rec.id);
                    return (
                      <div
                        key={rec.id}
                        className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--avs-brand-primary)]/10 text-caption font-bold text-[var(--avs-brand-primary)]">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="text-small font-medium text-[var(--avs-text-primary)]">
                              {cleaner?.name ?? rec.id}
                            </span>
                            <p className="text-caption text-[var(--avs-text-muted)]">
                              {(rec.totalBytes / (1024 * 1024)).toFixed(0)} MB · {rec.totalFiles} files
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            vm.setAllSelected(false);
                            vm.toggleSelection(rec.id);
                          }}
                          data-testid={`smart-rec-clean-${rec.id}`}
                        >
                          Clean This
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Pro-only: Scheduled Cleaning & Background Cleanup */}
            <Card title="Automation" variant="glass">
              <div className="space-y-3">
                {/* Scheduled Cleaning */}
                <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <div className="flex items-center gap-2">
                    <CalendarDaysIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
                    <div>
                      <span className="text-caption font-medium text-[var(--avs-text-primary)]">Scheduled Cleaning</span>
                      <p className="text-caption text-[var(--avs-text-muted)]">Automatically clean junk files on a schedule</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={scheduleFreq}
                      onChange={(e) => void handleScheduleFreqChange(e.target.value)}
                      disabled={!scheduleEnabled || scheduleLoading}
                      className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-2 py-1 text-caption text-[var(--avs-text-primary)]"
                      data-testid="junk-schedule-freq"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <button
                      onClick={() => void handleScheduleToggle(!scheduleEnabled)}
                      disabled={scheduleLoading}
                      className={`relative h-6 w-11 rounded-full transition-colors ${scheduleEnabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-glass-border)]'}`}
                      data-testid="junk-schedule-toggle"
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${scheduleEnabled ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                </div>

                {/* Background Cleanup */}
                <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <div className="flex items-center gap-2">
                    <ArrowPathRoundedSquareIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
                    <div>
                      <span className="text-caption font-medium text-[var(--avs-text-primary)]">Background Cleanup</span>
                      <p className="text-caption text-[var(--avs-text-muted)]">Continuously clean junk files in the background</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setBgCleanupEnabled((v) => !v)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${bgCleanupEnabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-glass-border)]'}`}
                    data-testid="junk-bg-cleanup-toggle"
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${bgCleanupEnabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--avs-border)]">
                  <ProFeatureIndicator icon={ClockIcon} label="Unlimited Cleaning" />
                  <ProFeatureIndicator icon={CalendarDaysIcon} label="Scheduled" />
                  <ProFeatureIndicator icon={ArrowPathRoundedSquareIcon} label="Background" />
                  <ProFeatureIndicator icon={LightBulbIcon} label="Smart Recommendations" />
                </div>
              </div>
            </Card>
          </ProOnlySection>
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
      {dialogElement}
    </div>
  );
}
