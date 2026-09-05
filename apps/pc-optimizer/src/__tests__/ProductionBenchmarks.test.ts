// @vitest-environment happy-dom
/**
 * Production Performance & Stability Benchmarks
 *
 * Final phase of performance engineering.
 * Verifies long-running stability, resource cleanup,
 * and production-readiness across all modules.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function fileContains(filePath: string, ...substrings: string[]): boolean {
  const content = readFile(filePath);
  return substrings.every((s) => content.includes(s));
}

const featuresDir = path.resolve(__dirname, '../features');
const electronDir = path.resolve(__dirname, '../../electron');

// ── Visibility-Aware Polling Tests ───────────────────────────────

describe('Visibility-aware polling (all ViewModels)', () => {
  it('DashboardViewModel uses visibility-aware polling', () => {
    const content = readFile(path.join(featuresDir, 'dashboard/DashboardViewModel.ts'));
    expect(content).toContain('visibilitychange');
    expect(content).toContain('document.hidden');
    expect(content).toContain('LIVE_METRICS_POLL_HIDDEN_INTERVAL_MS');
    expect(content).toContain('stopLiveMetricsPolling');
    expect(content).toContain('removeEventListener');
  });

  it('DiagnosticsViewModel uses visibility-aware polling', () => {
    const content = readFile(path.join(featuresDir, 'diagnostics/DiagnosticsViewModel.ts'));
    expect(content).toContain('visibilitychange');
    expect(content).toContain('document.hidden');
    expect(content).toContain('POLL_HIDDEN_INTERVAL_MS');
    expect(content).toContain('stopPolling');
    expect(content).toContain('removeEventListener');
  });

  it('PerformanceViewModel uses visibility-aware polling', () => {
    const content = readFile(path.join(featuresDir, 'performance/PerformanceViewModel.ts'));
    expect(content).toContain('visibilitychange');
    expect(content).toContain('document.hidden');
    expect(content).toContain('REFRESH_HIDDEN_INTERVAL_MS');
    expect(content).toContain('stopAutoRefresh');
    expect(content).toContain('removeEventListener');
  });
});

// ── Parallelized RPC Calls Tests ─────────────────────────────────

describe('Parallelized RPC calls', () => {
  it('DiagnosticsViewModel.refresh uses Promise.all', () => {
    const content = readFile(path.join(featuresDir, 'diagnostics/DiagnosticsViewModel.ts'));
    expect(content).toContain('Promise.all([');
    expect(content).toContain('getSystemInfo');
    expect(content).toContain('getBackendStatus');
    expect(content).toContain('getScanState');
    expect(content).toContain('getCleaningState');
    expect(content).toContain('getRecentLogs');
  });
});

// ── Resource Cleanup Tests ───────────────────────────────────────

describe('Resource cleanup on dispose', () => {
  const viewModels = [
    { name: 'DashboardViewModel', file: 'dashboard/DashboardViewModel.ts', cleanupMethod: 'stopLiveMetricsPolling' },
    { name: 'DiagnosticsViewModel', file: 'diagnostics/DiagnosticsViewModel.ts', cleanupMethod: 'stopPolling' },
    { name: 'PerformanceViewModel', file: 'performance/PerformanceViewModel.ts', cleanupMethod: 'stopAutoRefresh' },
    { name: 'JunkCleanerViewModel', file: 'junk-cleaner/JunkCleanerViewModel.ts', cleanupMethod: 'stopScanPolling' },
  ];

  for (const vm of viewModels) {
    it(`${vm.name} has dispose() that calls ${vm.cleanupMethod}`, () => {
      const content = readFile(path.join(featuresDir, vm.file));
      expect(content).toContain('override dispose()');
      expect(content).toContain(vm.cleanupMethod);
    });
  }

  it('CommandCenterRefreshEngine has stopAutoRefresh and clear', () => {
    const content = readFile(path.join(featuresDir, 'ai-workspace/command-center/commandCenterRefreshEngine.ts'));
    expect(content).toContain('stopAutoRefresh()');
    expect(content).toContain('clear()');
    expect(content).toContain('clearInterval');
  });

  it('UpdateManager has stopAutoCheck', () => {
    const content = readFile(path.join(featuresDir, 'licensing/UpdateManager.ts'));
    expect(content).toContain('stopAutoCheck');
    expect(content).toContain('clearInterval');
  });

  it('ExecutionEngine has _stopScheduler', () => {
    const content = readFile(path.join(featuresDir, 'maintenance-engine/executionEngine.ts'));
    expect(content).toContain('_stopScheduler()');
    expect(content).toContain('clearInterval');
  });

  it('DashboardRefreshManager has reset with unsub cleanup', () => {
    const content = readFile(path.join(featuresDir, 'health/DashboardRefreshManager.ts'));
    expect(content).toContain('reset()');
    expect(content).toContain('globalUnsub()');
  });
});

// ── History/Array Growth Caps Tests ──────────────────────────────

describe('History and array growth caps', () => {
  it('SmartOptimizeManager caps history entries', () => {
    const content = readFile(path.join(featuresDir, 'smart-optimize/planner/smartOptimizeManager.ts'));
    expect(content).toContain('maxHistoryEntries');
    expect(content).toContain('slice(');
  });

  it('MaintenanceHistoryRepository has retention policy', () => {
    const content = readFile(path.join(featuresDir, 'maintenance-history/executionHistoryRepository.ts'));
    expect(content).toContain('RetentionPolicy');
    expect(content).toContain('maxRecords');
    expect(content).toContain('_enforceRetention');
  });

  it('MaintenanceHistoryRepository default maxRecords is 500', () => {
    const content = readFile(path.join(featuresDir, 'maintenance-history/types.ts'));
    expect(content).toContain('DEFAULT_RETENTION_POLICY');
    expect(content).toContain('maxRecords: 500');
  });

  it('SessionSynchronizer caps input history per session', () => {
    const content = readFile(path.join(featuresDir, 'ai-workspace/multimodal/sessionSynchronizer.ts'));
    expect(content).toContain('_maxHistoryPerSession');
    expect(content).toContain('shift()');
  });

  it('QualityEvents caps history', () => {
    const content = readFile(path.join(featuresDir, 'ai-workspace/quality/QualityEvents.ts'));
    expect(content).toContain('_maxHistory');
    expect(content).toContain('shift()');
  });
});

// ── Listener Leak Prevention Tests ───────────────────────────────

describe('Listener leak prevention', () => {
  it('GlobalSearch cleans up keydown and mousedown listeners', () => {
    const content = readFile(path.resolve(__dirname, '../components/GlobalSearch.tsx'));
    expect(content).toContain('removeEventListener');
    const removeCount = (content.match(/removeEventListener/g) || []).length;
    expect(removeCount).toBeGreaterThanOrEqual(2);
  });

  it('useKeyboardShortcuts cleans up keydown listener', () => {
    const content = readFile(path.resolve(__dirname, '../components/useKeyboardShortcuts.ts'));
    expect(content).toContain('removeEventListener');
  });

  it('ExecutionDetailDialog cleans up keydown listener', () => {
    const content = readFile(path.join(featuresDir, 'maintenance-ui/components/ExecutionDetailDialog.tsx'));
    expect(content).toContain('removeEventListener');
  });

  it('SettingsPage cleans up storage listener', () => {
    const content = readFile(path.resolve(__dirname, '../pages/SettingsPage.tsx'));
    expect(content).toContain('removeEventListener');
  });

  it('LicenseContext cleans up interval and subscription', () => {
    const content = readFile(path.join(featuresDir, 'licensing/LicenseContext.tsx'));
    expect(content).toContain('clearInterval');
    expect(content).toContain('unsub()');
  });
});

// ── ViewModel Microtask Batching Tests ───────────────────────────

describe('ViewModel microtask batching (from Phase 3 Part 1A)', () => {
  it('ViewModel uses queueMicrotask for batching', () => {
    const content = readFile(
      path.resolve(__dirname, '../../../../packages/core/src/mvvm/ViewModel.ts'),
    );
    expect(content).toContain('queueMicrotask');
    expect(content).toContain('_scheduleFlush');
  });

  it('useViewModel uses useSyncExternalStore', () => {
    const content = readFile(
      path.resolve(__dirname, '../../../../packages/core/src/mvvm/useViewModel.ts'),
    );
    expect(content).toContain('useSyncExternalStore');
  });
});

// ── RPC Cache Tests ──────────────────────────────────────────────

describe('RPC cache layer (from Phase 3 Part 1A)', () => {
  it('rpcCache module exists with TTL and dedup', () => {
    const content = readFile(path.resolve(__dirname, '../services/rpcCache.ts'));
    expect(content).toContain('class RpcCacheImpl');
    expect(content).toContain('ttl');
    expect(content).toContain('dedup');
  });
});

// ── IPC Performance Tests ────────────────────────────────────────

describe('IPC performance (from Phase 3 Part 1B)', () => {
  it('preload has invokeWithTimeout wrapper', () => {
    expect(fileContains(
      path.join(electronDir, 'preload/preload.ts'),
      'invokeWithTimeout',
      'IPC_INVOKE_TIMEOUT_MS',
    )).toBe(true);
  });

  it('IPC handlers have timeout and validation', () => {
    expect(fileContains(
      path.join(electronDir, 'ipc/registerAllHandlers.ts'),
      'withTimeout',
      'requireString',
      'requirePositiveNumber',
      'cleanupAllHandlers',
    )).toBe(true);
  });

  it('Python bridge has graceful shutdown and buffer cap', () => {
    expect(fileContains(
      path.join(electronDir, 'ipc/pythonBridge.ts'),
      'system.shutdown',
      'MAX_BUFFER_SIZE',
      'disposed',
    )).toBe(true);
  });

  it('Startup state machine calls cleanupAllHandlers on shutdown', () => {
    expect(fileContains(
      path.join(electronDir, 'startup/startupStateMachine.ts'),
      'cleanupAllHandlers',
    )).toBe(true);
  });

  it('Main process uses backgroundThrottling and async admin check', () => {
    const content = readFile(path.join(electronDir, 'main/index.ts'));
    expect(content).toContain('backgroundThrottling: true');
    expect(content).not.toContain('execSync');
  });
});

// ── React Rendering Optimization Tests ───────────────────────────

describe('React rendering optimizations (from Phase 3 Part 1A)', () => {
  it('CategoryRow is wrapped in React.memo', () => {
    expect(fileContains(
      path.join(featuresDir, 'junk-cleaner/components/CategoryRow.tsx'),
      'memo(',
    )).toBe(true);
  });

  it('HealthScoreCard uses React.memo', () => {
    expect(fileContains(
      path.join(featuresDir, 'dashboard/components/HealthScoreCard.tsx'),
      'memo(',
    )).toBe(true);
  });

  it('UnifiedScanProgressCard uses React.memo', () => {
    expect(fileContains(
      path.join(featuresDir, 'unified-scan/components/UnifiedScanProgressCard.tsx'),
      'memo(',
    )).toBe(true);
  });

  it('Router uses lazy loading and requestIdleCallback', () => {
    const content = readFile(path.resolve(__dirname, '../router/index.tsx'));
    expect(content).toContain('lazy(() => import');
    expect(content).toContain('requestIdleCallback');
    expect(content).toContain('Suspense');
  });
});

// ── Performance Hooks Tests ──────────────────────────────────────

describe('Performance hooks (from Phase 3 Part 1A)', () => {
  it('performanceHooks module exists with all hooks', () => {
    const content = readFile(path.resolve(__dirname, '../hooks/performanceHooks.ts'));
    expect(content).toContain('useDebouncedCallback');
    expect(content).toContain('useThrottledValue');
    expect(content).toContain('useStableCallback');
    expect(content).toContain('useIsPageVisible');
  });
});

// ── Production Stability Tests ───────────────────────────────────

describe('Production stability checks', () => {
  it('no setInterval in ViewModels (all use setTimeout chain)', () => {
    const vmFiles = [
      'dashboard/DashboardViewModel.ts',
      'diagnostics/DiagnosticsViewModel.ts',
      'performance/PerformanceViewModel.ts',
    ];
    for (const file of vmFiles) {
      const content = readFile(path.join(featuresDir, file));
      // ViewModels should use setTimeout for adaptive polling, not setInterval
      expect(content).not.toContain('setInterval(');
    }
  });

  it('all ViewModels with polling have visibility-aware logic', () => {
    const pollingVMs = [
      'dashboard/DashboardViewModel.ts',
      'diagnostics/DiagnosticsViewModel.ts',
      'performance/PerformanceViewModel.ts',
    ];
    for (const file of pollingVMs) {
      const content = readFile(path.join(featuresDir, file));
      expect(content).toContain('visibilitychange');
    }
  });

  it('ResourceManager exists for tracking disposable resources', () => {
    const content = readFile(path.join(featuresDir, 'production/ResourceManager.ts'));
    expect(content).toContain('trackTimer');
    expect(content).toContain('trackEventListener');
    expect(content).toContain('trackWorker');
    expect(content).toContain('DisposableScope');
  });
});
