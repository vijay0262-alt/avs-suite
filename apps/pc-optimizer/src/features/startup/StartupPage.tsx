/**
 * StartupPage - Main Startup Manager page
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, Button, StatTile } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleLoadingState, ModuleEmptyState } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { StartupViewModel } from './StartupViewModel';
import { startupService } from './startup.service';
import { StartupEntryCard } from './components/StartupEntryCard';
import type { StartupEntry } from './startup.types';
import {
  ChartBarIcon,
  ArrowPathIcon,
  BoltIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

type SortBy = 'name' | 'impact' | 'publisher' | 'status';

export default function StartupPage() {
  const vm = useMemo(() => new StartupViewModel(startupService), []);
  const state = useViewModel(vm);
  const [query, setQuery] = useState('');
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medium' | 'low' | 'unknown'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('name');

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const isPermissionError = (msg: string): boolean =>
    /admin|permission|elevat|access.*denied/i.test(msg);

  const handleDisable = async (entry: StartupEntry) => {
    try {
      const result = await vm.disableEntry(entry);
      if (!result.success) {
        const msg = result.message || result.error || result.reason || 'Failed to disable entry';
        if (msg === 'Already Disabled') {
          await vm.loadEntries();
        } else if (isPermissionError(msg)) {
          if (confirm('This action requires administrator privileges. Would you like to restart AVS AI Shield as administrator?')) {
            const w = window as unknown as { avs?: { app?: { relaunchAsAdmin?: () => Promise<unknown> } } };
            await w.avs?.app?.relaunchAsAdmin?.();
          }
        } else {
          alert('Could not disable this entry. Please try again.');
        }
      }
    } catch {
      if (confirm('This action requires administrator privileges. Would you like to restart AVS AI Shield as administrator?')) {
        const w = window as unknown as { avs?: { app?: { relaunchAsAdmin?: () => Promise<unknown> } } };
        await w.avs?.app?.relaunchAsAdmin?.();
      } else {
        alert('Could not disable this entry. Please try again.');
      }
    }
  };

  const handleEnable = async (entry: StartupEntry) => {
    try {
      const result = await vm.enableEntry(entry);
      if (!result.success) {
        const msg = result.message || 'Failed to enable entry';
        if (isPermissionError(msg)) {
          if (confirm('This action requires administrator privileges. Would you like to restart AVS AI Shield as administrator?')) {
            const w = window as unknown as { avs?: { app?: { relaunchAsAdmin?: () => Promise<unknown> } } };
            await w.avs?.app?.relaunchAsAdmin?.();
          }
        } else {
          alert('Could not enable this entry. Please try again.');
        }
      }
    } catch {
      if (confirm('This action requires administrator privileges. Would you like to restart AVS AI Shield as administrator?')) {
        const w = window as unknown as { avs?: { app?: { relaunchAsAdmin?: () => Promise<unknown> } } };
        await w.avs?.app?.relaunchAsAdmin?.();
      } else {
        alert('Could not enable this entry. Please try again.');
      }
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
        actions={<HelpButton text="Disable unnecessary startup programs to speed up boot time. High-impact items have the biggest effect on startup duration. Changes can be reversed anytime using the backup history." />}
      />

      {state.bootstrap === 'loading' && (
        <ModuleLoadingState
          message="Loading startup entries…"
          testId="startup-loading"
        />
      )}

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message="Could not reach the backend service. Please try again."
          onRetry={handleRefresh}
          testId="startup-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {/* Scanning — show the path currently being scanned */}
          {state.loading && (
            <Card className="mb-4" data-testid="startup-scan-progress">
              <div className="flex items-center gap-3">
                <ArrowPathIcon className="h-5 w-5 animate-spin text-[var(--avs-brand-primary)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-text-primary">Scanning startup locations…</p>
                  {state.scanProgress?.currentPath && (
                    <p className="text-caption text-text-muted truncate font-mono" title={state.scanProgress.currentPath} data-testid="startup-scan-path">
                      {state.scanProgress.currentPath}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Key stats */}
          <div className="mb-4 grid grid-cols-3 gap-3" data-testid="startup-hero-section">
            <StatTile
              label="Total Entries"
              value={state.entries.length.toString()}
              hint="Detected on system"
              icon={<ComputerDesktopIcon className="h-5 w-5" />}
              variant="glass"
            />
            <StatTile
              label="Enabled"
              value={enabledCount.toString()}
              hint={`${state.entries.length - enabledCount} disabled`}
              icon={<BoltIcon className="h-5 w-5" />}
              variant="glass"
              accentColor="var(--avs-success)"
            />
            <StatTile
              label="High Impact"
              value={highImpactCount.toString()}
              hint={highImpactCount > 0 ? 'Consider disabling' : 'None detected'}
              icon={<ChartBarIcon className="h-5 w-5" />}
              variant="glass"
              accentColor={highImpactCount > 0 ? 'var(--avs-danger)' : 'var(--avs-success)'}
            />
          </div>

          <Card className="mb-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <input
                type="text"
                aria-label="Search startup entries"
                placeholder="Search name, publisher, or command"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] px-3 py-1.5 text-small text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:shadow-focus"
              />
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'enabled' | 'disabled')}
                className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] px-3 py-1.5 text-small text-text-primary focus:outline-none focus-visible:shadow-focus"
              >
                <option value="all">All Entries</option>
                <option value="enabled">Enabled Only</option>
                <option value="disabled">Disabled Only</option>
              </select>
              <select
                aria-label="Filter by impact"
                value={impactFilter}
                onChange={(e) => setImpactFilter(e.target.value as typeof impactFilter)}
                className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] px-3 py-1.5 text-small text-text-primary focus:outline-none focus-visible:shadow-focus"
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
                className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] px-3 py-1.5 text-small text-text-primary focus:outline-none focus-visible:shadow-focus"
              >
                <option value="name">Sort by name</option>
                <option value="impact">Sort by impact</option>
                <option value="publisher">Sort by publisher</option>
                <option value="status">Sort by status</option>
              </select>
              <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={state.loading} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
                {state.loading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </Card>

          {filteredEntries.length === 0 ? (
            <ModuleEmptyState
              title="No startup entries match the filters"
              message={state.loading ? 'Loading startup entries…' : 'Try adjusting your search or filter criteria.'}
              testId="startup-empty"
            />
          ) : (
            <div className="space-y-3" role="list">
              {filteredEntries.map((entry, index) => (
                <StartupEntryCard
                  key={`${entry.name}-${index}`}
                  entry={entry}
                  onDisable={handleDisable}
                  onEnable={handleEnable}
                  pending={vm.isTogglePending(entry)}
                />
              ))}
            </div>
          )}

          {state.backups.length > 0 && (
            <div className="mt-6">
              <h2 className="text-section-title text-text-primary mb-4">Backup History</h2>
              <Card>
                <div className="space-y-2">
                  {state.backups.map((backup) => (
                    <div key={backup.backupId} className="flex items-center justify-between py-2 border-b border-[var(--avs-border)] last:border-0">
                      <div>
                        <p className="text-small text-text-primary">{backup.entryName}</p>
                        <p className="text-caption text-text-muted">{backup.timestamp}</p>
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
