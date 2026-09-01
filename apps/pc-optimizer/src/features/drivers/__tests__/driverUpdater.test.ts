/**
 * Tests for the Driver Updater service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    DRIVERS_LIST: 'drivers.list',
    DRIVERS_SUMMARY: 'drivers.summary',
    DRIVERS_SCAN_OUTDATED: 'drivers.scanOutdated',
    DRIVERS_UPDATE: 'drivers.update',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { driverUpdaterService } from '../driverUpdater.service';

describe('driverUpdaterService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('scans for outdated drivers', async () => {
    const mockResult = {
      outdated: [
        {
          DeviceName: 'NVIDIA GeForce RTX 3080',
          DeviceClass: 'Display',
          Manufacturer: 'NVIDIA',
          DriverVersion: '31.0.15.169',
          DriverDate: '2022-01-15',
          ProviderName: 'NVIDIA',
          IsSigned: true,
          daysOld: 800,
          reasons: ['Driver is 800 days old (over 2 years)'],
          severity: 'medium',
        },
      ],
      outdatedCount: 1,
      updatesAvailable: [
        {
          Title: 'NVIDIA - Display - 31.0.15.169',
          DriverVerDate: '2024-01-15',
          DriverClass: 'Display',
          DriverManufacturer: 'NVIDIA',
          DriverModel: 'RTX 3080',
          DriverProvider: 'NVIDIA',
        },
      ],
      updatesAvailableCount: 1,
      scannedAt: '2024-06-01T12:00:00',
    };
    mockCall.mockResolvedValue(mockResult);

    const result = await driverUpdaterService.scanOutdated();
    expect(result.outdatedCount).toBe(1);
    expect(result.updatesAvailableCount).toBe(1);
    expect(result.outdated[0].DeviceName).toBe('NVIDIA GeForce RTX 3080');
  });

  it('updates a driver', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Driver update installed: NVIDIA - Display - 31.0.15.169',
    });

    const result = await driverUpdaterService.updateDriver('NVIDIA - Display - 31.0.15.169');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('drivers.update', {
      updateTitle: 'NVIDIA - Display - 31.0.15.169',
    });
  });

  it('gets driver summary', async () => {
    mockCall.mockResolvedValue({
      total: 150,
      signed: 148,
      unsigned: 2,
      outdated: 5,
    });

    const result = await driverUpdaterService.getSummary();
    expect(result.total).toBe(150);
    expect(result.outdated).toBe(5);
  });

  it('handles scan with no outdated drivers', async () => {
    mockCall.mockResolvedValue({
      outdated: [],
      outdatedCount: 0,
      updatesAvailable: [],
      updatesAvailableCount: 0,
      scannedAt: '2024-06-01T12:00:00',
    });

    const result = await driverUpdaterService.scanOutdated();
    expect(result.outdatedCount).toBe(0);
    expect(result.updatesAvailableCount).toBe(0);
  });

  it('handles update failure', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Update not found',
    });

    const result = await driverUpdaterService.updateDriver('Nonexistent Update');
    expect(result.success).toBe(false);
  });
});
