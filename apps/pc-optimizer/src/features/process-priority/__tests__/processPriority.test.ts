/**
 * Tests for the Process Priority service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    PROC_PRIORITY_GET_STATUS: 'process_priority.getStatus',
    PROC_PRIORITY_LIST_PROCESSES: 'process_priority.listProcesses',
    PROC_PRIORITY_SET_MODE: 'process_priority.setMode',
    PROC_PRIORITY_APPLY_MODE: 'process_priority.applyMode',
    PROC_PRIORITY_SET_PRIORITY: 'process_priority.setPriority',
    PROC_PRIORITY_SET_AFFINITY: 'process_priority.setAffinity',
    PROC_PRIORITY_RESET_ALL: 'process_priority.resetAll',
    PROC_PRIORITY_CONFIGURE: 'process_priority.configure',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { processPriorityService } from '../processPriority.service';

describe('processPriorityService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('gets status', async () => {
    mockCall.mockResolvedValue({
      enabled: true,
      currentMode: 'game',
      modeLabel: 'Game Mode',
      modeDescription: 'Boost games, lower background tasks',
      autoDetect: true,
      applyAffinity: false,
      availableModes: [
        { id: 'balanced', label: 'Balanced', description: 'Default Windows priorities' },
        { id: 'game', label: 'Game Mode', description: 'Boost games, lower background tasks' },
        { id: 'work', label: 'Work Mode', description: 'Boost productivity apps' },
        { id: 'creative', label: 'Creative Mode', description: 'Boost creative tools' },
        { id: 'battery', label: 'Battery Saver', description: 'Lower all non-essential processes' },
      ],
      stats: {
        totalAdjustments: 25,
        totalBoosted: 10,
        totalLowered: 15,
        totalResets: 3,
      },
      adjustedCount: 5,
      supported: true,
    });

    const result = await processPriorityService.getStatus();
    expect(result.currentMode).toBe('game');
    expect(result.modeLabel).toBe('Game Mode');
    expect(result.availableModes).toHaveLength(5);
    expect(result.stats.totalBoosted).toBe(10);
  });

  it('lists processes', async () => {
    mockCall.mockResolvedValue({
      processes: [
        { pid: 1234, name: 'chrome.exe', cpuPercent: 45.2, memoryMB: 850.0, priority: 0x20, priorityLabel: 'Normal', classification: 'lower' },
        { pid: 5678, name: 'game.exe', cpuPercent: 80.5, memoryMB: 1200.0, priority: 0x20, priorityLabel: 'Normal', classification: 'boost' },
        { pid: 9012, name: 'explorer.exe', cpuPercent: 1.0, memoryMB: 120.0, priority: 0x20, priorityLabel: 'Normal', classification: 'protected' },
      ],
      count: 3,
      totalCount: 3,
      currentMode: 'game',
      supported: true,
    });

    const result = await processPriorityService.listProcesses({ limit: 50, sortBy: 'cpu' });
    expect(result.count).toBe(3);
    expect(result.processes[0].name).toBe('chrome.exe');
    expect(result.processes[1].classification).toBe('boost');
  });

  it('sets mode', async () => {
    mockCall.mockResolvedValue({
      success: true,
      mode: 'game',
      label: 'Game Mode',
      description: 'Boost games, lower background tasks',
      message: 'Mode set to Game Mode',
    });

    const result = await processPriorityService.setMode('game');
    expect(result.success).toBe(true);
    expect(result.mode).toBe('game');
    expect(mockCall).toHaveBeenCalledWith('process_priority.setMode', { mode: 'game' });
  });

  it('applies mode adjustments', async () => {
    mockCall.mockResolvedValue({
      success: true,
      boostedCount: 3,
      loweredCount: 5,
      failedCount: 1,
      mode: 'game',
      message: 'Applied Game Mode: 3 boosted, 5 lowered, 1 failed',
    });

    const result = await processPriorityService.applyMode();
    expect(result.success).toBe(true);
    expect(result.boostedCount).toBe(3);
    expect(result.loweredCount).toBe(5);
  });

  it('sets priority for a process', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "Set 'chrome.exe' (PID 1234) to Above Normal",
      pid: 1234,
      name: 'chrome.exe',
      priority: 'above_normal',
    });

    const result = await processPriorityService.setPriority(1234, 'above_normal');
    expect(result.success).toBe(true);
    expect(result.priority).toBe('above_normal');
    expect(mockCall).toHaveBeenCalledWith('process_priority.setPriority', { pid: 1234, priority: 'above_normal' });
  });

  it('sets affinity for a process', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "Set CPU affinity for 'game.exe' (PID 5678)",
      pid: 5678,
      name: 'game.exe',
      affinity: 15,
    });

    const result = await processPriorityService.setAffinity(5678, 15);
    expect(result.success).toBe(true);
    expect(result.name).toBe('game.exe');
  });

  it('resets all adjusted processes', async () => {
    mockCall.mockResolvedValue({
      success: true,
      resetCount: 8,
      failedCount: 1,
      message: 'Reset 8 process(es) to normal, 1 failed',
    });

    const result = await processPriorityService.resetAll();
    expect(result.success).toBe(true);
    expect(result.resetCount).toBe(8);
  });

  it('configures process priority', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        currentMode: 'work',
        autoDetect: false,
        applyAffinity: true,
        protectedProcesses: ['explorer.exe', 'svchost.exe'],
      },
      message: 'Process priority configuration updated',
    });

    const result = await processPriorityService.configure({ autoDetect: false });
    expect(result.success).toBe(true);
  });

  it('handles balanced mode (no adjustments)', async () => {
    mockCall.mockResolvedValue({
      success: true,
      boostedCount: 0,
      loweredCount: 0,
      failedCount: 0,
      mode: 'balanced',
      message: 'Balanced mode — no adjustments needed',
    });

    const result = await processPriorityService.applyMode();
    expect(result.success).toBe(true);
    expect(result.boostedCount).toBe(0);
  });

  it('handles set priority on protected process', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: "Process 'explorer.exe' is protected",
    });

    const result = await processPriorityService.setPriority(999, 'high');
    expect(result.success).toBe(false);
  });

  it('handles set priority with realtime (blocked)', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Realtime priority is blocked for safety',
    });

    const result = await processPriorityService.setPriority(1234, 'realtime');
    expect(result.success).toBe(false);
  });

  it('handles empty process list', async () => {
    mockCall.mockResolvedValue({
      processes: [],
      count: 0,
      totalCount: 0,
      currentMode: 'balanced',
      supported: true,
    });

    const result = await processPriorityService.listProcesses();
    expect(result.count).toBe(0);
    expect(result.processes).toHaveLength(0);
  });

  it('handles unsupported platform', async () => {
    mockCall.mockResolvedValue({
      enabled: true,
      currentMode: 'balanced',
      modeLabel: 'Balanced',
      modeDescription: 'Default Windows priorities',
      autoDetect: true,
      applyAffinity: false,
      availableModes: [],
      stats: { totalAdjustments: 0, totalBoosted: 0, totalLowered: 0, totalResets: 0 },
      adjustedCount: 0,
      supported: false,
    });

    const result = await processPriorityService.getStatus();
    expect(result.supported).toBe(false);
  });
});
