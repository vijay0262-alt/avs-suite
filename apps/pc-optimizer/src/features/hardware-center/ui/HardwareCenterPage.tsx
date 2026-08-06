/**
 * HardwareCenterPage — the user-facing Hardware Intelligence Center dashboard.
 *
 * Displays real-time hardware monitoring with cards for CPU, GPU, RAM, Storage,
 * Network, Battery, and Cooling. Includes overview metrics, live graphs,
 * alerts, search, export, and monitoring controls.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, Badge, Button, ProgressBar } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../../components/PageHeader';
import { HelpButton } from '../../../components/HelpButton';
import { ModuleErrorState, ModuleLoadingState } from '../../../components/ModuleStates';
import { useEditionLimits } from '../../licensing/editionLimits';
import { ProStatusBanner, ProStatusPill, ProFeatureIndicator, ProOnlySection } from '../../licensing/ProStatusBadge';
import { ChartBarIcon, FireIcon, BellIcon } from '@heroicons/react/24/outline';
import { HardwareDashboardViewModel } from './HardwareDashboardViewModel';
import { OverviewSection } from './OverviewSection';
import { HardwareCard } from './HardwareCard';
import { LiveGraph } from './LiveGraph';
import { AlertsPanel } from './AlertsPanel';
import { ExportMenu } from './ExportMenu';
import type {
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  NetworkComponent,
  BatteryComponent,
  CoolingComponent,
  SensorReading,
  ExportFormat,
} from '../types';

export default function HardwareCenterPage() {
  const vm = useMemo(() => new HardwareDashboardViewModel(), []);
  const state = useViewModel(vm);
  const [showHistory, setShowHistory] = useState(false);
  const limits = useEditionLimits();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handlePause = useCallback(() => vm.pauseMonitoring(), [vm]);
  const handleResume = useCallback(() => vm.resumeMonitoring(), [vm]);
  const handleSnapshot = useCallback(() => { void vm.snapshotNow(); }, [vm]);
  const handleExport = useCallback((format: ExportFormat) => {
    const data = vm.exportSnapshot(format);
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hardware-snapshot-${Date.now()}.${format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [vm]);

  if (state.bootstrap === 'loading') {
    return (
      <div data-testid="page-hardware-center">
        <PageHeader title="Hardware Center" description="Real-time hardware monitoring and diagnostics" />
        <ModuleLoadingState message="Initializing hardware scan…" testId="hardware-center-loading" />
      </div>
    );
  }

  if (state.bootstrap === 'error') {
    return (
      <div data-testid="page-hardware-center">
        <PageHeader title="Hardware Center" description="Real-time hardware monitoring and diagnostics" />
        <ModuleErrorState
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="hardware-center-error"
        />
      </div>
    );
  }

  const components = state.snapshot?.components ?? [];
  const cpu = components.find((c) => c.category === 'cpu') as CPUComponent | undefined;
  const gpu = components.find((c) => c.category === 'gpu') as GPUComponent | undefined;
  const ram = components.find((c) => c.category === 'ram') as RAMComponent | undefined;
  const storage = components.filter((c) => c.category === 'storage') as StorageComponent[];
  const network = components.find((c) => c.category === 'network') as NetworkComponent | undefined;
  const battery = components.find((c) => c.category === 'battery') as BatteryComponent | undefined;
  const cooling = components.find((c) => c.category === 'cooling') as CoolingComponent | undefined;

  const searchResults = state.searchResults;

  return (
    <div data-testid="page-hardware-center" className="space-y-6">
      <ProStatusBanner compact />
      <PageHeader
        title="Hardware Center"
        description="Real-time monitoring of your computer's hardware components"
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <HelpButton text="View real-time hardware metrics including CPU, GPU, RAM, storage, network, battery, and cooling. Use the controls to pause/resume monitoring, take snapshots, or export data." />
            <ExportMenu onExport={handleExport} />
          </div>
        }
      />

      {/* Edition History Indicator */}
      <div className="flex items-center gap-3">
        <Badge tone={limits.isPro ? 'brand' : 'neutral'} data-testid="hardware-history-indicator">
          {limits.getLabel('hardwareCenterHistoryHours')}
        </Badge>
        <ProOnlySection>
          <div className="flex flex-wrap gap-2">
            <ProFeatureIndicator icon={ChartBarIcon} label="Long-term Trends" />
            <ProFeatureIndicator icon={FireIcon} label="Thermal Analytics" />
            <ProFeatureIndicator icon={BellIcon} label="Health Alerts" />
          </div>
        </ProOnlySection>
      </div>

      {/* Monitoring Controls */}
      <div className="flex items-center gap-3 flex-wrap" data-testid="monitoring-controls">
        {state.isPolling ? (
          <Button variant="secondary" size="sm" onClick={handlePause} leftIcon={<span>⏸</span>} data-testid="btn-pause">
            Pause
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleResume} leftIcon={<span>▶</span>} data-testid="btn-resume">
            Resume
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleSnapshot} leftIcon={<span>📷</span>} data-testid="btn-snapshot">
          Snapshot Now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHistory((v) => !v)}
          data-testid="btn-history"
        >
          {showHistory ? 'Hide History' : 'Show History'}
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-caption text-text-secondary" htmlFor="poll-interval">Refresh:</label>
          <select
            id="poll-interval"
            className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-small text-text-primary focus:outline-none focus-visible:shadow-focus focus:border-[var(--avs-border-hover)] transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
            value={state.pollIntervalMs}
            onChange={(e) => vm.setPollInterval(Number(e.target.value))}
            data-testid="poll-interval-select"
          >
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
          </select>
          <Badge tone={state.isPolling ? 'success' : 'neutral'} data-testid="monitoring-status">
            {state.isPolling ? 'Live' : 'Paused'}
          </Badge>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search hardware, sensors, drives, adapters…"
          className="w-full max-w-md rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:shadow-focus focus:border-[var(--avs-border-hover)] transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
          value={state.searchQuery}
          onChange={(e) => vm.setSearchQuery(e.target.value)}
          data-testid="hardware-search"
        />
        {state.searchQuery && (
          <Button variant="ghost" size="sm" onClick={() => vm.setSearchQuery('')}>
            Clear
          </Button>
        )}
      </div>

      {/* Overview Section */}
      {state.overview && <OverviewSection overview={state.overview} />}

      {/* Alerts Panel */}
      {state.alerts.length > 0 && (
        <AlertsPanel
          alerts={state.alerts}
          onAcknowledge={(id) => vm.acknowledgeAlert(id)}
          onClear={() => vm.clearAlerts()}
        />
      )}

      {/* Live Graphs */}
      {state.graphHistory.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LiveGraph
            title="CPU Utilization & Temperature"
            unit="%"
            series={[
              { name: 'Utilization', color: 'var(--avs-brand-primary)', points: state.graphHistory.map((p) => ({ t: p.t, v: p.cpuUtil })) },
              { name: 'Temperature', color: 'var(--avs-danger)', points: state.graphHistory.map((p) => ({ t: p.t, v: p.cpuTemp })) },
            ]}
            windowSeconds={60}
            data-testid="cpu-graph"
          />
          <LiveGraph
            title="GPU Utilization & Temperature"
            unit="%"
            series={[
              { name: 'Utilization', color: 'var(--avs-brand-primary)', points: state.graphHistory.map((p) => ({ t: p.t, v: p.gpuUtil })) },
              { name: 'Temperature', color: 'var(--avs-danger)', points: state.graphHistory.map((p) => ({ t: p.t, v: p.gpuTemp })) },
            ]}
            windowSeconds={60}
            data-testid="gpu-graph"
          />
          <LiveGraph
            title="RAM Usage"
            unit="%"
            series={[
              { name: 'Memory Usage', color: 'var(--avs-success)', points: state.graphHistory.map((p) => ({ t: p.t, v: p.ramUsage })) },
            ]}
            windowSeconds={60}
            data-testid="ram-graph"
          />
          <LiveGraph
            title="Network Bandwidth"
            unit="Mbps"
            series={[
              { name: 'Download', color: 'var(--avs-brand-primary)', points: state.graphHistory.map((p) => ({ t: p.t, v: p.netDownload })) },
              { name: 'Upload', color: 'var(--avs-warning)', points: state.graphHistory.map((p) => ({ t: p.t, v: p.netUpload })) },
            ]}
            windowSeconds={60}
            data-testid="network-graph"
          />
        </div>
      )}

      {/* History View */}
      {showHistory && (
        <Card title="Scan History" variant="glass" data-testid="history-view">
          <div className="space-y-2">
            <p className="text-small text-text-secondary">
              Last scan: {state.snapshot ? new Date(state.snapshot.timestamp).toLocaleString() : 'N/A'}
              {' · '}
              Duration: {state.lastScanDurationMs}ms
              {' · '}
              Components: {state.snapshot?.components.length ?? 0}
            </p>
            <p className="text-small text-text-secondary">
              Graph data points: {state.graphHistory.length}/{60}
            </p>
          </div>
        </Card>
      )}

      {/* Hardware Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cpu && (!searchResults || searchResults.some((c) => c.category === 'cpu')) && (
          <CPUCard cpu={cpu} data-testid="cpu-card" />
        )}
        {gpu && (!searchResults || searchResults.some((c) => c.category === 'gpu')) && (
          <GPUCard gpu={gpu} data-testid="gpu-card" />
        )}
        {ram && (!searchResults || searchResults.some((c) => c.category === 'ram')) && (
          <RAMCard ram={ram} data-testid="ram-card" />
        )}
        {network && (!searchResults || searchResults.some((c) => c.category === 'network')) && (
          <NetworkCard network={network} data-testid="network-card" />
        )}
        {battery && (!searchResults || searchResults.some((c) => c.category === 'battery')) && (
          <BatteryCard battery={battery} data-testid="battery-card" />
        )}
        {cooling && (!searchResults || searchResults.some((c) => c.category === 'cooling')) && (
          <CoolingCard cooling={cooling} data-testid="cooling-card" />
        )}
      </div>

      {/* Storage Cards (each drive gets its own card) */}
      {storage.length > 0 && (!searchResults || searchResults.some((c) => c.category === 'storage')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {storage.map((drive, i) => (
            <StorageCard key={i} storage={drive} data-testid={`storage-card-${i}`} />
          ))}
        </div>
      )}

      {/* No Results */}
      {searchResults && searchResults.length === 0 && (
        <div className="text-center py-12 text-small text-text-secondary rounded-[var(--avs-radius-xl)] bg-gradient-surface border border-[var(--avs-border)]" data-testid="no-search-results">
          No hardware found matching &ldquo;{state.searchQuery}&rdquo;
        </div>
      )}
    </div>
  );
}

