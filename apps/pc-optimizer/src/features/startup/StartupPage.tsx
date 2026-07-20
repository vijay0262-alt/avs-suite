/**
 * StartupPage - Main Startup Manager page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { StartupViewModel } from './StartupViewModel';
import { startupService } from './startup.service';
import { StartupEntryCard } from './components/StartupEntryCard';
import type { StartupEntry } from './startup.types';

export default function StartupPage() {
  const vm = useMemo(() => new StartupViewModel(startupService), []);
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleDisable = async (entry: StartupEntry) => {
    try {
      const result = await vm.disableEntry(entry);
      if (!result.success) {
        alert(result.message || 'Failed to disable entry');
      }
    } catch (err) {
      alert('Failed to disable entry');
    }
  };

  const handleEnable = async (entry: StartupEntry) => {
    try {
      const result = await vm.enableEntry(entry);
      if (!result.success) {
        alert(result.message || 'Failed to enable entry');
      }
    } catch (err) {
      alert('Failed to enable entry');
    }
  };

  const handleRefresh = () => {
    void vm.loadEntries();
  };

  const enabledCount = state.entries.filter(e => e.enabled).length;
  const highImpactCount = state.entries.filter(e => e.impact === 'high' && e.enabled).length;

  return (
    <div data-testid="page-startup-manager">
      <PageHeader
        title="Startup Manager"
        description="Control which programs launch when Windows starts"
      />

      {state.bootstrap === 'loading' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-text-secondary">Loading startup entries...</p>
          </div>
        </Card>
      )}

      {state.bootstrap === 'error' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{state.bootstrapError}</p>
            <Button onClick={handleRefresh}>Retry</Button>
          </div>
        </Card>
      )}

      {state.bootstrap === 'ready' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card title="Total Entries">
              <p className="text-3xl font-bold text-text-primary">{state.entries.length}</p>
              <p className="text-sm text-text-secondary">Startup items</p>
            </Card>
            <Card title="Enabled">
              <p className="text-3xl font-bold text-green-500">{enabledCount}</p>
              <p className="text-sm text-text-secondary">Currently active</p>
            </Card>
            <Card title="High Impact">
              <p className="text-3xl font-bold text-red-500">{highImpactCount}</p>
              <p className="text-sm text-text-secondary">Slowing startup</p>
            </Card>
          </div>

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Startup Entries</h2>
            <Button variant="secondary" onClick={handleRefresh} disabled={state.loading}>
              {state.loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          {state.entries.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <p className="text-text-secondary">
                  {state.loading ? 'Loading startup entries...' : 'No startup entries found'}
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {state.entries.map((entry, index) => (
                <StartupEntryCard
                  key={`${entry.name}-${index}`}
                  entry={entry}
                  onDisable={handleDisable}
                  onEnable={handleEnable}
                  loading={state.loading}
                />
              ))}
            </div>
          )}

          {state.backups.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Backup History</h2>
              <Card>
                <div className="space-y-2">
                  {state.backups.map((backup) => (
                    <div key={backup.backupId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm text-text-primary">{backup.entryName}</p>
                        <p className="text-xs text-text-muted">{backup.timestamp}</p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => vm.restoreBackup(backup.backupId)}
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
