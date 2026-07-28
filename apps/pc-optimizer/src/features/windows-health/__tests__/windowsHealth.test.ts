/**
 * Tests for Windows System Health Platform (Phase 3.7).
 *
 * Covers:
 * - Helper functions: daysSince, formatBytes, formatDuration
 * - Scanner: cache, throttle, scan with RPC unavailable
 * - Repository: load, query, filter, partial update, clear
 * - Update Analyzer: pending, failed, overdue, restart, service disabled
 * - Driver Analyzer: outdated, unknown, errors, disabled, unsigned
 * - Security Analyzer: defender, firewall, SmartScreen, Secure Boot, TPM, definitions
 * - Hardware Analyzer: CPU, memory, disk space, battery
 * - Windows Analyzer: overall score, sub-scores, insights
 * - Recommendation Engine: 10 recommendation types, filter, sort
 * - Execution Task: validate, config, safety, forbidden actions
 * - History: record, scan, update check, execution, health change
 * - Health Integration: update, driver, security contributions
 * - Events: emit, subscribe, listener count
 * - Regression: all exports, task registered, no forbidden modifications
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  WindowsSystemInfo,
  UpdateStatus,
  SecurityStatus,
  HardwareInfo,
  DriverInfo,
  WindowsHealthResult,
  WindowsScanResult,
  PendingUpdate,
} from '../types';
import {
  daysSince,
  formatBytes,
  formatDuration,
  OVERDUE_UPDATE_THRESHOLD_DAYS,
  HIGH_CPU_USAGE_THRESHOLD,
  HIGH_MEMORY_USAGE_THRESHOLD,
  LOW_DISK_SPACE_THRESHOLD,
} from '../types';
import { WindowsScanner } from '../windowsScanner';
import { WindowsRepository } from '../windowsRepository';
import { UpdateAnalyzer } from '../updateAnalyzer';
import { DriverAnalyzer } from '../driverAnalyzer';
import { SecurityAnalyzer } from '../securityAnalyzer';
import { HardwareAnalyzer } from '../hardwareAnalyzer';
import { WindowsAnalyzer } from '../windowsAnalyzer';
import { WindowsRecommendationEngine } from '../windowsRecommendationEngine';
import { WindowsExecutionTask, WINDOWS_TASK_ID } from '../windowsExecutionTask';
import { WindowsHistory } from '../windowsHistory';
import { WindowsHealthIntegration } from '../windowsHealthIntegration';
import { WindowsEventEmitter } from '../windowsEvents';
import { isTaskRegistered } from '../../maintenance-engine/tasks/index';

// ── Test Helpers ──────────────────────────────────────────────

function makeSystemInfo(overrides: Partial<WindowsSystemInfo> = {}): WindowsSystemInfo {
  return {
    edition: 'Windows 11 Pro',
    version: '23H2',
    buildNumber: '22631.3737',
    release: '2023-10-31',
    installDate: '2023-01-15T00:00:00Z',
    activationStatus: 'activated',
    lastBootTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    pendingRestart: false,
    systemLocale: 'en-US',
    architecture: 'x64',
    deviceName: 'DESKTOP-TEST',
    systemManufacturer: 'Dell',
    biosVersion: '1.5.0',
    uefiStatus: true,
    secureBoot: true,
    tpmVersion: '2.0',
    bitLockerStatus: 'on',
    virtualizationSupport: true,
    ...overrides,
  };
}

function makeUpdateStatus(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    serviceEnabled: true,
    lastUpdateDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    pendingUpdates: [],
    failedUpdates: [],
    securityUpdatesPending: 0,
    featureUpdatesPending: 0,
    optionalUpdatesPending: 0,
    restartRequired: false,
    pausedUpdates: false,
    deliveryOptimizationEnabled: true,
    daysSinceLastUpdate: 10,
    ...overrides,
  };
}

function makeSecurityStatus(overrides: Partial<SecurityStatus> = {}): SecurityStatus {
  return {
    defenderEnabled: true,
    realTimeProtection: true,
    firewallEnabled: true,
    smartScreenEnabled: true,
    secureBootEnabled: true,
    tpmPresent: true,
    tpmVersion: '2.0',
    coreIsolationEnabled: true,
    memoryIntegrityEnabled: true,
    ransomwareProtectionEnabled: true,
    virusDefinitionsUpdated: true,
    virusDefinitionsDate: new Date().toISOString(),
    thirdPartyAV: null,
    bitLockerStatus: 'on',
    uacEnabled: true,
    ...overrides,
  };
}

function makeHardwareInfo(overrides: Partial<HardwareInfo> = {}): HardwareInfo {
  return {
    cpu: {
      name: 'Intel Core i7-12700K',
      manufacturer: 'Intel',
      cores: 12,
      logicalCores: 20,
      maxFrequency: 3600,
      currentUsage: 30,
    },
    memory: {
      total: 32 * 1024 * 1024 * 1024,
      used: 16 * 1024 * 1024 * 1024,
      free: 16 * 1024 * 1024 * 1024,
      usage: 50,
      slotsUsed: 2,
      slotsTotal: 4,
      speed: 3200,
    },
    storage: [
      {
        id: 'storage-0',
        name: 'C:',
        type: 'ssd',
        totalSize: 512 * 1024 * 1024 * 1024,
        freeSpace: 256 * 1024 * 1024 * 1024,
        usedSpace: 256 * 1024 * 1024 * 1024,
        usage: 50,
        isSystemDrive: true,
        smartStatus: 'ok',
      },
    ],
    gpus: [
      { name: 'NVIDIA RTX 3080', manufacturer: 'NVIDIA', driverVersion: '545.84', vram: 10 * 1024 * 1024 * 1024 },
    ],
    battery: null,
    totalStorageFree: 256 * 1024 * 1024 * 1024,
    totalStorageUsed: 256 * 1024 * 1024 * 1024,
    totalStorageTotal: 512 * 1024 * 1024 * 1024,
    ...overrides,
  };
}

function makeDriver(overrides: Partial<DriverInfo> = {}): DriverInfo {
  return {
    id: 'driver-1',
    deviceName: 'Intel Wi-Fi 6 AX201',
    deviceClass: 'Network',
    manufacturer: 'Intel',
    driverVersion: '22.250.1.2',
    driverDate: '2024-01-15',
    status: 'ok',
    isSigned: true,
    hasError: false,
    errorMessage: null,
    isEnabled: true,
    ...overrides,
  };
}

function makeScanResult(overrides: Partial<WindowsScanResult> = {}): WindowsScanResult {
  return {
    systemInfo: makeSystemInfo(),
    updateStatus: makeUpdateStatus(),
    securityStatus: makeSecurityStatus(),
    hardwareInfo: makeHardwareInfo(),
    drivers: [makeDriver()],
    scannedAt: new Date().toISOString(),
    scanDurationMs: 500,
    errors: [],
    fromCache: false,
    ...overrides,
  };
}

function makeHealthResult(overrides: Partial<WindowsHealthResult> = {}): WindowsHealthResult {
  return {
    overallScore: 85,
    performanceScore: 90,
    updateScore: 80,
    securityScore: 95,
    hardwareScore: 85,
    issues: [],
    insights: ['System is healthy'],
    systemInfo: makeSystemInfo(),
    updateStatus: makeUpdateStatus(),
    securityStatus: makeSecurityStatus(),
    hardwareInfo: makeHardwareInfo(),
    driverInfo: [makeDriver()],
    analyzedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePendingUpdate(overrides: Partial<PendingUpdate> = {}): PendingUpdate {
  return {
    id: 'KB5012345',
    title: 'Security Update for Windows',
    classification: 'security',
    sizeBytes: 250 * 1024 * 1024,
    isSecurity: true,
    isRequired: true,
    ...overrides,
  };
}

// ── Helper Function Tests ─────────────────────────────────────

describe('Helper Functions', () => {
  it('daysSince computes days from date', () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(old)).toBe(10);
  });

  it('daysSince returns Infinity for null', () => {
    expect(daysSince(null)).toBe(Infinity);
  });

  it('formatBytes formats correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('formatDuration formats correctly', () => {
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(90)).toBe('1m 30s');
  });

  it('OVERDUE_UPDATE_THRESHOLD_DAYS is 60', () => {
    expect(OVERDUE_UPDATE_THRESHOLD_DAYS).toBe(60);
  });

  it('HIGH_CPU_USAGE_THRESHOLD is 85', () => {
    expect(HIGH_CPU_USAGE_THRESHOLD).toBe(85);
  });

  it('HIGH_MEMORY_USAGE_THRESHOLD is 85', () => {
    expect(HIGH_MEMORY_USAGE_THRESHOLD).toBe(85);
  });

  it('LOW_DISK_SPACE_THRESHOLD is 0.9', () => {
    expect(LOW_DISK_SPACE_THRESHOLD).toBe(0.9);
  });
});

// ── Scanner Tests ─────────────────────────────────────────────

describe('WindowsScanner', () => {
  let scanner: WindowsScanner;

  beforeEach(() => {
    scanner = new WindowsScanner();
  });

  it('scan returns errors when RPC unavailable', async () => {
    const result = await scanner.scan();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.systemInfo).toBeNull();
  });

  it('isCacheValid returns false initially', () => {
    expect(scanner.isCacheValid()).toBe(false);
  });

  it('invalidateCache clears cache', () => {
    scanner.invalidateCache();
    expect(scanner.isCacheValid()).toBe(false);
  });

  it('shouldThrottle returns false initially', () => {
    expect(scanner.shouldThrottle()).toBe(false);
  });

  it('checkUpdates returns null when RPC unavailable', async () => {
    const result = await scanner.checkUpdates();
    expect(result).toBeNull();
  });
});

// ── Repository Tests ──────────────────────────────────────────

describe('WindowsRepository', () => {
  let repo: WindowsRepository;

  beforeEach(() => {
    repo = new WindowsRepository();
  });

  it('loadFromScanResult populates all fields', () => {
    repo.loadFromScanResult(makeScanResult());
    expect(repo.getSystemInfo()).not.toBeNull();
    expect(repo.getUpdateStatus()).not.toBeNull();
    expect(repo.getSecurityStatus()).not.toBeNull();
    expect(repo.getHardwareInfo()).not.toBeNull();
    expect(repo.getDrivers()).toHaveLength(1);
  });

  it('hasData returns true after loading', () => {
    expect(repo.hasData()).toBe(false);
    repo.loadFromScanResult(makeScanResult());
    expect(repo.hasData()).toBe(true);
  });

  it('getDriverById returns driver by ID', () => {
    repo.loadFromScanResult(makeScanResult());
    expect(repo.getDriverById('driver-1')?.deviceName).toBe('Intel Wi-Fi 6 AX201');
  });

  it('getDriversByStatus filters by status', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [
        makeDriver({ id: 'd1', status: 'ok' }),
        makeDriver({ id: 'd2', status: 'outdated' }),
      ],
    });
    expect(repo.getDriversByStatus('outdated')).toHaveLength(1);
  });

  it('getOutdatedDrivers returns only outdated', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [
        makeDriver({ id: 'd1', status: 'ok' }),
        makeDriver({ id: 'd2', status: 'outdated' }),
      ],
    });
    expect(repo.getOutdatedDrivers()).toHaveLength(1);
  });

  it('getErrorDrivers returns only errored', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [
        makeDriver({ id: 'd1', hasError: false }),
        makeDriver({ id: 'd2', hasError: true, errorMessage: 'Code 28' }),
      ],
    });
    expect(repo.getErrorDrivers()).toHaveLength(1);
  });

  it('getUnsignedDrivers returns only unsigned', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [
        makeDriver({ id: 'd1', isSigned: true }),
        makeDriver({ id: 'd2', isSigned: false }),
      ],
    });
    expect(repo.getUnsignedDrivers()).toHaveLength(1);
  });

  it('clear removes all data', () => {
    repo.loadFromScanResult(makeScanResult());
    repo.clear();
    expect(repo.hasData()).toBe(false);
    expect(repo.getDrivers()).toEqual([]);
  });

  it('updatePartial updates only specified fields', () => {
    repo.loadFromScanResult(makeScanResult());
    const newUpdate = makeUpdateStatus({ restartRequired: true });
    repo.updatePartial({ updateStatus: newUpdate });
    expect(repo.getUpdateStatus()?.restartRequired).toBe(true);
    expect(repo.getSecurityStatus()).not.toBeNull();
  });
});

// ── Update Analyzer Tests ─────────────────────────────────────

describe('UpdateAnalyzer', () => {
  let repo: WindowsRepository;
  let analyzer: UpdateAnalyzer;

  beforeEach(() => {
    repo = new WindowsRepository();
    analyzer = new UpdateAnalyzer(repo);
  });

  it('computes update score', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('detects pending security updates', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      updateStatus: makeUpdateStatus({
        pendingUpdates: [makePendingUpdate()],
        securityUpdatesPending: 1,
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'pending_updates')).toBe(true);
    expect(result.securityPendingCount).toBe(1);
  });

  it('detects failed updates', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      updateStatus: makeUpdateStatus({
        failedUpdates: [makePendingUpdate({ id: 'KB9999', title: 'Failed Update' })],
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'failed_updates')).toBe(true);
  });

  it('detects overdue updates', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      updateStatus: makeUpdateStatus({
        lastUpdateDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        daysSinceLastUpdate: 90,
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'overdue_updates')).toBe(true);
  });

  it('detects restart required', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      updateStatus: makeUpdateStatus({ restartRequired: true }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'restart_required')).toBe(true);
    expect(result.restartRequired).toBe(true);
  });

  it('detects disabled update service', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      updateStatus: makeUpdateStatus({ serviceEnabled: false }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'update_service_disabled')).toBe(true);
  });

  it('detects paused updates', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      updateStatus: makeUpdateStatus({ pausedUpdates: true }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'paused_updates')).toBe(true);
  });

  it('handles empty repository', () => {
    const result = analyzer.analyze();
    expect(result.score).toBe(100);
    expect(result.pendingCount).toBe(0);
  });
});

// ── Driver Analyzer Tests ─────────────────────────────────────

describe('DriverAnalyzer', () => {
  let repo: WindowsRepository;
  let analyzer: DriverAnalyzer;

  beforeEach(() => {
    repo = new WindowsRepository();
    analyzer = new DriverAnalyzer(repo);
  });

  it('computes driver score', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.totalDrivers).toBe(1);
  });

  it('detects outdated drivers', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [makeDriver({ id: 'd1', status: 'outdated' })],
    });
    const result = analyzer.analyze();
    expect(result.outdatedCount).toBe(1);
    expect(result.issues.some((i) => i.type === 'outdated_driver')).toBe(true);
  });

  it('detects unknown devices', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [makeDriver({ id: 'd1', status: 'unknown' })],
    });
    const result = analyzer.analyze();
    expect(result.unknownDeviceCount).toBe(1);
    expect(result.issues.some((i) => i.type === 'unknown_device')).toBe(true);
  });

  it('detects device errors', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [makeDriver({ id: 'd1', hasError: true, errorMessage: 'Code 28' })],
    });
    const result = analyzer.analyze();
    expect(result.errorCount).toBe(1);
    expect(result.issues.some((i) => i.type === 'device_error')).toBe(true);
  });

  it('detects unsigned drivers', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [makeDriver({ id: 'd1', isSigned: false })],
    });
    const result = analyzer.analyze();
    expect(result.unsignedCount).toBe(1);
    expect(result.issues.some((i) => i.type === 'unsigned_driver')).toBe(true);
  });

  it('detects disabled devices', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      drivers: [makeDriver({ id: 'd1', isEnabled: false })],
    });
    const result = analyzer.analyze();
    expect(result.disabledCount).toBe(1);
    expect(result.issues.some((i) => i.type === 'disabled_device')).toBe(true);
  });

  it('handles empty repository', () => {
    const result = analyzer.analyze();
    expect(result.score).toBe(100);
    expect(result.totalDrivers).toBe(0);
  });
});

// ── Security Analyzer Tests ───────────────────────────────────

describe('SecurityAnalyzer', () => {
  let repo: WindowsRepository;
  let analyzer: SecurityAnalyzer;

  beforeEach(() => {
    repo = new WindowsRepository();
    analyzer = new SecurityAnalyzer(repo);
  });

  it('computes security score', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('detects disabled Defender', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      securityStatus: makeSecurityStatus({ defenderEnabled: false, thirdPartyAV: null }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'defender_disabled')).toBe(true);
    expect(result.defenderActive).toBe(false);
  });

  it('detects disabled real-time protection', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      securityStatus: makeSecurityStatus({ realTimeProtection: false }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'realtime_protection_off')).toBe(true);
  });

  it('detects disabled firewall', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      securityStatus: makeSecurityStatus({ firewallEnabled: false }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'firewall_disabled')).toBe(true);
    expect(result.firewallActive).toBe(false);
  });

  it('detects disabled SmartScreen', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      securityStatus: makeSecurityStatus({ smartScreenEnabled: false }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'smart_screen_disabled')).toBe(true);
  });

  it('detects disabled Secure Boot', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      securityStatus: makeSecurityStatus({ secureBootEnabled: false }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'secure_boot_disabled')).toBe(true);
  });

  it('detects missing TPM', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      securityStatus: makeSecurityStatus({ tpmPresent: false, tpmVersion: null }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'tpm_not_found')).toBe(true);
  });

  it('detects outdated virus definitions', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      securityStatus: makeSecurityStatus({
        virusDefinitionsUpdated: false,
        virusDefinitionsDate: null,
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'virus_definitions_outdated')).toBe(true);
  });

  it('detects stale virus definitions', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      securityStatus: makeSecurityStatus({
        virusDefinitionsUpdated: true,
        virusDefinitionsDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'virus_definitions_outdated')).toBe(true);
  });

  it('allProtectionsEnabled is true when all enabled', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.allProtectionsEnabled).toBe(true);
  });

  it('handles empty repository', () => {
    const result = analyzer.analyze();
    expect(result.score).toBe(100);
  });
});

// ── Hardware Analyzer Tests ───────────────────────────────────

describe('HardwareAnalyzer', () => {
  let repo: WindowsRepository;
  let analyzer: HardwareAnalyzer;

  beforeEach(() => {
    repo = new WindowsRepository();
    analyzer = new HardwareAnalyzer(repo);
  });

  it('computes hardware score', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('detects high CPU usage', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      hardwareInfo: makeHardwareInfo({
        cpu: { ...makeHardwareInfo().cpu, currentUsage: 90 },
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'high_cpu_usage')).toBe(true);
  });

  it('detects high memory usage', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      hardwareInfo: makeHardwareInfo({
        memory: { ...makeHardwareInfo().memory, usage: 90 },
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'high_memory_usage')).toBe(true);
  });

  it('detects low disk space', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      hardwareInfo: makeHardwareInfo({
        storage: [{
          id: 'storage-0',
          name: 'C:',
          type: 'ssd',
          totalSize: 100 * 1024 * 1024 * 1024,
          freeSpace: 5 * 1024 * 1024 * 1024,
          usedSpace: 95 * 1024 * 1024 * 1024,
          usage: 95,
          isSystemDrive: true,
          smartStatus: 'ok',
        }],
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'low_disk_space')).toBe(true);
    expect(result.lowDiskSpaceDrives.length).toBeGreaterThan(0);
  });

  it('detects poor battery health', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      hardwareInfo: makeHardwareInfo({
        battery: {
          present: true,
          percent: 30,
          powerPlugged: false,
          cycleCount: 500,
          health: 'poor',
          designCapacity: 50000,
          fullChargeCapacity: 20000,
        },
      }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'poor_battery_health')).toBe(true);
    expect(result.batteryHealth).toBe('poor');
  });

  it('reports not_present when no battery', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.batteryHealth).toBe('not_present');
  });

  it('handles empty repository', () => {
    const result = analyzer.analyze();
    expect(result.score).toBe(100);
  });
});

// ── Windows Analyzer Tests ────────────────────────────────────

describe('WindowsAnalyzer', () => {
  let repo: WindowsRepository;
  let analyzer: WindowsAnalyzer;

  beforeEach(() => {
    repo = new WindowsRepository();
    analyzer = new WindowsAnalyzer(repo);
  });

  it('computes overall health score', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('computes sub-scores', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.performanceScore).toBeGreaterThanOrEqual(0);
    expect(result.updateScore).toBeGreaterThanOrEqual(0);
    expect(result.securityScore).toBeGreaterThanOrEqual(0);
    expect(result.hardwareScore).toBeGreaterThanOrEqual(0);
  });

  it('aggregates issues from all analyzers', () => {
    repo.loadFromScanResult({
      ...makeScanResult(),
      updateStatus: makeUpdateStatus({ restartRequired: true }),
      securityStatus: makeSecurityStatus({ firewallEnabled: false }),
    });
    const result = analyzer.analyze();
    expect(result.issues.some((i) => i.type === 'restart_required')).toBe(true);
    expect(result.issues.some((i) => i.type === 'firewall_disabled')).toBe(true);
  });

  it('generates insights', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it('includes system info in result', () => {
    repo.loadFromScanResult(makeScanResult());
    const result = analyzer.analyze();
    expect(result.systemInfo).not.toBeNull();
    expect(result.updateStatus).not.toBeNull();
    expect(result.securityStatus).not.toBeNull();
  });

  it('handles empty repository', () => {
    const result = analyzer.analyze();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });
});

// ── Recommendation Engine Tests ───────────────────────────────

describe('WindowsRecommendationEngine', () => {
  let engine: WindowsRecommendationEngine;

  beforeEach(() => {
    engine = new WindowsRecommendationEngine();
  });

  it('generates install updates recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'pending_updates', title: '5 updates pending',
        description: 'Updates pending', severity: 'medium', impact: 10, autoFixable: false,
      }],
    }));
    const rec = recs.find((r) => r.type === 'install_windows_updates');
    expect(rec).toBeDefined();
    expect(rec!.priority).toBe('high');
  });

  it('generates restart recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'restart_required', title: 'Restart required',
        description: 'Restart needed', severity: 'medium', impact: 8, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'restart_computer')).toBe(true);
  });

  it('generates enable firewall recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'firewall_disabled', title: 'Firewall disabled',
        description: 'Firewall off', severity: 'high', impact: 12, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'enable_firewall')).toBe(true);
  });

  it('generates enable defender recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'defender_disabled', title: 'Defender disabled',
        description: 'Defender off', severity: 'critical', impact: 25, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'enable_defender')).toBe(true);
  });

  it('generates enable SmartScreen recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'smart_screen_disabled', title: 'SmartScreen disabled',
        description: 'SmartScreen off', severity: 'low', impact: 5, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'enable_smartscreen')).toBe(true);
  });

  it('generates enable Secure Boot recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'secure_boot_disabled', title: 'Secure Boot disabled',
        description: 'Secure Boot off', severity: 'medium', impact: 8, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'enable_secure_boot')).toBe(true);
  });

  it('generates review device errors recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'device_error', title: '2 device errors',
        description: 'Errors', severity: 'medium', impact: 10, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'review_device_errors')).toBe(true);
  });

  it('generates review unsigned drivers recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'unsigned_driver', title: '1 unsigned driver',
        description: 'Unsigned', severity: 'high', impact: 15, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'review_unsigned_drivers')).toBe(true);
  });

  it('generates free disk space recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'low_disk_space', title: 'Low disk space on C:',
        description: 'Disk almost full', severity: 'high', impact: 15, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'free_disk_space')).toBe(true);
  });

  it('generates review battery health recommendation', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [{
        type: 'poor_battery_health', title: 'Poor battery health',
        description: 'Battery degraded', severity: 'medium', impact: 8, autoFixable: false,
      }],
    }));
    expect(recs.some((r) => r.type === 'review_battery_health')).toBe(true);
  });

  it('recommendations are sorted by priority', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [
        { type: 'firewall_disabled', title: 'Firewall', description: '', severity: 'high', impact: 12, autoFixable: false },
        { type: 'pending_updates', title: 'Updates', description: '', severity: 'medium', impact: 10, autoFixable: false },
        { type: 'smart_screen_disabled', title: 'SmartScreen', description: '', severity: 'low', impact: 5, autoFixable: false },
      ],
    }));
    const priorities = recs.map((r) => r.priority);
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i]!]).toBeGreaterThanOrEqual(order[priorities[i - 1]!]);
    }
  });

  it('filterByType filters correctly', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [
        { type: 'pending_updates', title: 'Updates', description: '', severity: 'medium', impact: 10, autoFixable: false },
        { type: 'firewall_disabled', title: 'Firewall', description: '', severity: 'high', impact: 12, autoFixable: false },
      ],
    }));
    const updateRecs = engine.filterByType(recs, 'install_windows_updates');
    expect(updateRecs.every((r) => r.type === 'install_windows_updates')).toBe(true);
  });

  it('getReviewRequired returns only review-required', () => {
    const recs = engine.generate(makeHealthResult({
      issues: [
        { type: 'firewall_disabled', title: 'Firewall', description: '', severity: 'high', impact: 12, autoFixable: false },
        { type: 'pending_updates', title: 'Updates', description: '', severity: 'medium', impact: 10, autoFixable: false },
      ],
    }));
    const reviewRecs = engine.getReviewRequired(recs);
    expect(reviewRecs.every((r) => r.reviewRequired)).toBe(true);
  });
});

// ── Execution Task Tests ──────────────────────────────────────

describe('WindowsExecutionTask', () => {
  let task: WindowsExecutionTask;

  beforeEach(() => {
    task = new WindowsExecutionTask();
  });

  it('has correct display name', () => {
    expect(task.displayName).toBe('Windows System Health');
  });

  it('estimates zero duration for no config', () => {
    expect(task.estimateDuration()).toBe(0);
  });

  it('estimates duration based on actions', () => {
    task.setConfig({ actions: ['open_windows_update', 'trigger_update_scan'] });
    expect(task.estimateDuration()).toBe(32000);
  });

  it('validates and rejects when no config', async () => {
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors).toContain('No execution configuration set');
  });

  it('validates and warns about empty actions', async () => {
    task.setConfig({ actions: [] });
    const result = await task.validate();
    expect(result.warnings).toContain('No actions configured');
  });

  it('rejects forbidden actions', async () => {
    task.setConfig({ actions: ['disable_defender' as never] });
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors.some((e) => e.includes('forbidden'))).toBe(true);
  });

  it('allows safe actions', async () => {
    task.setConfig({ actions: ['open_windows_update', 'trigger_update_scan'] });
    const result = await task.validate();
    expect(result.errors.some((e) => e.includes('forbidden'))).toBe(false);
  });

  it('getActionRecords returns empty before execution', () => {
    expect(task.getActionRecords()).toEqual([]);
  });
});

// ── History Tests ─────────────────────────────────────────────

describe('WindowsHistory', () => {
  let history: WindowsHistory;

  beforeEach(() => {
    history = new WindowsHistory();
  });

  it('records scan entries', () => {
    history.recordScan(85, 500);
    expect(history.size()).toBe(1);
    expect(history.getScans()).toHaveLength(1);
  });

  it('records update check entries', () => {
    history.recordUpdateCheck(5);
    expect(history.getByType('update_check')).toHaveLength(1);
  });

  it('records execution entries', () => {
    history.recordExecution('trigger_update_scan', true, 30000);
    expect(history.getExecutions()).toHaveLength(1);
  });

  it('records health change entries', () => {
    history.recordHealthChange(70, 85);
    expect(history.getHealthChanges()).toHaveLength(1);
    const entry = history.getHealthChanges()[0]!;
    expect(entry.scoreBefore).toBe(70);
    expect(entry.scoreAfter).toBe(85);
  });

  it('getRecent returns most recent entries', () => {
    history.recordScan(80, 100);
    history.recordScan(85, 200);
    const recent = history.getRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.scoreAfter).toBe(85);
  });

  it('getLastScore returns last scan score', () => {
    history.recordScan(80, 100);
    history.recordScan(85, 200);
    expect(history.getLastScore()).toBe(85);
  });

  it('clear removes all entries', () => {
    history.recordScan(85, 500);
    history.clear();
    expect(history.size()).toBe(0);
  });
});

// ── Health Integration Tests ──────────────────────────────────

describe('WindowsHealthIntegration', () => {
  let integration: WindowsHealthIntegration;

  beforeEach(() => {
    integration = new WindowsHealthIntegration();
  });

  it('builds update contribution', () => {
    const contribution = integration.buildUpdateContribution(makeHealthResult());
    expect(contribution.categoryId).toBe('system_updates');
    expect(contribution.score).toBe(80);
  });

  it('builds driver contribution', () => {
    const contribution = integration.buildDriverContribution(makeHealthResult());
    expect(contribution.categoryId).toBe('drivers');
    expect(typeof contribution.score).toBe('number');
  });

  it('builds security contribution', () => {
    const contribution = integration.buildSecurityContribution(makeHealthResult());
    expect(contribution.categoryId).toBe('security');
    expect(contribution.score).toBe(95);
  });

  it('sets confidence based on data availability', () => {
    const withData = integration.buildUpdateContribution(makeHealthResult());
    expect(withData.confidence).toBe(0.8);

    const withoutData = integration.buildUpdateContribution(makeHealthResult({ updateStatus: null }));
    expect(withoutData.confidence).toBe(0.3);
  });

  it('filters issues by category in contributions', () => {
    const health = makeHealthResult({
      issues: [
        { type: 'pending_updates', title: 'Updates', description: '', severity: 'medium', impact: 10, autoFixable: false },
        { type: 'firewall_disabled', title: 'Firewall', description: '', severity: 'high', impact: 12, autoFixable: false },
        { type: 'outdated_driver', title: 'Old driver', description: '', severity: 'low', impact: 3, autoFixable: false },
      ],
    });
    const updateContribution = integration.buildUpdateContribution(health);
    const securityContribution = integration.buildSecurityContribution(health);
    const driverContribution = integration.buildDriverContribution(health);

    expect(updateContribution.issues.some((i) => i.type === 'pending_updates')).toBe(true);
    expect(updateContribution.issues.some((i) => i.type === 'firewall_disabled')).toBe(false);

    expect(securityContribution.issues.some((i) => i.type === 'firewall_disabled')).toBe(true);
    expect(securityContribution.issues.some((i) => i.type === 'pending_updates')).toBe(false);

    expect(driverContribution.issues.some((i) => i.type === 'outdated_driver')).toBe(true);
    expect(driverContribution.issues.some((i) => i.type === 'firewall_disabled')).toBe(false);
  });
});

// ── Events Tests ──────────────────────────────────────────────

describe('WindowsEvents', () => {
  let emitter: WindowsEventEmitter;

  beforeEach(() => {
    emitter = new WindowsEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('windows_scan_started', listener);
    emitter.emit('windows_scan_started', { timestamp: 'test' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('windows_scan_completed', listener);
    unsub();
    emitter.emit('windows_scan_completed', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not crash when listener throws', () => {
    emitter.on('windows_analysis_completed', () => {
      throw new Error('test');
    });
    expect(() => emitter.emit('windows_analysis_completed', {})).not.toThrow();
  });

  it('tracks listener count', () => {
    emitter.on('windows_scan_started', () => {});
    emitter.on('windows_scan_started', () => {});
    expect(emitter.listenerCount('windows_scan_started')).toBe(2);
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.windowsScanner).toBeDefined();
    expect(mod.windowsRepository).toBeDefined();
    expect(mod.updateAnalyzer).toBeDefined();
    expect(mod.driverAnalyzer).toBeDefined();
    expect(mod.securityAnalyzer).toBeDefined();
    expect(mod.hardwareAnalyzer).toBeDefined();
    expect(mod.windowsAnalyzer).toBeDefined();
    expect(mod.windowsRecommendationEngine).toBeDefined();
    expect(mod.windowsHistory).toBeDefined();
    expect(mod.windowsHealthIntegration).toBeDefined();
    expect(mod.WindowsScanner).toBeDefined();
    expect(mod.WindowsRepository).toBeDefined();
    expect(mod.UpdateAnalyzer).toBeDefined();
    expect(mod.DriverAnalyzer).toBeDefined();
    expect(mod.SecurityAnalyzer).toBeDefined();
    expect(mod.HardwareAnalyzer).toBeDefined();
    expect(mod.WindowsAnalyzer).toBeDefined();
    expect(mod.WindowsRecommendationEngine).toBeDefined();
    expect(mod.WindowsExecutionTask).toBeDefined();
    expect(mod.WindowsHistory).toBeDefined();
    expect(mod.WindowsHealthIntegration).toBeDefined();
    expect(mod.WindowsEventEmitter).toBeDefined();
    expect(mod.WINDOWS_TASK_ID).toBeDefined();
  });

  it('task is registered in the execution engine registry', () => {
    expect(isTaskRegistered(WINDOWS_TASK_ID)).toBe(true);
  });

  it('WINDOWS_TASK_ID is correct', () => {
    expect(WINDOWS_TASK_ID).toBe('windows_health');
  });

  it('health contributions are compatible with health engine types', () => {
    const integration = new WindowsHealthIntegration();
    const health = makeHealthResult();
    const updateContribution = integration.buildUpdateContribution(health);
    expect(updateContribution.categoryId).toBe('system_updates');
    expect(typeof updateContribution.score).toBe('number');
    expect(Array.isArray(updateContribution.issues)).toBe(true);

    const driverContribution = integration.buildDriverContribution(health);
    expect(driverContribution.categoryId).toBe('drivers');

    const securityContribution = integration.buildSecurityContribution(health);
    expect(securityContribution.categoryId).toBe('security');
  });

  it('scanner supports caching and throttling', () => {
    const scanner = new WindowsScanner();
    expect(typeof scanner.isCacheValid).toBe('function');
    expect(typeof scanner.shouldThrottle).toBe('function');
    expect(typeof scanner.invalidateCache).toBe('function');
  });

  it('repository supports incremental refresh', () => {
    const repo = new WindowsRepository();
    repo.loadFromScanResult(makeScanResult());
    const originalUpdate = repo.getUpdateStatus();
    repo.updatePartial({ securityStatus: makeSecurityStatus({ firewallEnabled: false }) });
    expect(repo.getSecurityStatus()?.firewallEnabled).toBe(false);
    expect(repo.getUpdateStatus()).toEqual(originalUpdate);
  });
});