// ── Card Components ───────────────────────────────────────────────────

function sensorNum(reading: SensorReading<number> | undefined, decimals = 0): string {
  if (!reading?.supported || reading.value === undefined) return 'N/A';
  return reading.value.toFixed(decimals);
}

function MetricRow({ label, value, unit, supported }: { label: string; value: string; unit?: string; supported?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-small">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-medium ${supported === false ? 'text-text-muted' : 'text-text-primary'}`}>
        {value}{unit && supported !== false ? ` ${unit}` : ''}
      </span>
    </div>
  );
}

function CPUCard({ cpu, ...rest }: { cpu: CPUComponent } & React.HTMLAttributes<HTMLDivElement>) {
  const util = cpu.info.packageUtilization;
  const temp = cpu.sensors.temperatureC;
  return (
    <HardwareCard title="CPU" model={cpu.info.model} badge={cpu.info.vendor} {...rest}>
      <MetricRow label="Current Clock" value={sensorNum(cpu.info.currentFrequencyMHz, 0)} unit="MHz" supported={cpu.info.currentFrequencyMHz?.supported} />
      <MetricRow label="Base Clock" value={String(cpu.info.baseFrequencyMHz)} unit="MHz" />
      <MetricRow label="Boost Clock" value={cpu.info.boostFrequencyMHz ? String(cpu.info.boostFrequencyMHz) : 'N/A'} unit="MHz" />
      <MetricRow label="Utilization" value={sensorNum(util, 0)} unit="%" supported={util?.supported} />
      <MetricRow label="Temperature" value={sensorNum(temp, 0)} unit="°C" supported={temp?.supported} />
      <MetricRow label="Package Power" value={sensorNum(cpu.sensors.powerDrawW, 1)} unit="W" supported={cpu.sensors.powerDrawW?.supported} />
      <MetricRow label="Voltage" value={sensorNum(cpu.sensors.voltageV, 2)} unit="V" supported={cpu.sensors.voltageV?.supported} />
      <MetricRow label="Logical Cores" value={String(cpu.info.logicalCores)} />
      <MetricRow label="Physical Cores" value={String(cpu.info.physicalCores)} />
      <MetricRow label="Threads" value={String(cpu.info.threads)} />
      {cpu.info.perCoreUtilization && cpu.info.perCoreUtilization.length > 0 && (
        <div className="mt-3">
          <div className="text-caption text-text-secondary mb-1.5">Per-Core Utilization</div>
          <div className="flex flex-wrap gap-1">
            {cpu.info.perCoreUtilization.map((core, i) => (
              <span
                key={i}
                className="inline-flex items-center justify-center rounded-[var(--avs-radius-sm)] text-caption font-medium px-1.5 py-0.5 bg-[var(--avs-surface-muted)] text-text-primary"
                title={core.supported ? `Core ${i}: ${core.value}% via ${core.source}` : 'Unsupported'}
              >
                {core.supported ? `${core.value.toFixed(0)}%` : '—'}
              </span>
            ))}
          </div>
        </div>
      )}
      {util?.supported && (
        <div className="mt-3">
          <ProgressBar value={util.value} label="CPU Usage" tone={util.value > 85 ? 'danger' : util.value > 60 ? 'warning' : 'brand'} />
        </div>
      )}
    </HardwareCard>
  );
}

