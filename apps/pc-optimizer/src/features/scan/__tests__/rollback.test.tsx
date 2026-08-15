// @vitest-environment happy-dom
/**
 * Rollback UI tests — SC-8C8 Part 2B Phase 4.
 *
 * Covers the remediation rollback flow through the single
 * `scan_core.remediation.rollback` RPC end point.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ResultsView } from '../ResultsView';
import { orchestratorService } from '../../orchestrator/orchestrator.service';
import { RPC_METHODS } from '@avs/shared/rpc';
import type { ScanFinding } from '../types';

const planId = 'plan-test-123';
const executionId = 'exec-test-456';

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

const baseFindings = [actionableFinding];

const baseStatistics = {
  assets_discovered: 10,
  assets_evaluated: 10,
  matches: 1,
  rules_evaluated: 1,
};

const validPreview = {
  request_id: 'req-1',
  approval_token: 'token-1',
  plan_id: planId,
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
    execution_id: executionId,
    request_id: 'req-1',
    plan_id: planId,
    status,
    total: 2,
    completed: status === 'executing' ? 0 : 1,
    failed: status === 'failed' ? 1 : 0,
    rejected: 0,
    skipped: 0,
    requires_review: 0,
    cancelled: status === 'cancelled',
    dry_run: false,
    started_at: '2026-01-01T00:00:00Z',
    completed_at: status === 'executing' ? undefined : '2026-01-01T00:00:01Z',
    reason: status === 'failed' ? 'One action failed' : undefined,
  };
}

function makeRollback(total: number, successful: number, failed: number, allFailed = false) {
  const results = [] as Array<{
    action_id: string;
    backup_identity: string;
    success: boolean;
    reason?: string;
    restored_path?: string;
  }>;
  for (let i = 0; i < total; i += 1) {
    const success = !allFailed && i < successful;
    results.push({
      action_id: `action-${i + 1}`,
      backup_identity: `backup-${i + 1}`,
      success,
      reason: success ? undefined : 'Backup not found',
      restored_path: success ? `C:\\restored-${i + 1}.tmp` : undefined,
    });
  }
  return {
    execution_id: executionId,
    total,
    successful,
    failed,
    results,
    timestamp: '2026-01-01T00:00:02Z',
  };
}

function flowToTerminal(status: string, mockCall: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) {
  mockCall.mockImplementation((method: string) => {
    if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
      return Promise.resolve({ ok: true, preview: { ...validPreview, ...overrides.preview } });
    }
    if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
      return Promise.resolve({ ok: true, validation: validValidation });
    }
    if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
      return Promise.resolve({ ok: true, summary: { ...makeExecution(status), ...overrides.summary } });
    }
    if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK) {
      return Promise.resolve(overrides.rollback ?? { ok: true, rollback: makeRollback(1, 1, 0) });
    }
    return Promise.reject(new Error(`Unknown method: ${method}`));
  });
}

async function reachTerminal(status: string, mockCall: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) {
  flowToTerminal(status, mockCall, overrides);
  render(
    <ResultsView
      moduleName="AI Smart Optimize"
      moduleIcon="SparklesIcon"
      statistics={baseStatistics}
      findings={baseFindings}
      planId={planId}
      onClose={() => {}}
    />,
  );
  fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
  fireEvent.click(screen.getByTestId('review-remediate-btn'));
  await waitFor(() => {
    expect(screen.getByTestId('remediation-preview-panel')).toBeDefined();
  });
  fireEvent.click(screen.getByTestId('preview-validate-btn'));
  await waitFor(() => {
    expect(screen.getByTestId('validation-approve-btn')).toBeDefined();
  });
  fireEvent.click(screen.getByTestId('validation-approve-btn'));
  await waitFor(() => {
    expect(screen.getByTestId(`terminal-state-${status}`)).toBeDefined();
  });
}

describe('ResultsView rollback (SC-8C8 Part 2B Phase 4)', () => {
  const mockCall = vi.fn();

  beforeEach(() => {
    cleanup();
    Object.assign(window as unknown as Record<string, unknown>, {
      avs: { rpc: { call: mockCall } },
    });
    vi.spyOn(orchestratorService, 'fullAsync');
    vi.spyOn(orchestratorService, 'optimize');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).avs;
    cleanup();
  });

  it('1. partial execution with rollback available shows rollback action', async () => {
    await reachTerminal('partial', mockCall);
    expect(screen.getByTestId('terminal-rollback-btn')).toBeDefined();
  });

  it('2. failed execution with completed actions shows rollback', async () => {
    await reachTerminal('failed', mockCall);
    expect(screen.getByTestId('terminal-rollback-btn')).toBeDefined();
  });

  it('3. cancelled execution shows rollback when permitted', async () => {
    await reachTerminal('cancelled', mockCall);
    expect(screen.getByTestId('terminal-rollback-btn')).toBeDefined();
  });

  it('4. rollback is not automatically called', async () => {
    await reachTerminal('completed', mockCall);
    const calls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
    );
    expect(calls).toHaveLength(0);
  });

  it('5. rollback requires explicit confirmation', async () => {
    await reachTerminal('completed', mockCall);
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-confirmation-panel')).toBeDefined();
    });
    const rollbackCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
    );
    expect(rollbackCalls).toHaveLength(0);
  });

  it('6. confirmation calls scan_core.remediation.rollback exactly once', async () => {
    await reachTerminal('completed', mockCall);
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-confirm-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      const calls = mockCall.mock.calls.filter(
        (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
      );
      expect(calls).toHaveLength(1);
    });
  });

  it('7. correct execution ID is sent to the rollback RPC', async () => {
    await reachTerminal('completed', mockCall);
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-confirm-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
        expect.objectContaining({ execution_id: executionId }),
      );
    });
  });

  it('8. rollback success displays success with restored paths', async () => {
    await reachTerminal('completed', mockCall, {
      rollback: { ok: true, rollback: makeRollback(2, 2, 0) },
    });
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-confirm-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-result-success')).toBeDefined();
    });
    expect(screen.getAllByTestId('rollback-restored-path').length).toBeGreaterThan(0);
  });

  it('9. rollback partial displays partial recovery and failure reasons', async () => {
    await reachTerminal('partial', mockCall, {
      rollback: { ok: true, rollback: makeRollback(2, 1, 1) },
    });
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-confirm-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-result-partial')).toBeDefined();
    });
    expect(screen.getByTestId('rollback-failure-reason')).toBeDefined();
  });

  it('10. rollback failure displays failure and error details', async () => {
    await reachTerminal('failed', mockCall, {
      rollback: { ok: false, error: 'Rollback engine offline' },
    });
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-confirm-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-result-failed')).toBeDefined();
    });
    expect(screen.getByText('Rollback engine offline')).toBeDefined();
  });

  it('11. backend rollback conflict is shown safely', async () => {
    await reachTerminal('completed', mockCall, {
      rollback: { ok: false, error: 'rollback conflict: execution already finalized' },
    });
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-result-failed')).toBeDefined();
    });
    expect(screen.getByText(/conflict/)).toBeDefined();
  });

  it('12. rollback unavailable hides the rollback button', async () => {
    await reachTerminal('completed', mockCall, {
      preview: { ...validPreview, rollback_supported: false },
    });
    expect(screen.queryByTestId('terminal-rollback-btn')).toBeNull();
  });

  it('13. rapid rollback confirm clicks cannot duplicate calls', async () => {
    await reachTerminal('completed', mockCall, {
      rollback: new Promise((resolve) => setTimeout(() => resolve({ ok: true, rollback: makeRollback(1, 1, 0) }), 50)),
    });
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-confirm-btn')).toBeDefined();
    });
    const confirmBtn = screen.getByTestId('rollback-confirm-btn');
    // Synchronously click the same element multiple times before React can swap the view.
    confirmBtn.click();
    confirmBtn.click();
    confirmBtn.click();
    await waitFor(() => {
      expect(screen.getByTestId('results-view-rollbacking')).toBeDefined();
    });
    await waitFor(
      () => {
        const calls = mockCall.mock.calls.filter(
          (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
        );
        expect(calls).toHaveLength(1);
      },
      { timeout: 2000 },
    );
  });

  it('14. rollback cannot start while execution is still running', async () => {
    flowToTerminal('executing', mockCall);
    render(
      <ResultsView
        moduleName="AI Smart Optimize"
        moduleIcon="SparklesIcon"
        statistics={baseStatistics}
        findings={baseFindings}
        planId={planId}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('remediation-preview-panel')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('preview-validate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('validation-approve-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('validation-approve-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('results-view-executing')).toBeDefined();
    });
    expect(screen.queryByTestId('terminal-rollback-btn')).toBeNull();
    const rollbackCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
    );
    expect(rollbackCalls).toHaveLength(0);
  });

  it('15. execution and rollback cannot run concurrently', async () => {
    flowToTerminal('executing', mockCall);
    render(
      <ResultsView
        moduleName="AI Smart Optimize"
        moduleIcon="SparklesIcon"
        statistics={baseStatistics}
        findings={baseFindings}
        planId={planId}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('remediation-preview-panel')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('preview-validate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('validation-approve-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('validation-approve-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('results-view-executing')).toBeDefined();
    });
    const rollbackCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
    );
    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(1);
    expect(rollbackCalls).toHaveLength(0);
  });

  it('16. no direct filesystem, registry, or browser APIs are invoked', async () => {
    await reachTerminal('completed', mockCall, {
      rollback: { ok: true, rollback: makeRollback(1, 1, 0) },
    });
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      const calls = mockCall.mock.calls.filter(
        (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
      );
      expect(calls).toHaveLength(1);
    });
    for (const call of mockCall.mock.calls) {
      const payload = call[1] as Record<string, unknown> | undefined;
      if (payload) {
        const keys = Object.keys(payload).join(' ');
        expect(keys).not.toMatch(/path|registry|browser|startup|localStorage|fs|child_process/);
      }
    }
    expect(orchestratorService.fullAsync).not.toHaveBeenCalled();
    expect(orchestratorService.optimize).not.toHaveBeenCalled();
  });

  it('17. orchestrator.optimize is never called', async () => {
    await reachTerminal('completed', mockCall);
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    expect(orchestratorService.optimize).not.toHaveBeenCalled();
  });

  it('18. security.remediation.rollback is never called', async () => {
    await reachTerminal('completed', mockCall);
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      const calls = mockCall.mock.calls.filter(
        (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
      );
      expect(calls).toHaveLength(1);
    });
    const securityCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SECURITY_REMEDIATION_ROLLBACK,
    );
    expect(securityCalls).toHaveLength(0);
  });

  it('19. rollback is never called during scan completion', async () => {
    flowToTerminal('completed', mockCall);
    render(
      <ResultsView
        moduleName="AI Smart Optimize"
        moduleIcon="SparklesIcon"
        statistics={baseStatistics}
        findings={baseFindings}
        planId={planId}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('remediation-preview-panel')).toBeDefined();
    });
    const rollbackCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
    );
    expect(rollbackCalls).toHaveLength(0);
  });

  it('20. the existing results/execution flow can still be restarted from a rollback result', async () => {
    await reachTerminal('completed', mockCall, {
      rollback: { ok: true, rollback: makeRollback(1, 1, 0) },
    });
    fireEvent.click(screen.getByTestId('terminal-rollback-btn'));
    fireEvent.click(screen.getByTestId('rollback-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('rollback-result-success')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('rollback-back-to-results-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('results-view')).toBeDefined();
    });
    const firstRpc = mockCall.mock.calls[0][0];
    expect(firstRpc).toBe(RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE);
  });
});
