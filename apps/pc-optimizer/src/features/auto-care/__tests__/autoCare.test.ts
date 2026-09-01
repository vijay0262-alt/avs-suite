/**
 * Tests for the AI Auto-Care service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    AUTO_CARE_STATUS: 'auto_care.status',
    AUTO_CARE_CONFIGURE: 'auto_care.configure',
    AUTO_CARE_GET_LOG: 'auto_care.getActivityLog',
    AUTO_CARE_RUN_NOW: 'auto_care.runNow',
    AUTO_CARE_CLEAR_LOG: 'auto_care.clearLog',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { autoCareService } from '../autoCare.service';

describe('autoCareService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('gets status', async () => {
    mockCall.mockResolvedValue({
      config: {
        enabled: true,
        idleThresholdSeconds: 300,
        checkIntervalSeconds: 60,
        tasks: { junkClean: true, memoryOptimize: true, tempClean: false },
        minCpuUsage: 10,
      },
      running: true,
      currentIdleSeconds: 45,
      lastRunAt: '2024-06-01T12:00:00',
      nextCheckAt: '2024-06-01T12:01:00',
      supported: true,
    });

    const result = await autoCareService.getStatus();
    expect(result.config.enabled).toBe(true);
    expect(result.running).toBe(true);
    expect(result.currentIdleSeconds).toBe(45);
    expect(result.config.tasks.junkClean).toBe(true);
  });

  it('configures auto-care', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        idleThresholdSeconds: 600,
        checkIntervalSeconds: 60,
        tasks: { junkClean: true, memoryOptimize: true, tempClean: true },
        minCpuUsage: 10,
      },
      running: true,
      message: 'Auto-Care configuration updated',
    });

    const result = await autoCareService.configure({ enabled: true, idleThresholdSeconds: 600 });
    expect(result.success).toBe(true);
    expect(result.config.idleThresholdSeconds).toBe(600);
    expect(mockCall).toHaveBeenCalledWith('auto_care.configure', { enabled: true, idleThresholdSeconds: 600 });
  });

  it('gets activity log', async () => {
    mockCall.mockResolvedValue({
      entries: [
        {
          id: 'autocare_1',
          timestamp: '2024-06-01T12:00:00',
          trigger: 'idle',
          tasks: [
            { task: 'junkClean', success: true, details: 'Cleaned 50 items', itemsCleaned: 50, bytesFreed: 1024000 },
            { task: 'memoryOptimize', success: true, details: 'Trimmed 20 processes' },
          ],
          totalBytesFreed: 1024000,
          totalItemsCleaned: 50,
          success: true,
          idleSeconds: 320,
        },
      ],
      count: 1,
      supported: true,
    });

    const result = await autoCareService.getActivityLog(50);
    expect(result.count).toBe(1);
    expect(result.entries[0].trigger).toBe('idle');
    expect(result.entries[0].totalBytesFreed).toBe(1024000);
  });

  it('runs auto-care now', async () => {
    mockCall.mockResolvedValue({
      success: true,
      tasks: [
        { task: 'junkClean', success: true, details: 'Cleaned 30 items', itemsCleaned: 30, bytesFreed: 500000 },
        { task: 'memoryOptimize', success: true, details: 'Trimmed 15 processes' },
        { task: 'tempClean', success: true, details: 'Cleaned 10 items', itemsCleaned: 10, bytesFreed: 200000 },
      ],
      totalBytesFreed: 700000,
      totalItemsCleaned: 40,
      logEntry: {
        id: 'autocare_2',
        timestamp: '2024-06-01T12:30:00',
        trigger: 'manual',
        tasks: [],
        totalBytesFreed: 700000,
        totalItemsCleaned: 40,
        success: true,
        idleSeconds: 0,
      },
    });

    const result = await autoCareService.runNow();
    expect(result.success).toBe(true);
    expect(result.totalBytesFreed).toBe(700000);
    expect(result.tasks).toHaveLength(3);
  });

  it('clears log', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Activity log cleared',
    });

    const result = await autoCareService.clearLog();
    expect(result.success).toBe(true);
  });

  it('handles disabled auto-care', async () => {
    mockCall.mockResolvedValue({
      config: {
        enabled: false,
        idleThresholdSeconds: 300,
        checkIntervalSeconds: 60,
        tasks: { junkClean: true, memoryOptimize: true, tempClean: true },
        minCpuUsage: 10,
      },
      running: false,
      currentIdleSeconds: 0,
      lastRunAt: null,
      nextCheckAt: null,
      supported: true,
    });

    const result = await autoCareService.getStatus();
    expect(result.config.enabled).toBe(false);
    expect(result.running).toBe(false);
  });

  it('handles empty activity log', async () => {
    mockCall.mockResolvedValue({
      entries: [],
      count: 0,
      supported: true,
    });

    const result = await autoCareService.getActivityLog();
    expect(result.count).toBe(0);
    expect(result.entries).toHaveLength(0);
  });

  it('handles run now with partial failures', async () => {
    mockCall.mockResolvedValue({
      success: false,
      tasks: [
        { task: 'junkClean', success: true, details: 'Cleaned 5 items', itemsCleaned: 5, bytesFreed: 10000 },
        { task: 'memoryOptimize', success: false, details: 'Access denied' },
      ],
      totalBytesFreed: 10000,
      totalItemsCleaned: 5,
      logEntry: {
        id: 'autocare_3',
        timestamp: '2024-06-01T13:00:00',
        trigger: 'manual',
        tasks: [],
        totalBytesFreed: 10000,
        totalItemsCleaned: 5,
        success: false,
        idleSeconds: 0,
      },
    });

    const result = await autoCareService.runNow();
    expect(result.success).toBe(false);
    expect(result.tasks[1].success).toBe(false);
  });
});
