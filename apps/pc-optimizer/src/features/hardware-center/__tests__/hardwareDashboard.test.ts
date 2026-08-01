// @vitest-environment happy-dom
/**
 * Hardware Dashboard ViewModel Tests
 *
 * Tests for:
 * - Bootstrap and initial scan
 * - Overview metrics computation
 * - Alert detection and management
 * - Graph history accumulation
 * - Pause/resume monitoring
 * - Search filtering
 * - Export (JSON, CSV, PDF)
 * - Sensor availability tracking
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HardwareDashboardViewModel } from '../ui/HardwareDashboardViewModel';
import { HardwareManager } from '../HardwareManager';
import { hardwareRegistry } from '../HardwareRegistry';
import { hardwareEventBus } from '../HardwareEvents';
import { mkSensor } from '../types';
import type {
  HardwareComponent,
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  NetworkComponent,
  BatteryComponent,
  CoolingComponent,
  OSComponent,
  MotherboardComponent,
  ProviderHealthStatus,
} from '../types';

// ── Mock Factories ───────────────────────────────────────────────────

function makeCPU(overrides?: Partial<CPUComponent>): CPUComponent {
  return {
    category: 'cpu',
    info: {
      vendor: 'Intel',
      model: 'Core i7-12700K',
      architecture: 'x86_64',
      logicalCores: 20,
      physicalCores: 12,
      threads: 20,
      baseFrequencyMHz: 3600,
      boostFrequencyMHz: 5000,
      currentFrequencyMHz: mkSensor(4200, 'MHz'),
      perCoreUtilization: [45, 52, 38, 61, 44, 50, 33, 55, 41, 48, 39, 60].map((v) => mkSensor(v, '%')),
      packageUtilization: mkSensor(47, '%'),
    },
    sensors: {
      temperatureC: mkSensor(55, '°C'),
      powerDrawW: mkSensor(65, 'W'),
      voltageV: mkSensor(1.2, 'V'),
      thermalThrottling: mkSensor(false, 'bool'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeGPU(overrides?: Partial<GPUComponent>): GPUComponent {
  return {
    category: 'gpu',
    info: {
      vendor: 'NVIDIA',
      model: 'GeForce RTX 3070',
      driver: '536.40',
      vramMB: 8192,
      dedicatedMemoryMB: mkSensor(8192, 'MB'),
      sharedMemoryMB: mkSensor(0, 'MB'),
    },
    sensors: {
      gpuUtilization: mkSensor(35, '%'),
      memoryUtilization: mkSensor(28, '%'),
      temperatureC: mkSensor(58, '°C'),
      fanSpeedRPM: mkSensor(1800, 'RPM'),
      coreClockMHz: mkSensor(1500, 'MHz'),
      memoryClockMHz: mkSensor(6750, 'MHz'),
      powerDrawW: mkSensor(120, 'W'),
      encoderUsage: mkSensor(0, '%'),
      decoderUsage: mkSensor(0, '%'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeRAM(overrides?: Partial<RAMComponent>): RAMComponent {
  return {
    category: 'ram',
    info: {
      installedMB: 32768,
      availableMB: mkSensor(16384, 'MB'),
      usedMB: mkSensor(16384, 'MB'),
      cachedMB: mkSensor(2048, 'MB'),
      memoryPressure: mkSensor(50, '%'),
      speedMTs: 3200,
      channels: 2,
      slotsUsed: 2,
      slotsTotal: 4,
      ecc: false,
      modules: [],
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeStorage(overrides?: Partial<StorageComponent>): StorageComponent {
  return {
    category: 'storage',
    info: {
      type: 'ssd',
      model: 'Samsung 980 PRO',
      capacityBytes: 1024000000000,
      usedBytes: mkSensor(400000000000, 'B'),
      freeBytes: mkSensor(624000000000, 'B'),
      filesystem: 'NTFS',
      interface: 'NVMe',
      smartSupported: true,
    },
    sensors: {
      temperatureC: mkSensor(42, '°C'),
      healthPercent: mkSensor(95, '%'),
      lifetimeRemainingPercent: mkSensor(92, '%'),
      readSpeedMBps: mkSensor(6800, 'MB/s'),
      writeSpeedMBps: mkSensor(5100, 'MB/s'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeNetwork(overrides?: Partial<NetworkComponent>): NetworkComponent {
  return {
    category: 'network',
    info: {
      adapter: 'Intel Wi-Fi 6 AX201',
      mac: 'AA:BB:CC:DD:EE:FF',
      ipv4: ['192.168.1.100'],
      type: 'wifi',
      signalStrengthPercent: mkSensor(75, '%'),
    },
    sensors: {
      usagePercent: mkSensor(12, '%'),
      downloadMbps: mkSensor(45, 'Mbps'),
      uploadMbps: mkSensor(10, 'Mbps'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeBattery(overrides?: Partial<BatteryComponent>): BatteryComponent {
  return {
    category: 'battery',
    info: {
      designCapacityWH: 60,
      fullChargeCapacityWH: 55,
      chargeCycles: 120,
      currentChargePercent: mkSensor(85, '%'),
      wearLevelPercent: mkSensor(8, '%'),
      chargingStatus: mkSensor('discharging' as const, 'status'),
      estimatedRuntimeMinutes: mkSensor(240, 'min'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeCooling(overrides?: Partial<CoolingComponent>): CoolingComponent {
  return {
    category: 'cooling',
    info: {
      fans: [
        { name: 'CPU Fan', type: 'cpu_fan', rpm: mkSensor(1800, 'RPM') },
        { name: 'Case Fan', type: 'case_fan', rpm: mkSensor(1200, 'RPM') },
      ],
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeOS(overrides?: Partial<OSComponent>): OSComponent {
  return {
    category: 'operating_system',
    info: {
      name: 'Windows 11',
      version: '23H2',
      architecture: 'x86_64',
      uptimeSeconds: mkSensor(3600, 's'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeMotherboard(overrides?: Partial<MotherboardComponent>): MotherboardComponent {
  return {
    category: 'motherboard',
    info: {
      manufacturer: 'ASUS',
      model: 'PRIME Z690-A',
      version: 'Rev 1.02',
      biosVendor: 'AMI',
      biosVersion: '1801',
      biosDate: '2024-01-10',
      chipset: 'Intel Z690',
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeAllComponents(): HardwareComponent[] {
  return [makeCPU(), makeGPU(), makeRAM(), makeStorage(), makeNetwork(), makeBattery(), makeCooling(), makeOS(), makeMotherboard()];
}

// ── Mock Provider ────────────────────────────────────────────────────

function makeMockProvider(components: HardwareComponent[]) {
  return {
    id: 'mock-wmi',
    source: 'wmi' as const,
    categories: ['cpu', 'gpu', 'ram', 'storage', 'network', 'battery', 'cooling', 'operating_system', 'motherboard'] as const,
    async initialize() {},
    dispose() {},
    async scan() { return components; },
    async poll() { return components.map((c) => ({ ...c })); },
    isAvailable() { return true; },
    getHealth(): ProviderHealthStatus { return { state: 'healthy', consecutiveFailures: 0, consecutiveSuccesses: 1 }; },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('HardwareDashboardViewModel', () => {
  let vm: HardwareDashboardViewModel;

  beforeEach(() => {
    hardwareRegistry.clear();
    hardwareEventBus.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vm?.dispose();
    hardwareRegistry.clear();
    hardwareEventBus.clear();
    vi.useRealTimers();
  });

  describe('bootstrap', () => {
    it('initializes and populates state from scan', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);

      await vm.bootstrap();

      expect(vm.state.bootstrap).toBe('ready');
      expect(vm.state.snapshot).not.toBeNull();
      expect(vm.state.snapshot!.components.length).toBe(9);
      expect(vm.state.health).not.toBeNull();
      expect(vm.state.overview).not.toBeNull();
    });

    it('handles scan with no providers gracefully', async () => {
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      // No providers registered — scan returns empty snapshot
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      expect(vm.state.bootstrap).toBe('ready');
      expect(vm.state.snapshot).not.toBeNull();
      expect(vm.state.snapshot!.components.length).toBe(0);
    });
  });

  describe('overview metrics', () => {
    it('computes health score and level', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const overview = vm.state.overview!;
      expect(overview.healthScore).toBeGreaterThanOrEqual(0);
      expect(overview.healthScore).toBeLessThanOrEqual(100);
      expect(overview.healthLevel).toBeDefined();
    });

    it('computes overall temperature from CPU and GPU', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const overview = vm.state.overview!;
      // CPU temp is 55, GPU temp is 58 → max is 58
      expect(overview.overallTempC).toBe(58);
      expect(overview.overallTempLevel).toBe('good');
    });

    it('returns null temperature when no temp sensors available', async () => {
      const components = [
        makeCPU({ sensors: { temperatureC: undefined, thermalThrottling: mkSensor(false, 'bool') } }),
        makeGPU({ sensors: { ...makeGPU().sensors, temperatureC: undefined } }),
        makeRAM(), makeStorage(), makeNetwork(), makeBattery(), makeCooling(), makeOS(), makeMotherboard(),
      ];
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      expect(vm.state.overview!.overallTempC).toBeNull();
    });

    it('tracks sensor availability counts', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const avail = vm.state.overview!.sensorAvailability;
      expect(avail.total).toBe(9);
      expect(avail.available).toBe(9);
      expect(avail.unsupported).toBe(0);
    });

    it('tracks system uptime from OS component', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      expect(vm.state.overview!.systemUptimeSeconds).toBe(3600);
    });
  });

  describe('alert detection', () => {
    it('detects critical CPU temperature alert', async () => {
      const components = makeAllComponents();
      components[0] = makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } });
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const criticalAlerts = vm.state.alerts.filter((a) => a.severity === 'critical');
      expect(criticalAlerts.length).toBeGreaterThan(0);
      expect(criticalAlerts.some((a) => a.title.includes('CPU'))).toBe(true);
    });

    it('detects warning alerts for poor health', async () => {
      const components = makeAllComponents();
      components[0] = makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(80, '°C') } });
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const warningAlerts = vm.state.alerts.filter((a) => a.severity === 'warning');
      expect(warningAlerts.length).toBeGreaterThan(0);
    });

    it('acknowledgeAlert marks alert as acknowledged', async () => {
      const components = makeAllComponents();
      components[0] = makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } });
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const firstAlert = vm.state.alerts[0]!;
      expect(firstAlert.acknowledged).toBe(false);

      vm.acknowledgeAlert(firstAlert.id);
      expect(vm.state.alerts[0]!.acknowledged).toBe(true);
    });

    it('clearAlerts removes all alerts', async () => {
      const components = makeAllComponents();
      components[0] = makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } });
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      expect(vm.state.alerts.length).toBeGreaterThan(0);
      vm.clearAlerts();
      expect(vm.state.alerts.length).toBe(0);
    });

    it('detects unsupported sensor info alerts', async () => {
      const components = makeAllComponents();
      components[0] = makeCPU({
        sensors: { thermalThrottling: mkSensor(false, 'bool') },
        sensorStatus: { availability: 'unsupported' },
      });
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const infoAlerts = vm.state.alerts.filter((a) => a.severity === 'info');
      expect(infoAlerts.some((a) => a.title === 'Missing Sensors')).toBe(true);
    });
  });

  describe('graph history', () => {
    it('accumulates graph data points on scan', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      expect(vm.state.graphHistory.length).toBe(1);
      const point = vm.state.graphHistory[0]!;
      expect(point.cpuUtil).toBe(47);
      expect(point.cpuTemp).toBe(55);
      expect(point.gpuUtil).toBe(35);
      expect(point.gpuTemp).toBe(58);
      expect(point.ramUsage).toBeCloseTo(50, 0);
      expect(point.netDownload).toBe(45);
      expect(point.netUpload).toBe(10);
    });

    it('limits graph history to 60 points', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      // Manually trigger many scans
      for (let i = 0; i < 70; i++) {
        await vm.snapshotNow();
      }

      expect(vm.state.graphHistory.length).toBeLessThanOrEqual(60);
    });
  });

  describe('monitoring controls', () => {
    it('pauseMonitoring stops polling', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      expect(vm.state.isPolling).toBe(true);
      vm.pauseMonitoring();
      expect(vm.state.isPolling).toBe(false);
    });

    it('resumeMonitoring restarts polling', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      vm.pauseMonitoring();
      expect(vm.state.isPolling).toBe(false);
      vm.resumeMonitoring();
      expect(vm.state.isPolling).toBe(true);
    });

    it('setPollInterval updates interval', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      vm.setPollInterval(5000);
      expect(vm.state.pollIntervalMs).toBe(5000);
    });

    it('snapshotNow triggers a scan', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const initialCount = vm.state.graphHistory.length;
      await vm.snapshotNow();
      expect(vm.state.graphHistory.length).toBe(initialCount + 1);
    });
  });

  describe('search', () => {
    it('filters components by category', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      vm.setSearchQuery('cpu');
      expect(vm.state.searchResults).not.toBeNull();
      expect(vm.state.searchResults!.length).toBe(1);
      expect(vm.state.searchResults![0]!.category).toBe('cpu');
    });

    it('filters components by model name', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      vm.setSearchQuery('samsung');
      expect(vm.state.searchResults!.length).toBe(1);
      expect(vm.state.searchResults![0]!.category).toBe('storage');
    });

    it('filters components by vendor', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      vm.setSearchQuery('nvidia');
      expect(vm.state.searchResults!.length).toBe(1);
      expect(vm.state.searchResults![0]!.category).toBe('gpu');
    });

    it('clears search results on empty query', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      vm.setSearchQuery('cpu');
      expect(vm.state.searchResults).not.toBeNull();
      vm.setSearchQuery('');
      expect(vm.state.searchResults).toBeNull();
    });

    it('returns empty results for non-matching query', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      vm.setSearchQuery('xyznonexistent');
      expect(vm.state.searchResults!.length).toBe(0);
    });
  });

  describe('export', () => {
    it('exports as JSON', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const json = vm.exportSnapshot('json');
      const parsed = JSON.parse(json);
      expect(parsed.id).toBeDefined();
      expect(parsed.components).toBeDefined();
      expect(parsed.components.length).toBe(9);
    });

    it('exports as CSV', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const csv = vm.exportSnapshot('csv');
      const lines = csv.split('\n');
      expect(lines[0]).toBe('Category,Model,Value,Unit,Source,Supported');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('exports as PDF (text report)', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      const report = vm.exportSnapshot('pdf');
      expect(report).toContain('Hardware Snapshot Report');
      expect(report).toContain('Health Score');
    });

    it('returns empty string when no snapshot', () => {
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      vm = new HardwareDashboardViewModel(manager);
      expect(vm.exportSnapshot('json')).toBe('');
    });
  });

  describe('dispose', () => {
    it('stops polling on dispose', async () => {
      const components = makeAllComponents();
      const manager = new HardwareManager({ pollIntervalMs: 1000, enablePolling: false });
      manager.registerProvider(makeMockProvider(components));
      vm = new HardwareDashboardViewModel(manager);
      await vm.bootstrap();

      expect(vm.state.isPolling).toBe(true);
      vm.dispose();
      // After dispose, state should not be updating
      expect(vm.state.isPolling).toBe(false);
    });
  });
});

// ── SensorReading Type Tests ─────────────────────────────────────────

describe('SensorReading type', () => {
  it('mkSensor creates a reading with defaults', () => {
    const reading = mkSensor(42, '°C');
    expect(reading.value).toBe(42);
    expect(reading.unit).toBe('°C');
    expect(reading.source).toBe('mock');
    expect(reading.confidence).toBe(1.0);
    expect(reading.supported).toBe(true);
    expect(reading.estimated).toBe(false);
    expect(reading.stale).toBe(false);
    expect(reading.timestamp).toBeGreaterThan(0);
  });

  it('mkSensor accepts custom source and confidence', () => {
    const reading = mkSensor(55, 'W', 'wmi', 0.8);
    expect(reading.source).toBe('wmi');
    expect(reading.confidence).toBe(0.8);
  });
});
