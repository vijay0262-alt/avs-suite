// @vitest-environment happy-dom
/**
 * Unified Scan UI tests — covers ScanView for all three modules and the
 * scan-core-only backend contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ScanView } from '../ScanView';
import { orchestratorService } from '../../orchestrator/orchestrator.service';
import { RPC_METHODS } from '@avs/shared/rpc';

interface ScanStatusResponse {
  ok: true;
  progress: Record<string, unknown>;
  completed: boolean;
  cancelled: boolean;
  error: string | null;
}

describe('ScanView', () => {
  const mockCall = vi.fn();

  const baseStatus: ScanStatusResponse = {
    ok: true,
    progress: {
      phase: 'initializing',
      current_operation: 'Scanning...',
      completion_percent: 10,
      assets_evaluated: 5,
      findings: 0,
      actions_available: 0,
      elapsed_time_ms: 0,
    },
    completed: false,
    cancelled: false,
    error: null,
  };

  let currentStatus: ScanStatusResponse;
  let mockResult: { ok: boolean; result: Record<string, unknown>; error?: string };

  beforeEach(() => {
    cleanup();
    currentStatus = { ...baseStatus };
    mockResult = {
      ok: true,
      result: {
        scan_id: 'test-session',
        findings_count: 0,
        action_plan_id: null,
        elapsed_time_ms: 0,
        statistics: {
          assets_discovered: 0,
          assets_evaluated: 0,
          matches: 0,
          rules_evaluated: 0,
        },
      },
    };

    Object.assign(globalThis as unknown as Record<string, unknown>, {
      avs: { rpc: { call: mockCall } },
    });

    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_QUICK) {
        return Promise.resolve({
          ok: true,
          session_id: 'test-session',
          started_at: new Date().toISOString(),
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_FULL) {
        return Promise.resolve({
          ok: true,
          session_id: 'test-session',
          started_at: new Date().toISOString(),
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_STATUS) {
        return Promise.resolve(currentStatus);
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_RESULT) {
        return Promise.resolve(mockResult);
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_CANCEL) {
        return Promise.resolve({ ok: true, cancelled: true });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

    vi.spyOn(orchestratorService, 'fullAsync');
    vi.spyOn(orchestratorService, 'optimize');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as unknown as Record<string, unknown>).avs;
    cleanup();
  });

  it('renders ScanView for each of the three modules', () => {
    for (const module of ['protection', 'optimize', 'security'] as const) {
      const { unmount } = render(
        <ScanView
          module={module}
          mode={module === 'optimize' ? 'quick' : 'full'}
          onClose={() => {}}
        />,
      );
      expect(screen.getByTestId('scan-view-idle')).toBeDefined();
      unmount();
    }
  });

  it('clicking the start scan button calls scan_core.scan.quick for the optimize module', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    const startBtn = screen.getByTestId('scan-start-btn');
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_QUICK,
        expect.any(Object),
      );
    });
  });

  it('shows scanning state after start', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(
      () => {
        expect(screen.queryByTestId('unified-scan-view-active')).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('shows completed/no issues state when result has 0 issues', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    currentStatus = {
      ...currentStatus,
      completed: true,
      progress: { ...currentStatus.progress, completion_percent: 100 },
    };

    await waitFor(
      () => {
        expect(screen.queryByTestId('unified-scan-view-complete')).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('shows issues found when result has >0 issues', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    mockResult = {
      ok: true,
      result: {
        scan_id: 'test-session',
        findings_count: 5,
        action_plan_id: 'plan-test',
        elapsed_time_ms: 100,
        statistics: {
          assets_discovered: 10,
          assets_evaluated: 10,
          matches: 5,
          rules_evaluated: 1,
        },
      },
    };
    currentStatus = {
      ...currentStatus,
      completed: true,
      progress: {
        ...currentStatus.progress,
        completion_percent: 100,
        findings: 5,
      },
    };

    await waitFor(
      () => {
        expect(screen.getByText(/5 issues found/)).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('calls scan_core.scan.cancel when cancel button is clicked', async () => {
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
  });

  it('shows error/retry state on error', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    currentStatus = { ...currentStatus, error: 'Disk full' };

    await waitFor(
      () => {
        expect(screen.getByText('Scan Failed')).toBeDefined();
        expect(screen.getByText('Disk full')).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('verifies no remediation buttons appear', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    currentStatus = {
      ...currentStatus,
      completed: true,
      progress: { ...currentStatus.progress, completion_percent: 100 },
    };

    await waitFor(
      () => {
        expect(screen.queryByTestId('unified-scan-view-complete')).toBeDefined();
      },
      { timeout: 5000 },
    );

    expect(screen.queryByText('Fix All')).toBeNull();
    expect(screen.queryByText('Optimize Now')).toBeNull();
    expect(screen.queryByText('Quarantine')).toBeNull();
  });

  it('verifies full scan mode calls scan_core.scan.full', async () => {
    render(<ScanView module="protection" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_FULL,
        expect.any(Object),
      );
    });
  });

  it('double-clicking the start scan button only creates one session', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    const startBtn = screen.getByTestId('scan-start-btn');
    fireEvent.click(startBtn);
    fireEvent.click(startBtn);
    await waitFor(() => {
      const fullCalls = mockCall.mock.calls.filter(
        (call) => call[0] === RPC_METHODS.SCAN_CORE_SCAN_FULL,
      );
      expect(fullCalls.length).toBeLessThanOrEqual(1);
    });
  });

  it('cancels the active session and never calls orchestrator methods', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('unified-scan-view-active')).toBeDefined();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Yes, Cancel'));

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_CANCEL,
        expect.any(Object),
      );
    });
    expect(orchestratorService.fullAsync).not.toHaveBeenCalled();
    expect(orchestratorService.optimize).not.toHaveBeenCalled();
  });

  it('retry after close/error starts exactly one new session', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('unified-scan-view-active')).toBeDefined();
    }, { timeout: 5000 });

    currentStatus = { ...currentStatus, error: 'Disk full' };
    await waitFor(() => {
      expect(screen.getByText('Scan Failed')).toBeDefined();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.getByTestId('scan-view-idle')).toBeDefined();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      const fullCalls = mockCall.mock.calls.filter(
        (call) => call[0] === RPC_METHODS.SCAN_CORE_SCAN_FULL,
      );
      expect(fullCalls.length).toBe(2);
    });
  });

  it('uses the same scan-start-btn for all three modules', () => {
    for (const module of ['protection', 'optimize', 'security'] as const) {
      const { unmount } = render(
        <ScanView
          module={module}
          mode={module === 'optimize' ? 'quick' : 'full'}
          onClose={() => {}}
        />,
      );
      expect(screen.getByTestId('scan-start-btn')).toBeDefined();
      unmount();
    }
  });

  it('calls scan_core.scan.status and scan_core.scan.result on completion', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    currentStatus = {
      ...currentStatus,
      completed: true,
      progress: { ...currentStatus.progress, completion_percent: 100 },
    };
    mockResult = {
      ok: true,
      result: {
        scan_id: 'test-session',
        findings_count: 1,
        action_plan_id: 'plan-test',
        elapsed_time_ms: 100,
        statistics: {},
      },
    };

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_FULL,
        expect.any(Object),
      );
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_STATUS,
        expect.any(Object),
      );
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_RESULT,
        expect.any(Object),
      );
    });
    expect(mockResult.result.action_plan_id).toBe('plan-test');
  });

  it('never calls orchestrator.fullAsync or orchestrator.optimize', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalled();
    });
    expect(orchestratorService.fullAsync).not.toHaveBeenCalled();
    expect(orchestratorService.optimize).not.toHaveBeenCalled();
  });

  it('shows Review & Remediate action and opens results view when clicked', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    mockResult = {
      ok: true,
      result: {
        scan_id: 'test-session',
        findings_count: 2,
        action_plan_id: 'plan-test',
        elapsed_time_ms: 100,
        statistics: {
          assets_discovered: 4,
          assets_evaluated: 4,
          matches: 2,
          rules_evaluated: 1,
        },
        findings: [
          {
            finding_id: 'f-1',
            display_name: 'Junk file',
            rule_id: 'junk.file',
            rule_category: 'junk',
            severity: 'low',
            confidence: 0.9,
            safety: 'safe',
            reason: 'Safe to remove',
            recommended_action: 'delete',
            estimated_size: 1024,
            is_blocked: false,
            requires_review: false,
            is_actionable: true,
            canonical_path: 'C:\\junk.txt',
          },
          {
            finding_id: 'f-2',
            display_name: 'Blocked file',
            rule_id: 'sys.blocked',
            rule_category: 'system',
            severity: 'high',
            confidence: 0.9,
            safety: 'blocked',
            reason: 'Protected',
            recommended_action: 'none',
            estimated_size: 0,
            is_blocked: true,
            requires_review: false,
            is_actionable: false,
            canonical_path: 'C:\\blocked.txt',
          },
        ],
      },
    };
    currentStatus = {
      ...currentStatus,
      completed: true,
      progress: {
        ...currentStatus.progress,
        completion_percent: 100,
        findings: 2,
      },
    };

    await waitFor(
      () => {
        expect(screen.getByTestId('unified-scan-view-complete')).toBeDefined();
      },
      { timeout: 5000 },
    );

    await waitFor(
      () => {
        expect(screen.getByText('Review & Remediate')).toBeDefined();
      },
      { timeout: 5000 },
    );

    fireEvent.click(screen.getByText('Review & Remediate'));

    await waitFor(
      () => {
        expect(screen.getByTestId('results-view')).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('full flow reaches approval and only calls execute after explicit Approve & Fix', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_FULL) {
        return Promise.resolve({
          ok: true,
          session_id: 'test-session',
          started_at: new Date().toISOString(),
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_STATUS) {
        return Promise.resolve(currentStatus);
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_RESULT) {
        return Promise.resolve(mockResult);
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({
          ok: true,
          preview: {
            request_id: 'req-flow',
            approval_token: 'token-flow',
            plan_id: 'plan-test',
            total_actions: 1,
            action_types: { delete: 1 },
            affected_targets: [{ display_name: 'Junk file' }],
            estimated_size: 1024,
            safety_state_counts: { safe: 1 },
            fixability_counts: { automatic: 1 },
            backup_required: false,
            rollback_supported: true,
            warnings: [],
            is_stale: false,
            generated_at: '2026-01-01T00:00:00Z',
          },
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({
          ok: true,
          validation: {
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
          },
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({
          ok: true,
          summary: {
            execution_id: 'exec-flow',
            request_id: 'req-flow',
            plan_id: 'plan-test',
            status: 'completed',
            total: 1,
            completed: 1,
            failed: 0,
            rejected: 0,
            skipped: 0,
            requires_review: 0,
            cancelled: false,
            dry_run: false,
            started_at: '2026-01-01T00:00:00Z',
            completed_at: '2026-01-01T00:00:01Z',
          },
        });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    mockResult = {
      ok: true,
      result: {
        scan_id: 'test-session',
        findings_count: 1,
        action_plan_id: 'plan-test',
        elapsed_time_ms: 100,
        statistics: {
          assets_discovered: 2,
          assets_evaluated: 2,
          matches: 1,
          rules_evaluated: 1,
        },
        findings: [
          {
            finding_id: 'f-flow',
            display_name: 'Junk file',
            rule_id: 'junk.file',
            rule_category: 'junk',
            severity: 'low',
            confidence: 0.9,
            safety: 'safe',
            reason: 'Safe to remove',
            recommended_action: 'delete',
            estimated_size: 1024,
            is_blocked: false,
            requires_review: false,
            is_actionable: true,
            canonical_path: 'C:\\junk.txt',
          },
        ],
      },
    };
    currentStatus = {
      ...currentStatus,
      completed: true,
      progress: {
        ...currentStatus.progress,
        completion_percent: 100,
        findings: 1,
      },
    };

    await waitFor(
      () => {
        expect(screen.getByTestId('unified-scan-view-complete')).toBeDefined();
      },
      { timeout: 5000 },
    );
    await waitFor(
      () => {
        expect(screen.getByText('Review & Remediate')).toBeDefined();
      },
      { timeout: 5000 },
    );

    fireEvent.click(screen.getByText('Review & Remediate'));
    await waitFor(
      () => {
        expect(screen.getByTestId('results-view')).toBeDefined();
      },
      { timeout: 5000 },
    );

    // Preview/validate are triggered by user action in ResultsView.
    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('remediation-preview-panel')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('preview-validate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('validation-approve-btn')).toBeDefined();
    });

    const executeBeforeApproval = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeBeforeApproval).toHaveLength(0);

    fireEvent.click(screen.getByTestId('validation-approve-btn'));
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
        expect.objectContaining({
          plan_id: 'plan-test',
          request_id: 'req-flow',
          approval_token: 'token-flow',
          mode: 'live',
        }),
      );
    });

    expect(orchestratorService.optimize).not.toHaveBeenCalled();
    expect(orchestratorService.fullAsync).not.toHaveBeenCalled();
  });
});
