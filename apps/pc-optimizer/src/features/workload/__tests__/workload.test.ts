/**
 * Tests for the Workload Detection service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    WORKLOAD_DETECT: 'workload.detect',
    WORKLOAD_STATUS: 'workload.status',
    WORKLOAD_CONFIGURE: 'workload.configure',
    WORKLOAD_SET_MODE: 'workload.setMode',
    WORKLOAD_HISTORY: 'workload.history',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { workloadService } from '../workload.service';

describe('workloadService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('detects gaming workload', async () => {
    mockCall.mockResolvedValue({
      mode: 'gaming',
      confidence: 0.85,
      matchedProcesses: [
        { name: 'csgo.exe', cpu: 45.2, memoryMB: 1200 },
        { name: 'steam.exe', cpu: 2.1, memoryMB: 350 },
      ],
      categoryScores: { gaming: 8.5, browsing: 1.2 },
      profile: {
        label: 'Gaming Mode',
        description: 'Maximum performance for gaming.',
        actions: ['suspend_scans', 'free_ram', 'high_performance_power'],
        icon: 'game',
        color: 'danger',
      },
      detectedAt: '2024-06-01T12:00:00',
      supported: true,
      manualOverride: false,
    });

    const result = await workloadService.detect();
    expect(result.mode).toBe('gaming');
    expect(result.confidence).toBe(0.85);
    expect(result.matchedProcesses).toHaveLength(2);
    expect(result.profile.label).toBe('Gaming Mode');
  });

  it('detects coding workload', async () => {
    mockCall.mockResolvedValue({
      mode: 'coding',
      confidence: 0.72,
      matchedProcesses: [
        { name: 'code.exe', cpu: 5.2, memoryMB: 450 },
        { name: 'node.exe', cpu: 12.0, memoryMB: 200 },
      ],
      categoryScores: { coding: 5.2, browsing: 2.1 },
      profile: {
        label: 'Coding Mode',
        description: 'Balanced for development work.',
        actions: ['moderate_ram_optimize'],
        icon: 'code',
        color: 'primary',
      },
      detectedAt: '2024-06-01T12:00:00',
      supported: true,
      manualOverride: false,
    });

    const result = await workloadService.detect();
    expect(result.mode).toBe('coding');
    expect(result.matchedProcesses[0].name).toBe('code.exe');
  });

  it('detects idle workload', async () => {
    mockCall.mockResolvedValue({
      mode: 'idle',
      confidence: 1.0,
      matchedProcesses: [],
      categoryScores: {},
      profile: {
        label: 'Idle Mode',
        description: 'System is idle.',
        actions: ['enable_auto_care'],
        icon: 'moon',
        color: 'neutral',
      },
      detectedAt: '2024-06-01T12:00:00',
      supported: true,
      manualOverride: false,
    });

    const result = await workloadService.detect();
    expect(result.mode).toBe('idle');
    expect(result.matchedProcesses).toHaveLength(0);
  });

  it('gets status', async () => {
    mockCall.mockResolvedValue({
      currentMode: 'browsing',
      currentConfidence: 0.65,
      detectedAt: '2024-06-01T12:00:00',
      detectedProcesses: [{ name: 'chrome.exe', cpu: 8.0, memoryMB: 800 }],
      profile: {
        label: 'Browsing Mode',
        description: 'Light optimization.',
        actions: ['light_cleanup'],
        icon: 'globe',
        color: 'primary',
      },
      config: {
        enabled: true,
        autoOptimize: false,
        manualOverride: null,
        checkIntervalSeconds: 30,
        minConfidence: 0.5,
      },
      supported: true,
    });

    const result = await workloadService.getStatus();
    expect(result.currentMode).toBe('browsing');
    expect(result.config.enabled).toBe(true);
  });

  it('configures workload detection', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        autoOptimize: true,
        manualOverride: null,
        checkIntervalSeconds: 30,
        minConfidence: 0.5,
      },
      message: 'Workload detection configuration updated',
    });

    const result = await workloadService.configure({ autoOptimize: true });
    expect(result.success).toBe(true);
    expect(result.config.autoOptimize).toBe(true);
  });

  it('sets manual mode override', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Mode set to gaming',
      config: {
        enabled: true,
        autoOptimize: false,
        manualOverride: 'gaming',
        checkIntervalSeconds: 30,
        minConfidence: 0.5,
      },
      profile: {
        label: 'Gaming Mode',
        description: 'Maximum performance.',
        actions: ['suspend_scans', 'free_ram'],
        icon: 'game',
        color: 'danger',
      },
    });

    const result = await workloadService.setMode('gaming');
    expect(result.success).toBe(true);
    expect(result.config?.manualOverride).toBe('gaming');
  });

  it('clears manual override', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Manual override cleared, auto-detection active',
      config: {
        enabled: true,
        autoOptimize: false,
        manualOverride: null,
        checkIntervalSeconds: 30,
        minConfidence: 0.5,
      },
    });

    const result = await workloadService.setMode(null);
    expect(result.success).toBe(true);
    expect(result.config?.manualOverride).toBeNull();
  });

  it('gets history', async () => {
    mockCall.mockResolvedValue({
      entries: [
        { timestamp: '2024-06-01T12:00:00', mode: 'gaming', confidence: 0.85, matchedCount: 2, manualOverride: false },
        { timestamp: '2024-06-01T12:30:00', mode: 'coding', confidence: 0.72, matchedCount: 3, manualOverride: false },
      ],
      count: 2,
      supported: true,
    });

    const result = await workloadService.getHistory(30);
    expect(result.count).toBe(2);
    expect(result.entries[0].mode).toBe('gaming');
  });

  it('handles mixed workload', async () => {
    mockCall.mockResolvedValue({
      mode: 'mixed',
      confidence: 0.78,
      matchedProcesses: [
        { name: 'chrome.exe', cpu: 8.0, memoryMB: 800 },
        { name: 'code.exe', cpu: 5.0, memoryMB: 450 },
      ],
      categoryScores: { browsing: 4.2, coding: 3.8 },
      profile: {
        label: 'Mixed Mode',
        description: 'Multiple categories active.',
        actions: ['balanced_optimize'],
        icon: 'sparkles',
        color: 'warning',
      },
      detectedAt: '2024-06-01T12:00:00',
      supported: true,
      manualOverride: false,
    });

    const result = await workloadService.detect();
    expect(result.mode).toBe('mixed');
    expect(result.matchedProcesses).toHaveLength(2);
  });
});
