import { useState } from 'react';
import { Button, Card } from '@avs/ui';
import { DocumentTextIcon, PrinterIcon } from '@heroicons/react/24/outline';
import type { ComprehensiveSystemInfo } from '../system-info.types';
import type { SystemInfoViewModel } from '../SystemInfoViewModel';

interface SystemInfoTabsProps {
  info: ComprehensiveSystemInfo;
  vm: SystemInfoViewModel;
}

type TabId = 'overview' | 'cpu' | 'memory' | 'storage' | 'graphics' | 'network' | 'os';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cpu', label: 'CPU' },
  { id: 'memory', label: 'Memory' },
  { id: 'storage', label: 'Storage' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'network', label: 'Network' },
  { id: 'os', label: 'Operating System' },
];

export function SystemInfoTabs({ info, vm }: SystemInfoTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const exportAsTxt = () => {
    const lines = [
      `System Information Report — ${new Date(info.capturedAt).toLocaleString()}`,
      '',
      'CPU',
      `  Processor: ${info.cpu.name}`,
      `  Architecture: ${info.cpu.architecture}`,
      `  Cores: ${info.cpu.cores} physical / ${info.cpu.logicalCores} logical`,
      `  Max frequency: ${vm.formatFrequency(info.cpu.maxFrequency)}`,
      `  Current frequency: ${vm.formatFrequency(info.cpu.currentFrequency)}`,
      '',
      'Memory',
      `  Total: ${vm.formatBytes(info.memory.total)}`,
      `  Used: ${vm.formatBytes(info.memory.used)}`,
      `  Available: ${vm.formatBytes(info.memory.available)}`,
      `  Free: ${vm.formatBytes(info.memory.free)}`,
      `  Usage: ${info.memory.percent.toFixed(1)}%`,
      '',
      'Storage',
      ...info.disk.map((d) => `  ${d.device} ${d.mountpoint} — ${d.fstype} — ${vm.formatBytes(d.used)} / ${vm.formatBytes(d.total)} (${d.percent.toFixed(1)}%)`),
      '',
      'Network',
      `  Interfaces: ${info.network.interfaces.join(', ')}`,
      `  Bytes sent: ${vm.formatBytes(info.network.io.bytes_sent)}`,
      `  Bytes received: ${vm.formatBytes(info.network.io.bytes_recv)}`,
      `  Packets sent: ${info.network.io.packets_sent}`,
      `  Packets received: ${info.network.io.packets_recv}`,
      '',
      'Operating System',
      `  System: ${info.os.system}`,
      `  Release: ${info.os.release}`,
      `  Version: ${info.os.version}`,
      `  Machine: ${info.os.machine}`,
      `  Hostname: ${info.os.hostname}`,
      `  Boot time: ${new Date(info.os.bootTime * 1000).toLocaleString()}`,
      '',
      'Processes',
      `  Total: ${info.processes.total}`,
      `  Running: ${info.processes.running}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-info-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printForPdf = () => {
    window.print();
  };

  const renderOverview = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <SpecCard title="CPU" value={info.cpu.name} sub={`${info.cpu.cores} cores / ${info.cpu.logicalCores} threads`} />
      <SpecCard title="Memory" value={`${info.memory.percent.toFixed(1)}% used`} sub={`${vm.formatBytes(info.memory.total)} total`} />
      <SpecCard title="Storage" value={`${info.disk.length} drives`} sub={`${vm.formatBytes(info.disk.reduce((s, d) => s + d.used, 0))} used`} />
      <SpecCard title="Operating System" value={info.os.system} sub={`${info.os.release} ${info.os.version}`} />
      <SpecCard title="Network" value={`${info.network.interfaces.length} interfaces`} sub={info.network.interfaces.slice(0, 3).join(', ')} />
      <SpecCard title="Processes" value={`${info.processes.total}`} sub={`${info.processes.running} running`} />
    </div>
  );

  const renderPairs = (pairs: { label: string; value: string }[]) => (
    <Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pairs.map((p) => (
          <div key={p.label} className="flex justify-between border-b border-border pb-2 last:border-0">
            <span className="text-sm text-text-secondary">{p.label}</span>
            <span className="text-sm font-medium text-text-primary text-right">{p.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );

  const content = (() => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'cpu':
        return renderPairs([
          { label: 'Processor', value: info.cpu.name },
          { label: 'Architecture', value: info.cpu.architecture },
          { label: 'Physical cores', value: String(info.cpu.cores) },
          { label: 'Logical cores', value: String(info.cpu.logicalCores) },
          { label: 'Max frequency', value: vm.formatFrequency(info.cpu.maxFrequency) },
          { label: 'Current frequency', value: vm.formatFrequency(info.cpu.currentFrequency) },
        ]);
      case 'memory':
        return renderPairs([
          { label: 'Total', value: vm.formatBytes(info.memory.total) },
          { label: 'Used', value: vm.formatBytes(info.memory.used) },
          { label: 'Available', value: vm.formatBytes(info.memory.available) },
          { label: 'Free', value: vm.formatBytes(info.memory.free) },
          { label: 'Usage', value: `${info.memory.percent.toFixed(1)}%` },
        ]);
      case 'storage':
        return (
          <div className="space-y-4">
            {info.disk.map((disk, index) => (
              <Card key={index} title={`${disk.device} ${disk.mountpoint}`}>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">File system</span>
                    <span className="text-text-primary">{disk.fstype}</span>
                  </div>
                  <div className="w-full h-2 bg-bg-secondary rounded overflow-hidden">
                    <div className="h-full bg-brand-primary" style={{ width: `${disk.percent}%` }} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">{vm.formatBytes(disk.used)} used</span>
                    <span className="text-text-secondary">{vm.formatBytes(disk.free)} free of {vm.formatBytes(disk.total)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        );
      case 'graphics':
        return (
          <Card>
            <p className="text-sm text-text-secondary">GPU information is not yet collected by the backend. This tab is reserved for future graphics metrics.</p>
          </Card>
        );
      case 'network':
        return renderPairs([
          { label: 'Interfaces', value: info.network.interfaces.join(', ') },
          { label: 'Bytes sent', value: vm.formatBytes(info.network.io.bytes_sent) },
          { label: 'Bytes received', value: vm.formatBytes(info.network.io.bytes_recv) },
          { label: 'Packets sent', value: String(info.network.io.packets_sent) },
          { label: 'Packets received', value: String(info.network.io.packets_recv) },
          { label: 'Errors in/out', value: `${info.network.io.errin} / ${info.network.io.errout}` },
        ]);
      case 'os':
        return renderPairs([
          { label: 'System', value: info.os.system },
          { label: 'Release', value: info.os.release },
          { label: 'Version', value: info.os.version },
          { label: 'Machine', value: info.os.machine },
          { label: 'Hostname', value: info.os.hostname },
          { label: 'Boot time', value: new Date(info.os.bootTime * 1000).toLocaleString() },
          { label: 'Uptime', value: vm.formatUptime(info.os.bootTime) },
        ]);
      default:
        return null;
    }
  })();

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap gap-2" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                activeTab === tab.id
                  ? 'bg-brand-primary text-white'
                  : 'bg-surface-muted text-text-secondary hover:bg-bg-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" leftIcon={<DocumentTextIcon className="h-4 w-4" />} onClick={exportAsTxt}>
            Export TXT
          </Button>
          <Button variant="secondary" size="sm" leftIcon={<PrinterIcon className="h-4 w-4" />} onClick={printForPdf}>
            Print / PDF
          </Button>
        </div>
      </div>
      <div role="tabpanel" className="animate-fadeIn">
        {content}
      </div>
    </div>
  );
}

function SpecCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">{title}</div>
      <div className="text-lg font-semibold text-text-primary truncate" title={value}>
        {value}
      </div>
      <div className="text-xs text-text-secondary truncate">{sub}</div>
    </Card>
  );
}
