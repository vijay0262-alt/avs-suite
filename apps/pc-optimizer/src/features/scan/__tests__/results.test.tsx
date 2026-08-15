// @vitest-environment happy-dom
/**
 * Results / Remediation Preview tests — SC-8C8 Part 2B Phase 2.
 *
 * Covers finding selection, preview generation, validation, and the
 * hard stop before any `scan_core.remediation.execute` or orchestrator call.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ResultsView } from '../ResultsView';
import { orchestratorService } from '../../orchestrator/orchestrator.service';
import { RPC_METHODS } from '@avs/shared/rpc';
import type { ScanFinding } from '../types';

const planId = 'plan-test-123';

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

describe('ResultsView', () => {
  const mockCall = vi.fn();

  beforeEach(() => {
    cleanup();
    Object.assign(window as unknown as Record<string, unknown>, {
      avs: { rpc: { call: mockCall } },
    });
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve({
          ok: true,
          preview: {
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
      return Promise.reject(new Error(`Unknown method: ${method}`));
    });
    vi.spyOn(orchestratorService, 'fullAsync');
    vi.spyOn(orchestratorService, 'optimize');
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

  it('validate is called with the real planId', async () => {
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
  });

  it('stale/blocked validation displays safe failure UI', async () => {
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
            approval_token: 'token-2',
            plan_id: planId,
            total_actions: 1,
            action_types: { delete: 1 },
            affected_targets: ['Stale target'],
            estimated_size: 0,
            safety_state_counts: { stale: 1 },
            fixability_counts: { automatic: 1 },
            backup_required: false,
            rollback_supported: true,
            warnings: ['Preview is stale'],
            is_stale: true,
            generated_at: '2026-01-01T00:00:00Z',
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
    expect(screen.getByText(/Execution is blocked/)).toBeDefined();
  });

  it('never calls execute or orchestrator.optimize', async () => {
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
        expect.any(Object),
      );
    });

    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
    expect(orchestratorService.optimize).not.toHaveBeenCalled();
    expect(orchestratorService.fullAsync).not.toHaveBeenCalled();
  });
});
