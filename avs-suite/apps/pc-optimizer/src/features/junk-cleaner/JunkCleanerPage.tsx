import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import {
  BoltIcon,
  StopIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '../../components/PageHeader';
import { JunkCleanerViewModel } from './JunkCleanerViewModel';
import { junkCleanerService } from './junkCleaner.service';
import { CategoryRow } from './components/CategoryRow';
import { ScanProgress } from './components/ScanProgress';
import { DetailsTable } from './components/DetailsTable';

/**
 * JunkCleanerPage — top-level view for the module.
 *
 * The View is intentionally thin: it renders state read from the
 * ViewModel and forwards user gestures. All logic (start / cancel /
 * poll / paging) lives in the ViewModel.
 */
export default function JunkCleanerPage() {
  const vm = useMemo(() => new JunkCleanerViewModel(junkCleanerService), []);
  const state = useViewModel(vm);
  const [scanIssuedOnce, setScanIssuedOnce] = useState(false);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const running = state.snapshot.status === 'running';
  const hasResults =
    state.snapshot.present && !running && Boolean(state.snapshot.cleaners?.length);
  const scanEverStarted = scanIssuedOnce || state.snapshot.present;

  const anySelected = state.selected.size > 0;
  const allSelected = state.selected.size === state.catalog.length && state.catalog.length > 0;

  const activeDetailsCleaner = state.detailsCleanerId
    ? state.catalog.find((c) => c.id === state.detailsCleanerId)
    : null;

  return (
    <div data-testid="page-junk-cleaner">
      <PageHeader
        title="Junk Cleaner"
        description="Find temporary files, caches, and other safely-removable clutter. Nothing is deleted — this build only scans."
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

      {state.lastScanError && (
        <Card className="mb-4">
          <div
            role="alert"
            className="flex items-start gap-3 py-1 text-sm text-semantic-danger"
            data-testid="junk-scan-error"
          >
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
            <span>{state.lastScanError}</span>
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
        </>
      )}
    </div>
  );
}
