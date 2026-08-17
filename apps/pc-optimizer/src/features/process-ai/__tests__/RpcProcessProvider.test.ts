/**
 * SC-8C15 Phase 1 — RpcProcessProvider tests.
 *
 * Verifies that:
 *   - RpcProcessProvider implements ProcessProvider
 *   - scan() calls the correct RPC method
 *   - scan() returns ProcessEntry[] on success
 *   - scan() handles ok:false responses
 *   - scan() handles malformed responses
 *   - scan() handles empty entries
 *   - scan() validates entry shape and skips invalid entries
 *   - isAvailable() checks for window.avs.rpc
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RpcProcessProvider } from '../RpcProcessProvider';
import type { ProcessEntry } from '../types';

// Mock the rpc module
const mockRaw = vi.fn();
vi.mock('../../../services/rpc', () => ({
  rpc: { raw: (...args: unknown[]) => mockRaw(...args) },
}));

// Mock @avs/shared/rpc to provide the constant
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

describe('RpcProcessProvider', () => {
  let provider: RpcProcessProvider;

  beforeEach(() => {
    provider = new RpcProcessProvider();
    mockRaw.mockReset();
  });

  afterEach(() => {
    provider.dispose();
  });

  it('implements ProcessProvider interface', () => {
    expect(provider.id).toBe('rpc-process-provider');
    expect(provider.source).toBe('backend');
    expect(typeof provider.initialize).toBe('function');
    expect(typeof provider.dispose).toBe('function');
    expect(typeof provider.isAvailable).toBe('function');
    expect(typeof provider.scan).toBe('function');
  });

  it('initialize() resolves without error', async () => {
    await expect(provider.initialize()).resolves.toBeUndefined();
  });

  it('scan() returns entries on success', async () => {
    const entries = [makeValidEntry(1, 'a.exe'), makeValidEntry(2, 'b.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 2, scanDurationMs: 100 });
    const result = await provider.scan();
    expect(result).toHaveLength(2);
    expect(result[0].info.pid).toBe(1);
    expect(result[1].info.name).toBe('b.exe');
  });

  it('scan() calls the correct RPC method', async () => {
    mockRaw.mockResolvedValue({ ok: true, entries: [], count: 0, scanDurationMs: 0 });
    await provider.scan();
    expect(mockRaw).toHaveBeenCalledWith('process_intelligence.scan');
  });

  it('scan() throws on ok:false', async () => {
    mockRaw.mockResolvedValue({ ok: false, error: 'psutil not available' });
    await expect(provider.scan()).rejects.toThrow('psutil not available');
  });

  it('scan() throws on ok:false with default message', async () => {
    mockRaw.mockResolvedValue({ ok: false });
    await expect(provider.scan()).rejects.toThrow('Unknown backend error');
  });

  it('scan() throws on non-object response', async () => {
    mockRaw.mockResolvedValue(null);
    await expect(provider.scan()).rejects.toThrow('Invalid response');
  });

  it('scan() throws on malformed entries (not an array)', async () => {
    mockRaw.mockResolvedValue({ ok: true, entries: 'not-an-array' });
    await expect(provider.scan()).rejects.toThrow('entries is not an array');
  });

  it('scan() returns empty array when entries is empty', async () => {
    mockRaw.mockResolvedValue({ ok: true, entries: [], count: 0, scanDurationMs: 0 });
    const result = await provider.scan();
    expect(result).toEqual([]);
  });

  it('scan() skips invalid entries', async () => {
    const valid = makeValidEntry(1, 'good.exe');
    const invalid1 = { info: { pid: 'not-a-number' }, sensors: {} };
    const invalid2 = { info: {}, sensors: {} };
    const invalid3 = null;
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [valid, invalid1 as unknown as ProcessEntry, invalid2 as unknown as ProcessEntry, invalid3 as unknown as ProcessEntry],
      count: 4,
      scanDurationMs: 50,
    });
    const result = await provider.scan();
    expect(result).toHaveLength(1);
    expect(result[0].info.pid).toBe(1);
  });

  it('scan() handles RPC rejection', async () => {
    mockRaw.mockRejectedValue(new Error('Network error'));
    await expect(provider.scan()).rejects.toThrow('Network error');
  });

  it('isAvailable() returns false when window.avs is undefined', () => {
    const originalWindow = global.window;
    // @ts-expect-error — intentionally undefined for test
    delete global.window;
    const p = new RpcProcessProvider();
    expect(p.isAvailable()).toBe(false);
    global.window = originalWindow;
  });
});
