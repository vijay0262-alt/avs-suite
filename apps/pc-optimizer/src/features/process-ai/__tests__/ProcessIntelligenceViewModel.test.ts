/**
 * SC-8C15 Phase 1+2 — ProcessIntelligenceViewModel integration tests.
 *
 * Verifies that:
 *   - ViewModel uses RpcProcessProvider (not MockProcessProvider)
 *   - bootstrap() loads data from the RPC
 *   - bootstrap() handles RPC errors
 *   - scan() updates the report
 *   - scan() handles errors
 *   - dispose() cleans up
 *   - Stale scan responses do not overwrite newer results
 *   - dispose() prevents state updates from in-flight scans
 *   - Rapid scan calls are safe
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProcessIntelligenceViewModel } from '../ui/ProcessIntelligenceViewModel';
import type { ProcessEntry } from '../types';

// Mock the rpc module
const mockRaw = vi.fn();
vi.mock('../../../services/rpc', () => ({
  rpc: { raw: (...args: unknown[]) => mockRaw(...args) },
}));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    PROCESS_INTELLIGENCE_SCAN: 'process_intelligence.scan',
  },
}));

function makeValidEntry(pid: number, name: string): ProcessEntry {
  return {
    info: {
      pid,
      name,
      displayName: name,
      parentPid: 0,
      parentName: '',
      publisher: '',
      description: name,
      executablePath: '',
      signatureStatus: 'unknown',
      signatureIssuer: '',
      launchTime: Date.now(),
      priority: 'normal',
      integrityLevel: 'high',
      threadCount: 1,
      handleCount: 10,
      windowTitle: '',
      userAccount: 'CurrentUser',
      isService: false,
      serviceName: '',
      isStartupEntry: false,
      startupEntryName: '',
      category: 'unknown',
      safetyLevel: 'safe',
    },
    sensors: {
      cpuUsagePercent: 1.0,
      perCoreUsage: [],
      memoryMB: 100,
      privateMemoryMB: 70,
      workingSetMB: 100,
      virtualMemoryMB: 200,
      diskReadMBps: 0,
      diskWriteMBps: 0,
      gpuUsagePercent: 0,
      vramMB: 0,
      networkDownloadMbps: 0,
      networkUploadMbps: 0,
      powerDrawEstimateW: 0.3,
    },
  };
}

describe('ProcessIntelligenceViewModel — SC-8C15 Phase 1', () => {
  let vm: ProcessIntelligenceViewModel;

  beforeEach(() => {
    mockRaw.mockReset();
    vm = new ProcessIntelligenceViewModel();
  });

  afterEach(() => {
    vm.dispose();
  });

  it('initial state is idle', () => {
    const state = vm.state;
    expect(state.bootstrap).toBe('idle');
    expect(state.report).toBeNull();
    expect(state.isScanning).toBe(false);
    expect(state.lastScanAt).toBeNull();
  });

  it('bootstrap() loads data from RPC and sets ready state', async () => {
    const entries = [makeValidEntry(1, 'chrome.exe'), makeValidEntry(2, 'code.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 2, scanDurationMs: 100 });

    await vm.bootstrap();

    const state = vm.state;
    expect(state.bootstrap).toBe('ready');
    expect(state.report).not.toBeNull();
    expect(state.report!.insights).toBeDefined();
    expect(state.lastScanAt).not.toBeNull();
    expect(mockRaw).toHaveBeenCalledWith('process_intelligence.scan');
  });

  it('bootstrap() sets error state on RPC failure', async () => {
    mockRaw.mockResolvedValue({ ok: false, error: 'psutil not available' });

    await vm.bootstrap();

    const state = vm.state;
    expect(state.bootstrap).toBe('error');
    expect(state.bootstrapError).toBe('psutil not available');
  });

  it('bootstrap() sets error state on RPC rejection', async () => {
    mockRaw.mockRejectedValue(new Error('Network failure'));

    await vm.bootstrap();

    const state = vm.state;
    expect(state.bootstrap).toBe('error');
    expect(state.bootstrapError).toContain('Network failure');
  });

  it('scan() updates report with new data', async () => {
    // First bootstrap
    const entries1 = [makeValidEntry(1, 'a.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries: entries1, count: 1, scanDurationMs: 50 });
    await vm.bootstrap();

    // Then scan with different data
    const entries2 = [makeValidEntry(1, 'a.exe'), makeValidEntry(2, 'b.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries: entries2, count: 2, scanDurationMs: 50 });
    await vm.scan();

    const state = vm.state;
    expect(state.isScanning).toBe(false);
    expect(state.report).not.toBeNull();
    expect(state.lastScanAt).not.toBeNull();
  });

  it('scan() handles errors without crashing', async () => {
    mockRaw.mockResolvedValue({ ok: true, entries: [makeValidEntry(1, 'a.exe')], count: 1, scanDurationMs: 50 });
    await vm.bootstrap();

    mockRaw.mockResolvedValue({ ok: false, error: 'Scan failed' });
    // scan() now re-throws; the UI catches this, so we catch it here too.
    await expect(vm.scan()).rejects.toThrow('Scan failed');

    const state = vm.state;
    expect(state.isScanning).toBe(false);
    expect(state.bootstrapError).toBeTruthy();
  });

  it('uses RpcProcessProvider, not MockProcessProvider', () => {
    // The provider should be an RpcProcessProvider.
    // We verify this by checking that scan() calls the RPC.
    // If MockProcessProvider were used, mockRaw would never be called.
    mockRaw.mockResolvedValue({ ok: true, entries: [], count: 0, scanDurationMs: 0 });
    return vm.bootstrap().then(() => {
      expect(mockRaw).toHaveBeenCalled();
    });
  });

  it('dispose() cleans up without error', () => {
    expect(() => vm.dispose()).not.toThrow();
  });

  // ── SC-8C15 Phase 2: Concurrency & State Safety ─────────────────

  it('stale scan response does not overwrite newer scan result', async () => {
    // Bootstrap succeeds
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    await vm.bootstrap();

    // Scan A: slow (never resolves in this test)
    let resolveScanA: (value: unknown) => void = () => {};
    mockRaw.mockReturnValueOnce(new Promise((resolve) => { resolveScanA = resolve; }));

    // Scan B: fast, returns different data
    const entriesB = [makeValidEntry(2, 'b.exe')];
    mockRaw.mockResolvedValueOnce({ ok: true, entries: entriesB, count: 1, scanDurationMs: 30 });

    // Start scan A (don't await)
    const scanAPromise = vm.scan().catch(() => {});

    // Start scan B (await)
    await vm.scan();

    const stateAfterB = vm.state;
    expect(stateAfterB.report).not.toBeNull();
    // The report should contain the newer data (process 2)
    expect(stateAfterB.report!.analyses.some((a) => a.pid === 2)).toBe(true);

    // Now resolve scan A with stale data (process 99)
    resolveScanA({ ok: true, entries: [makeValidEntry(99, 'stale.exe')], count: 1, scanDurationMs: 999 });
    await scanAPromise;

    // The stale result should NOT have overwritten the newer result
    const finalState = vm.state;
    expect(finalState.report!.analyses.some((a) => a.pid === 2)).toBe(true);
    expect(finalState.report!.analyses.some((a) => a.pid === 99)).toBe(false);
  });

  it('dispose() prevents in-flight scan from updating state', async () => {
    // Bootstrap succeeds
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    await vm.bootstrap();

    // Start a scan that we'll resolve after dispose
    let resolveScan: (value: unknown) => void = () => {};
    mockRaw.mockReturnValueOnce(new Promise((resolve) => { resolveScan = resolve; }));

    const scanPromise = vm.scan().catch(() => {});
    vm.dispose();

    // Resolve the scan after dispose
    resolveScan({ ok: true, entries: [makeValidEntry(99, 'late.exe')], count: 1, scanDurationMs: 50 });
    await scanPromise;

    // State should not have been updated with the late result
    // (the report from bootstrap should still be there)
    expect(vm.state.report).not.toBeNull();
    expect(vm.state.report!.analyses.some((a) => a.pid === 1)).toBe(true);
    expect(vm.state.report!.analyses.some((a) => a.pid === 99)).toBe(false);
  });

  it('isScanning returns to false after scan error', async () => {
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    await vm.bootstrap();

    mockRaw.mockResolvedValue({ ok: false, error: 'Scan failed' });
    await expect(vm.scan()).rejects.toThrow();

    expect(vm.state.isScanning).toBe(false);
  });

  it('clears bootstrapError on successful scan after error', async () => {
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    await vm.bootstrap();

    // Scan fails
    mockRaw.mockResolvedValue({ ok: false, error: 'Scan failed' });
    await expect(vm.scan()).rejects.toThrow();
    expect(vm.state.bootstrapError).toBe('Scan failed');

    // Scan succeeds — should clear error
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    await vm.scan();
    expect(vm.state.bootstrapError).toBeNull();
  });
});
