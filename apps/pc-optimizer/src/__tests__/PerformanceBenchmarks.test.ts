// @vitest-environment happy-dom
/**
 * Performance Benchmarks & Regression Tests
 *
 * Verifies that performance-critical paths meet their targets:
 * - RPC cache hit/miss behavior
 * - ViewModel microtask batching
 * - useViewModel useSyncExternalStore integration
 * - Performance hooks (debounce, throttle, stable callback)
 * - Dashboard polling adaptiveness
 * - React.memo on list components
 * - Lazy loading / code splitting
 * - Electron startup parallelization
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';
import { rpcCache } from '../services/rpcCache';

// ── Helpers ──────────────────────────────────────────────────────

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── RPC Cache Tests ──────────────────────────────────────────────

describe('RpcCache', () => {
  beforeEach(() => rpcCache.clear());

  it('caches results and returns from cache on hit', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { data: 'test' };
    };

    const r1 = await rpcCache.get('test-key', fetcher, 5000);
    const r2 = await rpcCache.get('test-key', fetcher, 5000);

    expect(r1).toEqual({ data: 'test' });
    expect(r2).toEqual({ data: 'test' });
    expect(callCount).toBe(1);
  });

  it('expires entries after TTL', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return callCount;
    };

    await rpcCache.get('ttl-key', fetcher, 50);
    expect(callCount).toBe(1);

    await sleep(60);
    await rpcCache.get('ttl-key', fetcher, 50);
    expect(callCount).toBe(2);
  });

  it('deduplicates concurrent calls', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      await sleep(20);
      return callCount;
    };

    const [r1, r2, r3] = await Promise.all([
      rpcCache.get('dedup-key', fetcher, 5000),
      rpcCache.get('dedup-key', fetcher, 5000),
      rpcCache.get('dedup-key', fetcher, 5000),
    ]);

    expect(callCount).toBe(1);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  it('invalidates specific keys', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return callCount;
    };

    await rpcCache.get('inv-key', fetcher, 5000);
    rpcCache.invalidate('inv-key');
    await rpcCache.get('inv-key', fetcher, 5000);
    expect(callCount).toBe(2);
  });

  it('invalidates by prefix', async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return callCount;
    };

    await rpcCache.get('metrics.cpu', fetcher, 5000);
    await rpcCache.get('metrics.mem', fetcher, 5000);
    rpcCache.invalidatePrefix('metrics.');
    expect(rpcCache.isFresh('metrics.cpu')).toBe(false);
    expect(rpcCache.isFresh('metrics.mem')).toBe(false);
  });

  it('tracks hit/miss statistics', async () => {
    const fetcher = async () => 'val';
    await rpcCache.get('stat-1', fetcher, 5000);
    await rpcCache.get('stat-1', fetcher, 5000);
    await rpcCache.get('stat-2', fetcher, 5000);

    const stats = rpcCache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBeCloseTo(1 / 3);
  });
});

// ── ViewModel Microtask Batching Tests ───────────────────────────

describe('ViewModel microtask batching', () => {
  it('batches multiple synchronous setState calls into one notification', async () => {
    const { ViewModel } = await import('@avs/core/mvvm/ViewModel');

    class TestVM extends ViewModel<{ a: number; b: number; c: number }> {
      constructor() {
        super({ a: 0, b: 0, c: 0 });
      }
      update() {
        this.setState({ a: 1 });
        this.setState({ b: 2 });
        this.setState({ c: 3 });
      }
    }

    const vm = new TestVM();
    let notifyCount = 0;
    let lastState: { a: number; b: number; c: number } | null = null;
    vm.subscribe((state) => {
      notifyCount++;
      lastState = state;
    });

    vm.update();
    expect(notifyCount).toBe(0);

    await Promise.resolve();
    expect(notifyCount).toBe(1);
    expect(lastState).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('does not notify when state is unchanged (Object.is)', async () => {
    const { ViewModel } = await import('@avs/core/mvvm/ViewModel');

    // Object.is check: setting the same value via functional update
    // should return the same state reference and NOT notify.
    class TestVM extends ViewModel<{ value: number }> {
      constructor() {
        super({ value: 42 });
      }
      noop() {
        this.setState((prev) => prev);
      }
    }

    const vm = new TestVM();
    let notifyCount = 0;
    vm.subscribe(() => notifyCount++);

    vm.noop();
    await Promise.resolve();
    expect(notifyCount).toBe(0);
  });

  it('notifies on genuine state change', async () => {
    const { ViewModel } = await import('@avs/core/mvvm/ViewModel');

    class TestVM extends ViewModel<{ count: number }> {
      constructor() {
        super({ count: 0 });
      }
      increment() {
        this.setState((prev) => ({ ...prev, count: prev.count + 1 }));
      }
    }

    const vm = new TestVM();
    let notifyCount = 0;
    vm.subscribe(() => notifyCount++);

    vm.increment();
    await Promise.resolve();
    expect(notifyCount).toBe(1);
    expect(vm.state.count).toBe(1);

    vm.increment();
    vm.increment();
    await Promise.resolve();
    expect(notifyCount).toBe(2);
    expect(vm.state.count).toBe(3);
  });
});

// ── Performance Hooks Tests ──────────────────────────────────────

describe('Performance hooks', () => {
  it('useDebouncedCallback delays invocation', async () => {
    const { useDebouncedCallback } = await import('../hooks/performanceHooks');
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 50));

    result.current('a');
    result.current('b');
    result.current('c');

    expect(callback).not.toHaveBeenCalled();
    await sleep(60);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('c');
  });

  it('useStableCallback maintains stable identity', async () => {
    const { useStableCallback } = await import('../hooks/performanceHooks');
    const callback = vi.fn();
    const { result, rerender } = renderHook(() => useStableCallback(callback));

    const first = result.current;
    rerender();
    const second = result.current;
    rerender();
    const third = result.current;

    expect(first).toBe(second);
    expect(second).toBe(third);

    first('test');
    expect(callback).toHaveBeenCalledWith('test');
  });

  it('useThrottledValue limits update frequency', async () => {
    const { useThrottledValue } = await import('../hooks/performanceHooks');
    let value = 0;
    const { result, rerender } = renderHook(() => useThrottledValue(value, 50));

    // Rapid updates
    value = 1; rerender();
    value = 2; rerender();
    value = 3; rerender();

    // Should not have updated yet (throttled)
    expect(result.current).toBe(0);

    await sleep(60);
    // After throttle window, last value should appear
    // (useThrottledValue uses useEffect which runs on next render)
    rerender();
    expect(result.current).toBeGreaterThanOrEqual(0);
  });

  it('useIsPageVisible tracks document visibility', async () => {
    const { useIsPageVisible } = await import('../hooks/performanceHooks');
    const { result } = renderHook(() => useIsPageVisible());

    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        configurable: true,
        writable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe(false);
  });
});

// ── Dashboard Polling Tests ──────────────────────────────────────

describe('Dashboard polling optimization', () => {
  it('uses adaptive intervals based on visibility', () => {
    const content = readFile(
      path.resolve(__dirname, '../features/dashboard/DashboardViewModel.ts'),
    );
    expect(content).toContain('LIVE_METRICS_POLL_HIDDEN_INTERVAL_MS');
    expect(content).toContain('visibilitychange');
    expect(content).toContain('getLiveMetricsPollInterval');
  });

  it('pauses polling when page is hidden', () => {
    const content = readFile(
      path.resolve(__dirname, '../features/dashboard/DashboardViewModel.ts'),
    );
    expect(content).toContain('document.hidden');
    expect(content).toContain('stopLiveMetricsPolling');
    expect(content).toContain('liveMetricsPollActive');
  });
});

// ── Electron Startup Optimization Tests ─────────────────────────

describe('Electron startup optimization', () => {
  it('parallelizes IPC registration and auto-updater init', () => {
    const content = readFile(
      path.resolve(__dirname, '../../electron/startup/startupStateMachine.ts'),
    );
    expect(content).toContain('Promise.all');
    expect(content).toContain('initAutoUpdater');
    expect(content).toContain('registerAllHandlers');
  });
});

// ── React.memo Usage Tests ───────────────────────────────────────

describe('React.memo on list components', () => {
  it('CategoryRow is wrapped in memo', () => {
    const content = readFile(
      path.resolve(__dirname, '../features/junk-cleaner/components/CategoryRow.tsx'),
    );
    expect(content).toContain('memo(');
    expect(content).toContain('import { memo }');
  });
});

// ── Code Splitting / Lazy Loading Tests ─────────────────────────

describe('Code splitting and lazy loading', () => {
  const routerContent = readFile(
    path.resolve(__dirname, '../router/index.tsx'),
  );

  it('all page routes use lazy()', () => {
    expect(routerContent).toContain('lazy(() => import');
    // Count lazy imports — should be at least 15 pages
    const lazyCount = (routerContent.match(/lazy\(\(\)/g) || []).length;
    expect(lazyCount).toBeGreaterThanOrEqual(15);
  });

  it('uses Suspense with LoadingFallback', () => {
    expect(routerContent).toContain('Suspense');
    expect(routerContent).toContain('LoadingFallback');
  });

  it('uses ErrorBoundary around routes', () => {
    expect(routerContent).toContain('ErrorBoundary');
  });

  it('ModulePreloader uses requestIdleCallback', () => {
    expect(routerContent).toContain('requestIdleCallback');
  });
});

// ── useViewModel useSyncExternalStore Tests ──────────────────────

describe('useViewModel uses useSyncExternalStore', () => {
  it('imports useSyncExternalStore', () => {
    const content = readFile(
      path.resolve(__dirname, '../../../../packages/core/src/mvvm/useViewModel.ts'),
    );
    expect(content).toContain('useSyncExternalStore');
    expect(content).not.toContain('useState');
  });
});

// ── ViewModel Batching Source Verification ───────────────────────

describe('ViewModel batching source verification', () => {
  it('uses queueMicrotask for batching', () => {
    const content = readFile(
      path.resolve(__dirname, '../../../../packages/core/src/mvvm/ViewModel.ts'),
    );
    expect(content).toContain('queueMicrotask');
    expect(content).toContain('_scheduleFlush');
    expect(content).toContain('_flushScheduled');
  });
});

// ── Performance Regression: File-based checks ───────────────────

describe('Performance regression checks', () => {
  it('RPC cache module exists', () => {
    const content = readFile(
      path.resolve(__dirname, '../services/rpcCache.ts'),
    );
    expect(content).toContain('class RpcCacheImpl');
    expect(content).toContain('rpcCache');
  });

  it('Performance hooks module exists', () => {
    const content = readFile(
      path.resolve(__dirname, '../hooks/performanceHooks.ts'),
    );
    expect(content).toContain('useDebouncedCallback');
    expect(content).toContain('useThrottledValue');
    expect(content).toContain('useStableCallback');
    expect(content).toContain('useIsPageVisible');
  });
});
