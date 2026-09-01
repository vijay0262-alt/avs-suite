/**
 * Tests for the App Freezer service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    APP_FREEZER_LIST_CANDIDATES: 'app_freezer.listCandidates',
    APP_FREEZER_LIST_FROZEN: 'app_freezer.listFrozen',
    APP_FREEZER_FREEZE: 'app_freezer.freeze',
    APP_FREEZER_UNFREEZE: 'app_freezer.unfreeze',
    APP_FREEZER_FREEZE_ALL: 'app_freezer.freezeAll',
    APP_FREEZER_UNFREEZE_ALL: 'app_freezer.unfreezeAll',
    APP_FREEZER_STATUS: 'app_freezer.status',
    APP_FREEZER_CONFIGURE: 'app_freezer.configure',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { appFreezerService } from '../appFreezer.service';

describe('appFreezerService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('lists candidates', async () => {
    mockCall.mockResolvedValue({
      candidates: [
        { pid: 1234, name: 'chrome.exe', exe: 'C:\\Program Files\\Chrome\\chrome.exe', memoryMB: 850.5, cpuPercent: 0.2, createTime: 1000000 },
        { pid: 5678, name: 'slack.exe', exe: 'C:\\Users\\test\\AppData\\Local\\Slack\\slack.exe', memoryMB: 420.0, cpuPercent: 0.1, createTime: 1000000 },
      ],
      count: 2,
      currentFrozen: 0,
      remainingSlots: 10,
      supported: true,
      enabled: true,
    });

    const result = await appFreezerService.listCandidates();
    expect(result.count).toBe(2);
    expect(result.candidates[0].name).toBe('chrome.exe');
    expect(result.candidates[0].memoryMB).toBe(850.5);
    expect(result.remainingSlots).toBe(10);
  });

  it('lists frozen processes', async () => {
    mockCall.mockResolvedValue({
      frozen: [
        { pid: 1234, name: 'chrome.exe', exe: 'C:\\Program Files\\Chrome\\chrome.exe', memoryMBAtFreeze: 850.5, frozenAt: '2024-06-01T12:00:00', currentMemoryMB: 120.0 },
      ],
      count: 1,
      supported: true,
    });

    const result = await appFreezerService.listFrozen();
    expect(result.count).toBe(1);
    expect(result.frozen[0].name).toBe('chrome.exe');
    expect(result.frozen[0].memoryMBAtFreeze).toBe(850.5);
  });

  it('freezes a process', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "Froze 'chrome.exe' (PID 1234)",
      process: {
        pid: 1234,
        name: 'chrome.exe',
        exe: 'C:\\Program Files\\Chrome\\chrome.exe',
        memoryMBAtFreeze: 850.5,
        frozenAt: '2024-06-01T12:00:00',
      },
      totalFrozen: 1,
    });

    const result = await appFreezerService.freeze(1234);
    expect(result.success).toBe(true);
    expect(result.process?.name).toBe('chrome.exe');
    expect(result.totalFrozen).toBe(1);
    expect(mockCall).toHaveBeenCalledWith('app_freezer.freeze', { pid: 1234 });
  });

  it('unfreezes a process', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "Unfroze 'chrome.exe' (PID 1234)",
      process: {
        pid: 1234,
        name: 'chrome.exe',
        memoryMBAtFreeze: 850.5,
        frozenAt: '2024-06-01T12:00:00',
      },
      currentMemoryMB: 800.0,
      totalFrozen: 0,
    });

    const result = await appFreezerService.unfreeze(1234);
    expect(result.success).toBe(true);
    expect(result.totalFrozen).toBe(0);
    expect(mockCall).toHaveBeenCalledWith('app_freezer.unfreeze', { pid: 1234 });
  });

  it('freezes all candidates', async () => {
    mockCall.mockResolvedValue({
      success: true,
      frozenCount: 3,
      failedCount: 0,
      totalMemoryMB: 1500.0,
      totalFrozen: 3,
      message: 'Froze 3 process(es), 0 failed',
    });

    const result = await appFreezerService.freezeAll();
    expect(result.success).toBe(true);
    expect(result.frozenCount).toBe(3);
    expect(result.totalMemoryMB).toBe(1500.0);
  });

  it('unfreezes all', async () => {
    mockCall.mockResolvedValue({
      success: true,
      unfrozenCount: 3,
      failedCount: 0,
      totalFrozen: 0,
      message: 'Unfroze 3 process(es), 0 failed',
    });

    const result = await appFreezerService.unfreezeAll();
    expect(result.success).toBe(true);
    expect(result.unfrozenCount).toBe(3);
  });

  it('gets status', async () => {
    mockCall.mockResolvedValue({
      enabled: true,
      autoFreeze: false,
      frozenCount: 2,
      totalFrozenMemoryMB: 1200.0,
      maxFrozen: 10,
      config: {
        enabled: true,
        autoFreeze: false,
        idleThresholdSeconds: 300,
        minMemoryMB: 100,
        maxFrozen: 10,
        protectedProcesses: ['explorer.exe', 'svchost.exe'],
      },
      stats: {
        totalFrozen: 15,
        totalUnfrozen: 13,
        totalBytesFreed: 5000000000,
      },
      supported: true,
    });

    const result = await appFreezerService.getStatus();
    expect(result.frozenCount).toBe(2);
    expect(result.totalFrozenMemoryMB).toBe(1200.0);
    expect(result.config.maxFrozen).toBe(10);
    expect(result.stats.totalFrozen).toBe(15);
  });

  it('configures app freezer', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        autoFreeze: true,
        idleThresholdSeconds: 600,
        minMemoryMB: 200,
        maxFrozen: 15,
        protectedProcesses: ['explorer.exe', 'svchost.exe', 'myapp.exe'],
      },
      message: 'App freezer configuration updated',
    });

    const result = await appFreezerService.configure({ autoFreeze: true, minMemoryMB: 200 });
    expect(result.success).toBe(true);
    expect(result.config.autoFreeze).toBe(true);
    expect(result.config.minMemoryMB).toBe(200);
  });

  it('handles freeze failure (protected process)', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: "Process 'explorer.exe' is protected and cannot be frozen",
    });

    const result = await appFreezerService.freeze(999);
    expect(result.success).toBe(false);
  });

  it('handles freeze failure (already frozen)', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Process is already frozen',
    });

    const result = await appFreezerService.freeze(1234);
    expect(result.success).toBe(false);
  });

  it('handles empty candidates list', async () => {
    mockCall.mockResolvedValue({
      candidates: [],
      count: 0,
      currentFrozen: 0,
      remainingSlots: 10,
      supported: true,
      enabled: true,
    });

    const result = await appFreezerService.listCandidates();
    expect(result.count).toBe(0);
    expect(result.candidates).toHaveLength(0);
  });

  it('handles unfreeze of non-frozen process', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Process is not frozen',
    });

    const result = await appFreezerService.unfreeze(9999);
    expect(result.success).toBe(false);
  });
});
