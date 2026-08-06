/**
 * SystemInfoPage - Main System Information page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleErrorBanner, ModuleLoadingState } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { SystemInfoViewModel } from './SystemInfoViewModel';
import { systemInfoService } from './system-info.service';
import { SystemInfoTabs } from './components/SystemInfoTabs';

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
            <SystemInfoTabs info={state.systemInfo} vm={vm} />
          )}
        </>
      )}
    </div>
  );
}
