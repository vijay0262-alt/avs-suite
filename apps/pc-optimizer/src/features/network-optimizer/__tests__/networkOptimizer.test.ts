/**
 * Tests for the Network Optimizer service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    NETWORK_OPT_ANALYZE: 'network_opt.analyze',
    NETWORK_OPT_OPTIMIZE: 'network_opt.optimize',
    NETWORK_OPT_REVERT: 'network_opt.revert',
    NETWORK_OPT_STATUS: 'network_opt.status',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { networkOptimizerService } from '../networkOptimizer.service';

describe('networkOptimizerService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('analyzes network settings', async () => {
    mockCall.mockResolvedValue({
      supported: true,
      currentSettings: [
        {
          name: 'TcpAckFrequency',
          description: 'Send TCP ACKs immediately',
          category: 'latency',
          currentValue: 2,
          recommendedValue: 1,
          defaultValue: 2,
          needsOptimization: true,
          regPath: 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters',
        },
        {
          name: 'TCPNoDelay',
          description: 'Disable Nagle algorithm',
          category: 'latency',
          currentValue: 1,
          recommendedValue: 1,
          defaultValue: 0,
          needsOptimization: false,
          regPath: 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters',
        },
      ],
      recommendations: [
        {
          name: 'TcpAckFrequency',
          description: 'Send TCP ACKs immediately',
          category: 'latency',
          currentValue: 2,
          recommendedValue: 1,
          defaultValue: 2,
          needsOptimization: true,
          regPath: 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters',
        },
      ],
      recommendationCount: 1,
      adapters: [
        { name: 'Ethernet', mtu: 1500, speed: 1000, isUp: true },
      ],
      dnsServers: ['8.8.8.8', '8.8.4.4'],
      optimized: false,
      analyzedAt: '2024-06-01T12:00:00',
    });

    const result = await networkOptimizerService.analyze();
    expect(result.supported).toBe(true);
    expect(result.recommendationCount).toBe(1);
    expect(result.currentSettings).toHaveLength(2);
    expect(result.recommendations[0].name).toBe('TcpAckFrequency');
    expect(result.adapters[0].mtu).toBe(1500);
  });

  it('optimizes network settings', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Applied 5 optimization(s)',
      applied: [
        { name: 'TcpAckFrequency', oldValue: 2, newValue: 1, description: 'Send TCP ACKs immediately' },
        { name: 'TCPNoDelay', oldValue: 0, newValue: 1, description: 'Disable Nagle algorithm' },
      ],
      failed: [],
      appliedCount: 2,
      failedCount: 0,
      backupFile: 'C:\\Users\\backup.reg',
      note: 'A system restart may be required for all changes to take effect.',
    });

    const result = await networkOptimizerService.optimize();
    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(2);
    expect(result.applied[0].newValue).toBe(1);
  });

  it('reverts network settings', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Reverted 5 setting(s) to defaults',
      reverted: [
        { name: 'TcpAckFrequency', description: 'Send TCP ACKs immediately' },
      ],
      failed: [],
      revertedCount: 1,
      failedCount: 0,
      note: 'A system restart may be required for all changes to take effect.',
    });

    const result = await networkOptimizerService.revert();
    expect(result.success).toBe(true);
    expect(result.revertedCount).toBe(1);
  });

  it('gets optimization status', async () => {
    mockCall.mockResolvedValue({
      optimized: true,
      appliedAt: '2024-06-01T12:00:00',
      revertedAt: null,
      appliedSettings: [],
      supported: true,
    });

    const result = await networkOptimizerService.getStatus();
    expect(result.optimized).toBe(true);
    expect(result.supported).toBe(true);
  });

  it('handles unsupported platform', async () => {
    mockCall.mockResolvedValue({
      supported: false,
      currentSettings: [],
      recommendations: [],
      recommendationCount: 0,
      adapters: [],
      dnsServers: [],
      optimized: false,
      analyzedAt: '2024-06-01T12:00:00',
    });

    const result = await networkOptimizerService.analyze();
    expect(result.supported).toBe(false);
    expect(result.recommendationCount).toBe(0);
  });

  it('handles optimize with failures', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Applied 3 optimization(s), 2 failed',
      applied: [{ name: 'TcpAckFrequency', oldValue: 2, newValue: 1, description: 'test' }],
      failed: [{ name: 'MaxUserPort', error: 'Access denied' }],
      appliedCount: 3,
      failedCount: 2,
      backupFile: null,
      note: 'A system restart may be required.',
    });

    const result = await networkOptimizerService.optimize();
    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(2);
  });
});
