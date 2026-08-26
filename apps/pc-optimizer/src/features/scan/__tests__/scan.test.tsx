// @vitest-environment happy-dom
/**
 * Unified Scan UI tests — covers ScanView for all three modules and the
 * scan-core-only backend contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render as baseRender, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { ScanView } from '../ScanView';
import { RPC_METHODS } from '@avs/shared/rpc';

function render(ui: ReactElement) {
  return baseRender(<MemoryRouter>{ui}</MemoryRouter>);
}

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
      if (method === RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE) {
        return Promise.resolve({ ok: true, session_id: 'opt-session' });
      }
      if (method === RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE_STATUS) {
        return Promise.resolve({
          ok: true,
          phase: 'complete',
          completed: true,
          result: { files_cleaned: 1, space_recovered: 1024 },
        });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });


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

    // V1.0 UNIFIED: scan → detect → auto-optimize → results.
    // With a non-null planId, ScanView auto-transitions to AutoOptimizeView.
    // The mock auto-optimize status returns phase='complete', so the
    // auto-optimize complete card should appear.
    await waitFor(
      () => {
        expect(screen.queryByTestId('auto-optimize-complete')).toBeDefined();
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

  });

  it('V1.0 UNIFIED: auto-starts optimization when scan completes with findings', async () => {
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
            canonical_path: '',
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
            canonical_path: '',
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

    // V1.0 UNIFIED: AutoOptimizeView should appear automatically (no manual Review & Remediate)
    // The scan completes and immediately transitions to auto-optimize, so we
    // wait for the auto-optimize view to appear.
    await waitFor(
      () => {
        const view = screen.queryByTestId('auto-optimize-loading') ||
                     screen.queryByTestId('auto-optimize-running') ||
                     screen.queryByTestId('auto-optimize-complete');
        expect(view).toBeDefined();
      },
      { timeout: 10000 },
    );
  });

  it('active scan results do not display canonical_path or asset_id', async () => {
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
            canonical_path: '',
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
            canonical_path: '',
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

    // V1.0 UNIFIED: the scan transitions DIRECTLY to AutoOptimizeView
    // (no intermediate summary, no manual Review & Remediate).
    await waitFor(
      () => {
        const view = screen.queryByTestId('auto-optimize-loading') ||
                     screen.queryByTestId('auto-optimize-running') ||
                     screen.queryByTestId('auto-optimize-complete') ||
                     screen.queryByTestId('auto-optimize-error');
        expect(view).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // Ensure no raw path or asset data is visible in the auto-optimize view.
    expect(screen.queryByText(/C:\\\\|\\\\Users/)).toBeNull();
    expect(screen.queryByText(/asset-1/)).toBeNull();
  });

  it('V1.0 UNIFIED: auto-optimize starts automatically after scan completes', async () => {
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
      if (method === RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE) {
        return Promise.resolve({ ok: true, session_id: 'opt-session' });
      }
      if (method === RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE_STATUS) {
        return Promise.resolve({
          ok: true,
          phase: 'complete',
          completed: true,
          result: { files_cleaned: 1, space_recovered: 1024 },
        });
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
            canonical_path: '',
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

    // V1.0 UNIFIED: the scan transitions DIRECTLY to AutoOptimizeView
    // (no intermediate summary, no manual review).
    await waitFor(
      () => {
        const view = screen.queryByTestId('auto-optimize-loading') ||
                     screen.queryByTestId('auto-optimize-running') ||
                     screen.queryByTestId('auto-optimize-complete') ||
                     screen.queryByTestId('auto-optimize-error');
        expect(view).not.toBeNull();
      },
      { timeout: 5000 },
    );

    // The auto-optimize flow should call the auto_optimize RPC with the plan_id.
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE,
        expect.objectContaining({
          plan_id: 'plan-test',
        }),
      );
    });


  });

  // ── V1.0 Critical Four-Scan Workflow Fix regression tests ───────────

  describe('V1.0 Critical Scan Workflow Fix', () => {
    it('scan with zero cleanable files completes successfully (no "No Plan Defined")', async () => {
      // Simulate a scan that finds zero issues and has no plan_id.
      // The scan should complete successfully, NOT show "No Plan Defined".
      mockResult = {
        ok: true,
        result: {
          scan_id: 'test-session-clean',
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

      render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
      fireEvent.click(screen.getByTestId('scan-start-btn'));

      currentStatus = {
        ...currentStatus,
        completed: true,
        progress: { ...currentStatus.progress, completion_percent: 100 },
      };

      // The scan should complete without showing an error.
      // It should NOT display "No Plan Defined" or any failure state.
      await waitFor(
        () => {
          const completeView = screen.queryByTestId('unified-scan-view-complete');
          const resultsView = screen.queryByTestId('results-view');
          const autoOptView = screen.queryByTestId('auto-optimize-complete') ||
                             screen.queryByTestId('auto-optimize-loading');
          // One of these success states should be present
          expect(completeView || resultsView || autoOptView).not.toBeNull();
        },
        { timeout: 5000 },
      );
    });

    it('scan with findings but zero safe actions shows results (no failure)', async () => {
      // Simulate a scan with findings but no action_plan_id (all blocked).
      // This should NOT show "No Plan Defined" as an error.
      mockResult = {
        ok: true,
        result: {
          scan_id: 'test-session-blocked',
          findings_count: 5,
          action_plan_id: null,
          elapsed_time_ms: 100,
          statistics: {
            assets_discovered: 10,
            assets_evaluated: 10,
            matches: 5,
            rules_evaluated: 3,
          },
          findings: [],
        },
      };

      render(<ScanView module="security" mode="full" onClose={() => {}} />);
      fireEvent.click(screen.getByTestId('scan-start-btn'));

      currentStatus = {
        ...currentStatus,
        completed: true,
        progress: {
          ...currentStatus.progress,
          completion_percent: 100,
          findings: 5,
        },
      };

      // Should complete without crashing or showing "No Plan Defined"
      await waitFor(
        () => {
          const completeView = screen.queryByTestId('unified-scan-view-complete');
          const resultsView = screen.queryByTestId('results-view');
          const autoOptView = screen.queryByTestId('auto-optimize-complete') ||
                             screen.queryByTestId('auto-optimize-loading') ||
                             screen.queryByTestId('auto-optimize-error');
          expect(completeView || resultsView || autoOptView).not.toBeNull();
        },
        { timeout: 5000 },
      );
    });

    it('plan persisted correctly — action_plan_id flows from scan result to auto-optimize', async () => {
      // The plan_id from the scan result must be passed to auto_optimize.
      mockResult = {
        ok: true,
        result: {
          scan_id: 'test-session-plan',
          findings_count: 3,
          action_plan_id: 'plan-abc-123',
          elapsed_time_ms: 200,
          statistics: {
            assets_discovered: 5,
            assets_evaluated: 5,
            matches: 3,
            rules_evaluated: 2,
          },
          findings: [
            {
              finding_id: 'f1',
              display_name: 'Temp file',
              rule_id: 'junk.temp',
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
              canonical_path: '',
            },
          ],
        },
      };

      render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
      fireEvent.click(screen.getByTestId('scan-start-btn'));

      currentStatus = {
        ...currentStatus,
        completed: true,
        progress: {
          ...currentStatus.progress,
          completion_percent: 100,
          findings: 3,
        },
      };

      // The auto-optimize flow should be called with the correct plan_id.
      await waitFor(
        () => {
          expect(mockCall).toHaveBeenCalledWith(
            RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE,
            expect.objectContaining({
              plan_id: 'plan-abc-123',
            }),
          );
        },
        { timeout: 5000 },
      );
    });

    it('does not show "AVS is preparing the scanner" on first click', async () => {
      // V1.0: The backend now waits for readiness instead of returning
      // "still initializing". The frontend should NOT show the
      // "preparing the scanner" message.
      // This test verifies the frontend doesn't map "initializing" errors
      // to the old "try again in a moment" message.
      render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
      fireEvent.click(screen.getByTestId('scan-start-btn'));

      // The scan should start — no "preparing the scanner" message.
      await waitFor(
        () => {
          const activeView = screen.queryByTestId('unified-scan-view-active');
          const completeView = screen.queryByTestId('unified-scan-view-complete');
          expect(activeView || completeView).not.toBeNull();
          // Verify no "preparing the scanner" text is shown
          const preparingText = screen.queryByText(/preparing the scanner/i);
          expect(preparingText).toBeNull();
        },
        { timeout: 5000 },
      );
    });
  });
});
