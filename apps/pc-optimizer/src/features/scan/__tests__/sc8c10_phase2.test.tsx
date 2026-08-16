// @vitest-environment happy-dom
/**
 * SC-8C10 Phase 2 — focused edge-case, concurrency, and state-machine
 * regression tests for the unified scan/remediation flow.
 *
 * These supplement the existing SC-8C8/SC-8C9 tests; they do not duplicate them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render as baseRender, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { ScanView } from '../ScanView';
import { ResultsView } from '../ResultsView';
import { RPC_METHODS } from '@avs/shared/rpc';
import { unifiedScanState } from '../unifiedScanState';
import type { ScanFinding } from '../types';

function render(ui: ReactElement) {
  return baseRender(<MemoryRouter>{ui}</MemoryRouter>);
}

const mockCall = vi.fn();

const actionableFinding: ScanFinding = {
  finding_id: 'f-1',
  display_name: 'Junk temp files',
  rule_id: 'junk.temp',
  rule_category: 'junk',
  severity: 'low',
  confidence: 0.95,
  safety: 'safe',
  reason: 'Temporary files can be removed.',
  recommended_action: 'delete',
  estimated_size: 1024,
  is_blocked: false,
  requires_review: false,
  is_actionable: true,
  canonical_path: 'C:\\Windows\\Temp\\junk.tmp',
};

const baseStatistics = {
  assets_discovered: 10,
  assets_evaluated: 10,
  matches: 1,
  rules_evaluated: 1,
};

const validPreview = {
  request_id: 'req-1',
  approval_token: 'token-1',
  plan_id: 'plan-phase2',
  total_actions: 1,
  action_types: { delete: 1 },
  affected_targets: [{ display_name: 'Junk temp files' }],
  estimated_size: 1024,
  safety_state_counts: { safe: 1 },
  fixability_counts: { automatic: 1 },
  backup_required: false,
  rollback_supported: true,
  warnings: [],
  is_stale: false,
  generated_at: '2026-01-01T00:00:00Z',
};

const validValidation = {
  valid: true,
  status: 'ok',
  total: 1,
  completed: 1,
  failed: 0,
  rejected: 0,
  requires_review: 0,
  dry_run: true,
  warnings: [],
  summary: 'All checks passed',
};

function makeExecution(status = 'executing' as string) {
  return {
    execution_id: 'exec-phase2',
    request_id: 'req-1',
    plan_id: 'plan-phase2',
    status,
    total: 1,
    completed: status === 'completed' ? 1 : 0,
    failed: 0,
    rejected: 0,
    skipped: 0,
    requires_review: 0,
    cancelled: false,
    dry_run: false,
    started_at: '2026-01-01T00:00:00Z',
    completed_at: status === 'completed' ? '2026-01-01T00:00:01Z' : undefined,
    reason: undefined,
  };
}

function countCalls(method: string): number {
  return mockCall.mock.calls.filter((c) => c[0] === method).length;
}

describe('SC-8C10 Phase 2', () => {
  beforeEach(() => {
    cleanup();
    unifiedScanState.clear();
    Object.assign(window as unknown as Record<string, unknown>, {
      avs: { rpc: { call: mockCall } },
    });

    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_QUICK || method === RPC_METHODS.SCAN_CORE_SCAN_FULL) {
        return Promise.resolve({
          ok: true,
          session_id: 'test-session-p2',
          started_at: new Date().toISOString(),
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_STATUS) {
        return Promise.resolve({
          ok: true,
          progress: { phase: 'initializing', current_operation: 'Scanning...', completion_percent: 10 },
          completed: false,
          cancelled: false,
          error: null,
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_RESULT) {
        return Promise.resolve({
          ok: true,
          result: {
            scan_id: 'test-session-p2',
            findings_count: 1,
            action_plan_id: 'plan-phase2',
            statistics: baseStatistics,
            findings: [actionableFinding],
          },
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_CANCEL) {
        return Promise.resolve({ ok: true, cancelled: true });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: true, summary: makeExecution('completed') });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS) {
        return Promise.resolve({ ok: true, status: makeExecution('completed') });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_CANCEL) {
        return Promise.resolve({ ok: true, cancelled: true });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).avs;
    cleanup();
  });

  it('sends only one scan_core.scan.cancel even when the user double-clicks the cancel confirmation', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    await waitFor(
      () => {
        expect(screen.queryByTestId('unified-scan-view-active')).toBeDefined();
      },
      { timeout: 5000 },
    );

    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Yes, Cancel'));

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_CANCEL,
        expect.any(Object),
      );
    });

    expect(countCalls(RPC_METHODS.SCAN_CORE_SCAN_CANCEL)).toBe(1);
  });

  it('does not start a second scan session when start is triggered again before the first completes', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    const startBtn = screen.getByTestId('scan-start-btn');
    fireEvent.click(startBtn);
    fireEvent.click(startBtn);

    await waitFor(
      () => {
        expect(countCalls(RPC_METHODS.SCAN_CORE_SCAN_QUICK)).toBe(1);
      },
      { timeout: 5000 },
    );
  });

  it('prevents approve if the backend execute response is missing an execution_id', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        const badSummary = { ...makeExecution('executing'), execution_id: undefined };
        return Promise.resolve({ ok: true, summary: badSummary });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

    render(
      <ResultsView
        moduleName="AI Smart Optimize"
        moduleIcon="SparklesIcon"
        statistics={baseStatistics}
        findings={[actionableFinding]}
        planId="plan-phase2"
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));
    await waitFor(() => expect(screen.getByTestId('remediation-preview-panel')).toBeDefined());

    fireEvent.click(screen.getByTestId('preview-validate-btn'));
    await waitFor(() => expect(screen.getByTestId('results-view-awaiting-approval')).toBeDefined());

    fireEvent.click(screen.getByTestId('validation-approve-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('results-view-error')).toBeDefined();
    });

    expect(countCalls(RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS)).toBe(0);
  });

  it('does not write scan/remediation state to localStorage or sessionStorage', () => {
    const localSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {});
    const sessionSpy = vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {});

    unifiedScanState.setLatest({
      sessionId: 'sess-1',
      module: 'optimize',
      mode: 'full',
      status: 'scanning',
      startedAt: new Date().toISOString(),
      remediationStatus: 'none',
      error: null,
    });

    unifiedScanState.updateLatest({
      planId: 'plan-1',
      remediationStatus: 'executing',
      error: 'boom',
    });

    expect(localSpy).not.toHaveBeenCalled();
    expect(sessionSpy).not.toHaveBeenCalled();

    localSpy.mockRestore();
    sessionSpy.mockRestore();
  });

  it('reflects an active in-memory scan session in unifiedScanState', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    const startBtn = screen.getByTestId('scan-start-btn');
    fireEvent.click(startBtn);

    await waitFor(() => {
      const latest = unifiedScanState.getLatest();
      expect(latest).not.toBeNull();
      expect(latest?.status).toBe('scanning');
      expect(latest?.module).toBe('optimize');
    });
  });
});