function GPUCard({ gpu, ...rest }: { gpu: GPUComponent } & React.HTMLAttributes<HTMLDivElement>) {
  const util = gpu.sensors.gpuUtilization;
  const temp = gpu.sensors.temperatureC;
  const vramTotal = gpu.info.vramMB;
  const memUtil = gpu.sensors.memoryUtilization;
  return (
    <HardwareCard title="GPU" model={gpu.info.model} badge={gpu.info.vendor} {...rest}>
      <MetricRow label="GPU Utilization" value={sensorNum(util, 0)} unit="%" supported={util?.supported} />
      <MetricRow label="VRAM" value={`${vramTotal} MB`} />
      <MetricRow label="VRAM Usage" value={sensorNum(memUtil, 0)} unit="%" supported={memUtil?.supported} />
      <MetricRow label="Temperature" value={sensorNum(temp, 0)} unit="°C" supported={temp?.supported} />
      <MetricRow label="Core Clock" value={sensorNum(gpu.sensors.coreClockMHz, 0)} unit="MHz" supported={gpu.sensors.coreClockMHz?.supported} />
      <MetricRow label="Memory Clock" value={sensorNum(gpu.sensors.memoryClockMHz, 0)} unit="MHz" supported={gpu.sensors.memoryClockMHz?.supported} />
      <MetricRow label="Power Draw" value={sensorNum(gpu.sensors.powerDrawW, 1)} unit="W" supported={gpu.sensors.powerDrawW?.supported} />
      <MetricRow label="Fan Speed" value={sensorNum(gpu.sensors.fanSpeedRPM, 0)} unit="RPM" supported={gpu.sensors.fanSpeedRPM?.supported} />
      <MetricRow label="Driver" value={gpu.info.driver} />
      {util?.supported && (
        <div className="mt-3">
          <ProgressBar value={util.value} label="GPU Usage" tone={util.value > 90 ? 'danger' : util.value > 70 ? 'warning' : 'brand'} />
        </div>
      )}
    </HardwareCard>
  );
}

