/**
 * UninstallerPage — list installed programs and launch their uninstallers.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { UninstallerViewModel, type SortKey } from './UninstallerViewModel';
import { uninstallerService } from './uninstaller.service';
import type { Program } from './uninstaller.types';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function UninstallerPage() {
  const vm = useMemo(() => new UninstallerViewModel(uninstallerService), []);
  const state = useViewModel(vm);
  const [confirm, setConfirm] = useState<Program | null>(null);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const programs = vm.visiblePrograms;

  return (
    <div data-testid="page-uninstaller">
      <PageHeader
        title="Uninstaller"
        description="Review installed programs and remove the ones you no longer need."
      />

      {state.bootstrap === 'error' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{state.bootstrapError}</p>
            <Button onClick={() => vm.load()}>Retry</Button>
          </div>
        </Card>
      )}

      {state.bootstrap === 'ready' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card title="Installed Programs">
              <p className="text-3xl font-bold text-text-primary">{state.total}</p>
            </Card>
            <Card title="Total Size">
              <p className="text-3xl font-bold text-text-primary">
                {formatBytes(state.totalSizeBytes)}
              </p>
            </Card>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Search by name or publisher…"
              value={state.search}
              onChange={(e) => vm.setSearch(e.target.value)}
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-primary"
            />
            <select
              value={state.sortBy}
              onChange={(e) => vm.setSortBy(e.target.value as SortKey)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            >
              <option value="name">Sort: Name</option>
              <option value="size">Sort: Size</option>
              <option value="date">Sort: Install date</option>
            </select>
            <Button variant="secondary" onClick={() => vm.load()}>
              Refresh
            </Button>
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

          <Card>
            <div className="divide-y divide-border">
              {programs.map((p) => (
                <div key={p.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                    <p className="text-xs text-text-muted truncate">
                      {p.publisher || 'Unknown publisher'}
                      {p.version ? ` · v${p.version}` : ''}
                      {p.installDate ? ` · ${p.installDate}` : ''}
                    </p>
                  </div>
                  <div className="w-20 text-right text-sm text-text-secondary tabular-nums">
                    {formatBytes(p.sizeBytes)}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={state.busyId === p.id}
                    onClick={() => setConfirm(p)}
                  >
                    {state.busyId === p.id ? 'Working…' : 'Uninstall'}
                  </Button>
                </div>
              ))}
              {programs.length === 0 && (
                <p className="text-center text-text-secondary py-8">No programs match your search.</p>
              )}
            </div>
          </Card>
        </>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Uninstall {confirm.name}?</h3>
            <p className="text-sm text-text-secondary mb-6">
              This will launch the program&apos;s uninstaller. Follow its prompts to complete removal.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const target = confirm;
                  setConfirm(null);
                  void vm.uninstall(target);
                }}
              >
                Uninstall
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
