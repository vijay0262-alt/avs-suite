// @vitest-environment happy-dom
/**
 * SC-8C15 Phase 2 — Process Intelligence page end-to-end integration tests.
 *
 * Tests the complete user workflow with real backend data (mocked RPC):
 *   - Loading state during bootstrap
 *   - Error state on bootstrap failure
 *   - Dashboard rendering with real data
 *   - Empty state
 *   - Scan Now button triggers rescan
 *   - Scan error shows error banner
 *   - Navigation/unmount safety
 *   - Privacy-safe rendering (no executable paths, no cmdline)
 *   - No destructive operations
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ProcessIntelligencePage from '../ui/ProcessIntelligencePage';
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

function makeValidEntry(pid: number, name: string, opts?: Partial<ProcessEntry['info']>): ProcessEntry {
  return {
    info: {
      pid,
      name,
      displayName: name.replace('.exe', ''),
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
      ...opts,
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

function makeHighCpuEntry(pid: number, name: string): ProcessEntry {
  const base = makeValidEntry(pid, name, { category: 'browser' });
  return {
    ...base,
    sensors: {
      ...base.sensors,
      cpuUsagePercent: 85.5,
      memoryMB: 2048,
      privateMemoryMB: 1400,
      workingSetMB: 2048,
      virtualMemoryMB: 4096,
      diskReadMBps: 5.5,
      diskWriteMBps: 3.2,
      gpuUsagePercent: 15,
      vramMB: 350,
      networkDownloadMbps: 50,
      networkUploadMbps: 10,
      powerDrawEstimateW: 25.65,
    },
  };
}

describe('ProcessIntelligencePage — SC-8C15 Phase 2 E2E', () => {
  beforeEach(() => {
    mockRaw.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Loading State ────────────────────────────────────────────────

  it('shows loading state during bootstrap', async () => {
    // Never resolves — keeps the page in loading state
    mockRaw.mockReturnValue(new Promise(() => {}));
    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-intelligence-loading')).toBeTruthy();
    });
  });

  // ── Error State ──────────────────────────────────────────────────

  it('shows error state on bootstrap failure with retry button', async () => {
    mockRaw.mockResolvedValue({ ok: false, error: 'psutil not available' });
    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-intelligence-error')).toBeTruthy();
    });
    expect(screen.getByText('psutil not available')).toBeTruthy();
    expect(screen.getByTestId('process-intelligence-error-retry')).toBeTruthy();
  });

  it('shows error state on RPC rejection', async () => {
    mockRaw.mockRejectedValue(new Error('Network failure'));
    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-intelligence-error')).toBeTruthy();
    });
    expect(screen.getByText('Network failure')).toBeTruthy();
  });

  // ── Successful Dashboard ─────────────────────────────────────────

  it('renders dashboard with real process data', async () => {
    const entries = [
      makeValidEntry(4, 'System', { category: 'system', safetyLevel: 'critical_system' }),
      makeValidEntry(104, 'explorer.exe', { category: 'windows', safetyLevel: 'safe' }),
      makeHighCpuEntry(512, 'chrome.exe'),
    ];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 3, scanDurationMs: 100 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-summary-bar')).toBeTruthy();
    });

    expect(screen.getByTestId('stat-total-processes')).toBeTruthy();
    expect(screen.getByTestId('stat-cpu-usage')).toBeTruthy();
    expect(screen.getByTestId('stat-memory-usage')).toBeTruthy();
    expect(screen.getByTestId('stat-risk-level')).toBeTruthy();
  });

  it('renders top consumers card with process names', async () => {
    const entries = [
      makeValidEntry(4, 'System', { category: 'system', safetyLevel: 'critical_system' }),
      makeHighCpuEntry(512, 'chrome.exe'),
    ];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 2, scanDurationMs: 100 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-top-consumers')).toBeTruthy();
    });
  });

  // ── Empty State ──────────────────────────────────────────────────

  it('shows empty state when no processes returned', async () => {
    mockRaw.mockResolvedValue({ ok: true, entries: [], count: 0, scanDurationMs: 10 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByText(/No process data available/i)).toBeTruthy();
    });
  });

  // ── Scan Now Button ──────────────────────────────────────────────

  it('Scan Now button triggers a new scan', async () => {
    const entries1 = [makeValidEntry(1, 'a.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries: entries1, count: 1, scanDurationMs: 50 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('btn-process-scan')).toBeTruthy();
    });

    const entries2 = [makeValidEntry(1, 'a.exe'), makeValidEntry(2, 'b.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries: entries2, count: 2, scanDurationMs: 50 });

    fireEvent.click(screen.getByTestId('btn-process-scan'));

    await waitFor(() => {
      expect(mockRaw).toHaveBeenCalledTimes(2);
    });
  });

  it('Scan Now button is disabled during scan', async () => {
    const entries = [makeValidEntry(1, 'a.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 1, scanDurationMs: 50 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('btn-process-scan')).toBeTruthy();
    });

    // Second call never resolves — keeps isScanning true
    mockRaw.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByTestId('btn-process-scan'));

    await waitFor(() => {
      const btn = screen.getByTestId('btn-process-scan') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  // ── Scan Error Banner ────────────────────────────────────────────

  it('shows error banner when scan fails after successful bootstrap', async () => {
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-summary-bar')).toBeTruthy();
    });

    mockRaw.mockResolvedValue({ ok: false, error: 'Scan failed' });
    fireEvent.click(screen.getByTestId('btn-process-scan'));

    await waitFor(() => {
      expect(screen.getByTestId('process-scan-error-banner')).toBeTruthy();
    });
    expect(screen.getByText('Last scan failed')).toBeTruthy();
  });

  // ── Rescan After Error ───────────────────────────────────────────

  it('can rescan after a scan error', async () => {
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('btn-process-scan')).toBeTruthy();
    });

    // Scan fails
    mockRaw.mockResolvedValue({ ok: false, error: 'Scan failed' });
    fireEvent.click(screen.getByTestId('btn-process-scan'));
    await waitFor(() => {
      expect(screen.getByTestId('process-scan-error-banner')).toBeTruthy();
    });

    // Scan succeeds again
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe'), makeValidEntry(2, 'b.exe')],
      count: 2,
      scanDurationMs: 50,
    });
    fireEvent.click(screen.getByTestId('btn-process-scan-retry'));

    await waitFor(() => {
      expect(screen.queryByTestId('process-scan-error-banner')).toBeNull();
    });
  });

  // ── Unmount Safety ───────────────────────────────────────────────

  it('unmount during scan does not crash', async () => {
    mockRaw.mockResolvedValue({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    const { unmount } = render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('btn-process-scan')).toBeTruthy();
    });

    // Start a scan that never resolves
    mockRaw.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByTestId('btn-process-scan'));

    // Unmount during scan — should not throw
    expect(() => unmount()).not.toThrow();
  });

  // ── Privacy-Safe Rendering ───────────────────────────────────────

  it('does not render executable paths in the UI', async () => {
    const entries = [
      makeValidEntry(1, 'chrome.exe', {
        category: 'browser',
        executablePath: '', // Backend sanitizes — should be empty
      }),
    ];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 1, scanDurationMs: 50 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-summary-bar')).toBeTruthy();
    });

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain('C:\\');
    expect(bodyText).not.toContain('C:/');
    expect(bodyText).not.toContain('/Users/');
    expect(bodyText).not.toContain('\\Users\\');
  });

  it('does not render command-line arguments', async () => {
    const entries = [makeValidEntry(1, 'chrome.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 1, scanDurationMs: 50 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-summary-bar')).toBeTruthy();
    });

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain('--password');
    expect(bodyText).not.toContain('--token');
    expect(bodyText).not.toContain('cmdline');
  });

  // ── No Destructive Operations ────────────────────────────────────

  it('does not expose any terminate/kill/suspend actions', async () => {
    const entries = [makeValidEntry(1, 'chrome.exe')];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 1, scanDurationMs: 50 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-summary-bar')).toBeTruthy();
    });

    expect(screen.queryByTestId('btn-terminate')).toBeNull();
    expect(screen.queryByTestId('btn-kill')).toBeNull();
    expect(screen.queryByTestId('btn-suspend')).toBeNull();
    expect(screen.queryByTestId('btn-end-process')).toBeNull();

    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/terminate/i);
    expect(bodyText).not.toMatch(/kill process/i);
    expect(bodyText).not.toMatch(/end process/i);
    expect(bodyText).not.toMatch(/suspend/i);
  });

  // ── System Summary ───────────────────────────────────────────────

  it('renders AI system summary when available', async () => {
    const entries = [
      makeValidEntry(4, 'System', { category: 'system', safetyLevel: 'critical_system' }),
      makeValidEntry(104, 'explorer.exe', { category: 'windows', safetyLevel: 'safe' }),
    ];
    mockRaw.mockResolvedValue({ ok: true, entries, count: 2, scanDurationMs: 50 });

    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-system-summary')).toBeTruthy();
    });
  });

  // ── Malformed Response Handling ──────────────────────────────────

  it('shows error state on malformed response (entries not array)', async () => {
    mockRaw.mockResolvedValue({ ok: true, entries: 'not-an-array' });
    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-intelligence-error')).toBeTruthy();
    });
  });

  it('shows error state on null response', async () => {
    mockRaw.mockResolvedValue(null);
    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-intelligence-error')).toBeTruthy();
    });
  });

  // ── Bootstrap Retry from Error State ─────────────────────────────

  it('retry from error state triggers new bootstrap', async () => {
    // First bootstrap fails
    mockRaw.mockResolvedValueOnce({ ok: false, error: 'Initial failure' });
    render(<ProcessIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByTestId('process-intelligence-error')).toBeTruthy();
    });

    // Retry succeeds
    mockRaw.mockResolvedValueOnce({
      ok: true,
      entries: [makeValidEntry(1, 'a.exe')],
      count: 1,
      scanDurationMs: 50,
    });
    fireEvent.click(screen.getByTestId('process-intelligence-error-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('process-summary-bar')).toBeTruthy();
    });
  });
});
