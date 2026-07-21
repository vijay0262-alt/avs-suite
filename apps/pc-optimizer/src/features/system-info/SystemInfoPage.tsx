/**
 * SystemInfoPage - Main System Information page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
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
      />

      {state.bootstrap === 'loading' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-text-secondary">Loading system information...</p>
          </div>
        </Card>
      )}

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
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-secondary">
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
                  <div className="h-3 bg-bg-secondary rounded w-1/3 mb-3" />
                  <div className="h-5 bg-bg-secondary rounded w-2/3 mb-2" />
                  <div className="h-3 bg-bg-secondary rounded w-1/2" />
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
