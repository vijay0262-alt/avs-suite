/**
 * SystemInfoPage - Main System Information page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button, GaugeCard, StatTile } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleErrorBanner, ModuleLoadingState } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { SystemInfoViewModel } from './SystemInfoViewModel';
import { systemInfoService } from './system-info.service';
import { SystemInfoTabs } from './components/SystemInfoTabs';
import {
  CpuChipIcon,
  CircleStackIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export default function SystemInfoPage() {
  const vm = useMemo(() => new SystemInfoViewModel(systemInfoService), []);
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleRefresh = () => {
    void vm.loadSystemInfo();
  };

  return (
    <div data-testid="page-system-information">
      <PageHeader
        title="System Information"
        description="A comprehensive report of CPU, RAM, disks, GPU, network, and OS build"
        actions={<HelpButton text="View detailed hardware and software information about your system. Use the Refresh button to capture the latest state. Information is organized into tabs for easy navigation." />}
      />

      {state.bootstrap === 'loading' && (
        <ModuleLoadingState
          message="Loading system information…"
          testId="system-info-loading"
        />
      )}

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="system-info-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {state.refreshError && (
            <ModuleErrorBanner
              message={state.refreshError}
              onRetry={() => vm.loadSystemInfo()}
              onDismiss={() => vm.clearRefreshError()}
              testId="system-info-refresh-error"
            />
          )}
          <div className="flex items-center justify-between mb-4">
            <p className="text-small text-text-secondary">
              {state.systemInfo && `Captured at ${new Date(state.systemInfo.capturedAt).toLocaleString()}`}
            </p>
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={state.loading}>
              {state.loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          {(state.loading && !state.systemInfo) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <div className="h-3 bg-[var(--avs-surface-muted)] rounded w-1/3 mb-3" />
                  <div className="h-5 bg-[var(--avs-surface-muted)] rounded w-2/3 mb-2" />
                  <div className="h-3 bg-[var(--avs-surface-muted)] rounded w-1/2" />
                </Card>
              ))}
            </div>
          )}

          {state.systemInfo && (
            <>
              {/* Hero status section — System Mechanic style */}
              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="system-info-hero-section">
                {/* Gauge */}
                <GaugeCard
                  title="CPU Usage"
                  value={Math.round(state.systemInfo.cpuUsage)}
                  unit="%"
                  tone={state.systemInfo.cpuUsage >= 80 ? 'danger' : state.systemInfo.cpuUsage >= 60 ? 'warning' : 'success'}
                  icon={<CpuChipIcon className="h-6 w-6" />}
                  description={state.systemInfo.cpu.name}
                  data-testid="system-info-hero-gauge"
                />

                {/* Key stats */}
                <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile
                    label="Memory"
                    value={`${Math.round(state.systemInfo.memory.percent)}%`}
                    hint={`${formatBytes(state.systemInfo.memory.used)} / ${formatBytes(state.systemInfo.memory.total)}`}
                    icon={<CircleStackIcon className="h-5 w-5" />}
                    variant="glass"
                    accentColor={state.systemInfo.memory.percent >= 80 ? 'var(--avs-danger)' : state.systemInfo.memory.percent >= 60 ? 'var(--avs-warning)' : undefined}
                  />
                  <StatTile
                    label="CPU Cores"
                    value={`${state.systemInfo.cpu.cores}`}
                    hint={`${state.systemInfo.cpu.logicalCores} logical`}
                    icon={<CpuChipIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                  <StatTile
                    label="OS"
                    value={state.systemInfo.os.system}
                    hint={state.systemInfo.os.release}
                    icon={<ComputerDesktopIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                  <StatTile
                    label="Processes"
                    value={state.systemInfo.processes.total.toLocaleString()}
                    hint={`${state.systemInfo.processes.running} running`}
                    icon={<CpuChipIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                  <StatTile
                    label="Hostname"
                    value={state.systemInfo.os.hostname}
                    hint={state.systemInfo.os.machine}
                    icon={<ComputerDesktopIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                  <StatTile
                    label="Disks"
                    value={state.systemInfo.disk.length.toString()}
                    hint="Mounted drives"
                    icon={<CircleStackIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                </div>
              </div>

              <SystemInfoTabs info={state.systemInfo} vm={vm} />
            </>
          )}
        </>
      )}
    </div>
  );
}
