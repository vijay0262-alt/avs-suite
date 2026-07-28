/**
 * Windows Repository — in-memory store for Windows scan data.
 *
 * Provides querying, caching, and incremental refresh support.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  WindowsScanResult,
  WindowsSystemInfo,
  UpdateStatus,
  SecurityStatus,
  HardwareInfo,
  DriverInfo,
} from './types';

export class WindowsRepository {
  private _systemInfo: WindowsSystemInfo | null = null;
  private _updateStatus: UpdateStatus | null = null;
  private _securityStatus: SecurityStatus | null = null;
  private _hardwareInfo: HardwareInfo | null = null;
  private _drivers: DriverInfo[] = [];
  private _lastScanAt: string | null = null;
  private _errors: string[] = [];

  loadFromScanResult(result: WindowsScanResult): void {
    this._systemInfo = result.systemInfo;
    this._updateStatus = result.updateStatus;
    this._securityStatus = result.securityStatus;
    this._hardwareInfo = result.hardwareInfo;
    this._drivers = result.drivers;
    this._lastScanAt = result.scannedAt;
    this._errors = result.errors;
  }

  getSystemInfo(): WindowsSystemInfo | null {
    return this._systemInfo;
  }

  getUpdateStatus(): UpdateStatus | null {
    return this._updateStatus;
  }

  getSecurityStatus(): SecurityStatus | null {
    return this._securityStatus;
  }

  getHardwareInfo(): HardwareInfo | null {
    return this._hardwareInfo;
  }

  getDrivers(): DriverInfo[] {
    return [...this._drivers];
  }

  getDriverById(id: string): DriverInfo | null {
    return this._drivers.find((d) => d.id === id) ?? null;
  }

  getDriversByStatus(status: DriverInfo['status']): DriverInfo[] {
    return this._drivers.filter((d) => d.status === status);
  }

  getOutdatedDrivers(): DriverInfo[] {
    return this._drivers.filter((d) => d.status === 'outdated');
  }

  getErrorDrivers(): DriverInfo[] {
    return this._drivers.filter((d) => d.hasError);
  }

  getUnsignedDrivers(): DriverInfo[] {
    return this._drivers.filter((d) => !d.isSigned);
  }

  getDisabledDevices(): DriverInfo[] {
    return this._drivers.filter((d) => !d.isEnabled);
  }

  getUnknownDevices(): DriverInfo[] {
    return this._drivers.filter((d) => d.status === 'unknown');
  }

  getLastScanAt(): string | null {
    return this._lastScanAt;
  }

  getErrors(): string[] {
    return [...this._errors];
  }

  hasData(): boolean {
    return this._systemInfo !== null || this._hardwareInfo !== null;
  }

  clear(): void {
    this._systemInfo = null;
    this._updateStatus = null;
    this._securityStatus = null;
    this._hardwareInfo = null;
    this._drivers = [];
    this._lastScanAt = null;
    this._errors = [];
  }

  updatePartial(partial: Partial<WindowsScanResult>): void {
    if (partial.systemInfo !== undefined) this._systemInfo = partial.systemInfo;
    if (partial.updateStatus !== undefined) this._updateStatus = partial.updateStatus;
    if (partial.securityStatus !== undefined) this._securityStatus = partial.securityStatus;
    if (partial.hardwareInfo !== undefined) this._hardwareInfo = partial.hardwareInfo;
    if (partial.drivers !== undefined) this._drivers = partial.drivers;
    if (partial.scannedAt !== undefined) this._lastScanAt = partial.scannedAt;
    if (partial.errors !== undefined) this._errors = partial.errors;
  }
}

export const windowsRepository = new WindowsRepository();