function RAMCard({ ram, ...rest }: { ram: RAMComponent } & React.HTMLAttributes<HTMLDivElement>) {
  const used = ram.info.usedMB;
  const total = ram.info.installedMB;
  const pct = used?.supported && total > 0 ? (used.value / total) * 100 : 0;
  return (
    <HardwareCard title="Memory" model={`${(total / 1024).toFixed(0)} GB RAM`} badge={ram.info.ecc ? 'ECC' : undefined} {...rest}>
      <MetricRow label="Installed" value={`${(total / 1024).toFixed(0)} GB`} />
      <MetricRow label="Available" value={used?.supported ? `${((total - used.value) / 1024).toFixed(1)} GB` : 'N/A'} supported={used?.supported} />
      <MetricRow label="Used" value={sensorNum(used, 0)} unit="MB" supported={used?.supported} />
      <MetricRow label="Cached" value={sensorNum(ram.info.cachedMB, 0)} unit="MB" supported={ram.info.cachedMB?.supported} />
      <MetricRow label="Memory Pressure" value={sensorNum(ram.info.memoryPressure, 0)} unit="%" supported={ram.info.memoryPressure?.supported} />
      <MetricRow label="Speed" value={ram.info.speedMTs ? `${ram.info.speedMTs} MT/s` : 'N/A'} />
      <MetricRow label="Channels" value={ram.info.channels ? String(ram.info.channels) : 'N/A'} />
      <MetricRow label="Slots" value={ram.info.slotsUsed && ram.info.slotsTotal ? `${ram.info.slotsUsed}/${ram.info.slotsTotal}` : 'N/A'} />
      {used?.supported && (
        <div className="mt-3">
          <ProgressBar value={pct} label="Memory Usage" tone={pct > 85 ? 'danger' : pct > 70 ? 'warning' : 'success'} />
        </div>
      )}
    </HardwareCard>
  );
}

