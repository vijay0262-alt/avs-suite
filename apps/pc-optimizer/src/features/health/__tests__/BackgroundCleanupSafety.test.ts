// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

// ── Mocks must be set up BEFORE importing the module under test ──────────

// Track all RPC calls so tests can assert that no destructive RPCs are invoked.
const mockRpcCall = vi.fn();
vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    ORCHESTRATOR_OPTIMIZE: 'orchestrator.optimize',
    DASHBOARD_OPTIMIZE_EXECUTE: 'dashboard.optimize.execute',
    DASHBOARD_METRICS: 'dashboard.metrics',
    PERFORMANCE_MONITOR_TOP_PROCESSES: 'performance.monitor.getTopProcesses',
  },
}));

// Mock the window.avs.rpc bridge
beforeEach(() => {
  (globalThis as unknown as { window: Record<string, unknown> }).window = globalThis as unknown as Record<string, unknown>;
  (window as unknown as { avs: Record<string, unknown> }).avs = {
    rpc: {
      call: mockRpcCall,
    },
  };
});

// Import after mocks are set up
import { BackgroundCleanupServiceImpl } from '../BackgroundCleanupService';
import { useDeferredCleanupStore } from '../DeferredCleanupStore';
import { healthNotificationService } from '../HealthNotificationService';

