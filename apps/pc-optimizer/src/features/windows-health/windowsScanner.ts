/**
 * Windows Scanner — collects OS info, updates, drivers, security,
 * and hardware data via existing RPC methods.
 *
 * Uses:
 *   • system.info / system.comprehensive — OS and hardware data
 *   • dashboard.metrics — security and Windows info
 *   • dashboard.live — real-time CPU/memory metrics
 *
 * Caches expensive queries and throttles repeated scans.
 *
 * This module does NOT modify any existing service.
 */
import type {
  WindowsScanResult,
  WindowsSystemInfo,
  UpdateStatus,
  SecurityStatus,
  HardwareInfo,
  DriverInfo,
  PendingUpdate,
  CpuInfo,
  MemoryInfo,
  StorageDeviceInfo,
  GpuInfo,
  BatteryInfo,
} from './types';
import { daysSince, CACHE_TTL_MS, THROTTLE_INTERVAL_MS } from './types';
import { windowsEvents } from './windowsEvents';
import { getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import { RPC_METHODS } from '@avs/shared/rpc';

interface RawSystemInfo {
  os?: {
    edition?: string;
    version?: string;
    build?: string;
    release?: string;
    installDate?: string;
    activationStatus?: string;
    lastBootTime?: string;
    locale?: string;
    architecture?: string;
    deviceName?: string;
    manufacturer?: string;
    bios?: string;
    uefi?: boolean;
    secureBoot?: boolean;
    tpm?: string;
    bitLocker?: string;
    virtualization?: boolean;
  };
  cpu?: {
    name?: string;
    manufacturer?: string;
    cores?: number;
    logicalCores?: number;
    maxFrequency?: number;
  };
  memory?: {
    total?: number;
    used?: number;
    free?: number;
    slotsUsed?: number;
    slotsTotal?: number;
    speed?: number;
  };
  storage?: Array<{
    name?: string;
    type?: string;
    total?: number;
    free?: number;
    isSystem?: boolean;
    smart?: string;
  }>;
  gpus?: Array<{
    name?: string;
    manufacturer?: string;
    driverVersion?: string;
    vram?: number;
  }>;
  battery?: {
    present?: boolean;
    percent?: number;
    plugged?: boolean;
    cycleCount?: number;
    designCapacity?: number;
    fullChargeCapacity?: number;
  };
  drivers?: Array<{
    id?: string;
    deviceName?: string;
    deviceClass?: string;
    manufacturer?: string;
    version?: string;
    date?: string;
    status?: string;
    signed?: boolean;
    error?: string;
    enabled?: boolean;
  }>;
  updates?: {
    serviceEnabled?: boolean;
    lastUpdateDate?: string;
    pending?: Array<{ id?: string; title?: string; classification?: string; size?: number; isSecurity?: boolean; isRequired?: boolean }>;
    failed?: Array<{ id?: string; title?: string; classification?: string; size?: number; isSecurity?: boolean; isRequired?: boolean }>;
    restartRequired?: boolean;
    paused?: boolean;
    deliveryOptimization?: boolean;
  };
}

interface RawDashboardMetrics {
  windows?: {
    version?: string;
    build?: string;
    uptime?: number;
    secureBoot?: boolean;
    tpmStatus?: boolean;
    battery?: { percent?: number; powerPlugged?: boolean } | null;
  };
  security?: {
    defender?: { enabled?: boolean; realTimeProtection?: boolean; thirdPartyAV?: string | null };
    firewall?: { enabled?: boolean };
    updates?: { pendingUpdates?: number; lastUpdateDate?: string | null; serviceEnabled?: boolean };
    realTimeProtection?: boolean;
    smartScreen?: boolean;
  };
  cpu?: { usage?: number; name?: string; manufacturer?: string; cores?: number; processes?: number; frequency?: number };
  memory?: { total?: number; used?: number; usage?: number };
  storage?: Array<{ mount?: string; name?: string; total?: number; used?: number; free?: number; usage?: number; isSSD?: boolean; fileSystem?: string }>;
}

export class WindowsScanner {
  private _cache: WindowsScanResult | null = null;
  private _cacheTimestamp = 0;
  private _lastScanTime = 0;

  getCacheAge(): number {
    return Date.now() - this._cacheTimestamp;
  }

  isCacheValid(): boolean {
    return this._cache !== null && this.getCacheAge() < CACHE_TTL_MS;
  }

  shouldThrottle(): boolean {
    return Date.now() - this._lastScanTime < THROTTLE_INTERVAL_MS;
  }

  invalidateCache(): void {
    this._cache = null;
    this._cacheTimestamp = 0;
  }

  async scan(forceRefresh: boolean = false): Promise<WindowsScanResult> {
    const startTime = Date.now();

    if (!forceRefresh && this.isCacheValid()) {
      return { ...this._cache!, fromCache: true };
    }

    if (!forceRefresh && this.shouldThrottle()) {
      if (this._cache) return { ...this._cache, fromCache: true };
    }

    this._lastScanTime = Date.now();
    windowsEvents.emit('windows_scan_started', { timestamp: new Date().toISOString() });

    const errors: string[] = [];
    let systemInfo: WindowsSystemInfo | null = null;
    let updateStatus: UpdateStatus | null = null;
    let securityStatus: SecurityStatus | null = null;
    let hardwareInfo: HardwareInfo | null = null;
    let drivers: DriverInfo[] = [];

    if (!isRpcAvailable()) {
      errors.push('RPC bridge is unavailable (outside Electron?)');
    } else {
      const rpc = getRpcBridge();
      if (!rpc) {
        errors.push('RPC bridge is null');
      } else {
        try {
          const raw = await rpc.call(RPC_METHODS.SYSTEM_COMPREHENSIVE) as RawSystemInfo;
          if (raw.os) systemInfo = this._convertSystemInfo(raw.os);
          if (raw.updates) updateStatus = this._convertUpdateStatus(raw.updates);
          if (raw.drivers) drivers = raw.drivers.map((d) => this._convertDriver(d));
          if (raw.cpu || raw.memory || raw.storage || raw.gpus || raw.battery) {
            hardwareInfo = this._convertHardware(raw);
          }
          securityStatus = this._extractSecurity(raw);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Comprehensive scan failed: ${msg}`);
        }

        // Fallback: try dashboard metrics for security/Windows info
        if (!systemInfo || !securityStatus) {
          try {
            const dash = await rpc.call(RPC_METHODS.DASHBOARD_METRICS) as RawDashboardMetrics;
            if (!systemInfo && dash.windows) {
              systemInfo = this._convertSystemFromDashboard(dash.windows);
            }
            if (!securityStatus && dash.security) {
              securityStatus = this._convertSecurityFromDashboard(dash.security);
            }
            if (!hardwareInfo && (dash.cpu || dash.memory || dash.storage)) {
              hardwareInfo = this._convertHardwareFromDashboard(dash);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Dashboard metrics fallback failed: ${msg}`);
          }
        }
      }
    }

    const result: WindowsScanResult = {
      systemInfo,
      updateStatus,
      securityStatus,
      hardwareInfo,
      drivers,
      scannedAt: new Date().toISOString(),
      scanDurationMs: Date.now() - startTime,
      errors,
      fromCache: false,
    };

    this._cache = result;
    this._cacheTimestamp = Date.now();

    windowsEvents.emit('windows_scan_completed', { result });
    return result;
  }

  async checkUpdates(): Promise<UpdateStatus | null> {
    if (!isRpcAvailable()) return null;
    const rpc = getRpcBridge();
    if (!rpc) return null;

    try {
      const raw = await rpc.call(RPC_METHODS.SYSTEM_COMPREHENSIVE) as RawSystemInfo;
      if (raw.updates) {
        const status = this._convertUpdateStatus(raw.updates);
        windowsEvents.emit('windows_update_checked', { status });
        return status;
      }
    } catch (err) {
      console.error('[WindowsScanner] Update check failed:', err);
    }
    return null;
  }

  private _convertSystemInfo(os: NonNullable<RawSystemInfo['os']>): WindowsSystemInfo {
    return {
      edition: os.edition ?? 'Unknown',
      version: os.version ?? 'Unknown',
      buildNumber: os.build ?? 'Unknown',
      release: os.release ?? null,
      installDate: os.installDate ?? null,
      activationStatus: (os.activationStatus as WindowsSystemInfo['activationStatus']) ?? 'unknown',
      lastBootTime: os.lastBootTime ?? null,
      pendingRestart: false,
      systemLocale: os.locale ?? null,
      architecture: (os.architecture as WindowsSystemInfo['architecture']) ?? 'unknown',
      deviceName: os.deviceName ?? 'Unknown',
      systemManufacturer: os.manufacturer ?? null,
      biosVersion: os.bios ?? null,
      uefiStatus: os.uefi ?? false,
      secureBoot: os.secureBoot ?? false,
      tpmVersion: os.tpm ?? null,
      bitLockerStatus: (os.bitLocker as WindowsSystemInfo['bitLockerStatus']) ?? 'unknown',
      virtualizationSupport: os.virtualization ?? false,
    };
  }

  private _convertSystemFromDashboard(win: NonNullable<RawDashboardMetrics['windows']>): WindowsSystemInfo {
    return {
      edition: 'Windows',
      version: win.version ?? 'Unknown',
      buildNumber: win.build ?? 'Unknown',
      release: null,
      installDate: null,
      activationStatus: 'unknown',
      lastBootTime: null,
      pendingRestart: false,
      systemLocale: null,
      architecture: 'x64',
      deviceName: 'Unknown',
      systemManufacturer: null,
      biosVersion: null,
      uefiStatus: false,
      secureBoot: win.secureBoot ?? false,
      tpmVersion: win.tpmStatus ? '2.0' : null,
      bitLockerStatus: 'unknown',
      virtualizationSupport: false,
    };
  }

  private _convertUpdateStatus(updates: NonNullable<RawSystemInfo['updates']>): UpdateStatus {
    const pending = (updates.pending ?? []).map((u) => this._convertPendingUpdate(u));
    const failed = (updates.failed ?? []).map((u) => this._convertPendingUpdate(u));
    return {
      serviceEnabled: updates.serviceEnabled ?? true,
      lastUpdateDate: updates.lastUpdateDate ?? null,
      pendingUpdates: pending,
      failedUpdates: failed,
      securityUpdatesPending: pending.filter((u) => u.isSecurity).length,
      featureUpdatesPending: pending.filter((u) => u.classification === 'feature').length,
      optionalUpdatesPending: pending.filter((u) => u.classification === 'optional').length,
      restartRequired: updates.restartRequired ?? false,
      pausedUpdates: updates.paused ?? false,
      deliveryOptimizationEnabled: updates.deliveryOptimization ?? false,
      daysSinceLastUpdate: daysSince(updates.lastUpdateDate ?? null),
    };
  }

  private _convertPendingUpdate(u: NonNullable<NonNullable<RawSystemInfo['updates']>['pending']>[number]): PendingUpdate {
    return {
      id: u.id ?? 'unknown',
      title: u.title ?? 'Unknown Update',
      classification: (u.classification as PendingUpdate['classification']) ?? 'optional',
      sizeBytes: u.size ?? 0,
      isSecurity: u.isSecurity ?? false,
      isRequired: u.isRequired ?? false,
    };
  }

  private _convertDriver(d: NonNullable<RawSystemInfo['drivers']>[number]): DriverInfo {
    const status = (d.status as DriverInfo['status']) ?? 'ok';
    return {
      id: d.id ?? `driver-${Math.random().toString(36).slice(2)}`,
      deviceName: d.deviceName ?? 'Unknown Device',
      deviceClass: d.deviceClass ?? 'Unknown',
      manufacturer: d.manufacturer ?? null,
      driverVersion: d.version ?? null,
      driverDate: d.date ?? null,
      status,
      isSigned: d.signed ?? true,
      hasError: !!d.error,
      errorMessage: d.error ?? null,
      isEnabled: d.enabled ?? true,
    };
  }

  private _convertHardware(raw: RawSystemInfo): HardwareInfo {
    const cpu: CpuInfo = {
      name: raw.cpu?.name ?? 'Unknown CPU',
      manufacturer: raw.cpu?.manufacturer ?? 'Unknown',
      cores: raw.cpu?.cores ?? 0,
      logicalCores: raw.cpu?.logicalCores ?? 0,
      maxFrequency: raw.cpu?.maxFrequency ?? 0,
      currentUsage: 0,
    };

    const mem = raw.memory;
    const total = mem?.total ?? 0;
    const used = mem?.used ?? 0;
    const memory: MemoryInfo = {
      total,
      used,
      free: mem?.free ?? total - used,
      usage: total > 0 ? (used / total) * 100 : 0,
      slotsUsed: mem?.slotsUsed ?? null,
      slotsTotal: mem?.slotsTotal ?? null,
      speed: mem?.speed ?? null,
    };

    const storage: StorageDeviceInfo[] = (raw.storage ?? []).map((s, i) => {
      const totalSize = s.total ?? 0;
      const freeSpace = s.free ?? 0;
      return {
        id: `storage-${i}`,
        name: s.name ?? 'Unknown Drive',
        type: (s.type as StorageDeviceInfo['type']) ?? 'unknown',
        totalSize,
        freeSpace,
        usedSpace: totalSize - freeSpace,
        usage: totalSize > 0 ? ((totalSize - freeSpace) / totalSize) * 100 : 0,
        isSystemDrive: s.isSystem ?? false,
        smartStatus: (s.smart as StorageDeviceInfo['smartStatus']) ?? 'unknown',
      };
    });

    const gpus: GpuInfo[] = (raw.gpus ?? []).map((g) => ({
      name: g.name ?? 'Unknown GPU',
      manufacturer: g.manufacturer ?? 'Unknown',
      driverVersion: g.driverVersion ?? null,
      vram: g.vram ?? 0,
    }));

    const battery: BatteryInfo | null = raw.battery
      ? {
          present: raw.battery.present ?? false,
          percent: raw.battery.percent ?? 0,
          powerPlugged: raw.battery.plugged ?? false,
          cycleCount: raw.battery.cycleCount ?? null,
          health: this._computeBatteryHealth(raw.battery),
          designCapacity: raw.battery.designCapacity ?? null,
          fullChargeCapacity: raw.battery.fullChargeCapacity ?? null,
        }
      : null;

    const totalStorageTotal = storage.reduce((sum, s) => sum + s.totalSize, 0);
    const totalStorageFree = storage.reduce((sum, s) => sum + s.freeSpace, 0);

    return {
      cpu,
      memory,
      storage,
      gpus,
      battery,
      totalStorageFree,
      totalStorageUsed: totalStorageTotal - totalStorageFree,
      totalStorageTotal,
    };
  }

  private _convertHardwareFromDashboard(dash: RawDashboardMetrics): HardwareInfo {
    const cpu: CpuInfo = {
      name: dash.cpu?.name ?? 'Unknown CPU',
      manufacturer: dash.cpu?.manufacturer ?? 'Unknown',
      cores: dash.cpu?.cores ?? 0,
      logicalCores: 0,
      maxFrequency: dash.cpu?.frequency ?? 0,
      currentUsage: dash.cpu?.usage ?? 0,
    };

    const total = dash.memory?.total ?? 0;
    const used = dash.memory?.used ?? 0;
    const memory: MemoryInfo = {
      total,
      used,
      free: total - used,
      usage: dash.memory?.usage ?? 0,
      slotsUsed: null,
      slotsTotal: null,
      speed: null,
    };

    const storage: StorageDeviceInfo[] = (dash.storage ?? []).map((s, i) => ({
      id: `storage-${i}`,
      name: s.name ?? s.mount ?? 'Unknown Drive',
      type: s.isSSD ? 'ssd' : 'hdd',
      totalSize: s.total ?? 0,
      freeSpace: s.free ?? 0,
      usedSpace: s.used ?? 0,
      usage: s.usage ?? 0,
      isSystemDrive: i === 0,
      smartStatus: 'unknown',
    }));

    const battery: BatteryInfo | null = dash.windows?.battery
      ? {
          present: true,
          percent: dash.windows.battery.percent ?? 0,
          powerPlugged: dash.windows.battery.powerPlugged ?? false,
          cycleCount: null,
          health: 'unknown',
          designCapacity: null,
          fullChargeCapacity: null,
        }
      : null;

    const totalStorageTotal = storage.reduce((sum, s) => sum + s.totalSize, 0);
    const totalStorageFree = storage.reduce((sum, s) => sum + s.freeSpace, 0);

    return {
      cpu,
      memory,
      storage,
      gpus: [],
      battery,
      totalStorageFree,
      totalStorageUsed: totalStorageTotal - totalStorageFree,
      totalStorageTotal,
    };
  }

  private _extractSecurity(raw: RawSystemInfo): SecurityStatus | null {
    const os = raw.os;
    if (!os) return null;
    return {
      defenderEnabled: true,
      realTimeProtection: true,
      firewallEnabled: true,
      smartScreenEnabled: true,
      secureBootEnabled: os.secureBoot ?? false,
      tpmPresent: !!os.tpm,
      tpmVersion: os.tpm ?? null,
      coreIsolationEnabled: false,
      memoryIntegrityEnabled: false,
      ransomwareProtectionEnabled: false,
      virusDefinitionsUpdated: true,
      virusDefinitionsDate: null,
      thirdPartyAV: null,
      bitLockerStatus: (os.bitLocker as SecurityStatus['bitLockerStatus']) ?? 'unknown',
      uacEnabled: true,
    };
  }

  private _convertSecurityFromDashboard(sec: NonNullable<RawDashboardMetrics['security']>): SecurityStatus {
    return {
      defenderEnabled: sec.defender?.enabled ?? false,
      realTimeProtection: sec.defender?.realTimeProtection ?? sec.realTimeProtection ?? false,
      firewallEnabled: sec.firewall?.enabled ?? false,
      smartScreenEnabled: sec.smartScreen ?? false,
      secureBootEnabled: false,
      tpmPresent: false,
      tpmVersion: null,
      coreIsolationEnabled: false,
      memoryIntegrityEnabled: false,
      ransomwareProtectionEnabled: false,
      virusDefinitionsUpdated: true,
      virusDefinitionsDate: sec.updates?.lastUpdateDate ?? null,
      thirdPartyAV: sec.defender?.thirdPartyAV ?? null,
      bitLockerStatus: 'unknown',
      uacEnabled: true,
    };
  }

  private _computeBatteryHealth(battery: NonNullable<RawSystemInfo['battery']>): BatteryInfo['health'] {
    const design = battery.designCapacity;
    const full = battery.fullChargeCapacity;
    if (design && full && design > 0) {
      const ratio = full / design;
      if (ratio > 0.8) return 'good';
      if (ratio > 0.5) return 'fair';
      return 'poor';
    }
    if (battery.percent !== undefined) {
      if (battery.percent > 50) return 'good';
      if (battery.percent > 20) return 'fair';
      return 'poor';
    }
    return 'unknown';
  }
}

export const windowsScanner = new WindowsScanner();
