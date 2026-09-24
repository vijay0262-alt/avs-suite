/**
 * RegistryCleanerPage — scan, review, and safely fix invalid registry entries.
 */
import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleSuccessBanner, ModuleErrorBanner, ModuleEmptyState } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { RegistryCleanerViewModel } from './RegistryCleanerViewModel';
import { registryService } from './registry.service';
import {
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const SEVERITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};

export default function RegistryCleanerPage() {
  const vm = useMemo(() => new RegistryCleanerViewModel(registryService), []);
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const selectedCount = state.selected.size;
  const issueCount = state.issues.length;

  return (
    <div data-testid="page-registry-cleaner">
      <PageHeader
        title="Registry Cleaner"
        description="Find and safely remove invalid Windows registry entries. Every change is backed up first."
        actions={<HelpButton text="The registry scanner checks for invalid file references, broken shortcuts, missing shared DLLs, and obsolete COM objects. Every fix is backed up and can be restored." />}
      />

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message="Could not reach the backend service. Please try again."
          onRetry={() => vm.bootstrap()}
          testId="registry-bootstrap-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {/* Scan controls */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-section-title text-text-primary">Registry Scan</h2>
              <p className="text-small text-text-secondary">
                {issueCount > 0 ? `${issueCount} issues found` : 'Scan your registry to find invalid entries.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => vm.scan()} disabled={state.scanning} leftIcon={<WrenchScrewdriverIcon className="h-4 w-4" />}>
                {state.scanning ? 'Scanning…' : 'Scan Registry'}
              </Button>
              <Button
                variant="primary"
                onClick={() => vm.clean()}
                disabled={state.cleaning || selectedCount === 0}
                leftIcon={<CheckCircleIcon className="h-4 w-4" />}
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

          {/* Scanning — show the registry path currently being checked */}
          {state.scanning && (
            <Card className="mb-4" data-testid="registry-scan-progress">
              <div className="flex items-center gap-3">
                <ArrowPathIcon className="h-5 w-5 animate-spin text-[var(--avs-brand-primary)] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-text-primary">
                    Scanning registry…
                    {state.scanProgress && state.scanProgress.categoriesTotal > 0 && (
                      <span className="text-text-muted"> ({state.scanProgress.categoriesDone}/{state.scanProgress.categoriesTotal} categories)</span>
                    )}
                  </p>
                  {state.scanProgress?.currentPath && (
                    <p className="text-caption text-text-muted truncate font-mono" title={state.scanProgress.currentPath} data-testid="registry-scan-path">
                      {state.scanProgress.currentPath}
                    </p>
                  )}
                </div>
              </div>
            </Card>
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
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => vm.selectNone()}>
                  Clear
                </Button>
                <span className="ml-auto text-caption text-text-muted">
                  {selectedCount} selected
                </span>
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

        </>
      )}
    </div>
  );
}
