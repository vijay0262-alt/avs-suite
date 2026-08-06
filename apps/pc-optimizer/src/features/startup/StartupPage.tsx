/**
 * StartupPage - Main Startup Manager page
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleLoadingState, ModuleEmptyState } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { StartupViewModel } from './StartupViewModel';
import { startupService } from './startup.service';
import { StartupEntryCard } from './components/StartupEntryCard';
import type { StartupEntry } from './startup.types';
import { useIsPro } from '../sync/syncStore';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { useEditionLimits } from '../licensing/editionLimits';
import { ProStatusPill, ProFeatureIndicator } from '../licensing/ProStatusBadge';
import {
  ClockIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowPathIcon,
  LockClosedIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

type SortBy = 'name' | 'impact' | 'publisher' | 'status';

export default function StartupPage() {
  const vm = useMemo(() => new StartupViewModel(startupService), []);
  const state = useViewModel(vm);
  const [query, setQuery] = useState('');
  const [impactFilter, setImpactFilter] = useState<'all' | 'high' | 'medium' | 'low' | 'unknown'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('enabled');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const isPro = useIsPro();
  const { guard, dialogElement } = useFeatureGuard();
  const limits = useEditionLimits();
  const disableLimit = limits.getLimit('startupManagerEntriesPerRun');
  const remainingDisables = vm.remainingDisables();
  const limitReached = vm.isDisableLimitReached();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const isPermissionError = (msg: string): boolean =>
    /admin|permission|elevat|access.*denied/i.test(msg);

  const handleDisable = async (entry: StartupEntry) => {
    if (limitReached) {
      guard('startup.disable', 'Startup Manager', () => {}, {
        limitDescription: `Free edition allows disabling up to ${disableLimit} startup entries.`,
        proBenefit: 'Unlimited startup management + AI recommendations + auto-delay + startup history.',
      });
      return;
    }
    try {
      const result = await vm.disableEntry(entry);
      if (!result.success) {
        const msg = result.message || result.error || result.reason || 'Failed to disable entry';
        if (msg === 'Already Disabled') {
          await vm.loadEntries();
        } else if (isPermissionError(msg)) {
          if (confirm(`${msg}\n\nWould you like to restart AVS PC Optimizer as administrator?`)) {
            const w = window as unknown as { avs?: { app?: { relaunchAsAdmin?: () => Promise<unknown> } } };
            await w.avs?.app?.relaunchAsAdmin?.();
          }
        } else {
          alert(msg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disable entry';
      if (isPermissionError(msg)) {
        if (confirm(`${msg}\n\nWould you like to restart AVS PC Optimizer as administrator?`)) {
          const w = window as unknown as { avs?: { app?: { relaunchAsAdmin?: () => Promise<unknown> } } };
          await w.avs?.app?.relaunchAsAdmin?.();
        }
      } else {
        alert(msg);
      }
    }
  };

  const handleEnable = async (entry: StartupEntry) => {
    try {
      const result = await vm.enableEntry(entry);
      if (!result.success) {
        const msg = result.message || 'Failed to enable entry';
        if (isPermissionError(msg)) {
          if (confirm(`${msg}\n\nWould you like to restart AVS PC Optimizer as administrator?`)) {
            const w = window as unknown as { avs?: { app?: { relaunchAsAdmin?: () => Promise<unknown> } } };
            await w.avs?.app?.relaunchAsAdmin?.();
          }
        } else {
          alert(msg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to enable entry';
      if (isPermissionError(msg)) {
        if (confirm(`${msg}\n\nWould you like to restart AVS PC Optimizer as administrator?`)) {
          const w = window as unknown as { avs?: { app?: { relaunchAsAdmin?: () => Promise<unknown> } } };
          await w.avs?.app?.relaunchAsAdmin?.();
        }
      } else {
        alert(msg);
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
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={handleRefresh}
          testId="startup-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card title="Total Entries">
              <p className="text-statistic text-text-primary">{state.entries.length}</p>
              <p className="text-caption text-text-secondary">Startup items</p>
            </Card>
            <Card title="Enabled">
              <p className="text-statistic text-semantic-success">{enabledCount}</p>
              <p className="text-caption text-text-secondary">Currently active</p>
            </Card>
            <Card title="High Impact">
              <p className="text-statistic text-semantic-danger">{highImpactCount}</p>
              <p className="text-caption text-text-secondary">Slowing startup</p>
            </Card>
          </div>

          {/* Free edition limit banner */}
          {!isPro && state.entries.length > 0 && (
            <div
              className={`mb-4 rounded-[var(--avs-radius-md)] border px-4 py-3 ${
                limitReached
                  ? 'border-semantic-warning/30 bg-semantic-warning/10'
                  : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)]'
              }`}
              data-testid="startup-free-limit-banner"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-text-secondary shrink-0" />
                  <span className="text-caption text-text-secondary">
                    Free edition: <strong className="text-text-primary">{state.sessionDisabledCount} of {disableLimit}</strong> entries disabled this session
                    {remainingDisables !== null && remainingDisables > 0 && ` (${remainingDisables} remaining)`}
                  </span>
                </div>
                {limitReached && (
                  <button
                    onClick={() => guard('startup.disable', 'Startup Manager', () => {}, {
                      limitDescription: `Free edition allows disabling up to ${disableLimit} startup entries.`,
                      proBenefit: 'Unlimited startup management + AI recommendations + auto-delay + startup history.',
                    })}
                    className="text-caption font-medium text-brand-primary hover:underline"
                    data-testid="startup-upgrade-link"
                  >
                    Upgrade to Pro →
                  </button>
                )}
              </div>
            </div>
          )}

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
                <option value="all">Include Disabled</option>
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
              <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={state.loading}>
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
                  loading={state.loading}
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

          {/* Professional Features */}
          <div className="mt-8">
            <Card title="Professional Features" variant="glass">
              <div className="space-y-4">
                {/* AI Startup Recommendations */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <SparklesIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text-primary">AI Startup Recommendations</span>
                        {!isPro && <ProStatusPill />}
                        {isPro && <ProFeatureIndicator icon={SparklesIcon} label="AI-Powered" />}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        AI analyzes your startup entries and recommends which to disable based on impact, safety, and usage patterns.
                      </p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm" leftIcon={<SparklesIcon className="h-4 w-4" />}>
                      Get Recommendations
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('auto.startup_optimization', 'Startup Manager', () => {}, {
                        limitDescription: 'AI startup recommendations are a Professional feature.',
                        proBenefit: 'AI-powered startup analysis with personalized recommendations.',
                      })}
                      data-testid="startup-ai-recommendations-upgrade"
                    >
                      Upgrade to Unlock
                    </Button>
                  )}
                </div>

                {/* Startup Impact Analysis */}
                <div className="flex items-start justify-between border-t border-[var(--avs-border)] pt-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <ChartBarIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text-primary">Startup Impact Analysis</span>
                        {!isPro && <ProStatusPill />}
                        {isPro && <ProFeatureIndicator icon={ChartBarIcon} label="Detailed" />}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        Detailed boot impact analysis with CPU, memory, and disk activity estimates for each startup entry.
                      </p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm" leftIcon={<ChartBarIcon className="h-4 w-4" />}>
                      View Analysis
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('auto.startup_optimization', 'Startup Manager', () => {}, {
                        limitDescription: 'Startup impact analysis is a Professional feature.',
                        proBenefit: 'Detailed boot impact analysis with CPU, memory, and disk estimates.',
                      })}
                      data-testid="startup-impact-analysis-upgrade"
                    >
                      Upgrade to Unlock
                    </Button>
                  )}
                </div>

                {/* Auto-Delay */}
                <div className="flex items-start justify-between border-t border-[var(--avs-border)] pt-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <ArrowPathIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text-primary">Auto-Delay</span>
                        {!isPro && <ProStatusPill />}
                        {isPro && <ProFeatureIndicator icon={ArrowPathIcon} label="Active" />}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        Automatically delay non-critical startup programs to speed up boot time. Launches them gradually after boot.
                      </p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm" leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
                      Configure Delay
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('auto.startup_optimization', 'Startup Manager', () => {}, {
                        limitDescription: 'Auto-delay is a Professional feature.',
                        proBenefit: 'Automatically delay non-critical startup programs for faster boot.',
                      })}
                      data-testid="startup-auto-delay-upgrade"
                    >
                      Upgrade to Unlock
                    </Button>
                  )}
                </div>

                {/* Startup History */}
                <div className="flex items-start justify-between border-t border-[var(--avs-border)] pt-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <ClockIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text-primary">Startup History</span>
                        {!isPro && <ProStatusPill />}
                        {isPro && <ProFeatureIndicator icon={ClockIcon} label="Full Log" />}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        Complete audit trail of all startup changes — disable, enable, restore actions with timestamps and estimated boot improvement.
                      </p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm" leftIcon={<ClockIcon className="h-4 w-4" />}>
                      View History
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('auto.startup_optimization', 'Startup Manager', () => {}, {
                        limitDescription: 'Startup history is a Professional feature.',
                        proBenefit: 'Complete audit trail of all startup changes with timestamps.',
                      })}
                      data-testid="startup-history-upgrade"
                    >
                      Upgrade to Unlock
                    </Button>
                  )}
                </div>

                {/* Unlimited Management (Free benefit reminder) */}
                <div className="flex items-start justify-between border-t border-[var(--avs-border)] pt-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <ShieldCheckIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text-primary">Unlimited Management</span>
                        {isPro && <ProFeatureIndicator icon={ShieldCheckIcon} label="Unlimited" />}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        {isPro
                          ? 'Disable and enable unlimited startup entries with no session limits.'
                          : `Free edition: disable up to ${disableLimit} entries per session. Upgrade for unlimited management.`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {dialogElement}
        </>
      )}
    </div>
  );
}
