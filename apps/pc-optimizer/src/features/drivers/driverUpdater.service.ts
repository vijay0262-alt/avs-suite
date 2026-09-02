/**
 * Driver Updater service — wraps the backend drivers.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface OutdatedDriver {
  DeviceName: string;
  DeviceClass: string;
  Manufacturer: string;
  DriverVersion: string;
  DriverDate: string | null;
  ProviderName: string;
  IsSigned: boolean;
  daysOld: number;
  reasons: string[];
  severity: 'high' | 'medium';
}

export interface AvailableUpdate {
  Title: string;
  DriverVerDate: string | null;
  DriverClass: string;
  DriverManufacturer: string;
  DriverModel: string;
  DriverProvider: string;
}

export interface ScanOutdatedResult {
  outdated: OutdatedDriver[];
  outdatedCount: number;
  updatesAvailable: AvailableUpdate[];
  updatesAvailableCount: number;
  scannedAt: string;
}

export interface DriverUpdateResult {
  success: boolean;
  message: string;
}

export interface ManufacturerInfo {
  name: string;
  url: string;
  autoDetect: string | null;
}

export interface DownloadLink {
  deviceName: string;
  manufacturer: string;
  category: string;
  driverVersion: string;
  driverDate: string;
  downloadUrl: string;
  autoDetectUrl: string | null;
}

export const driverUpdaterService = {
  async scanOutdated(): Promise<ScanOutdatedResult> {
    return client().call(RPC_METHODS.DRIVERS_SCAN_OUTDATED);
  },

  async updateDriver(updateTitle: string): Promise<DriverUpdateResult> {
    return client().call(RPC_METHODS.DRIVERS_UPDATE, { updateTitle });
  },

  async getSummary(): Promise<{
    total: number;
    signed: number;
    unsigned: number;
    outdated: number;
  }> {
    return client().call(RPC_METHODS.DRIVERS_SUMMARY);
  },

  async getManufacturers(): Promise<{ manufacturers: ManufacturerInfo[]; count: number }> {
    return client().call(RPC_METHODS.DRIVERS_MANUFACTURERS);
  },

  async getDownloadLinks(): Promise<{ supported: boolean; links: DownloadLink[]; totalDrivers: number; uniqueManufacturers: number }> {
    return client().call(RPC_METHODS.DRIVERS_DOWNLOAD_LINKS);
  },
};
