/**
 * UpdaterPage — list and apply software updates via winget.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { UpdaterViewModel } from './UpdaterViewModel';
import { updaterService } from './updater.service';

export default function UpdaterPage() {
  const vm = useMemo(() => new UpdaterViewModel(updaterService), []);
  const state = useViewModel(vm);
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
      />

      {state.bootstrap === 'error' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{state.bootstrapError}</p>
            <Button onClick={() => vm.bootstrap()}>Retry</Button>
          </div>
        </Card>
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
                <Button variant="primary" onClick={() => setConfirmAll(true)} disabled={state.loading}>
                  Update All
                </Button>
              )}
            </div>
          </div>

          {state.actionMessage && (
            <Card>
              <p className="text-green-500 py-2">{state.actionMessage}</p>
            </Card>
          )}
          {state.actionError && (
            <Card>
              <p className="text-red-500 py-2">{state.actionError}</p>
            </Card>
          )}

          {state.available && state.upgrades.length === 0 && !state.loading && (
            <Card>
              <p className="text-center text-text-secondary py-8">All checked applications are up to date.</p>
            </Card>
          )}

          {state.upgrades.length > 0 && (
            <Card>
              <div className="divide-y divide-border">
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
                      onClick={() => vm.upgrade(u.packageId)}
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

      {confirmAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Update all packages?</h3>
            <p className="text-sm text-text-secondary mb-6">
              This will start winget updating all {state.upgrades.length} available packages in the background.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmAll(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmAll(false);
                  void vm.upgradeAll();
                }}
              >
                Update All
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
