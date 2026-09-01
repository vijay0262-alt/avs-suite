/**
 * Tests for the Disk Optimizer service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    DISK_OPTIMIZER_LIST_DRIVES: 'disk_optimizer.listDrives',
    DISK_OPTIMIZER_ANALYZE: 'disk_optimizer.analyze',
    DISK_OPTIMIZER_OPTIMIZE: 'disk_optimizer.optimize',
    DISK_OPTIMIZER_STATUS: 'disk_optimizer.status',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { diskOptimizerService } from '../diskOptimizer.service';

describe('diskOptimizerService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('lists drives with type info', async () => {
    mockCall.mockResolvedValue({
      drives: [
        {
          device: 'C:',
          mountpoint: 'C:\\',
          fstype: 'NTFS',
          total: 500107862016,
          used: 250053931008,
          free: 250053931008,
          percent: 50,
          driveType: 'SSD',
          isSSD: true,
          needsOptimization: false,
        },
        {
          device: 'D:',
          mountpoint: 'D:\\',
          fstype: 'NTFS',
          total: 1000204886016,
          used: 400000000000,
          free: 6000204886016,
          percent: 40,
          driveType: 'HDD',
          isSSD: false,
          needsOptimization: false,
        },
      ],
      count: 2,
      supported: true,
    });

    const result = await diskOptimizerService.listDrives();
    expect(result.count).toBe(2);
    expect(result.drives[0].isSSD).toBe(true);
    expect(result.drives[1].driveType).toBe('HDD');
  });

  it('analyzes a drive', async () => {
    mockCall.mockResolvedValue({
      drive: 'C:',
      driveType: 'HDD',
      fragmentationPercent: 15.5,
      needsOptimization: true,
      analyzedAt: '2024-06-01T12:00:00',
    });

    const result = await diskOptimizerService.analyzeDrive('C');
    expect(result.drive).toBe('C:');
    expect(result.fragmentationPercent).toBe(15.5);
    expect(result.needsOptimization).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('disk_optimizer.analyze', { drive: 'C' });
  });

  it('optimizes a drive', async () => {
    mockCall.mockResolvedValue({
      started: true,
      drive: 'C:',
      driveType: 'SSD',
      action: 'TRIM',
      message: 'Optimization started for C:',
    });

    const result = await diskOptimizerService.optimizeDrive('C', 'SSD');
    expect(result.started).toBe(true);
    expect(result.action).toBe('TRIM');
    expect(mockCall).toHaveBeenCalledWith('disk_optimizer.optimize', { drive: 'C', driveType: 'SSD' });
  });

  it('gets optimization status', async () => {
    mockCall.mockResolvedValue({
      running: false,
      drive: null,
      progress: 0,
      message: 'Idle',
      startedAt: null,
      completedAt: null,
      result: null,
    });

    const result = await diskOptimizerService.getStatus();
    expect(result.running).toBe(false);
    expect(result.message).toBe('Idle');
  });

  it('gets running optimization status', async () => {
    mockCall.mockResolvedValue({
      running: true,
      drive: 'C:',
      progress: 50,
      message: 'Defragmenting C:...',
      startedAt: '2024-06-01T12:00:00',
      completedAt: null,
      result: null,
    });

    const result = await diskOptimizerService.getStatus();
    expect(result.running).toBe(true);
    expect(result.progress).toBe(50);
  });

  it('handles analysis error', async () => {
    mockCall.mockResolvedValue({
      error: 'Only available on Windows',
    });

    const result = await diskOptimizerService.analyzeDrive('C');
    expect(result.error).toBe('Only available on Windows');
  });
});
