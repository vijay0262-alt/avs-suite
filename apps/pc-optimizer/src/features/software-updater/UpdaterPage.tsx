/**
 * UpdaterPage — list and apply software updates via winget.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button, GaugeCard, StatTile } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleEmptyState, ModuleSuccessBanner, ModuleErrorBanner, ModuleLoadingState } from '../../components/ModuleStates';
import { SharedConfirmDialog } from '../../components/SharedConfirmDialog';
import { HelpButton } from '../../components/HelpButton';
import { UpdaterViewModel } from './UpdaterViewModel';
import { updaterService } from './updater.service';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import {
  ArrowPathIcon,
  ArrowUpCircleIcon,
  CheckCircleIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export default function UpdaterPage() {
  const vm = useMemo(() => new UpdaterViewModel(updaterService), []);
  const state = useViewModel(vm);
  const { guard, dialogElement } = useFeatureGuard();
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  return (
    <div data-testid="page-software-updater">
      <PageHeader
        title="Software Updater"
        description="Keep your applications up to date with the Windows Package Manager (winget)."
        actions={<HelpButton text="The Software Updater uses winget to check for and install available updates for your installed applications. Update individual apps or use Update All to apply everything at once." />}
      />

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message="Could not reach the backend service. Please try again."
          onRetry={() => vm.bootstrap()}
          testId="updater-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {/* Hero status section — System Mechanic style */}
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="updater-hero-section">
            {/* Gauge */}
            <GaugeCard
              title={state.loading ? 'Checking…' : state.upgrades.length > 0 ? 'Updates Available' : 'All Up to Date'}
              value={Math.min(100, state.upgrades.length)}
              unit=""
              tone={state.upgrades.length > 5 ? 'danger' : state.upgrades.length > 0 ? 'warning' : 'success'}
              icon={<ArrowUpCircleIcon className="h-6 w-6" />}
              description={state.loading ? 'Scanning installed applications' : state.upgrades.length > 0 ? `${state.upgrades.length} updates ready to install` : 'No updates available'}
              data-testid="updater-hero-gauge"
            />

            {/* Key stats */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label="Updates"
                value={state.upgrades.length.toString()}
                hint={state.upgrades.length > 0 ? 'Available' : 'None pending'}
                icon={<ArrowUpCircleIcon className="h-5 w-5" />}
                variant="glass"
                accentColor={state.upgrades.length > 0 ? 'var(--avs-warning)' : 'var(--avs-success)'}
              />
              <StatTile
                label="Status"
                value={state.available ? 'Active' : 'Unavailable'}
                hint={state.available ? 'winget ready' : 'winget not found'}
                icon={<CommandLineIcon className="h-5 w-5" />}
                variant="glass"
                accentColor={state.available ? 'var(--avs-success)' : 'var(--avs-warning)'}
              />
              <StatTile
                label="Up to Date"
                value={state.available && state.upgrades.length === 0 ? 'Yes' : '—'}
                hint={state.available ? 'All apps current' : 'N/A'}
                icon={<CheckCircleIcon className="h-5 w-5" />}
                variant="glass"
                accentColor="var(--avs-success)"
              />
              <StatTile
                label="Updating"
                value={state.busyIds.size.toString()}
                hint={state.busyIds.size > 0 ? 'In progress' : 'Idle'}
                icon={<ArrowPathIcon className="h-5 w-5" />}
                variant="glass"
              />
              <StatTile
                label="Action"
                value={state.upgrades.length > 0 ? 'Update All' : 'Check'}
                hint={state.upgrades.length > 0 ? 'Click above' : 'Click above'}
                icon={<ExclamationTriangleIcon className="h-5 w-5" />}
                variant="glass"
              />
              <StatTile
                label="Source"
                value="winget"
                hint="Windows Package Manager"
                icon={<CommandLineIcon className="h-5 w-5" />}
                variant="glass"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-section-title font-semibold text-text-primary">Updates</h2>
              {state.loading ? (
                <div className="flex items-center gap-2 mt-1">
                  <ArrowPathIcon className="h-4 w-4 text-[var(--avs-brand-primary)] animate-spin" aria-hidden />
                  <p className="text-small text-text-secondary">Checking for updates…</p>
                </div>
              ) : state.available ? (
                <p className="text-small text-text-secondary">
                  {state.upgrades.length} update{state.upgrades.length !== 1 ? 's' : ''} available
                </p>
              ) : (
                <p className="text-small text-text-muted">Update checking is not available. Please ensure winget is installed.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => vm.refresh()} disabled={state.loading} leftIcon={state.loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : undefined}>
                {state.loading ? 'Checking…' : 'Check for Updates'}
              </Button>
              {state.upgrades.length > 0 && (
                <Button variant="primary" onClick={() => guard('software.update_all', 'Software Updater', () => setConfirmAll(true))} disabled={state.loading}>
                  Update All
                </Button>
              )}
            </div>
          </div>

          {state.loading && (
            <ModuleLoadingState
              message="Scanning installed applications for available updates…"
              testId="updater-checking"
            />
          )}

          {state.actionMessage && (
            <ModuleSuccessBanner
              title={state.actionMessage}
              testId="updater-action-success"
            />
          )}
          {state.actionError && (
            <ModuleErrorBanner
              message="Update encountered an issue. Please try again."
              testId="updater-action-error"
            />
          )}

          {state.available && state.upgrades.length === 0 && !state.loading && (
            <ModuleEmptyState
              title="All applications are up to date"
              message="No updates are currently available for your installed applications."
              testId="updater-empty"
            />
          )}

          {state.upgrades.length > 0 && (
            <Card>
              <div className="divide-y divide-[var(--avs-border)]">
                {state.upgrades.map((u) => (
                  <div key={u.packageId} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-small font-medium text-text-primary truncate">{u.name}</p>
                      <p className="text-caption text-text-muted">
                        {u.currentVersion} → {u.availableVersion}
                        {u.source ? ` · ${u.source}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={state.busyIds.has(u.packageId)}
                      onClick={() => guard('software.update_manual', 'Software Updater', () => vm.upgrade(u.packageId))}
                    >
                      {state.busyIds.has(u.packageId) ? 'Updating…' : 'Update'}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <SharedConfirmDialog
        open={confirmAll}
        title="Update all packages?"
        message={`This will start winget updating all ${state.upgrades.length} available packages in the background.`}
        confirmLabel="Update All"
        onConfirm={() => {
          setConfirmAll(false);
          void vm.upgradeAll();
        }}
        onCancel={() => setConfirmAll(false)}
        testId="updater-confirm-all"
      />
      {dialogElement}
    </div>
  );
}