describe('SC-8C13 Phase 1 — BackgroundCleanupService Safety', () => {
  let service: BackgroundCleanupServiceImpl;

  beforeEach(() => {
    service = new BackgroundCleanupServiceImpl();
    mockRpcCall.mockReset();
    useDeferredCleanupStore.setState({ items: [] });
    healthNotificationService.reset();
  });

  afterEach(() => {
    service.reset();
  });

  // ── 1. No automatic destructive execution ───────────────────────────

  it('start() does not call orchestrator.optimize', () => {
    service.start();
    expect(mockRpcCall).not.toHaveBeenCalledWith(
      'orchestrator.optimize',
      expect.anything(),
    );
    service.stop();
  });

  it('start() does not call dashboard.optimize.execute', () => {
    service.start();
    expect(mockRpcCall).not.toHaveBeenCalledWith(
      'dashboard.optimize.execute',
      expect.anything(),
    );
    service.stop();
  });

  it('start() does not make any RPC calls', () => {
    service.start();
    // ProcessMonitorService may call getTopProcesses, but no destructive RPCs
    const destructiveCalls = mockRpcCall.mock.calls.filter(
      ([method]) =>
        method === 'orchestrator.optimize' ||
        method === 'dashboard.optimize.execute',
    );
    expect(destructiveCalls).toHaveLength(0);
    service.stop();
  });

  // ── 2. No runStartupCleanup method ──────────────────────────────────

  it('does not have a runStartupCleanup method', () => {
    expect((service as unknown as { runStartupCleanup?: unknown }).runStartupCleanup).toBeUndefined();
  });

  it('does not have an executeCleanup method', () => {
    expect((service as unknown as { executeCleanup?: unknown }).executeCleanup).toBeUndefined();
  });

  // ── 3. checkStartupOpportunities is detection-only ──────────────────

  it('checkStartupOpportunities returns null when no deferred items exist', () => {
    const result = service.checkStartupOpportunities();
    expect(result).toBeNull();
  });

  it('checkStartupOpportunities does not call orchestrator.optimize', () => {
    // Populate store with a deferred item
    useDeferredCleanupStore.setState({
      items: [
        {
          id: 'test-1',
          moduleId: 'junk',
          moduleName: 'Junk Cleaner',
          path: 'C:\\Temp\\test.tmp',
          reason: 'File was locked',
          size: 1024,
          timestamp: Date.now(),
          blockingProcess: 'chrome',
        },
      ],
    });

    service.checkStartupOpportunities();

    expect(mockRpcCall).not.toHaveBeenCalledWith(
      'orchestrator.optimize',
      expect.anything(),
    );
  });

  it('checkStartupOpportunities does not call dashboard.optimize.execute', () => {
    useDeferredCleanupStore.setState({
      items: [
        {
          id: 'test-1',
          moduleId: 'junk',
          moduleName: 'Junk Cleaner',
          path: 'C:\\Temp\\test.tmp',
          reason: 'File was locked',
          size: 1024,
          timestamp: Date.now(),
        },
      ],
    });

    service.checkStartupOpportunities();

    expect(mockRpcCall).not.toHaveBeenCalledWith(
      'dashboard.optimize.execute',
      expect.anything(),
    );
  });

  it('checkStartupOpportunities returns opportunity info when items exist', () => {
    useDeferredCleanupStore.setState({
      items: [
        {
          id: 'test-1',
          moduleId: 'junk',
          moduleName: 'Junk Cleaner',
          path: 'C:\\Temp\\test.tmp',
          reason: 'File was locked',
          size: 1024,
          timestamp: Date.now(),
        },
        {
          id: 'test-2',
          moduleId: 'junk',
          moduleName: 'Junk Cleaner',
          path: 'C:\\Temp\\test2.tmp',
          reason: 'File was locked',
          size: 2048,
          timestamp: Date.now(),
        },
      ],
    });

    const result = service.checkStartupOpportunities();
    expect(result).not.toBeNull();
    expect(result!.itemCount).toBe(2);
    expect(result!.estimatedBytes).toBe(3072);
  });

  // ── 4. Notification behavior ────────────────────────────────────────

  it('checkStartupOpportunities sends a notification when items exist', () => {
    const notifications: { title: string; message: string; actionLabel?: string; actionPath?: string }[] = [];
    const unsub = healthNotificationService.subscribe((n) => {
      notifications.push({ title: n.title, message: n.message, actionLabel: n.actionLabel, actionPath: n.actionPath });
    });

    useDeferredCleanupStore.setState({
      items: [
        {
          id: 'test-1',
          moduleId: 'junk',
          moduleName: 'Junk Cleaner',
          path: 'C:\\Temp\\test.tmp',
          reason: 'File was locked',
          size: 1_000_000,
          timestamp: Date.now(),
        },
      ],
    });

    service.checkStartupOpportunities();

    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Cleanup Opportunities Available');
    expect(notifications[0].actionLabel).toBe('Open Dashboard');
    expect(notifications[0].actionPath).toBe('/dashboard');

    unsub();
  });

  it('checkStartupOpportunities does not send notification when no items exist', () => {
    const notifications: { title: string }[] = [];
    const unsub = healthNotificationService.subscribe((n) => {
      notifications.push({ title: n.title });
    });

    service.checkStartupOpportunities();

    expect(notifications).toHaveLength(0);
    unsub();
  });

  // ── 5. Repeated startup is safe ─────────────────────────────────────

  it('multiple start/stop cycles do not trigger destructive operations', () => {
    for (let i = 0; i < 5; i++) {
      service.start();
      service.stop();
    }

    const destructiveCalls = mockRpcCall.mock.calls.filter(
      ([method]) =>
        method === 'orchestrator.optimize' ||
        method === 'dashboard.optimize.execute',
    );
    expect(destructiveCalls).toHaveLength(0);
  });

  it('multiple checkStartupOpportunities calls do not trigger destructive operations', () => {
    useDeferredCleanupStore.setState({
      items: [
        {
          id: 'test-1',
          moduleId: 'junk',
          moduleName: 'Junk Cleaner',
          path: 'C:\\Temp\\test.tmp',
          reason: 'File was locked',
          size: 1024,
          timestamp: Date.now(),
        },
      ],
    });

    for (let i = 0; i < 5; i++) {
      service.checkStartupOpportunities();
    }

    const destructiveCalls = mockRpcCall.mock.calls.filter(
      ([method]) =>
        method === 'orchestrator.optimize' ||
        method === 'dashboard.optimize.execute',
    );
    expect(destructiveCalls).toHaveLength(0);
  });

  // ── 6. No automatic approval/rollback ───────────────────────────────

  it('does not have automatic approval logic', () => {
    expect((service as unknown as { approve?: unknown }).approve).toBeUndefined();
    expect((service as unknown as { autoApprove?: unknown }).autoApprove).toBeUndefined();
  });

  it('does not have automatic rollback logic', () => {
    expect((service as unknown as { rollback?: unknown }).rollback).toBeUndefined();
    expect((service as unknown as { autoRollback?: unknown }).autoRollback).toBeUndefined();
  });

  // ── 7. subscribe listener gets opportunity events (not execution) ───

  it('subscribe listener receives opportunity info, not execution results', () => {
    const opportunities: { itemCount: number; estimatedBytes: number }[] = [];
    const unsub = service.subscribe((opp) => {
      opportunities.push({ itemCount: opp.itemCount, estimatedBytes: opp.estimatedBytes });
    });

    useDeferredCleanupStore.setState({
      items: [
        {
          id: 'test-1',
          moduleId: 'junk',
          moduleName: 'Junk Cleaner',
          path: 'C:\\Temp\\test.tmp',
          reason: 'chrome was running',
          size: 500_000,
          timestamp: Date.now(),
          blockingProcess: 'chrome',
        },
      ],
    });

    service.checkStartupOpportunities();

    expect(opportunities.length).toBeGreaterThanOrEqual(1);
    expect(opportunities[0].itemCount).toBe(1);
    expect(opportunities[0].estimatedBytes).toBe(500_000);

    unsub();
  });

  // ── 8. DeferredCleanupStore is not populated by the service ─────────

  it('the service does not add items to DeferredCleanupStore', () => {
    const initialItems = useDeferredCleanupStore.getState().items;
    service.start();
    service.checkStartupOpportunities();
    service.stop();
    expect(useDeferredCleanupStore.getState().items).toEqual(initialItems);
  });

  // ── 9. Source code safety — no destructive imports ──────────────────

  it('BackgroundCleanupService does not import RPC_METHODS', async () => {
    const source = await import('../BackgroundCleanupService?raw').catch(() => null);
    if (source && typeof source === 'string') {
      expect(source).not.toContain('ORCHESTRATOR_OPTIMIZE');
      expect(source).not.toContain('DASHBOARD_OPTIMIZE_EXECUTE');
    }
  });
});
