/**
 * SC-8C15 Phase 1 — ProcessIntelligenceViewModel integration tests.
 *
 * Verifies that:
 *   - ViewModel uses RpcProcessProvider (not MockProcessProvider)
 *   - bootstrap() loads data from the RPC
 *   - bootstrap() handles RPC errors
 *   - scan() updates the report
 *   - scan() handles errors
 *   - dispose() cleans up
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
});
