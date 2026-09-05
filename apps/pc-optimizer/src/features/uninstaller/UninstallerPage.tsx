/**
 * UninstallerPage — list installed programs and launch their uninstallers.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button, GaugeCard, StatTile } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { FreeEditionNotice } from '../../components/FreeEditionNotice';
import { ModuleErrorState, ModuleEmptyState, ModuleSuccessBanner, ModuleErrorBanner } from '../../components/ModuleStates';
import { SharedConfirmDialog } from '../../components/SharedConfirmDialog';
import { HelpButton } from '../../components/HelpButton';
import { ProStatusBanner } from '../licensing/ProStatusBadge';
import { useIsPro } from '../sync/syncStore';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { UninstallerViewModel, type SortKey } from './UninstallerViewModel';
import { uninstallerService } from './uninstaller.service';
import type { Program } from './uninstaller.types';
import {
  CircleStackIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  TrashIcon,
  SparklesIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';

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
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const programs = vm.visiblePrograms;

  return (
    <div data-testid="page-uninstaller">
      <ProStatusBanner compact />
      <PageHeader
        title="Uninstaller"
        description="Review installed programs and remove the ones you no longer need."
        actions={
          <div className="flex items-center gap-2">
            <HelpButton text="Browse installed programs and launch their uninstallers. Search by name or publisher, sort by size or install date. The program's own uninstaller will guide you through removal." />
          </div>
        }
      />

      {!isPro && (
        <FreeEditionNotice
          badgeLabel="PRO"
          title="Uninstaller is a Professional Feature"
          message="Free users can view installed programs but cannot uninstall them through AVS AI Shield. Upgrade to Professional to uninstall programs and scan for leftover files and registry entries."
          action={
            <Button
              onClick={() => showUpgrade('Uninstaller')}
              variant="primary"
              data-testid="uninstaller-upgrade-cta"
            >
              Upgrade to Professional
            </Button>
          }
          testId="uninstaller-free-notice"
          className="mb-6"
        />
      )}

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message="Could not reach the backend service. Please try again."
          onRetry={() => vm.load()}
          testId="uninstaller-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {/* Hero status section — System Mechanic style */}
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="uninstaller-hero-section">
            {/* Gauge */}
            <GaugeCard
              title="Installed Programs"
              value={Math.min(100, state.total)}
              unit=""
              tone="brand"
              icon={<CircleStackIcon className="h-6 w-6" />}
              description={`${state.total} programs · ${formatBytes(state.totalSizeBytes)} total`}
              data-testid="uninstaller-hero-gauge"
            />

            {/* Key stats */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label="Programs"
                value={state.total.toString()}
                hint="Installed on system"
                icon={<CircleStackIcon className="h-5 w-5" />}
                variant="glass"
              />
              <StatTile
                label="Total Size"
                value={formatBytes(state.totalSizeBytes)}
                hint="Disk space used"
                icon={<ArrowDownTrayIcon className="h-5 w-5" />}
                variant="glass"
              />
              <StatTile
                label="Visible"
                value={programs.length.toString()}
                hint={state.search ? 'Filtered results' : 'All programs'}
                icon={<CommandLineIcon className="h-5 w-5" />}
                variant="glass"
              />
              <StatTile
                label="Edition"
                value={isPro ? 'Pro' : 'Free'}
                hint={isPro ? 'Full access' : 'View only'}
                icon={<SparklesIcon className="h-5 w-5" />}
                variant="glass"
              />
              <StatTile
                label="Action"
                value={isPro ? 'Uninstall' : 'Locked'}
                hint={isPro ? 'Click to remove' : 'Upgrade to unlock'}
                icon={<TrashIcon className="h-5 w-5" />}
                variant="glass"
                accentColor={isPro ? 'var(--avs-success)' : 'var(--avs-warning)'}
              />
              <StatTile
                label="Refresh"
                value="Ready"
                hint="Click to rescan"
                icon={<ArrowPathIcon className="h-5 w-5" />}
                variant="glass"
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="Search by name or publisher…"
              value={state.search}
              onChange={(e) => vm.setSearch(e.target.value)}
              className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary outline-none focus:border-brand-primary"
            />
            <select
              value={state.sortBy}
              onChange={(e) => vm.setSortBy(e.target.value as SortKey)}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary"
            >
              <option value="name">Sort: Name</option>
              <option value="size">Sort: Size</option>
              <option value="date">Sort: Install date</option>
            </select>
            <Button variant="secondary" onClick={() => vm.load()} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
              Refresh
            </Button>
          </div>

          {state.actionMessage && (
            <ModuleSuccessBanner
              title={state.actionMessage}
              testId="uninstaller-action-success"
            />
          )}
          {state.actionError && (
            <ModuleErrorBanner
              message="Uninstall encountered an issue. Please try again."
              testId="uninstaller-action-error"
            />
          )}

          <Card>
            <div className="divide-y divide-[var(--avs-border)]">
              {programs.map((p) => (
                <div key={p.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-small font-medium text-text-primary truncate">{p.name}</p>
                    <p className="text-caption text-text-muted truncate">
                      {p.publisher || 'Unknown publisher'}
                      {p.version ? ` · v${p.version}` : ''}
                      {p.installDate ? ` · ${p.installDate}` : ''}
                    </p>
                  </div>
                  <div className="w-20 text-right text-small text-text-secondary tabular-nums">
                    {formatBytes(p.sizeBytes)}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={state.busyId === p.id}
                    onClick={() => {
                      if (!isPro) {
                        showUpgrade('Uninstaller');
                        return;
                      }
                      setConfirm(p);
                    }}
                  >
                    {state.busyId === p.id ? 'Working…' : isPro ? 'Uninstall' : 'Uninstall (PRO)'}
                  </Button>
                </div>
              ))}
              {programs.length === 0 && (
                <ModuleEmptyState
                  title="No programs match your search"
                  message="Try adjusting your search terms or clear the search to see all installed programs."
                  testId="uninstaller-empty"
                />
              )}
            </div>
          </Card>
        </>
      )}

      <SharedConfirmDialog
        open={confirm !== null}
        title={`Uninstall ${confirm?.name ?? ''}?`}
        message="This will launch the program's uninstaller. Follow its prompts to complete removal."
        confirmLabel="Uninstall"
        onConfirm={() => {
          const target = confirm;
          setConfirm(null);
          if (target) void vm.uninstall(target);
        }}
        onCancel={() => setConfirm(null)}
        testId="uninstaller-confirm"
      />
    </div>
  );
}
