// @vitest-environment happy-dom
/**
 * Results / Remediation Preview and Execution tests — SC-8C8 Part 2B Phase 3.
 *
 * Covers finding selection, preview generation, validation, explicit approval,
 * live execution, status polling, cancellation, and terminal states.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ResultsView } from '../ResultsView';
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

const blockedFinding: ScanFinding = {
  finding_id: 'f-2',
  display_name: 'Locked registry entry',
  rule_id: 'registry.locked',
  rule_category: 'registry',
  severity: 'medium',
  confidence: 0.8,
  safety: 'blocked',
  reason: 'Entry is protected by the operating system.',
  recommended_action: 'none',
  estimated_size: 0,
  is_blocked: true,
  requires_review: false,
  is_actionable: false,
  canonical_path: 'HKLM\\...',
};

const reviewFinding: ScanFinding = {
  finding_id: 'f-3',
  display_name: 'Startup program',
  rule_id: 'startup.unknown',
  rule_category: 'startup',
  severity: 'medium',
  confidence: 0.7,
  safety: 'review',
  reason: 'Requires user review.',
  recommended_action: 'review',
  estimated_size: 0,
  is_blocked: false,
  requires_review: true,
  is_actionable: true,
  canonical_path: 'HKCU\\...',
};

const detectionOnlyFinding: ScanFinding = {
  finding_id: 'f-4',
  display_name: 'Large file detected',
  rule_id: 'disk.large',
  rule_category: 'disk',
  severity: 'info',
  confidence: 0.99,
  safety: 'safe',
  reason: 'Informational finding only.',
  recommended_action: 'none',
  estimated_size: 9999999,
  is_blocked: false,
  requires_review: false,
  is_actionable: false,
  canonical_path: 'D:\\large.iso',
};

const baseFindings = [actionableFinding, blockedFinding, reviewFinding, detectionOnlyFinding];

const baseStatistics = {
  assets_discovered: 10,
  assets_evaluated: 10,
  matches: 4,
  rules_evaluated: 4,
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

describe('ResultsView', () => {
  const mockCall = vi.fn();

  beforeEach(() => {
    cleanup();
    Object.assign(window as unknown as Record<string, unknown>, {
      avs: { rpc: { call: mockCall } },
    });
    mockCall.mockImplementation((method: string) => {
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

  it('renders no-issues state when findings are empty', () => {
    render(
      <ResultsView
        moduleName="AI Smart Optimize"
        moduleIcon="SparklesIcon"
        statistics={baseStatistics}
        findings={[]}
        planId={planId}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('results-view-no-issues')).toBeDefined();
  });

  it('renders findings count', () => {
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
    expect(screen.getByText(`${baseFindings.length} issues found`)).toBeDefined();
  });

  it('lets actionable finding be selected and detection-only cannot be selected', () => {
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
    const actionableCheckbox = screen.getByTestId('finding-checkbox-f-1');
    const detectionOnlyCheckbox = screen.queryByTestId('finding-checkbox-f-4');

    expect(actionableCheckbox).toBeDefined();
    expect(detectionOnlyCheckbox).toBeNull();

    fireEvent.click(actionableCheckbox);
    expect(screen.getByTestId('selected-count').textContent).toBe('1 selected');
  });

  it('select all only selects actionable findings', () => {
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
    expect(screen.getByTestId('selected-count').textContent).toBe('1 selected');
  });

  it('clear selection resets selected count', () => {
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
    expect(screen.getByTestId('selected-count').textContent).toBe('1 selected');
    fireEvent.click(screen.getByTestId('clear-selection-btn'));
    expect(screen.getByTestId('selected-count').textContent).toBe('0 selected');
  });

  it('prepare is called with the real planId', async () => {
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
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE,
        expect.objectContaining({ plan_id: planId }),
      );
    });
  });

  it('preview data is displayed', async () => {
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
    expect(screen.getByText('Junk temp files')).toBeDefined();
  });

  it('validate is called with the real planId and leads to awaiting approval', async () => {
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
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE,
        expect.objectContaining({ plan_id: planId }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('results-view-awaiting-approval')).toBeDefined();
    });
  });

  it('validated plan displays explicit Approve & Fix button', async () => {
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
  });

  it('execute is not called before approval', async () => {
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

    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });

  it('clicking Approve & Fix calls scan_core.remediation.execute with mode live', async () => {
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
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
        expect.objectContaining({
          plan_id: planId,
          request_id: validPreview.request_id,
          approval_token: validPreview.approval_token,
          mode: 'live',
        }),
      );
    });
  });

  it('after execute, status polling starts', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: true, summary: makeExecution('executing') });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS) {
        return Promise.resolve({ ok: true, status: makeExecution('completed') });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS,
        expect.objectContaining({ execution_id: executionId }),
      );
    });
  });

  it('progress is rendered from backend status', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: true, summary: makeExecution('executing') });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS) {
        return Promise.resolve({
          ok: true,
          status: {
            ...makeExecution('executing'),
            completed: 2,
            total: 5,
            failed: 1,
            rejected: 0,
            skipped: 0,
            requires_review: 1,
          },
        });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(screen.getByTestId('execution-progress-panel')).toBeDefined();
    });
    // Wait for the status poll to update the execution counts from the
    // backend status response (completed: 2, total: 5, failed: 1, review: 1).
    await waitFor(() => {
      expect(screen.getByTestId('execution-completed-count').textContent).toBe('2 / 5');
    });
    expect(screen.getByTestId('execution-failed-count').textContent).toBe('1');
    expect(screen.getByTestId('execution-review-count').textContent).toBe('1');
  });

  it('scan_core.remediation.cancel is called by cancel button', async () => {
    let statusCount = 0;
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: true, summary: makeExecution('executing') });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS) {
        statusCount += 1;
        return Promise.resolve({
          ok: true,
          status: statusCount >= 2 ? { ...makeExecution('cancelled'), cancelled: true } : makeExecution('executing'),
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_CANCEL) {
        return Promise.resolve({ ok: true, cancelled: true });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(screen.getByTestId('execution-cancel-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('execution-cancel-btn'));
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_REMEDIATION_CANCEL,
        expect.objectContaining({ execution_id: executionId }),
      );
    });
  });

  it('cancellation eventually leads to cancelled terminal state', async () => {
    let statusCount = 0;
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: true, summary: makeExecution('executing') });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS) {
        statusCount += 1;
        return Promise.resolve({
          ok: true,
          status: statusCount >= 2 ? { ...makeExecution('cancelled'), cancelled: true } : makeExecution('executing'),
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_CANCEL) {
        return Promise.resolve({ ok: true, cancelled: true });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(screen.getByTestId('execution-cancel-btn')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('execution-cancel-btn'));
    await waitFor(
      () => {
        expect(screen.getByTestId('terminal-state-cancelled')).toBeDefined();
      },
      { timeout: 2000 },
    );
  });

  it('completed terminal state renders correctly', async () => {
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
      expect(screen.getByTestId('terminal-state-completed')).toBeDefined();
    });
  });

  it('partial, failed, and cancelled states render correctly', async () => {
    for (const endState of ['partial', 'failed', 'cancelled'] as const) {
      cleanup();
      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
          return Promise.resolve({ ok: true, preview: validPreview });
        }
        if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
          return Promise.resolve({ ok: true, validation: validValidation });
        }
        if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
          return Promise.resolve({ ok: true, summary: { ...makeExecution(endState), cancelled: endState === 'cancelled' } });
        }
        return Promise.reject(new Error(`Unknown method: ${method}`));
      });

      const { unmount } = render(
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
        expect(screen.getByTestId(`terminal-state-${endState}`)).toBeDefined();
      });
      unmount();
    }
  });

  it('stale/blocked validation keeps Approve & Fix disabled', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({
          ok: true,
          validation: {
            valid: false,
            status: 'rejected',
            total: 1,
            completed: 0,
            failed: 0,
            rejected: 1,
            requires_review: 0,
            dry_run: true,
            warnings: ['Action is stale'],
            summary: 'Plan validation rejected',
          },
        });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({
          ok: true,
          preview: {
            ...validPreview,
            is_stale: true,
            warnings: ['Preview is stale'],
          },
        });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(screen.getByTestId('validation-blocked-message')).toBeDefined();
    });
    const approveBtn = screen.queryByTestId('validation-approve-btn') as HTMLButtonElement | null;
    expect(approveBtn).toBeNull();

    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });

  it('execute RPC failure does not display completed', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: false, error: 'approval token expired' });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(screen.getByTestId('results-view-error')).toBeDefined();
    });
    expect(screen.queryByTestId('terminal-state-completed')).toBeNull();
  });

  it('status polling failure does not fabricate success', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: true, summary: makeExecution('executing') });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS) {
        return Promise.resolve({ ok: false, error: 'status unavailable' });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
    await waitFor(
      () => {
        expect(screen.getByTestId('results-view-error')).toBeDefined();
      },
      { timeout: 2000 },
    );
    expect(screen.queryByTestId('terminal-state-completed')).toBeNull();
  });

  it('Approve & Fix click is prevented from double-execution', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        // Deliberately slow so that the second click could overlap.
        return new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, summary: makeExecution('executing') }), 100),
        );
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
    fireEvent.click(screen.getByTestId('validation-approve-btn'));

    await waitFor(
      () => {
        const executeCalls = mockCall.mock.calls.filter(
          (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
        );
        expect(executeCalls.length).toBe(1);
      },
      { timeout: 2000 },
    );
  });

  it('never calls disallowed methods', async () => {
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

    const disallowed = [
      RPC_METHODS.ORCHESTRATOR_OPTIMIZE,
      RPC_METHODS.ORCHESTRATOR_FULL_ASYNC,
      'security.remediation.execute',
      'security.remediation.rollback',
    ];
    for (const method of disallowed) {
      const calls = mockCall.mock.calls.filter((call) => call[0] === method);
      expect(calls).toHaveLength(0);
    }

  });

  it('rejected execution leaves step="rejected" and does not poll status', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: false, status: 'rejected', reason: 'Plan is stale' });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(screen.getByTestId('results-view-rejected')).toBeDefined();
    });

    const statusCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS,
    );
    expect(statusCalls).toHaveLength(0);
  });

  it('missing approval token rejection renders the rejected panel', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({ ok: true, preview: validPreview });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve({ ok: true, validation: validValidation });
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE) {
        return Promise.resolve({ ok: false, status: 'rejected', reason: 'Missing approval token' });
      }
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(screen.getByTestId('results-view-rejected')).toBeDefined();
    });
    expect(screen.getByText('Missing approval token')).toBeDefined();
  });

  it('valid approval still reaches normal execution completion', async () => {
    mockCall.mockImplementation((method: string) => {
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
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });

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
      expect(screen.getByTestId('terminal-state-completed')).toBeDefined();
    });
  });
});
