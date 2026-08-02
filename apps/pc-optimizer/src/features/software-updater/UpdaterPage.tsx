/**
 * UpdaterPage — list and apply software updates via winget.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleEmptyState, ModuleSuccessBanner, ModuleErrorBanner } from '../../components/ModuleStates';
import { SharedConfirmDialog } from '../../components/SharedConfirmDialog';
import { HelpButton } from '../../components/HelpButton';
import { UpdaterViewModel } from './UpdaterViewModel';
import { updaterService } from './updater.service';
import { useFeatureGuard } from '../licensing/useFeatureGuard';

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
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="updater-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Updates</h2>
              {state.available ? (
                <p className="text-sm text-text-secondary">
                  {state.upgrades.length} update{state.upgrades.length !== 1 ? 's' : ''} available
                </p>
              ) : (
                <p className="text-sm text-red-400">{state.reason}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => vm.refresh()} disabled={state.loading}>
                {state.loading ? 'Checking…' : 'Check for Updates'}
              </Button>
              {state.upgrades.length > 0 && (
                <Button variant="primary" onClick={() => guard('software.update_all', 'Software Updater', () => setConfirmAll(true))} disabled={state.loading}>
                  Update All
                </Button>
              )}
            </div>
          </div>

          {state.actionMessage && (
            <ModuleSuccessBanner
              title={state.actionMessage}
              testId="updater-action-success"
            />
          )}
          {state.actionError && (
            <ModuleErrorBanner
              message={state.actionError}
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
                      <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
                      <p className="text-xs text-text-muted">
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
