/**
 * StartupPage - Main Startup Manager page
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, Button, GaugeCard, StatTile } from '@avs/ui';
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
import { ProStatusPill } from '../licensing/ProStatusBadge';
import {
  ClockIcon,
  ChartBarIcon,
  SparklesIcon,
  ArrowPathIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  XMarkIcon,
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

  const [proFeatureModal, setProFeatureModal] = useState<{ title: string; content: string } | null>(null);

  const handleProFeature = (feature: string) => {
    const enabled = state.entries.filter((e) => e.enabled);
    const highImpact = enabled.filter((e) => e.impact === 'high');
    const mediumImpact = enabled.filter((e) => e.impact === 'medium');
    const lowImpact = enabled.filter((e) => e.impact === 'low');

    switch (feature) {
      case 'recommendations':
        setProFeatureModal({
          title: 'Startup Recommendations',
          content: highImpact.length > 0
            ? `Found ${highImpact.length} high-impact startup entries. Consider disabling: ${highImpact.slice(0, 5).map((e) => e.name).join(', ')}${highImpact.length > 5 ? ' and others' : ''}. These applications significantly slow down your boot time.`
            : 'No high-impact startup entries detected. Your startup configuration is well-optimized.',
        });
        break;
      case 'impact-analysis':
        setProFeatureModal({
          title: 'Startup Impact Analysis',
          content: `Enabled entries: ${enabled.length}\nHigh impact: ${highImpact.length}\nMedium impact: ${mediumImpact.length}\nLow impact: ${lowImpact.length}\n\nHigh-impact applications consume significant CPU, memory, and disk resources during boot, delaying your system's readiness by several seconds each.`,
        });
        break;
      case 'auto-delay':
        setProFeatureModal({
          title: 'Auto-Delay Configuration',
          content: 'Auto-Delay will gradually launch non-critical startup programs after boot, prioritizing essential system services first. This reduces peak boot resource contention and gets you to a responsive desktop faster. Configure which applications to delay based on impact level.',
        });
        break;
      case 'history':
        setProFeatureModal({
          title: 'Startup History',
          content: state.backups.length > 0
            ? `Found ${state.backups.length} recorded changes. Recent changes:\n${state.backups.slice(0, 5).map((b) => `• ${b.entryName} — ${b.timestamp}`).join('\n')}`
            : 'No startup changes have been recorded yet. Changes will appear here after you disable or enable startup entries.',
        });
        break;
      default:
        break;
    }
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
          {/* Hero status section — System Mechanic style */}
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="startup-hero-section">
            {/* Gauge */}
            <GaugeCard
              title={highImpactCount > 0 ? 'Boot Impact' : 'Startup Healthy'}
              value={Math.min(100, Math.round((highImpactCount / Math.max(1, state.entries.length)) * 100))}
              unit=""
              tone={highImpactCount > 0 ? 'danger' : 'success'}
              icon={<BoltIcon className="h-6 w-6" />}
              description={highImpactCount > 0 ? `${highImpactCount} high-impact entries slowing boot` : `${enabledCount} entries enabled, all low impact`}
              data-testid="startup-hero-gauge"
            />

            {/* Key stats */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
              <StatTile
                label="Changes Made"
                value={state.backups.length.toString()}
                hint={state.backups.length > 0 ? 'Can be restored' : 'No changes yet'}
                icon={<ArrowPathIcon className="h-5 w-5" />}
                variant="glass"
              />
              <StatTile
                label="Safety"
                value="Protected"
                hint="Backup + Restore"
                icon={<ShieldCheckIcon className="h-5 w-5" />}
                variant="glass"
                accentColor="var(--avs-success)"
              />
              <StatTile
                label="Edition"
                value={isPro ? 'Pro' : 'Free'}
                hint={!isPro ? `${remainingDisables ?? '∞'} disables left` : 'Unlimited'}
                icon={<SparklesIcon className="h-5 w-5" />}
                variant="glass"
              />
            </div>
          </div>

          {/* Free edition limit banner — compact */}
          {!isPro && state.entries.length > 0 && (
            <div
              className={`mb-4 flex items-center gap-2 rounded-[var(--avs-radius-md)] border px-4 py-2 ${
                limitReached
                  ? 'border-semantic-warning/30 bg-semantic-warning/10'
                  : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)]'
              }`}
              data-testid="startup-free-limit-banner"
            >
              <ClockIcon className="h-4 w-4 text-text-secondary shrink-0" />
              <span className="text-caption text-text-secondary flex-1">
                Free edition: <strong className="text-text-primary">{state.sessionDisabledCount} of {disableLimit}</strong> disabled
                {remainingDisables !== null && remainingDisables > 0 && ` (${remainingDisables} remaining)`}
              </span>
              {limitReached && (
                <button
                  onClick={() => guard('startup.disable', 'Startup Manager', () => {}, {
                    limitDescription: `Free edition allows disabling up to ${disableLimit} startup entries.`,
                    proBenefit: 'Unlimited startup management + AI recommendations + auto-delay + startup history.',
                  })}
                  className="text-caption font-medium text-[var(--avs-brand-primary)] hover:underline"
                  data-testid="startup-upgrade-link"
                >
                  Upgrade →
                </button>
              )}
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

          {/* Professional Features — compact */}
          <Card title="Professional Features" variant="glass" className="mt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                    <SparklesIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                  </div>
                  <div>
                    <span className="text-small font-medium text-text-primary">AI Recommendations</span>
                    <p className="text-caption text-text-muted">Smart disable suggestions</p>
                  </div>
                </div>
                {isPro ? (
                  <Button variant="secondary" size="sm" onClick={() => handleProFeature('recommendations')}>View</Button>
                ) : (
                  <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                    onClick={() => guard('auto.startup_optimization', 'Startup Manager', () => {}, {
                      limitDescription: 'AI startup recommendations are a Professional feature.',
                      proBenefit: 'AI-powered startup analysis with personalized recommendations.',
                    })}
                    data-testid="startup-ai-recommendations-upgrade"
                  >Upgrade</Button>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                    <ChartBarIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                  </div>
                  <div>
                    <span className="text-small font-medium text-text-primary">Impact Analysis</span>
                    <p className="text-caption text-text-muted">CPU, memory & disk impact</p>
                  </div>
                </div>
                {isPro ? (
                  <Button variant="secondary" size="sm" onClick={() => handleProFeature('impact-analysis')}>View</Button>
                ) : (
                  <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                    onClick={() => guard('auto.startup_optimization', 'Startup Manager', () => {}, {
                      limitDescription: 'Startup impact analysis is a Professional feature.',
                      proBenefit: 'Detailed boot impact analysis with CPU, memory, and disk estimates.',
                    })}
                    data-testid="startup-impact-analysis-upgrade"
                  >Upgrade</Button>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                    <ArrowPathIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                  </div>
                  <div>
                    <span className="text-small font-medium text-text-primary">Auto-Delay</span>
                    <p className="text-caption text-text-muted">Delay non-critical apps for faster boot</p>
                  </div>
                </div>
                {isPro ? (
                  <Button variant="secondary" size="sm" onClick={() => handleProFeature('auto-delay')}>Configure</Button>
                ) : (
                  <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                    onClick={() => guard('auto.startup_optimization', 'Startup Manager', () => {}, {
                      limitDescription: 'Auto-delay is a Professional feature.',
                      proBenefit: 'Automatically delay non-critical startup programs for faster boot.',
                    })}
                    data-testid="startup-auto-delay-upgrade"
                  >Upgrade</Button>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                    <ClockIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                  </div>
                  <div>
                    <span className="text-small font-medium text-text-primary">Startup History</span>
                    <p className="text-caption text-text-muted">Audit trail of all changes</p>
                  </div>
                </div>
                {isPro ? (
                  <Button variant="secondary" size="sm" onClick={() => handleProFeature('history')}>View</Button>
                ) : (
                  <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                    onClick={() => guard('auto.startup_optimization', 'Startup Manager', () => {}, {
                      limitDescription: 'Startup history is a Professional feature.',
                      proBenefit: 'Complete audit trail of all startup changes with timestamps.',
                    })}
                    data-testid="startup-history-upgrade"
                  >Upgrade</Button>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                    <ShieldCheckIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                  </div>
                  <div>
                    <span className="text-small font-medium text-text-primary">Unlimited Management</span>
                    <p className="text-caption text-text-muted">
                      {isPro ? 'No session limits' : `Free: up to ${disableLimit} per session`}
                    </p>
                  </div>
                </div>
                {!isPro && <ProStatusPill />}
              </div>
            </div>
          </Card>

          {dialogElement}

          {proFeatureModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pro-feature-modal-title"
              onClick={() => setProFeatureModal(null)}
            >
              <div
                className="max-w-lg w-full mx-4 rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface)] shadow-[var(--avs-shadow-xl,var(--avs-shadow-lg))]"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="flex items-center justify-between border-b border-[var(--avs-border)] px-6 py-4">
                  <h2 id="pro-feature-modal-title" className="text-section-title font-semibold text-text-primary">
                    {proFeatureModal.title}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setProFeatureModal(null)}
                    className="rounded-[var(--avs-radius-md)] p-1 text-text-muted hover:bg-[var(--avs-surface-muted)] hover:text-text-primary outline-none focus-visible:shadow-focus"
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </header>
                <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
                  <p className="text-small text-text-secondary whitespace-pre-line">{proFeatureModal.content}</p>
                </div>
                <footer className="flex items-center justify-end gap-2 border-t border-[var(--avs-border)] px-6 py-3">
                  <Button variant="secondary" size="sm" onClick={() => setProFeatureModal(null)}>
                    Close
                  </Button>
                </footer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
