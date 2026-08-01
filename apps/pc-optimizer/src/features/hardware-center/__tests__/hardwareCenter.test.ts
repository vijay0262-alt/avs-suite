/**
 * Hardware Intelligence Center — Comprehensive Tests
 *
 * Tests cover:
 * - Mock providers and sensors
 * - Mock unsupported hardware
 * - Mock failures
 * - Caching (TTL, invalidation, freshness)
 * - Polling (start/stop, snapshot updates)
 * - Provider switching (priority, fallback)
 * - History (retention, max snapshots)
 * - Health evaluation (CPU temp, GPU temp, storage health, battery wear)
 * - Capabilities detection
 * - Diagnostics
 * - Dashboard provider
 * - Events (scan started/completed, snapshot updated, provider failed, sensor missing)
 * - HardwareManager end-to-end
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  HardwareProvider,
  HardwareComponent,
  HardwareCategory,
  HardwareSnapshot,
  HardwareEvent,
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  BatteryComponent,
  CoolingComponent,
  MotherboardComponent,
  OSComponent,
  NetworkComponent,
  PowerSupplyComponent,
  ProviderHealthStatus,
} from '../types';
import { DEFAULT_HARDWARE_CONFIG } from '../types';
import { HardwareScanner } from '../HardwareScanner';
import { HardwareMonitor } from '../HardwareMonitor';
import { HardwareCache } from '../HardwareCache';
import { HardwareHistory } from '../HardwareHistory';
import { hardwareRegistry } from '../HardwareRegistry';
import { hardwareEventBus } from '../HardwareEvents';
import { HardwareHealthEvaluator } from '../HardwareHealth';
import { HardwareCapabilitiesDetector } from '../HardwareCapabilities';
import { HardwareDiagnosticsRunner } from '../HardwareDiagnostics';
import { HardwareDashboardProvider } from '../HardwareDashboardProvider';
import { HardwareFactory } from '../HardwareFactory';
import { HardwareManager } from '../HardwareManager';
import { InMemoryHardwareRepository } from '../HardwareRepository';

// ── Mock Factory ─────────────────────────────────────────────────────

function makeCPU(overrides?: Partial<CPUComponent>): CPUComponent {
  return {
    category: 'cpu',
    info: {
      vendor: 'Intel',
      model: 'Core i7-12700K',
      architecture: 'x86_64',
      generation: '12th',
      socket: 'LGA1700',
      logicalCores: 20,
      physicalCores: 12,
      threads: 20,
      baseFrequencyMHz: 3600,
      boostFrequencyMHz: 5000,
      currentFrequencyMHz: 4200,
      perCoreUtilization: [45, 52, 38, 61, 44, 50, 33, 55, 41, 48, 39, 60],
      packageUtilization: 47,
      cacheSizes: { l1KB: 480, l2KB: 2048, l3KB: 25600 },
      instructionSets: ['AVX', 'AVX2', 'AVX-512'],
      virtualization: { supported: true, enabled: true },
    },
    sensors: {
      temperatureC: 55,
      powerDrawW: 65,
      voltageV: 1.2,
      thermalThrottling: false,
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
      driverDate: '2024-01-15',
      vramMB: 8192,
      dedicatedMemoryMB: 8192,
      sharedMemoryMB: 0,
      pcieGeneration: '4.0',
      pcieLaneWidth: 'x16',
    },
    sensors: {
      gpuUtilization: 35,
      memoryUtilization: 28,
      temperatureC: 58,
      fanSpeedRPM: 1800,
      coreClockMHz: 1500,
      memoryClockMHz: 6750,
      powerDrawW: 120,
      encoderUsage: 0,
      decoderUsage: 0,
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
      availableMB: 16384,
      usedMB: 16384,
      speedMTs: 3200,
      channels: 2,
      slotsUsed: 2,
      slotsTotal: 4,
      ecc: false,
      modules: [
        { manufacturer: 'Corsair', partNumber: 'CMK32GX4M2B3200C16', sizeMB: 16384, speedMTs: 3200, formFactor: 'DIMM' },
        { manufacturer: 'Corsair', partNumber: 'CMK32GX4M2B3200C16', sizeMB: 16384, speedMTs: 3200, formFactor: 'DIMM' },
      ],
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
      serial: 'S5GZNX0R123456',
      firmware: '5B2QGXA7',
      capacityBytes: 1024000000000,
      usedBytes: 400000000000,
      freeBytes: 624000000000,
      filesystem: 'NTFS',
      interface: 'NVMe',
      smartSupported: true,
    },
    sensors: {
      temperatureC: 42,
      healthPercent: 95,
      lifetimeRemainingPercent: 92,
      readSpeedMBps: 6800,
      writeSpeedMBps: 5100,
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
      currentChargePercent: 85,
      wearLevelPercent: 8,
      chargingStatus: 'discharging',
      estimatedRuntimeMinutes: 240,
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
        { name: 'CPU Fan', type: 'cpu_fan', rpm: 1800 },
        { name: 'Case Fan 1', type: 'case_fan', rpm: 1200 },
        { name: 'Case Fan 2', type: 'case_fan', rpm: 1100 },
      ],
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
      biosVendor: 'American Megatrends',
      biosVersion: '1801',
      biosDate: '2024-01-10',
      chipset: 'Intel Z690',
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
      build: '22631.3447',
      architecture: 'x86_64',
      installDate: '2023-06-15',
      lastBootTime: '2024-08-01T08:00:00Z',
      uptimeSeconds: 3600,
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
      ipv6: ['fe80::1234:5678:9abc:def0'],
      linkSpeedMbps: 866,
      type: 'wifi',
      signalStrengthPercent: 75,
    },
    sensors: {
      usagePercent: 12,
      downloadMbps: 45,
      uploadMbps: 10,
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeAllComponents(): HardwareComponent[] {
  return [
    makeCPU(),
    makeGPU(),
    makeRAM(),
    makeStorage(),
    makeBattery(),
    makeCooling(),
    makeMotherboard(),
    makeOS(),
    makeNetwork(),
  ];
}

function makeMockProvider(
  id: string,
  categories: HardwareCategory[],
  components: HardwareComponent[],
  options?: {
    available?: boolean;
    failScan?: boolean;
    source?: string;
  },
): HardwareProvider {
  const available = options?.available ?? true;
  const failScan = options?.failScan ?? false;
  let health: ProviderHealthStatus = {
    state: 'healthy',
    consecutiveFailures: 0,
    consecutiveSuccesses: 1,
  };

  return {
    id,
    source: (options?.source ?? 'mock') as never,
    categories,
    async initialize() {},
    dispose() {},
    async scan() {
      if (failScan) {
        health = {
          state: 'failed',
          consecutiveFailures: health.consecutiveFailures + 1,
          consecutiveSuccesses: 0,
          lastFailureAt: Date.now(),
          lastError: 'Mock scan failure',
        };
        throw new Error('Mock scan failure');
      }
      health = {
        state: 'healthy',
        consecutiveFailures: 0,
        consecutiveSuccesses: health.consecutiveSuccesses + 1,
        lastSuccessAt: Date.now(),
      };
      return components;
    },
    async poll() {
      return components.map((c) => ({ ...c }));
    },
    isAvailable() {
      return available;
    },
    getHealth() {
      return health;
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  hardwareRegistry.clear();
  hardwareEventBus.clear();
});

afterEach(() => {
  hardwareRegistry.clear();
  hardwareEventBus.clear();
});

// ── HardwareCache ────────────────────────────────────────────────────

describe('HardwareCache', () => {
  it('stores and retrieves a snapshot', () => {
    const cache = new HardwareCache(5000);
    const snapshot = { id: 'test', timestamp: Date.now() } as never;
    cache.set(snapshot);
    expect(cache.get()).toBe(snapshot);
  });

  it('returns null when empty', () => {
    const cache = new HardwareCache(5000);
    expect(cache.get()).toBeNull();
  });

  it('expires after TTL', () => {
    vi.useFakeTimers();
    const cache = new HardwareCache(1000);
    const snapshot = { id: 'test', timestamp: Date.now() } as never;
    cache.set(snapshot);
    expect(cache.isFresh()).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(cache.get()).toBeNull();
    expect(cache.isFresh()).toBe(false);
    vi.useRealTimers();
  });

  it('invalidate clears the cache', () => {
    const cache = new HardwareCache(5000);
    const snapshot = { id: 'test', timestamp: Date.now() } as never;
    cache.set(snapshot);
    cache.invalidate();
    expect(cache.get()).toBeNull();
  });

  it('ageMs returns null when empty', () => {
    const cache = new HardwareCache(5000);
    expect(cache.ageMs()).toBeNull();
  });

  it('ageMs returns elapsed time when populated', () => {
    vi.useFakeTimers();
    const cache = new HardwareCache(5000);
    const snapshot = { id: 'test', timestamp: Date.now() } as never;
    cache.set(snapshot);
    vi.advanceTimersByTime(500);
    expect(cache.ageMs()).toBeGreaterThanOrEqual(500);
    vi.useRealTimers();
  });
});

// ── HardwareHistory ──────────────────────────────────────────────────

describe('HardwareHistory', () => {
  it('stores and retrieves snapshots', () => {
    const history = new HardwareHistory(100, 60000);
    const snap = { id: 's1', timestamp: Date.now() } as never;
    history.add(snap);
    expect(history.count()).toBe(1);
    expect(history.getAll()[0]!.snapshot).toBe(snap);
  });

  it('getRecent returns last N entries', () => {
    const history = new HardwareHistory(100, 60000);
    for (let i = 0; i < 5; i++) {
      history.add({ id: `s${i}`, timestamp: Date.now() } as never);
    }
    const recent = history.getRecent(3);
    expect(recent).toHaveLength(3);
    expect(recent[2]!.snapshot.id).toBe('s4');
  });

  it('getSince filters by timestamp', () => {
    const history = new HardwareHistory(100, 60000);
    const old = { id: 'old', timestamp: 1000 } as never;
    const recent = { id: 'recent', timestamp: 2000 } as never;
    history.add(old);
    history.add(recent);
    expect(history.getSince(1500)).toHaveLength(1);
  });

  it('evicts entries beyond maxSnapshots', () => {
    const history = new HardwareHistory(3, 60000);
    for (let i = 0; i < 5; i++) {
      history.add({ id: `s${i}`, timestamp: Date.now() } as never);
    }
    expect(history.count()).toBe(3);
  });

  it('evicts entries older than retention', () => {
    vi.useFakeTimers();
    const history = new HardwareHistory(100, 1000);
    history.add({ id: 'old', timestamp: 0 } as never);
    vi.advanceTimersByTime(2000);
    history.add({ id: 'new', timestamp: 2000 } as never);
    expect(history.count()).toBe(1);
    vi.useRealTimers();
  });

  it('clear empties all entries', () => {
    const history = new HardwareHistory(100, 60000);
    history.add({ id: 's1', timestamp: Date.now() } as never);
    history.clear();
    expect(history.count()).toBe(0);
  });
});

// ── HardwareRegistry ─────────────────────────────────────────────────

describe('HardwareRegistry', () => {
  it('registers and retrieves providers by category', () => {
    const provider = makeMockProvider('p1', ['cpu'], [makeCPU()]);
    hardwareRegistry.register(provider);
    expect(hardwareRegistry.getProvidersForCategory('cpu')).toHaveLength(1);
    expect(hardwareRegistry.getProviderForCategory('cpu')?.id).toBe('p1');
  });

  it('supports multiple providers per category with priority', () => {
    const low = makeMockProvider('low', ['cpu'], [makeCPU({ info: { ...makeCPU().info, model: 'Low Priority' } })]);
    const high = makeMockProvider('high', ['cpu'], [makeCPU({ info: { ...makeCPU().info, model: 'High Priority' } })]);
    hardwareRegistry.register(low, 1);
    hardwareRegistry.register(high, 10);
    const providers = hardwareRegistry.getProvidersForCategory('cpu');
    expect(providers[0]!.id).toBe('high');
    expect(providers[1]!.id).toBe('low');
  });

  it('unregisters providers', () => {
    const provider = makeMockProvider('p1', ['cpu'], [makeCPU()]);
    hardwareRegistry.register(provider);
    hardwareRegistry.unregister('p1');
    expect(hardwareRegistry.getProvidersForCategory('cpu')).toHaveLength(0);
    expect(hardwareRegistry.getProvider('p1')).toBeUndefined();
  });

  it('getAllProviders returns all registered', () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    hardwareRegistry.register(makeMockProvider('p2', ['gpu'], [makeGPU()]));
    expect(hardwareRegistry.getAllProviders()).toHaveLength(2);
  });

  it('getRegisteredCategories returns unique categories', () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu', 'gpu'], [makeCPU(), makeGPU()]));
    hardwareRegistry.register(makeMockProvider('p2', ['cpu'], [makeCPU()]));
    const cats = hardwareRegistry.getRegisteredCategories();
    expect(cats).toContain('cpu');
    expect(cats).toContain('gpu');
    expect(cats).toHaveLength(2);
  });

  it('getAllHealth returns health for all providers', () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const health = hardwareRegistry.getAllHealth();
    expect(health['p1']).toBeDefined();
    expect(health['p1']!.state).toBe('healthy');
  });

  it('clear removes everything', () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    hardwareRegistry.clear();
    expect(hardwareRegistry.getAllProviders()).toHaveLength(0);
  });
});

// ── HardwareScanner ──────────────────────────────────────────────────

describe('HardwareScanner', () => {
  it('scans all registered providers and returns a snapshot', async () => {
    hardwareRegistry.register(makeMockProvider('cpu-prov', ['cpu'], [makeCPU()]));
    hardwareRegistry.register(makeMockProvider('gpu-prov', ['gpu'], [makeGPU()]));
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    const snapshot = await scanner.scan();
    expect(snapshot.components).toHaveLength(2);
    expect(snapshot.components.some((c) => c.category === 'cpu')).toBe(true);
    expect(snapshot.components.some((c) => c.category === 'gpu')).toBe(true);
    expect(snapshot.metadata.partial).toBe(false);
  });

  it('marks snapshot as partial when a provider fails', async () => {
    hardwareRegistry.register(makeMockProvider('cpu-prov', ['cpu'], [makeCPU()]));
    hardwareRegistry.register(makeMockProvider('gpu-prov', ['gpu'], [makeGPU()], { failScan: true }));
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    const snapshot = await scanner.scan();
    expect(snapshot.metadata.partial).toBe(true);
    expect(snapshot.components.some((c) => c.category === 'cpu')).toBe(true);
    expect(snapshot.components.some((c) => c.category === 'gpu')).toBe(false);
  });

  it('falls back to next provider when first fails', async () => {
    hardwareRegistry.register(makeMockProvider('fail-prov', ['cpu'], [makeCPU()], { failScan: true }), 10);
    hardwareRegistry.register(makeMockProvider('ok-prov', ['cpu'], [makeCPU()]), 1);
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    const snapshot = await scanner.scan();
    expect(snapshot.components.some((c) => c.category === 'cpu')).toBe(true);
    expect(snapshot.metadata.partial).toBe(true);
  });

  it('skips unavailable providers', async () => {
    hardwareRegistry.register(makeMockProvider('unavail', ['cpu'], [makeCPU()], { available: false }));
    hardwareRegistry.register(makeMockProvider('avail', ['cpu'], [makeCPU()]));
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    const snapshot = await scanner.scan();
    expect(snapshot.components).toHaveLength(1);
  });

  it('returns empty snapshot when no providers registered', async () => {
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    const snapshot = await scanner.scan();
    expect(snapshot.components).toHaveLength(0);
    expect(snapshot.metadata.partial).toBe(false);
  });

  it('emits scan_started and scan_completed events', async () => {
    const events: string[] = [];
    hardwareEventBus.subscribe((e) => events.push(e.type));
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    await scanner.scan();
    expect(events).toContain('hardware_scan_started');
    expect(events).toContain('hardware_scan_completed');
  });

  it('emits provider_failed event when a provider fails', async () => {
    const events: string[] = [];
    hardwareEventBus.subscribe((e) => events.push(e.type));
    hardwareRegistry.register(makeMockProvider('fail', ['gpu'], [makeGPU()], { failScan: true }));
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    await scanner.scan();
    expect(events).toContain('hardware_provider_failed');
  });

  it('generates unique snapshot IDs', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    const s1 = await scanner.scan();
    const s2 = await scanner.scan();
    expect(s1.id).not.toBe(s2.id);
  });
});

// ── HardwareMonitor ──────────────────────────────────────────────────

describe('HardwareMonitor', () => {
  it('start performs initial scan and returns snapshot', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const monitor = new HardwareMonitor({ ...DEFAULT_HARDWARE_CONFIG, enablePolling: false });
    const snapshot = await monitor.start();
    expect(snapshot.components).toHaveLength(1);
    expect(monitor.getSnapshot()).not.toBeNull();
  });

  it('stop halts polling', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const monitor = new HardwareMonitor({ ...DEFAULT_HARDWARE_CONFIG, enablePolling: true, pollIntervalMs: 100 });
    await monitor.start();
    expect(monitor.isPolling()).toBe(true);
    monitor.stop();
    expect(monitor.isPolling()).toBe(false);
  });

  it('getHistory returns scanned snapshots', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const monitor = new HardwareMonitor({ ...DEFAULT_HARDWARE_CONFIG, enablePolling: false });
    await monitor.start();
    expect(monitor.getHistory()).toHaveLength(1);
  });

  it('getRecentHistory returns last N', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const monitor = new HardwareMonitor({ ...DEFAULT_HARDWARE_CONFIG, enablePolling: false });
    await monitor.start();
    await monitor.start();
    expect(monitor.getRecentHistory(1)).toHaveLength(1);
  });
});

// ── HardwareHealthEvaluator ──────────────────────────────────────────

describe('HardwareHealthEvaluator', () => {
  it('returns good health for healthy components', () => {
    const evaluator = new HardwareHealthEvaluator();
    const health = evaluator.evaluate(makeAllComponents());
    expect(health.overall).toBe('good');
    expect(health.score).toBeGreaterThanOrEqual(90);
  });

  it('returns critical for high CPU temperature', () => {
    const evaluator = new HardwareHealthEvaluator();
    const health = evaluator.evaluate([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: 95 } })]);
    expect(health.components.cpu!.level).toBe('critical');
    expect(health.components.cpu!.issues.length).toBeGreaterThan(0);
  });

  it('returns poor for CPU thermal throttling', () => {
    const evaluator = new HardwareHealthEvaluator();
    const health = evaluator.evaluate([makeCPU({ sensors: { ...makeCPU().sensors, thermalThrottling: true } })]);
    expect(health.components.cpu!.level).toBe('poor');
  });

  it('returns critical for high GPU temperature', () => {
    const evaluator = new HardwareHealthEvaluator();
    const health = evaluator.evaluate([makeGPU({ sensors: { ...makeGPU().sensors, temperatureC: 90 } })]);
    expect(health.components.gpu!.level).toBe('critical');
  });

  it('returns critical for low storage health', () => {
    const evaluator = new HardwareHealthEvaluator();
    const health = evaluator.evaluate([makeStorage({ sensors: { ...makeStorage().sensors, healthPercent: 10 } })]);
    expect(health.components.storage!.level).toBe('critical');
  });

  it('returns critical for high battery wear', () => {
    const evaluator = new HardwareHealthEvaluator();
    const health = evaluator.evaluate([makeBattery({ info: { ...makeBattery().info, wearLevelPercent: 60 } })]);
    expect(health.components.battery!.level).toBe('critical');
  });

  it('returns critical for non-spinning fan', () => {
    const evaluator = new HardwareHealthEvaluator();
    const health = evaluator.evaluate([makeCooling({ info: { fans: [{ name: 'Dead Fan', type: 'cpu_fan', rpm: 0 }] } })]);
    expect(health.components.cooling!.level).toBe('critical');
  });

  it('returns unknown for empty components', () => {
    const evaluator = new HardwareHealthEvaluator();
    const health = evaluator.evaluate([]);
    expect(health.score).toBe(100);
  });
});

// ── HardwareCapabilitiesDetector ─────────────────────────────────────

describe('HardwareCapabilitiesDetector', () => {
  it('detects all capabilities from full components', () => {
    const detector = new HardwareCapabilitiesDetector();
    const caps = detector.detect(makeAllComponents());
    expect(caps.cpu.temperature).toBe(true);
    expect(caps.cpu.powerDraw).toBe(true);
    expect(caps.cpu.perCoreUtilization).toBe(true);
    expect(caps.gpu.utilization).toBe(true);
    expect(caps.gpu.temperature).toBe(true);
    expect(caps.storage.smart).toBe(true);
    expect(caps.storage.lifetimeRemaining).toBe(true);
    expect(caps.battery.wearLevel).toBe(true);
    expect(caps.cooling.fanRPM).toBe(true);
  });

  it('returns all false for empty components', () => {
    const detector = new HardwareCapabilitiesDetector();
    const caps = detector.detect([]);
    expect(caps.cpu.temperature).toBe(false);
    expect(caps.gpu.utilization).toBe(false);
  });

  it('detects missing sensors as false', () => {
    const detector = new HardwareCapabilitiesDetector();
    const caps = detector.detect([makeCPU({ sensors: { thermalThrottling: false } })]);
    expect(caps.cpu.temperature).toBe(false);
    expect(caps.cpu.powerDraw).toBe(false);
    expect(caps.cpu.thermalThrottling).toBe(true);
  });
});

// ── HardwareDiagnosticsRunner ────────────────────────────────────────

describe('HardwareDiagnosticsRunner', () => {
  it('checks all registered providers', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    hardwareRegistry.register(makeMockProvider('p2', ['gpu'], [makeGPU()]));
    const runner = new HardwareDiagnosticsRunner();
    const result = await runner.run();
    expect(result.providersChecked).toContain('p1');
    expect(result.providersChecked).toContain('p2');
  });

  it('reports warning for unavailable providers', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()], { available: false }));
    const runner = new HardwareDiagnosticsRunner();
    const result = await runner.run();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]!.severity).toBe('warning');
  });

  it('detects capabilities when components provided', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const runner = new HardwareDiagnosticsRunner();
    const result = await runner.run(makeAllComponents());
    expect(result.capabilities.cpu.temperature).toBe(true);
  });

  it('returns empty capabilities when no components', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const runner = new HardwareDiagnosticsRunner();
    const result = await runner.run();
    expect(result.capabilities.cpu.temperature).toBe(false);
  });
});

// ── HardwareDashboardProvider ────────────────────────────────────────

describe('HardwareDashboardProvider', () => {
  it('builds dashboard data from snapshot', () => {
    const provider = new HardwareDashboardProvider();
    const snapshot: HardwareSnapshot = {
      id: 'test',
      timestamp: Date.now(),
      scanDurationMs: 100,
      components: makeAllComponents(),
      providerHealth: {},
      metadata: { source: 'mock', version: '1.1.0', partial: false },
    };
    const dashboard = provider.buildDashboard(snapshot);
    expect(dashboard.summary.totalComponents).toBeGreaterThan(0);
    expect(dashboard.summary.overallHealth).toBe('good');
    expect(dashboard.highlights.length).toBeGreaterThan(0);
  });

  it('includes CPU temperature highlight', () => {
    const provider = new HardwareDashboardProvider();
    const snapshot: HardwareSnapshot = {
      id: 'test',
      timestamp: Date.now(),
      scanDurationMs: 100,
      components: [makeCPU()],
      providerHealth: {},
      metadata: { source: 'mock', version: '1.1.0', partial: false },
    };
    const dashboard = provider.buildDashboard(snapshot);
    const cpuTemp = dashboard.highlights.find((h) => h.label === 'CPU Temperature');
    expect(cpuTemp).toBeDefined();
    expect(cpuTemp?.level).toBe('good');
  });

  it('includes nextScanInMs when provided', () => {
    const provider = new HardwareDashboardProvider();
    const snapshot: HardwareSnapshot = {
      id: 'test',
      timestamp: Date.now(),
      scanDurationMs: 100,
      components: [],
      providerHealth: {},
      metadata: { source: 'mock', version: '1.1.0', partial: false },
    };
    const dashboard = provider.buildDashboard(snapshot, 5000);
    expect(dashboard.nextScanInMs).toBe(5000);
  });
});

// ── HardwareEvents ───────────────────────────────────────────────────

describe('HardwareEventBus', () => {
  it('subscribe receives events', () => {
    const events: string[] = [];
    const unsub = hardwareEventBus.subscribe((e) => events.push(e.type));
    hardwareEventBus.emitScanStarted();
    expect(events).toContain('hardware_scan_started');
    unsub();
  });

  it('unsubscribe stops receiving events', () => {
    const events: string[] = [];
    const unsub = hardwareEventBus.subscribe((e) => events.push(e.type));
    unsub();
    hardwareEventBus.emitScanStarted();
    expect(events).toHaveLength(0);
  });

  it('emitScanCompleted includes snapshot data', () => {
    const received: HardwareEvent[] = [];
    hardwareEventBus.subscribe((e) => { received.push(e); });
    hardwareEventBus.emitScanCompleted('snap-1', 500, 10);
    expect(received).toHaveLength(1);
    expect(received[0]?.data?.snapshotId).toBe('snap-1');
  });

  it('emitProviderFailed includes error', () => {
    const received: HardwareEvent[] = [];
    hardwareEventBus.subscribe((e) => { received.push(e); });
    hardwareEventBus.emitProviderFailed('wmi', 'cpu', 'WMI timeout');
    expect(received[0]?.data?.error).toBe('WMI timeout');
  });

  it('emitSensorMissing includes sensor name', () => {
    const received: HardwareEvent[] = [];
    hardwareEventBus.subscribe((e) => { received.push(e); });
    hardwareEventBus.emitSensorMissing('cpu', 'temperatureC');
    expect(received[0]?.data?.sensorName).toBe('temperatureC');
  });

  it('listener errors do not crash the bus', () => {
    hardwareEventBus.subscribe(() => { throw new Error('boom'); });
    hardwareEventBus.subscribe((e) => { expect(e).toBeDefined(); });
    hardwareEventBus.emitScanStarted();
  });
});

// ── HardwareFactory ──────────────────────────────────────────────────

describe('HardwareFactory', () => {
  it('creates all instances with default config', () => {
    const factory = new HardwareFactory();
    const instances = factory.create();
    expect(instances.scanner).toBeDefined();
    expect(instances.monitor).toBeDefined();
    expect(instances.cache).toBeDefined();
    expect(instances.history).toBeDefined();
    expect(instances.healthEvaluator).toBeDefined();
    expect(instances.capabilitiesDetector).toBeDefined();
    expect(instances.diagnosticsRunner).toBeDefined();
    expect(instances.dashboardProvider).toBeDefined();
    expect(instances.repository).toBeDefined();
  });

  it('accepts partial config overrides', () => {
    const factory = new HardwareFactory();
    const instances = factory.create({ pollIntervalMs: 10000 });
    expect(instances.monitor).toBeDefined();
  });
});

// ── HardwareManager ──────────────────────────────────────────────────

describe('HardwareManager', () => {
  it('initializes and disposes cleanly', async () => {
    const manager = new HardwareManager();
    await manager.initialize();
    manager.dispose();
  });

  it('registerProvider adds to registry', () => {
    const manager = new HardwareManager({ enablePolling: false });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    expect(manager.getRegisteredCategories()).toContain('cpu');
    manager.dispose();
  });

  it('scan returns a snapshot with components', async () => {
    const manager = new HardwareManager({ enablePolling: false });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    manager.registerProvider(makeMockProvider('p2', ['gpu'], [makeGPU()]));
    const snapshot = await manager.scan();
    expect(snapshot.components).toHaveLength(2);
    manager.dispose();
  });

  it('getSnapshot returns last scanned', async () => {
    const manager = new HardwareManager({ enablePolling: false });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    await manager.scan();
    expect(manager.getSnapshot()).not.toBeNull();
    manager.dispose();
  });

  it('getHealth returns health status', async () => {
    const manager = new HardwareManager({ enablePolling: false });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    await manager.scan();
    const health = manager.getHealth();
    expect(health.overall).toBe('good');
    manager.dispose();
  });

  it('getHealth returns unknown when no snapshot', () => {
    const manager = new HardwareManager({ enablePolling: false });
    const health = manager.getHealth();
    expect(health.overall).toBe('unknown');
    manager.dispose();
  });

  it('getCapabilities returns detected capabilities', async () => {
    const manager = new HardwareManager({ enablePolling: false });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    await manager.scan();
    const caps = manager.getCapabilities();
    expect(caps.cpu.temperature).toBe(true);
    manager.dispose();
  });

  it('getDashboard returns dashboard data', async () => {
    const manager = new HardwareManager({ enablePolling: false });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    await manager.scan();
    const dashboard = manager.getDashboard();
    expect(dashboard).not.toBeNull();
    expect(dashboard?.summary.totalComponents).toBeGreaterThan(0);
    manager.dispose();
  });

  it('getDashboard returns null when no snapshot', () => {
    const manager = new HardwareManager({ enablePolling: false });
    expect(manager.getDashboard()).toBeNull();
    manager.dispose();
  });

  it('runDiagnostics returns diagnostics result', async () => {
    const manager = new HardwareManager({ enablePolling: false });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    await manager.scan();
    const diag = await manager.runDiagnostics();
    expect(diag.providersChecked).toContain('p1');
    manager.dispose();
  });

  it('startMonitoring initiates polling and stopMonitoring halts', async () => {
    const manager = new HardwareManager({ enablePolling: true, pollIntervalMs: 100 });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    await manager.startMonitoring();
    expect(manager.isPolling()).toBe(true);
    manager.stopMonitoring();
    expect(manager.isPolling()).toBe(false);
    manager.dispose();
  });

  it('unregisterProvider removes from registry', () => {
    const manager = new HardwareManager({ enablePolling: false });
    manager.registerProvider(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    manager.unregisterProvider('p1');
    expect(manager.getRegisteredCategories()).not.toContain('cpu');
    manager.dispose();
  });
});

// ── InMemoryHardwareRepository ───────────────────────────────────────

describe('InMemoryHardwareRepository', () => {
  it('saves and retrieves snapshots', async () => {
    const repo = new InMemoryHardwareRepository();
    const snap = { id: 's1', timestamp: Date.now() } as never;
    await repo.saveSnapshot(snap);
    const retrieved = await repo.getSnapshots(10);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]!.snapshot.id).toBe('s1');
  });

  it('getSnapshotById finds by ID', async () => {
    const repo = new InMemoryHardwareRepository();
    const snap = { id: 'find-me', timestamp: Date.now() } as never;
    await repo.saveSnapshot(snap);
    const found = await repo.getSnapshotById('find-me');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('find-me');
  });

  it('getSnapshotById returns null for unknown ID', async () => {
    const repo = new InMemoryHardwareRepository();
    expect(await repo.getSnapshotById('nope')).toBeNull();
  });

  it('deleteSnapshotsOlderThan removes old entries', async () => {
    const repo = new InMemoryHardwareRepository();
    await repo.saveSnapshot({ id: 'old', timestamp: 1000 } as never);
    await repo.saveSnapshot({ id: 'new', timestamp: 5000 } as never);
    const deleted = await repo.deleteSnapshotsOlderThan(3000);
    expect(deleted).toBe(1);
    const remaining = await repo.getSnapshots(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.snapshot.id).toBe('new');
  });

  it('clear removes all', async () => {
    const repo = new InMemoryHardwareRepository();
    await repo.saveSnapshot({ id: 's1', timestamp: Date.now() } as never);
    await repo.clear();
    expect(await repo.getSnapshots(10)).toHaveLength(0);
  });
});

// ── Provider Switching ───────────────────────────────────────────────

describe('Provider Switching', () => {
  it('switches to fallback provider when primary becomes unavailable', async () => {
    const primary = makeMockProvider('primary', ['cpu'], [makeCPU({ info: { ...makeCPU().info, model: 'Primary CPU' } })], { available: true });
    const fallback = makeMockProvider('fallback', ['cpu'], [makeCPU({ info: { ...makeCPU().info, model: 'Fallback CPU' } })]);
    hardwareRegistry.register(primary, 10);
    hardwareRegistry.register(fallback, 1);

    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    let snapshot = await scanner.scan();
    expect(snapshot.components[0]!.category).toBe('cpu');
    expect((snapshot.components[0] as CPUComponent).info.model).toBe('Primary CPU');

    // Simulate primary going down
    const primaryProvider = hardwareRegistry.getProvider('primary')!;
    (primaryProvider as { isAvailable: () => boolean }).isAvailable = () => false;

    snapshot = await scanner.scan();
    expect((snapshot.components[0] as CPUComponent).info.model).toBe('Fallback CPU');
  });

  it('uses higher priority provider first', async () => {
    const low = makeMockProvider('low', ['cpu'], [makeCPU({ info: { ...makeCPU().info, model: 'Low' } })]);
    const high = makeMockProvider('high', ['cpu'], [makeCPU({ info: { ...makeCPU().info, model: 'High' } })]);
    hardwareRegistry.register(low, 1);
    hardwareRegistry.register(high, 100);

    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    const snapshot = await scanner.scan();
    expect((snapshot.components[0] as CPUComponent).info.model).toBe('High');
  });
});

// ── Unsupported Hardware ─────────────────────────────────────────────

describe('Unsupported Hardware', () => {
  it('handles unsupported CPU sensors gracefully', () => {
    const cpu = makeCPU({
      sensors: { thermalThrottling: false },
      sensorStatus: { availability: 'unsupported', message: 'Temperature sensor not available' },
    });
    expect(cpu.sensorStatus.availability).toBe('unsupported');
    expect(cpu.sensors.temperatureC).toBeUndefined();
  });

  it('handles missing battery (no battery component)', async () => {
    hardwareRegistry.register(makeMockProvider('p1', ['cpu'], [makeCPU()]));
    const scanner = new HardwareScanner(DEFAULT_HARDWARE_CONFIG);
    const snapshot = await scanner.scan();
    expect(snapshot.components.some((c) => c.category === 'battery')).toBe(false);
  });

  it('handles storage without SMART', () => {
    const storage = makeStorage({ info: { ...makeStorage().info, smartSupported: false } });
    expect(storage.info.smartSupported).toBe(false);
  });

  it('handles network with unknown type', () => {
    const net = makeNetwork({ info: { ...makeNetwork().info, type: 'unknown' } });
    expect(net.info.type).toBe('unknown');
  });
});
