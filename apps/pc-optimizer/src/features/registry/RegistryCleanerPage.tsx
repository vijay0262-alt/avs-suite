/**
 * RegistryCleanerPage — scan, review, and safely fix invalid registry entries.
 */
import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { RegistryCleanerViewModel } from './RegistryCleanerViewModel';
import { registryService } from './registry.service';
import { CATEGORY_LABELS } from './registry.types';

export default function RegistryCleanerPage() {
  const vm = useMemo(() => new RegistryCleanerViewModel(registryService), []);
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const selectedCount = state.selected.size;

  return (
    <div data-testid="page-registry-cleaner">
      <PageHeader
        title="Registry Cleaner"
        description="Find and safely remove invalid Windows registry entries. Every change is backed up first."
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Registry Scan</h2>
              <p className="text-sm text-text-secondary">
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
            <Card>
              <p className="text-red-500 py-4">{state.scanError}</p>
            </Card>
          )}

          {state.cleanResult && (
            <Card>
              <div className="py-2">
                <p className="text-green-500 font-medium">
                  Fixed {state.cleanResult.fixed} of {state.cleanResult.fixed + state.cleanResult.failed} selected entries.
                </p>
                {state.cleanResult.backupId && (
                  <p className="text-sm text-text-muted">
                    Backup created: {state.cleanResult.backupId}
                  </p>
                )}
                {state.cleanResult.errors.length > 0 && (
                  <p className="text-sm text-red-400">
                    {state.cleanResult.errors.length} error(s) occurred.
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Category summary */}
          {Object.keys(state.breakdown).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 my-6">
              {Object.entries(state.breakdown).map(([cat, count]) => (
                <Card key={cat} title={CATEGORY_LABELS[cat] ?? cat}>
                  <p className="text-2xl font-bold text-text-primary">{count}</p>
                </Card>
              ))}
            </div>
          )}

          {/* Issue list */}
          {state.issues.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Button variant="secondary" size="sm" onClick={() => vm.selectAll()}>
                  Select All
                </Button>
                <Button variant="secondary" size="sm" onClick={() => vm.selectNone()}>
                  Select None
                </Button>
              </div>
              <Card>
                <div className="divide-y divide-border">
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
                          <span className="text-sm font-medium text-text-primary truncate">
                            {issue.description}
                          </span>
                          <span
                            className={
                              issue.severity === 'medium'
                                ? 'text-xs text-semantic-warning'
                                : 'text-xs text-text-muted'
                            }
                          >
                            {issue.severity}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted truncate">
                          {issue.hive}\{issue.subkey}
                          {issue.valueName ? ` : ${issue.valueName}` : ''}
                        </p>
                        <p className="text-xs text-text-secondary truncate">{issue.valueData}</p>
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
              <h2 className="text-lg font-semibold text-text-primary mb-3">Backups</h2>
              <Card>
                <div className="space-y-2">
                  {state.backups.map((b) => (
                    <div
                      key={b.backupId}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div>
                        <p className="text-sm text-text-primary">{b.backupId}</p>
                        <p className="text-xs text-text-muted">
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
        </>
      )}
    </div>
  );
}
