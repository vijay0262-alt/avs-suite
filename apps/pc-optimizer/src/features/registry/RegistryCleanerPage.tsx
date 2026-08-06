/**
 * RegistryCleanerPage — scan, review, and safely fix invalid registry entries.
 */
import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
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
import { ProStatusPill, ProFeatureIndicator } from '../licensing/ProStatusBadge';
import {
  WrenchScrewdriverIcon,
  ShieldCheckIcon,
  ClockIcon,
  ArrowPathIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';

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

      {/* Safety guardrail banner */}
      <div
        className="mb-4 rounded-[var(--avs-radius-md)] border border-[color-mix(in_srgb,var(--avs-brand-primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)] px-4 py-3"
        data-testid="registry-safety-banner"
      >
        <div className="flex items-start gap-2">
          <ShieldCheckIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
          <div className="text-caption text-text-secondary">
            <span className="font-semibold text-text-primary">Safety Guardrails:</span>{' '}
            Registry cleaning is{' '}
            <strong>manual review only</strong> — no automatic deletion. Every fix is
            backed up and can be restored. A{' '}
            <strong>System Restore Point</strong> is automatically created before
            any registry changes.
          </div>
        </div>
      </div>

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="registry-bootstrap-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-section-title text-text-primary">Registry Scan</h2>
              <p className="text-small text-text-secondary">
                {state.issues.length > 0
                  ? `${state.issues.length} issues found`
                  : 'Scan your registry to find invalid entries.'}
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
              message={state.scanError}
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

          {/* Unified scanning progress */}
          {state.scanning && (
            <div className="mb-6">
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

          {/* Unified AI Results (shown after scan with issues) */}
          {!state.scanning && state.issues.length > 0 && !state.cleanResult && (
            <div className="mb-6">
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

          {/* Free edition limit banner */}
          {!isPro && issueCount > 0 && (
            <div
              className={`mb-4 rounded-[var(--avs-radius-md)] border px-4 py-3 ${
                limitReached
                  ? 'border-semantic-warning/30 bg-semantic-warning/10'
                  : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)]'
              }`}
              data-testid="registry-free-limit-banner"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClockIcon className="h-4 w-4 text-text-secondary shrink-0" />
                  <span className="text-caption text-text-secondary">
                    Free edition: <strong className="text-text-primary">{selectedCount} of {fixLimit}</strong> issues selected for repair
                    {remainingFixes !== null && remainingFixes > 0 && ` (${remainingFixes} remaining)`}
                    {hasMoreIssues && ` (${issueCount - (fixLimit ?? 0)} more found)`}
                  </span>
                </div>
                {limitReached && hasMoreIssues && (
                  <button
                    onClick={() => guard('registry.fix', 'Registry Cleaner', () => {}, {
                      limitDescription: `Free edition repairs up to ${fixLimit} issues per scan. ${issueCount} issues found.`,
                      proBenefit: 'Unlimited repairs + automatic backup + scheduled repair.',
                    })}
                    className="text-caption font-medium text-brand-primary hover:underline"
                    data-testid="registry-upgrade-link"
                  >
                    Upgrade to Pro →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Category summary */}
          {Object.keys(state.breakdown).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 my-6">
              {Object.entries(state.breakdown).map(([cat, count]) => (
                <Card key={cat} title={CATEGORY_LABELS[cat] ?? cat}>
                  <p className="text-statistic-sm text-text-primary">{count}</p>
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

          {/* Issue list */}
          {state.issues.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Button variant="secondary" size="sm" onClick={() => vm.selectAll()}>
                  Select All{!isPro && fixLimit !== null ? ` (max ${fixLimit})` : ''}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => vm.selectNone()}>
                  Select None
                </Button>
                {!isPro && (
                  <span className="ml-auto text-caption text-text-muted">
                    {selectedCount}/{fixLimit} selected
                  </span>
                )}
              </div>
              <Card>
                <div className="divide-y divide-[var(--avs-border)]">
                  {state.issues.map((issue) => (
                    <label
                      key={issue.id}
                      className="flex items-start gap-3 py-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={state.selected.has(issue.id)}
                        onChange={() => vm.toggleIssue(issue.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-small font-medium text-text-primary truncate">
                            {issue.description}
                          </span>
                          <span
                            className={
                              issue.severity === 'medium'
                                ? 'text-caption text-semantic-warning'
                                : 'text-caption text-text-muted'
                            }
                          >
                            {issue.severity}
                          </span>
                        </div>
                        <p className="text-caption text-text-muted truncate">
                          {issue.hive}\{issue.subkey}
                          {issue.valueName ? ` : ${issue.valueName}` : ''}
                        </p>
                        <p className="text-caption text-text-secondary truncate">{issue.valueData}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* Backups */}
          {state.backups.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-section-title text-text-primary">Backups</h2>
                {isPro && (
                  <ProFeatureIndicator icon={ShieldCheckIcon} label="Automatic Backup" />
                )}
              </div>
              <Card>
                <div className="space-y-2">
                  {state.backups.map((b) => (
                    <div
                      key={b.backupId}
                      className="flex items-center justify-between py-2 border-b border-[var(--avs-border)] last:border-0"
                    >
                      <div>
                        <p className="text-small text-text-primary">{b.backupId}</p>
                        <p className="text-caption text-text-muted">
                          {b.count} entries · {b.createdAt ?? 'unknown time'}
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => vm.restore(b.backupId)}>
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* Pro Features — Scheduled Repair */}
          <div className="mt-8">
            <Card title="Professional Features" variant="glass">
              <div className="space-y-4">
                {/* Scheduled Repair */}
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <ClockIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text-primary">Scheduled Repair</span>
                        {!isPro && <ProStatusPill />}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        Automatically scan and repair registry issues on a schedule — weekly, monthly, or custom.
                      </p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm" leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
                      Configure Schedule
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('registry.fix', 'Registry Cleaner', () => {}, {
                        limitDescription: 'Scheduled repair is a Professional feature.',
                        proBenefit: 'Automatically scan and repair registry issues on a schedule.',
                      })}
                      data-testid="registry-schedule-upgrade"
                    >
                      Upgrade to Unlock
                    </Button>
                  )}
                </div>

                {/* Automatic Backup */}
                <div className="flex items-start justify-between border-t border-[var(--avs-border)] pt-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <ShieldCheckIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text-primary">Automatic Backup</span>
                        {isPro && <ProFeatureIndicator icon={ShieldCheckIcon} label="Active" />}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        Every repair is automatically backed up before changes are applied. Restore anytime.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Unlimited Repairs */}
                <div className="flex items-start justify-between border-t border-[var(--avs-border)] pt-4">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <WrenchScrewdriverIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-semibold text-text-primary">Unlimited Repairs</span>
                        {isPro && <ProFeatureIndicator icon={WrenchScrewdriverIcon} label="Unlimited" />}
                      </div>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        {isPro
                          ? 'Repair all detected registry issues with no limits.'
                          : `Free edition: repair up to ${fixLimit} issues per scan. Upgrade for unlimited.`}
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