function StorageCard({ storage, ...rest }: { storage: StorageComponent } & React.HTMLAttributes<HTMLDivElement>) {
  const capGB = storage.info.capacityBytes / 1e9;
  const usedGB = storage.info.usedBytes?.supported ? storage.info.usedBytes.value / 1e9 : 0;
  const pct = storage.info.usedBytes?.supported ? (storage.info.usedBytes.value / storage.info.capacityBytes) * 100 : 0;
  return (
    <HardwareCard title={`Storage — ${storage.info.type.toUpperCase()}`} model={storage.info.model} badge={storage.info.interface} {...rest}>
      <MetricRow label="Capacity" value={capGB.toFixed(1)} unit="GB" />
      <MetricRow label="Used" value={usedGB.toFixed(1)} unit="GB" supported={storage.info.usedBytes?.supported} />
      <MetricRow label="Free" value={storage.info.freeBytes?.supported ? `${(storage.info.freeBytes.value / 1e9).toFixed(1)} GB` : 'N/A'} unit="GB" supported={storage.info.freeBytes?.supported} />
      <MetricRow label="Filesystem" value={storage.info.filesystem ?? 'N/A'} />
      <MetricRow label="Temperature" value={sensorNum(storage.sensors.temperatureC, 0)} unit="°C" supported={storage.sensors.temperatureC?.supported} />
      <MetricRow label="SMART Health" value={sensorNum(storage.sensors.healthPercent, 0)} unit="%" supported={storage.sensors.healthPercent?.supported} />
      <MetricRow label="Lifetime Remaining" value={sensorNum(storage.sensors.lifetimeRemainingPercent, 0)} unit="%" supported={storage.sensors.lifetimeRemainingPercent?.supported} />
      <MetricRow label="Read Speed" value={sensorNum(storage.sensors.readSpeedMBps, 0)} unit="MB/s" supported={storage.sensors.readSpeedMBps?.supported} />
      <MetricRow label="Write Speed" value={sensorNum(storage.sensors.writeSpeedMBps, 0)} unit="MB/s" supported={storage.sensors.writeSpeedMBps?.supported} />
      {storage.info.usedBytes?.supported && (
        <div className="mt-3">
          <ProgressBar value={pct} label="Drive Usage" tone={pct > 90 ? 'danger' : pct > 75 ? 'warning' : 'brand'} />
        </div>
      )}
    </HardwareCard>
  );
}

