/**
 * SystemInfoPage - Main System Information page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { SystemInfoViewModel } from './SystemInfoViewModel';
import { systemInfoService } from './system-info.service';

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

      {state.bootstrap === 'ready' && state.systemInfo && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">System Overview</h2>
            <Button variant="secondary" onClick={handleRefresh} disabled={state.loading}>
              {state.loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <Card title="CPU">
              <div className="space-y-2">
                < div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Processor</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.cpu.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Architecture</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.cpu.architecture}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Cores</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.cpu.cores} Physical / {state.systemInfo.cpu.logicalCores} Logical</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Frequency</span>
                  <span className="text-sm text-text-primary">{vm.formatFrequency(state.systemInfo.cpu.currentFrequency)}</span>
                </div>
              </div>
            </Card>

            <Card title="Memory">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Total</span>
                  <span className="text-sm text-text-primary">{vm.formatBytes(state.systemInfo.memory.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Used</span>
                  <span className="text-sm text-text-primary">{vm.formatBytes(state.systemInfo.memory.used)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Available</span>
                  <span className="text-sm text-text-primary">{vm.formatBytes(state.systemInfo.memory.available)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Usage</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.memory.percent.toFixed(1)}%</span>
                </div>
              </div>
            </Card>

            <Card title="Operating System">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">System</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.os.system}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Release</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.os.release}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Version</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.os.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Hostname</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.os.hostname}</span>
                </div>
              </div>
            </Card>
          </div>

          <Card title="Disk Drives" className="mb-6">
            <div className="space-y-4">
              {state.systemInfo.disk.map((disk, index) => (
                <div key={index} className="border border-border rounded p-4">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <p className="font-semibold text-text-primary">{disk.device}</p>
                      <p className="text-sm text-text-secondary">{disk.mountpoint} ({disk.fstype})</p>
                    </div>
                    <span className="text-lg font-bold text-text-primary">{disk.percent.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-bg-secondary rounded overflow-hidden mb-2">
                    <div 
                      className="h-full bg-brand-primary transition-all"
                      style={{ width: `${disk.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Used: {vm.formatBytes(disk.used)}</span>
                    <span className="text-text-secondary">Free: {vm.formatBytes(disk.free)}</span>
                    <span className="text-text-secondary">Total: {vm.formatBytes(disk.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card title="Network">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Interfaces</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.network.interfaces.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Bytes Sent</span>
                  <span className="text-sm text-text-primary">{vm.formatBytes(state.systemInfo.network.io.bytes_sent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Bytes Received</span>
                  <span className="text-sm text-text-primary">{vm.formatBytes(state.systemInfo.network.io.bytes_recv)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Packets Sent</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.network.io.packets_sent}</span>
                </div>
              </div>
            </Card>

            <Card title="Processes">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Total Processes</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.processes.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Running</span>
                  <span className="text-sm text-text-primary">{state.systemInfo.processes.running}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">System Uptime</span>
                  <span className="text-sm text-text-primary">{vm.formatUptime(state.systemInfo.os.bootTime)}</span>
                </div>
              </div>
            </Card>
          </div>

          <Card title="Last Updated">
            <p className="text-sm text-text-secondary">
              {new Date(state.systemInfo.capturedAt).toLocaleString()}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
