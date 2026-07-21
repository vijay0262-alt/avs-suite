/**
 * StartupPage - Main Startup Manager page
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { StartupViewModel } from './StartupViewModel';
import { startupService } from './startup.service';
import { StartupEntryCard } from './components/StartupEntryCard';
import type { StartupEntry } from './startup.types';

type SortBy = 'name' | 'impact' | 'publisher' | 'status';

export default function StartupPage() {
  const vm = useMemo(() => new StartupViewModel(startupService), []);
  const state = useViewModel(vm);
  const [query, setQuery] = useState('');
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medium' | 'low' | 'unknown'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('enabled');
  const [sortBy, setSortBy] = useState<SortBy>('name');

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleDisable = async (entry: StartupEntry) => {
    try {
      const result = await vm.disableEntry(entry);
      if (!result.success) {
        const msg = result.message || result.error || result.reason || 'Failed to disable entry';
        if (msg === 'Already Disabled') {
          await vm.loadEntries();
        } else {
          alert(msg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disable entry';
      alert(msg);
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

  const enabledCount = state.entries.filter((e) => e.enabled).length;
  const highImpactCount = state.entries.filter((e) => e.impact === 'high' && e.enabled).length;

  const impactWeight = (impact: string) => ({ high: 3, medium: 2, low: 1, unknown: 0 }[impact] ?? 0);

  const filteredEntries = useMemo(() => {
    let list = state.entries.filter((e) => {
      const matchesQuery =
        `${e.name} ${e.publisher} ${e.command}`.toLowerCase().includes(query.toLowerCase()) ||
        !query;
      const matchesImpact = impactFilter === 'all' || e.impact === impactFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' && e.enabled) ||
        (statusFilter === 'disabled' && !e.enabled);
      return matchesQuery && matchesImpact && matchesStatus;
    });

    list = [...list].sort((a, b) => {
      const dir = 1;
      switch (sortBy) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'publisher':
          return dir * (a.publisher || '').localeCompare(b.publisher || '');
        case 'impact':
          return dir * (impactWeight(b.impact) - impactWeight(a.impact));
        case 'status':
          return dir * (Number(b.enabled) - Number(a.enabled));
        default:
          return 0;
      }
    });

    return list;
  }, [state.entries, query, impactFilter, statusFilter, sortBy]);

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
              <p className="text-3xl font-bold text-semantic-success">{enabledCount}</p>
              <p className="text-sm text-text-secondary">Currently active</p>
            </Card>
            <Card title="High Impact">
              <p className="text-3xl font-bold text-semantic-danger">{highImpactCount}</p>
              <p className="text-sm text-text-secondary">Slowing startup</p>
            </Card>
          </div>

          <Card className="mb-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <input
                type="text"
                aria-label="Search startup entries"
                placeholder="Search name, publisher, or command"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 rounded-md bg-bg-secondary border border-border px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              />
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
                className="rounded-md bg-bg-secondary border border-border px-3 py-1.5 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                <option value="all">Include Disabled</option>
                <option value="enabled">Enabled Only</option>
                <option value="disabled">Disabled Only</option>
              </select>
              <select
                aria-label="Filter by impact"
                value={impactFilter}
                onChange={(e) => setImpactFilter(e.target.value as typeof impactFilter)}
                className="rounded-md bg-bg-secondary border border-border px-3 py-1.5 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                <option value="all">All impacts</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="unknown">Unknown</option>
              </select>
              <select
                aria-label="Sort startup entries"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="rounded-md bg-bg-secondary border border-border px-3 py-1.5 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              >
                <option value="name">Sort by name</option>
                <option value="impact">Sort by impact</option>
                <option value="publisher">Sort by publisher</option>
                <option value="status">Sort by status</option>
              </select>
              <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={state.loading}>
                {state.loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </Card>

          {filteredEntries.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <p className="text-text-secondary">
                  {state.loading ? 'Loading startup entries...' : 'No startup entries match the filters'}
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3" role="list">
              {filteredEntries.map((entry, index) => (
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
