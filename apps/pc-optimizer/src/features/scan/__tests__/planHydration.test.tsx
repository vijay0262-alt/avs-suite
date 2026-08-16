// @vitest-environment happy-dom
/**
 * Plan hydration tests — SC-8C9 Phase 3.
 *
 * Verifies that a persisted plan_id can safely hydrate ResultsView
 * from scan_core without fabricating findings, without executing remediation,
 * and without exposing raw target data.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlanReviewView } from '../PlanReviewView';
import { RPC_METHODS } from '@avs/shared/rpc';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('PlanReviewView', () => {
  const mockCall = vi.fn();

  const planDetails = {
    ok: true,
    plan_id: 'plan-h1',
    generated_at: new Date().toISOString(),
    is_stale: false,
    statistics: {
      matches: 3,
      actionable: 2,
      blocked: 0,
      review: 1,
      not_fixable: 0,
    },
    findings: [
      {
        finding_id: 'f1',
        display_name: 'Junk Temp Files',
        rule_id: 'junk-temp-files',
        rule_category: 'delete_file',
        severity: 'medium',
        confidence: 1.0,
        safety: 'safe',
        reason: 'Temporary files recoverable',
        recommended_action: 'delete file',
        estimated_size: 1024,
        is_blocked: false,
        requires_review: false,
        is_actionable: true,
        canonical_path: '',
      },
      {
        finding_id: 'f2',
        display_name: 'Old Log File',
        rule_id: 'junk-logs',
        rule_category: 'delete_file',
        severity: 'low',
        confidence: 1.0,
        safety: 'safe',
        reason: 'Log file',
        recommended_action: 'delete file',
        estimated_size: 512,
        is_blocked: false,
        requires_review: false,
        is_actionable: true,
        canonical_path: '',
      },
    ],
  };

  const preview = {
    ok: true,
    preview: {
      request_id: 'req-1',
      approval_token: 'tok-1',
      plan_id: 'plan-h1',
      total_actions: 2,
      action_types: { delete_file: 2 },
      affected_targets: [{ display_name: 'Junk Temp Files' }, { display_name: 'Old Log File' }],
      estimated_size: 1536,
      safety_state_counts: { safe: 2 },
      fixability_counts: { auto_fixable: 2 },
      backup_required: false,
      rollback_supported: false,
      warnings: [],
      is_stale: false,
      generated_at: new Date().toISOString(),
    },
  };

  const validation = {
    ok: true,
    validation: {
      valid: true,
      status: 'ok',
      total: 2,
      completed: 2,
      failed: 0,
      rejected: 0,
      requires_review: 0,
      dry_run: 2,
      warnings: [],
      summary: 'All checks passed',
    },
  };

  beforeEach(() => {
    cleanup();
    mockCall.mockReset();
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(planDetails);
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve(preview);
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve(validation);
      }
      return undefined;
    });
    Object.assign(globalThis as unknown as Record<string, unknown>, {
      avs: { rpc: { call: mockCall } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates findings from a valid persisted plan_id', async () => {
    render(
      <PlanReviewView
        planId="plan-h1"
        module="optimize"
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('results-view')).toBeDefined();
    });

    expect(screen.getByText('2 issues found')).toBeDefined();
    expect(screen.getAllByTestId('finding-card')).toHaveLength(2);
    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS,
      { plan_id: 'plan-h1' },
    );
  });

  it('does not expose canonical_path or target data in hydrated findings', async () => {
    render(
      <PlanReviewView
        planId="plan-h1"
        module="optimize"
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('findings-list')).toBeDefined();
    });

    const cards = screen.getAllByTestId('finding-card');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.textContent).not.toMatch(/C:\\\\|\\\\tmp\\\\|\\\\Users/);
    }
  });

  it('prepares the plan before remediation without automatic execution', async () => {
    render(
      <PlanReviewView
        planId="plan-h1"
        module="optimize"
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('review-remediate-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));

    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE,
        { plan_id: 'plan-h1' },
      );
    });

    expect(mockCall).not.toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
      expect.any(Object),
    );
  });

  it('remediation preview displays display_name and does not show canonical_path', async () => {
    render(
      <PlanReviewView
        planId="plan-h1"
        module="optimize"
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('review-remediate-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('remediation-preview-panel')).toBeDefined();
    });

    expect(screen.getByText('Junk Temp Files')).toBeDefined();
    expect(screen.getByText('Old Log File')).toBeDefined();
    expect(screen.queryByText(/C:\\\\Users/)).toBeNull();
    expect(screen.queryByText(/canonical_path/)).toBeNull();
  });

  it('double clicking Review & Remediate calls prepare only once', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(planDetails);
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return new Promise((resolve) => setTimeout(() => resolve(preview), 100));
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve(validation);
      }
      return undefined;
    });

    render(
      <PlanReviewView
        planId="plan-h1"
        module="optimize"
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('review-remediate-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));

    await new Promise((resolve) => setTimeout(resolve, 50));

    const prepareCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE,
    );
    expect(prepareCalls).toHaveLength(1);
    expect(prepareCalls[0][1]).toEqual({ plan_id: 'plan-h1' });
  });

  it('validate cannot be re-triggered while already validating', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(planDetails);
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve(preview);
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return new Promise((resolve) => setTimeout(() => resolve(validation), 100));
      }
      return undefined;
    });

    render(
      <PlanReviewView
        planId="plan-h1"
        module="optimize"
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('review-remediate-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('select-all-actionable-btn'));
    fireEvent.click(screen.getByTestId('review-remediate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('remediation-preview-panel')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('preview-validate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('results-view-validating')).toBeDefined();
    });

    // Validate Plan button is gone while validating; no second request is possible.
    expect(screen.queryByTestId('preview-validate-btn')).toBeNull();

    const validateCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE,
    );
    expect(validateCalls).toHaveLength(1);
    expect(validateCalls[0][1]).toEqual({ plan_id: 'plan-h1' });
  });

  it('shows a safe unavailable state for a missing plan', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve({ ok: false, error: 'Plan not found' });
      }
      return undefined;
    });

    render(
      <PlanReviewView
        planId="missing"
        module="optimize"
        onClose={() => {}}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-error')).toBeDefined();
    });

    expect(screen.getByText('Results no longer available')).toBeDefined();
  });
});
