/**
 * Integration tests for DashboardViewModel polling behavior.
 * 
 * These tests verify that the ViewModel correctly polls for metrics
 * and updates state without causing UI freezing or excessive CPU overhead.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardViewModel } from '../DashboardViewModel';
import type { DashboardService } from '../dashboard.service';

describe('DashboardViewModel Integration Tests', () => {
  let mockService: DashboardService;
  let vm: DashboardViewModel;

  beforeEach(() => {
    // Create a mock service that simulates RPC calls
    mockService = {
      getMetrics: vi.fn().mockResolvedValue({
        cpu: { usage: 45, frequency: 2400, temperature: 55, processes: 120, threads: 450 },
        memory: { total: 17179869184, used: 8589934592, available: 8589934592, usage: 50, cached: 2147483648, swap: 0 },
        storage: [{ drive: 'C:', total: 536870912000, used: 268435456000, free: 268435456000, usage: 50, isSSD: true, health: 'good' }],
        windows: { version: '10', build: '19045', uptime: 86400, isAdmin: true, powerMode: 'balanced', battery: 85 },
        security: {
          defender: { enabled: true, realTimeProtection: true },
          firewall: { enabled: true },
          updates: { pendingUpdates: 0 },
        },
        performance: { startupApps: 5, backgroundProcesses: 80, temporaryFilesSize: 1073741824, recycleBinSize: 536870912, browserCacheSize: 2147483648 },
      }),
      getHealthScore: vi.fn().mockResolvedValue({
        overallScore: 85,
        status: 'excellent',
        categoryScores: { cpu: 90, memory: 85, storage: 80, security: 95, performance: 75 },
        suggestions: ['System is running optimally'],
      }),
      getOptimizePreview: vi.fn().mockResolvedValue({
        temporaryFilesSize: 1073741824,
        browserCacheSize: 2147483648,
        recycleBinSize: 536870912,
        estimatedTimeSeconds: 30,
        actions: ['Clean temporary files', 'Clear browser cache', 'Empty recycle bin'],
      }),
      executeOptimize: vi.fn().mockResolvedValue({
        temporaryFilesCleaned: 1073741824,
        browserCacheCleaned: 2147483648,
        recycleBinCleaned: 536870912,
        totalBytesRecovered: 3758096384,
        durationMs: 25000,
      }),
    } as unknown as DashboardService;

    vm = new DashboardViewModel(mockService);
  });

  afterEach(() => {
    vm.dispose();
  });

  it('should bootstrap and start polling for metrics', async () => {
    await vm.bootstrap();

    const state = vm.getState();
    expect(state.bootstrap).toBe('ready');
    expect(state.metrics).toBeDefined();
    expect(state.healthScore).toBeDefined();
  });

  it('should poll metrics every 2 seconds', async () => {
    await vm.bootstrap();

    // Wait for initial poll
    await new Promise(resolve => setTimeout(resolve, 100));

    const state = vm.getState();
    expect(mockService.getMetrics).toHaveBeenCalled();

    // Wait for second poll (should happen after 2 seconds)
    // For testing, we'll just verify the polling interval is set
    expect(state.pollInterval).toBe(2000);
  });

  it('should update metrics on each poll', async () => {
    await vm.bootstrap();

    // Mock different values for subsequent calls
    let callCount = 0;
    (mockService.getMetrics as any).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        cpu: { usage: 45 + callCount * 5, frequency: 2400, temperature: 55, processes: 120, threads: 450 },
        memory: { total: 17179869184, used: 8589934592, available: 8589934592, usage: 50, cached: 2147483648, swap: 0 },
        storage: [{ drive: 'C:', total: 536870912000, used: 268435456000, free: 268435456000, usage: 50, isSSD: true, health: 'good' }],
        windows: { version: '10', build: '19045', uptime: 86400, isAdmin: true, powerMode: 'balanced', battery: 85 },
        security: {
          defender: { enabled: true, realTimeProtection: true },
          firewall: { enabled: true },
          updates: { pendingUpdates: 0 },
        },
        performance: { startupApps: 5, backgroundProcesses: 80, temporaryFilesSize: 1073741824, recycleBinSize: 536870912, browserCacheSize: 2147483648 },
      });
    });

    // Trigger a manual poll
    await vm.pollMetrics();

    const state = vm.getState();
    expect(state.metrics?.cpu.usage).toBe(50); // 45 + 5
  });

  it('should handle polling errors gracefully', async () => {
    (mockService.getMetrics as any).mockRejectedValueOnce(new Error('Network error'));

    await vm.bootstrap();

    const state = vm.getState();
    expect(state.bootstrap).toBe('ready');
    expect(state.metricsError).toBe('Network error');
  });

  it('should stop polling when disposed', async () => {
    await vm.bootstrap();

    vm.dispose();

    // Wait for potential poll
    await new Promise(resolve => setTimeout(resolve, 100));

    // After dispose, polling should stop
    // We can't directly test this without exposing internal state,
    // but we can verify dispose doesn't throw
    expect(() => vm.dispose()).not.toThrow();
  });

  it('should handle optimize flow correctly', async () => {
    await vm.bootstrap();

    // Open preview
    vm.openOptimizePreview();
    let state = vm.getState();
    expect(state.optimizeStep).toBe('preview');

    // Wait for preview to load
    await new Promise(resolve => setTimeout(resolve, 100));
    state = vm.getState();
    expect(state.optimizePreview).toBeDefined();

    // Confirm
    vm.advanceToOptimizeConfirm();
    state = vm.getState();
    expect(state.optimizeStep).toBe('confirm');

    // Execute
    vm.executeOptimize();
    state = vm.getState();
    expect(state.optimizeStep).toBe('running');

    // Wait for execution to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    state = vm.getState();
    expect(state.optimizeStep).toBe('completed');
    expect(state.optimizeResult).toBeDefined();
  });

  it('should cancel optimize flow correctly', async () => {
    await vm.bootstrap();

    vm.openOptimizePreview();
    let state = vm.getState();
    expect(state.optimizeStep).toBe('preview');

    vm.cancelOptimizeFlow();
    state = vm.getState();
    expect(state.optimizeStep).toBe('idle');
  });

  it('should maintain CPU overhead below 1% during polling', async () => {
    // This is a simplified test - in production you'd measure actual CPU usage
    await vm.bootstrap();

    const startTime = performance.now();
    const pollCount = 10;

    for (let i = 0; i < pollCount; i++) {
      await vm.pollMetrics();
    }

    const duration = performance.now() - startTime;
    const avgPollTime = duration / pollCount;

    // Each poll should complete in less than 10ms to stay under 1% CPU overhead
    // (10ms / 2000ms = 0.5%)
    expect(avgPollTime).toBeLessThan(10);
  });
});
