/**
 * HardwareDashboardViewModel — manages the Hardware Center dashboard state.
 *
 * Uses HardwareManager for scanning, monitoring, health, and diagnostics.
 * Exposes snapshot data, overview metrics, alerts, and graph history to the UI.
 * Supports pause/resume, configurable refresh interval, search, and export.
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type {
  HardwareSnapshot,
  HardwareHealthStatus,
  HardwareCapabilities,
  HardwareDashboardData,
  HardwareOverview,
  HardwareAlert,
  HardwareComponent,
  HardwareCategory,
  CPUComponent,
  GPUComponent,
  RAMComponent,
  NetworkComponent,
  CoolingComponent,
  OSComponent,
  ExportFormat,
  SensorReading,
} from '../types';
import { HardwareManager } from '../HardwareManager';
import { hardwareRegistry } from '../HardwareRegistry';
import { hardwareEventBus } from '../HardwareEvents';

export interface HardwareDashboardState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  snapshot: HardwareSnapshot | null;
  health: HardwareHealthStatus | null;
  capabilities: HardwareCapabilities | null;
  dashboard: HardwareDashboardData | null;
  overview: HardwareOverview | null;
  alerts: HardwareAlert[];
  isPolling: boolean;
  pollIntervalMs: number;
  searchQuery: string;
  searchResults: HardwareComponent[] | null;
  graphHistory: { t: number; cpuUtil: number; cpuTemp: number; gpuUtil: number; gpuTemp: number; ramUsage: number; netDownload: number; netUpload: number }[];
  lastScanDurationMs: number;
}

const MAX_GRAPH_POINTS = 60;
const DEFAULT_POLL_MS = 1000;

export class HardwareDashboardViewModel extends ViewModel<HardwareDashboardState> {
  private manager: HardwareManager;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private eventUnsub: (() => void) | null = null;

  constructor(manager?: HardwareManager) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      snapshot: null,
      health: null,
      capabilities: null,
      dashboard: null,
      overview: null,
      alerts: [],
      isPolling: false,
      pollIntervalMs: DEFAULT_POLL_MS,
      searchQuery: '',
      searchResults: null,
      graphHistory: [],
      lastScanDurationMs: 0,
    });
    this.manager = manager ?? new HardwareManager({ pollIntervalMs: DEFAULT_POLL_MS, enablePolling: false });
  }

  async bootstrap(): Promise<void> {
    this.setState({ bootstrap: 'loading', bootstrapError: null });
    try {
      this.registerMockProviders();
      await this.manager.initialize();
      const snapshot = await this.manager.scan();
      this.updateFromSnapshot(snapshot);
      this.setState({ bootstrap: 'ready' });
      this.startPolling();
      this.subscribeToEvents();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to initialize Hardware Center';
      this.setState({ bootstrap: 'error', bootstrapError: error });
    }
  }

  private registerMockProviders(): void {
    if (hardwareRegistry.getAllProviders().length > 0) return;
    hardwareRegistry.register({
      id: 'mock-wmi',
      source: 'wmi',
      categories: ['cpu', 'gpu', 'ram', 'storage', 'network', 'battery', 'cooling', 'operating_system', 'motherboard'],
      async initialize() {},
      dispose() {},
      async scan() { return []; },
      async poll() { return []; },
      isAvailable() { return true; },
      getHealth() {
        return { state: 'healthy', consecutiveFailures: 0, consecutiveSuccesses: 1 };
      },
    });
  }

  private subscribeToEvents(): void {
    this.eventUnsub = hardwareEventBus.subscribe((event) => {
      if (event.type === 'hardware_provider_failed') {
        this.addAlert({
          severity: 'warning',
          category: event.category ?? 'cpu',
          title: 'Provider Failed',
          message: event.data?.error ?? 'Unknown provider error',
        });
      }
      if (event.type === 'hardware_sensor_missing') {
        this.addAlert({
          severity: 'info',
          category: event.category ?? 'cpu',
          title: 'Sensor Missing',
          message: `Sensor ${event.data?.sensorName ?? 'unknown'} is not available`,
        });
      }
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.setState({ isPolling: true });
    this.pollTimer = setInterval(() => {
      void this.pollCycle();
    }, this.state.pollIntervalMs);
  }

  private stopPolling(): void {
    this.setState({ isPolling: false });
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollCycle(): Promise<void> {
    try {
      const snapshot = await this.manager.scan();
      this.updateFromSnapshot(snapshot);
    } catch {
      // polling errors are non-fatal
    }
  }

  private updateFromSnapshot(snapshot: HardwareSnapshot): void {
    const health = this.manager.getHealth();
    const capabilities = this.manager.getCapabilities();
    const dashboard = this.manager.getDashboard();
    const overview = this.buildOverview(snapshot, health);
    const alerts = this.detectAlerts(snapshot, health);
    const graphPoint = this.extractGraphPoint(snapshot);

    this.setState((prev) => ({
      ...prev,
      snapshot,
      health,
      capabilities,
      dashboard,
      overview,
      alerts,
      lastScanDurationMs: snapshot.scanDurationMs,
      graphHistory: [...prev.graphHistory, graphPoint].slice(-MAX_GRAPH_POINTS),
    }));
  }

  private buildOverview(snapshot: HardwareSnapshot, health: HardwareHealthStatus): HardwareOverview {
    const components = snapshot.components;
    const cpu = components.find((c) => c.category === 'cpu') as CPUComponent | undefined;
    const gpu = components.find((c) => c.category === 'gpu') as GPUComponent | undefined;
    const cooling = components.find((c) => c.category === 'cooling') as CoolingComponent | undefined;
    const os = components.find((c) => c.category === 'operating_system') as OSComponent | undefined;
    const power = components.find((c) => c.category === 'power_supply');

    const temps: number[] = [];
    if (cpu?.sensors.temperatureC?.supported && cpu.sensors.temperatureC.value !== undefined) {
      temps.push(cpu.sensors.temperatureC.value);
    }
    if (gpu?.sensors.temperatureC?.supported && gpu.sensors.temperatureC.value !== undefined) {
      temps.push(gpu.sensors.temperatureC.value);
    }
    const overallTemp = temps.length > 0 ? Math.max(...temps) : null;
    const tempLevel = overallTemp === null ? 'unknown' : overallTemp >= 85 ? 'critical' : overallTemp >= 70 ? 'poor' : 'good';

    const coolingStatus = cooling
      ? cooling.sensorStatus.availability === 'available'
        ? 'ok'
        : 'warning'
      : 'unknown';

    const powerStatus = power ? 'ok' : 'unknown';

    const providerStatuses = Object.entries(snapshot.providerHealth).map(([id, h]) => ({
      id,
      state: h.state,
      source: snapshot.metadata.source,
    }));

    let totalSensors = 0;
    let availableSensors = 0;
    let unsupportedSensors = 0;
    for (const c of components) {
      if (c.sensorStatus.availability === 'available') availableSensors++;
      else if (c.sensorStatus.availability === 'unsupported') unsupportedSensors++;
      totalSensors++;
    }

    return {
      healthScore: health.score,
      healthLevel: health.overall,
      overallTempC: overallTemp,
      overallTempLevel: tempLevel,
      powerStatus: powerStatus as 'ok' | 'warning' | 'critical' | 'unknown',
      coolingStatus: coolingStatus as 'ok' | 'warning' | 'critical' | 'unknown',
      systemUptimeSeconds: os?.info.uptimeSeconds?.supported ? os.info.uptimeSeconds.value : null,
      lastScanAt: snapshot.timestamp,
      providerStatuses,
      sensorAvailability: { total: totalSensors, available: availableSensors, unsupported: unsupportedSensors },
    };
  }

  private detectAlerts(snapshot: HardwareSnapshot, health: HardwareHealthStatus): HardwareAlert[] {
    const alerts: HardwareAlert[] = [];
    const now = Date.now();

    for (const [category, info] of Object.entries(health.components)) {
      if (info.level === 'critical') {
        for (const issue of info.issues) {
          alerts.push({
            id: `alert-${now}-${category}-${alerts.length}`,
            severity: 'critical',
            category: category as HardwareCategory,
            title: `${category.toUpperCase()} Critical`,
            message: issue,
            timestamp: now,
            acknowledged: false,
          });
        }
      } else if (info.level === 'poor') {
        for (const issue of info.issues) {
          alerts.push({
            id: `alert-${now}-${category}-${alerts.length}`,
            severity: 'warning',
            category: category as HardwareCategory,
            title: `${category.toUpperCase()} Warning`,
            message: issue,
            timestamp: now,
            acknowledged: false,
          });
        }
      }
    }

    // Check for missing sensors
    for (const c of snapshot.components) {
      if (c.sensorStatus.availability === 'unsupported') {
        alerts.push({
          id: `alert-${now}-sensor-${c.category}`,
          severity: 'info',
          category: c.category,
          title: 'Missing Sensors',
          message: `${c.category} sensors are not fully supported`,
          timestamp: now,
          acknowledged: false,
        });
      }
    }

    return alerts;
  }

  private extractGraphPoint(snapshot: HardwareSnapshot) {
    const cpu = snapshot.components.find((c) => c.category === 'cpu') as CPUComponent | undefined;
    const gpu = snapshot.components.find((c) => c.category === 'gpu') as GPUComponent | undefined;
    const ram = snapshot.components.find((c) => c.category === 'ram') as RAMComponent | undefined;
    const net = snapshot.components.find((c) => c.category === 'network') as NetworkComponent | undefined;

    return {
      t: snapshot.timestamp,
      cpuUtil: cpu?.info.packageUtilization?.supported ? cpu.info.packageUtilization.value : 0,
      cpuTemp: cpu?.sensors.temperatureC?.supported ? cpu.sensors.temperatureC.value ?? 0 : 0,
      gpuUtil: gpu?.sensors.gpuUtilization?.supported ? gpu.sensors.gpuUtilization.value : 0,
      gpuTemp: gpu?.sensors.temperatureC?.supported ? gpu.sensors.temperatureC.value ?? 0 : 0,
      ramUsage: ram?.info.usedMB?.supported && ram.info.installedMB > 0 ? (ram.info.usedMB.value / ram.info.installedMB) * 100 : 0,
      netDownload: net?.sensors.downloadMbps?.supported ? net.sensors.downloadMbps.value : 0,
      netUpload: net?.sensors.uploadMbps?.supported ? net.sensors.uploadMbps.value : 0,
    };
  }

  private addAlert(alert: Omit<HardwareAlert, 'id' | 'timestamp' | 'acknowledged'>): void {
    const fullAlert: HardwareAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      acknowledged: false,
    };
    this.setState((prev) => ({ ...prev, alerts: [fullAlert, ...prev.alerts].slice(0, 50) }));
  }

  // ── Public Actions ──────────────────────────────────────────────────

  pauseMonitoring(): void {
    this.stopPolling();
  }

  resumeMonitoring(): void {
    this.startPolling();
  }

  snapshotNow(): Promise<void> {
    return this.pollCycle();
  }

  setPollInterval(ms: number): void {
    this.setState({ pollIntervalMs: ms });
    if (this.state.isPolling) {
      this.stopPolling();
      this.startPolling();
    }
  }

  setSearchQuery(query: string): void {
    this.setState({ searchQuery: query });
    if (!query.trim()) {
      this.setState({ searchResults: null });
      return;
    }
    const lower = query.toLowerCase();
    const results = (this.state.snapshot?.components ?? []).filter((c) => {
      const info = (c as { info?: { model?: string; vendor?: string; adapter?: string; name?: string } }).info;
      return (
        c.category.includes(lower) ||
        (info?.model?.toLowerCase().includes(lower) ?? false) ||
        (info?.vendor?.toLowerCase().includes(lower) ?? false) ||
        (info?.adapter?.toLowerCase().includes(lower) ?? false) ||
        (info?.name?.toLowerCase().includes(lower) ?? false)
      );
    });
    this.setState({ searchResults: results });
  }

  acknowledgeAlert(id: string): void {
    this.setState((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a) => a.id === id ? { ...a, acknowledged: true } : a),
    }));
  }

  clearAlerts(): void {
    this.setState({ alerts: [] });
  }

  exportSnapshot(format: ExportFormat): string {
    const snapshot = this.state.snapshot;
    if (!snapshot) return '';

    if (format === 'json') {
      return JSON.stringify(snapshot, null, 2);
    }

    if (format === 'csv') {
      const rows = ['Category,Model,Value,Unit,Source,Supported'];
      for (const c of snapshot.components) {
        const info = (c as { info?: { model?: string } }).info;
        const model = info?.model ?? c.category;
        const sensors = (c as { sensors?: Record<string, SensorReading<unknown>> }).sensors;
        if (sensors) {
          for (const [, reading] of Object.entries(sensors)) {
            if (reading && typeof reading === 'object' && 'value' in reading) {
              rows.push(`${c.category},${model},${reading.value},${reading.unit},${reading.source},${reading.supported}`);
            }
          }
        }
      }
      return rows.join('\n');
    }

    // PDF — return a text report (actual PDF generation would require a library)
    const lines: string[] = [];
    lines.push('AVS Shield — Hardware Snapshot Report');
    lines.push(`Generated: ${new Date(snapshot.timestamp).toLocaleString()}`);
    lines.push(`Scan Duration: ${snapshot.scanDurationMs}ms`);
    lines.push('');
    lines.push(`Health Score: ${this.state.health?.score ?? 'N/A'}`);
    lines.push(`Overall Health: ${this.state.health?.overall ?? 'N/A'}`);
    lines.push('');
    for (const c of snapshot.components) {
      const info = (c as { info?: { model?: string; vendor?: string } }).info;
      lines.push(`[${c.category.toUpperCase()}] ${info?.vendor ?? ''} ${info?.model ?? ''}`);
    }
    return lines.join('\n');
  }

  override dispose(): void {
    this.stopPolling();
    this.eventUnsub?.();
    this.manager.dispose();
    super.dispose();
  }
}