function NetworkCard({ network, ...rest }: { network: NetworkComponent } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <HardwareCard title="Network" model={network.info.adapter} badge={network.info.type} {...rest}>
      <MetricRow label="Download Speed" value={sensorNum(network.sensors.downloadMbps, 1)} unit="Mbps" supported={network.sensors.downloadMbps?.supported} />
      <MetricRow label="Upload Speed" value={sensorNum(network.sensors.uploadMbps, 1)} unit="Mbps" supported={network.sensors.uploadMbps?.supported} />
      <MetricRow label="IPv4" value={network.info.ipv4?.join(', ') ?? 'N/A'} />
      <MetricRow label="IPv6" value={network.info.ipv6?.[0] ?? 'N/A'} />
      <MetricRow label="Link Speed" value={network.info.linkSpeedMbps ? `${network.info.linkSpeedMbps} Mbps` : 'N/A'} />
      <MetricRow label="MAC" value={network.info.mac} />
      {network.info.signalStrengthPercent?.supported && (
        <div className="mt-3">
          <ProgressBar value={network.info.signalStrengthPercent.value} label="Wi-Fi Signal" tone={network.info.signalStrengthPercent.value < 30 ? 'danger' : 'success'} />
        </div>
      )}
    </HardwareCard>
  );
}

function BatteryCard({ battery, ...rest }: { battery: BatteryComponent } & React.HTMLAttributes<HTMLDivElement>) {
  const charge = battery.info.currentChargePercent;
  const wear = battery.info.wearLevelPercent;
  return (
    <HardwareCard title="Battery" model="Laptop Battery" badge={battery.info.chargingStatus?.supported ? battery.info.chargingStatus.value : 'unknown'} {...rest}>
      <MetricRow label="Current Charge" value={sensorNum(charge, 0)} unit="%" supported={charge?.supported} />
      <MetricRow label="Health" value={`${battery.info.fullChargeCapacityWH && battery.info.designCapacityWH ? ((battery.info.fullChargeCapacityWH / battery.info.designCapacityWH) * 100).toFixed(0) : 'N/A'}%`} />
      <MetricRow label="Wear Level" value={sensorNum(wear, 0)} unit="%" supported={wear?.supported} />
      <MetricRow label="Charge Cycles" value={battery.info.chargeCycles ? String(battery.info.chargeCycles) : 'N/A'} />
      <MetricRow label="Remaining Time" value={sensorNum(battery.info.estimatedRuntimeMinutes, 0)} unit="min" supported={battery.info.estimatedRuntimeMinutes?.supported} />
      <MetricRow label="Charging Status" value={battery.info.chargingStatus?.supported ? battery.info.chargingStatus.value : 'N/A'} supported={battery.info.chargingStatus?.supported} />
      {charge?.supported && (
        <div className="mt-3">
          <ProgressBar value={charge.value} label="Battery Charge" tone={charge.value < 20 ? 'danger' : charge.value < 50 ? 'warning' : 'success'} />
        </div>
      )}
    </HardwareCard>
  );
}

function CoolingCard({ cooling, ...rest }: { cooling: CoolingComponent } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <HardwareCard title="Cooling" model="System Cooling" badge={cooling.sensorStatus.availability} {...rest}>
      {cooling.info.fans.map((fan, i) => (
        <MetricRow
          key={i}
          label={`${fan.name} (${fan.type.replace('_', ' ')})`}
          value={sensorNum(fan.rpm, 0)}
          unit="RPM"
          supported={fan.rpm?.supported}
        />
      ))}
      <MetricRow label="Sensor Availability" value={cooling.sensorStatus.availability} />
    </HardwareCard>
  );
}
