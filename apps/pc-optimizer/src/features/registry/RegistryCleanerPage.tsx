/**
 * RegistryCleanerPage — scan, review, and safely fix invalid registry entries.
 */
import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleSuccessBanner, ModuleErrorBanner, ModuleEmptyState } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { UnifiedScanProgressCard, REGISTRY_SCAN_CONFIG } from '../unified-scan';
import { UnifiedCleanerResults } from '../unified-results';
import { RegistryCleanerViewModel } from './RegistryCleanerViewModel';
import { registryService } from './registry.service';
import { CATEGORY_LABELS } from './registry.types';
import { useIsPro } from '../sync/syncStore';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { useEditionLimits } from '../licensing/editionLimits';
import { ProStatusPill } from '../licensing/ProStatusBadge';
import {
  WrenchScrewdriverIcon,
  ShieldCheckIcon,
  ClockIcon,
  ArrowPathIcon,
  LockClosedIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const SEVERITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};

export default function RegistryCleanerPage() {
  const vm = useMemo(() => new RegistryCleanerViewModel(registryService), []);
  const state = useViewModel(vm);
  const isPro = useIsPro();
  const { guard, dialogElement } = useFeatureGuard();
  const limits = useEditionLimits();
  const fixLimit = limits.getLimit('registryCleanerIssuesPerRun');

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const selectedCount = state.selected.size;
  const issueCount = state.issues.length;
  const remainingFixes = fixLimit !== null ? Math.max(0, fixLimit - selectedCount) : null;
  const limitReached = fixLimit !== null && selectedCount >= fixLimit;
  const hasMoreIssues = issueCount > (fixLimit ?? 0);

  return (
    <div data-testid="page-registry-cleaner">
      <PageHeader
        title="Registry Cleaner"
        description="Find and safely remove invalid Windows registry entries. Every change is backed up first."
        actions={<HelpButton text="The registry scanner checks for invalid file references, broken shortcuts, missing shared DLLs, and obsolete COM objects. Every fix is backed up and can be restored." />}
      />

      {/* Safety banner — compact */}
      <div
        className="mb-4 flex items-center gap-2 rounded-[var(--avs-radius-md)] border border-[color-mix(in_srgb,var(--avs-brand-primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)] px-4 py-2"
        data-testid="registry-safety-banner"
      >
        <ShieldCheckIcon className="h-4 w-4 text-[var(--avs-brand-primary)] shrink-0" />
        <span className="text-caption text-text-secondary">
          Manual review only — no automatic deletion. System Restore Point is created before any changes.
        </span>
      </div>

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message="Could not reach the backend service. Please try again."
          onRetry={() => vm.bootstrap()}
          testId="registry-bootstrap-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-section-title text-text-primary">Registry Scan</h2>
              <p className="text-small text-text-secondary">
                {state.issues.length > 0 ? `${state.issues.length} issues found` : 'Scan your registry to find invalid entries.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => vm.scan()} disabled={state.scanning}>
                {state.scanning ? 'Scanning…' : 'Scan Registry'}
              </Button>
              <Button
                variant="primary"
                onClick={() => vm.clean()}
                disabled={state.cleaning || selectedCount === 0}
              >
                {state.cleaning ? 'Fixing…' : `Fix Selected (${selectedCount})`}
              </Button>
            </div>
          </div>

          {state.scanError && (
            <ModuleErrorBanner
              message="Scan encountered an issue. Please try again."
              onRetry={() => vm.scan()}
              testId="registry-scan-error"
            />
          )}

          {state.cleanResult && (
            <ModuleSuccessBanner
              title={`Fixed ${state.cleanResult.fixed} of ${state.cleanResult.fixed + state.cleanResult.failed} selected entries.`}
              message={state.cleanResult.backupId ? `Backup created: ${state.cleanResult.backupId}` : undefined}
              testId="registry-clean-result"
            />
          )}

          {state.cleanResult && state.cleanResult.errors.length > 0 && (
            <ModuleErrorBanner
              message={`${state.cleanResult.errors.length} error(s) occurred during fixing.`}
              testId="registry-clean-errors"
            />
          )}

          {state.scanning && (
            <div className="mb-4">
              <UnifiedScanProgressCard
                config={REGISTRY_SCAN_CONFIG}
                isRunning={state.scanning}
                startTime={Date.now()}
                counters={{
                  registryEntries: state.issues.length,
                  issuesFound: state.issues.length,
                }}
              />
            </div>
          )}

          {/* Unified AI Results */}
          {!state.scanning && state.issues.length > 0 && !state.cleanResult && (
            <div className="mb-4">
              <UnifiedCleanerResults
                data={{
                  moduleId: 'registry',
                  moduleName: 'Registry Cleaner',
                  moduleIcon: 'ServerStackIcon',
                  timestamp: Date.now(),
                  durationMs: 5000,
                  itemsAnalyzed: state.issues.length,
                  issuesFound: state.issues.length,
                  categoryBreakdown: state.breakdown,
                  categoryLabels: CATEGORY_LABELS,
                  issues: state.issues.map((i) => ({
                    id: i.id,
                    description: i.description,
                    category: i.category,
                    severity: i.severity,
                    location: `${i.hive}\\${i.subkey}${i.valueName ? ` : ${i.valueName}` : ''}`,
                  })),
                }}
                isPro={isPro}
                onClose={() => vm.selectNone()}
                onFix={(ids) => { ids.forEach((id) => { if (!state.selected.has(id)) vm.toggleIssue(id); }); vm.clean(); }}
                onRescan={() => vm.scan()}
              />
            </div>
          )}

          {/* Free edition limit banner — compact */}
          {!isPro && issueCount > 0 && (
            <div
              className={`mb-4 flex items-center gap-2 rounded-[var(--avs-radius-md)] border px-4 py-2 ${
                limitReached
                  ? 'border-semantic-warning/30 bg-semantic-warning/10'
                  : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)]'
              }`}
              data-testid="registry-free-limit-banner"
            >
              <ClockIcon className="h-4 w-4 text-text-secondary shrink-0" />
              <span className="text-caption text-text-secondary flex-1">
                Free edition: <strong className="text-text-primary">{selectedCount} of {fixLimit}</strong> issues selected
                {remainingFixes !== null && remainingFixes > 0 && ` (${remainingFixes} remaining)`}
              </span>
              {limitReached && hasMoreIssues && (
                <button
                  onClick={() => guard('registry.fix', 'Registry Cleaner', () => {}, {
                    limitDescription: `Free edition repairs up to ${fixLimit} issues per scan. ${issueCount} issues found.`,
                    proBenefit: 'Unlimited repairs + automatic backup + scheduled repair.',
                  })}
                  className="text-caption font-medium text-[var(--avs-brand-primary)] hover:underline"
                  data-testid="registry-upgrade-link"
                >
                  Upgrade →
                </button>
              )}
            </div>
          )}

          {/* Category summary — compact */}
          {Object.keys(state.breakdown).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {Object.entries(state.breakdown).map(([cat, count]) => (
                <Card key={cat} variant="glass" padded={false} className="p-3">
                  <p className="text-statistic text-text-primary">{count}</p>
                  <p className="text-caption text-text-secondary truncate">{CATEGORY_LABELS[cat] ?? cat}</p>
                </Card>
              ))}
            </div>
          )}

          {/* Empty state */}
          {state.issues.length === 0 && !state.scanning && !state.scanError && (
            <ModuleEmptyState
              icon={WrenchScrewdriverIcon}
              title="No registry issues found"
              message="Run a scan to check for invalid entries, broken shortcuts, and obsolete references."
              testId="registry-empty"
            />
          )}

          {/* Issue list — clickable rows */}
          {state.issues.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Button variant="ghost" size="sm" onClick={() => vm.selectAll()}>
                  Select all{!isPro && fixLimit !== null ? ` (max ${fixLimit})` : ''}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => vm.selectNone()}>
                  Clear
                </Button>
                {!isPro && (
                  <span className="ml-auto text-caption text-text-muted">
                    {selectedCount}/{fixLimit} selected
                  </span>
                )}
              </div>
              <Card>
                <div className="space-y-1">
                  {state.issues.map((issue) => {
                    const selected = state.selected.has(issue.id);
                    return (
                      <div
                        key={issue.id}
                        onClick={() => vm.toggleIssue(issue.id)}
                        className={`flex items-start gap-3 p-2.5 rounded-[var(--avs-radius-md)] cursor-pointer transition-colors ${
                          selected ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)]' : 'hover:bg-[var(--avs-surface-muted)]/50'
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors mt-0.5 ${
                            selected
                              ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]'
                              : 'border-[var(--avs-border)] bg-transparent'
                          }`}
                        >
                          {selected && <CheckCircleIcon className="h-3.5 w-3.5 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-small font-medium text-text-primary truncate">{issue.description}</span>
                            <Badge tone={SEVERITY_TONE[issue.severity] ?? 'neutral'}>{issue.severity}</Badge>
                          </div>
                          <p className="text-caption text-text-muted truncate">
                            {issue.hive}\{issue.subkey}{issue.valueName ? ` : ${issue.valueName}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}

          {/* Backups */}
          {state.backups.length > 0 && (
            <div className="mt-6">
              <h2 className="text-section-title text-text-primary mb-3">Backups</h2>
              <Card>
                <div className="space-y-1.5">
                  {state.backups.map((b) => (
                    <div key={b.backupId} className="flex items-center justify-between p-2 rounded-[var(--avs-radius-md)] hover:bg-[var(--avs-surface-muted)]/50">
                      <div>
                        <p className="text-small font-medium text-text-primary">{b.backupId}</p>
                        <p className="text-caption text-text-muted">{b.count} entries · {b.createdAt ?? 'unknown time'}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => vm.restore(b.backupId)}>
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* Pro Features — compact */}
          <Card title="Professional Features" variant="glass" className="mt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                    <ClockIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                  </div>
                  <div>
                    <span className="text-small font-medium text-text-primary">Scheduled Repair</span>
                    <p className="text-caption text-text-muted">Auto-scan and repair on schedule</p>
                  </div>
                </div>
                {isPro ? (
                  <Button variant="secondary" size="sm" leftIcon={<ArrowPathIcon className="h-4 w-4" />}>Configure</Button>
                ) : (
                  <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                    onClick={() => guard('registry.fix', 'Registry Cleaner', () => {}, {
                      limitDescription: 'Scheduled repair is a Professional feature.',
                      proBenefit: 'Automatically scan and repair registry issues on a schedule.',
                    })}
                    data-testid="registry-schedule-upgrade"
                  >Upgrade</Button>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                    <ShieldCheckIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                  </div>
                  <div>
                    <span className="text-small font-medium text-text-primary">Automatic Backup</span>
                    <p className="text-caption text-text-muted">Every repair is backed up</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                <div className="flex items-center gap-3">
                  <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                    <WrenchScrewdriverIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                  </div>
                  <div>
                    <span className="text-small font-medium text-text-primary">Unlimited Repairs</span>
                    <p className="text-caption text-text-muted">
                      {isPro ? 'No limits on repairs' : `Free: up to ${fixLimit} per scan`}
                    </p>
                  </div>
                </div>
                {!isPro && <ProStatusPill />}
              </div>
            </div>
          </Card>

          {dialogElement}
        </>
      )}
    </div>
  );
}
