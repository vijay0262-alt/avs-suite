// @vitest-environment happy-dom
/**
 * Dashboard scan integration tests — SC-8C9 Phase 1.
 *
 * Verifies that the dashboard-facing unified scan state is read-only,
 * does not start new scans on mount, and correctly reflects the latest
 * scan_core scan/remediation/rollback state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardScanStatusCard } from '../components/DashboardScanStatusCard';
import { useDashboardScan } from '../useDashboardScan';
import { toDashboardSnapshot } from '../dashboardAdapter';
import { unifiedScanState } from '../unifiedScanState';
import { RPC_METHODS } from '@avs/shared/rpc';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function SnapshotDump() {
  const { snapshot } = useDashboardScan();
  return (
    <div>
      <span data-testid="dump-status">{snapshot.scanStatus}</span>
      <span data-testid="dump-remediation">{snapshot.remediationStatus}</span>
      <span data-testid="dump-issues">{snapshot.issuesFound}</span>
      <span data-testid="dump-actionable">{snapshot.actionableCount}</span>
      <span data-testid="dump-can-rollback">{snapshot.canRollback ? 'yes' : 'no'}</span>
    </div>
  );
}

describe('Dashboard scan state', () => {
  const mockCall = vi.fn();

  beforeEach(() => {
    cleanup();
    unifiedScanState.clear();
    mockCall.mockReset();
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
        return Promise.resolve({ ok: true, latest: null });
      }
      if (method === RPC_METHODS.SCAN_CORE_SCAN_HISTORY) {
        return Promise.resolve({ ok: true, history: [] });
      }
      return undefined;
    });
    Object.assign(globalThis as unknown as Record<string, unknown>, {
      avs: { rpc: { call: mockCall } },
    });
  });

  afterEach(() => {
    unifiedScanState.clear();
    vi.restoreAllMocks();
  });

  it('starts with an idle snapshot when no scan session exists', () => {
    render(<SnapshotDump />, { wrapper: Wrapper });
    expect(screen.getByTestId('dump-status').textContent).toBe('idle');
    expect(screen.getByTestId('dump-remediation').textContent).toBe('none');
    expect(screen.getByTestId('dump-issues').textContent).toBe('0');
  });

  it('adapts a completed scan result preserving backend counts', () => {
    const snapshot = toDashboardSnapshot({
      sessionId: 's1',
      module: 'optimize',
      mode: 'full',
      status: 'complete',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      planId: 'plan-1',
      statistics: {
        assets_discovered: 100,
        assets_evaluated: 95,
        matches: 12,
        rules_evaluated: 20,
        actionable: 8,
        blocked: 2,
        review: 1,
        not_fixable: 1,
      },
      remediationStatus: 'none',
      error: null,
    });
    expect(snapshot.scanStatus).toBe('complete');
    expect(snapshot.issuesFound).toBe(12);
    expect(snapshot.actionableCount).toBe(8);
    expect(snapshot.blockedCount).toBe(2);
    expect(snapshot.reviewCount).toBe(1);
    expect(snapshot.notFixableCount).toBe(1);
    expect(snapshot.canReview).toBe(true);
    expect(snapshot.rollbackAvailable).toBe(false);
    expect(snapshot.moduleRoute).toBe('/ai-smart-optimize');
  });

  it('adapts a rejected execution without fabricating values', () => {
    const snapshot = toDashboardSnapshot({
      sessionId: 's2',
      module: 'security',
      mode: 'full',
      status: 'complete',
      startedAt: new Date().toISOString(),
      planId: 'plan-2',
      statistics: { matches: 3, actionable: 3 },
      rollbackSupported: true,
      executionId: 'exec-2',
      remediationStatus: 'rejected',
      execution: {
        execution_id: 'exec-2',
        request_id: 'req-2',
        plan_id: 'plan-2',
        status: 'rejected',
        total: 0,
        completed: 0,
        failed: 0,
        rejected: 1,
        skipped: 0,
        requires_review: 0,
        cancelled: false,
        dry_run: false,
      },
      error: 'Plan is stale',
    });
    expect(snapshot.remediationStatus).toBe('rejected');
    expect(snapshot.canRollback).toBe(false);
    expect(snapshot.rollbackAvailable).toBe(false);
  });

  it('adapts a completed execution with rollback available', () => {
    const snapshot = toDashboardSnapshot({
      sessionId: 's3',
      module: 'protection',
      mode: 'full',
      status: 'complete',
      startedAt: new Date().toISOString(),
      planId: 'plan-3',
      statistics: { matches: 5, actionable: 5 },
      rollbackSupported: true,
      executionId: 'exec-3',
      remediationStatus: 'completed',
      execution: {
        execution_id: 'exec-3',
        request_id: 'req-3',
        plan_id: 'plan-3',
        status: 'completed',
        total: 5,
        completed: 5,
        failed: 0,
        rejected: 0,
        skipped: 0,
        requires_review: 0,
        cancelled: false,
        dry_run: false,
      },
      error: null,
    });
    expect(snapshot.canRollback).toBe(true);
    expect(snapshot.rollbackAvailable).toBe(true);
    expect(snapshot.moduleRoute).toBe('/protection-center');
  });

  it('does not call scan_core.scan.* on DashboardScanStatusCard mount or re-render', () => {
    const { rerender } = render(
      <DashboardScanStatusCard />,
      { wrapper: Wrapper },
    );
    rerender(<DashboardScanStatusCard />);
    const scanCalls = mockCall.mock.calls.filter(
      (call) =>
        call[0] === RPC_METHODS.SCAN_CORE_SCAN_QUICK ||
        call[0] === RPC_METHODS.SCAN_CORE_SCAN_FULL,
    );
    const remediationCalls = mockCall.mock.calls.filter(
      (call) =>
        call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(scanCalls).toHaveLength(0);
    expect(remediationCalls).toHaveLength(0);
    expect(screen.getByTestId('dashboard-scan-action').textContent).toBe('Start a Scan');
  });

  it('reflects a completed scan in the dashboard card and offers review', () => {
    unifiedScanState.setLatest({
      sessionId: 's4',
      module: 'optimize',
      mode: 'full',
      status: 'complete',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      planId: 'plan-4',
      statistics: {
        matches: 7,
        actionable: 5,
      },
      remediationStatus: 'none',
      error: null,
    });
    render(<DashboardScanStatusCard />, { wrapper: Wrapper });
    expect(screen.getByTestId('dashboard-scan-issues').textContent).toBe('7 issues');
    expect(screen.getByTestId('dashboard-scan-actionable').textContent).toBe('5 actionable');
    expect(screen.getByTestId('dashboard-scan-action').textContent).toBe('Review Findings');
  });

  it('does not expose legacy orchestrator or security remediation RPCs in scan components', () => {
    const forbidden = [
      RPC_METHODS.ORCHESTRATOR_OPTIMIZE,
      RPC_METHODS.ORCHESTRATOR_FULL_ASYNC,
      'security.remediation.execute',
      'security.remediation.rollback',
    ];
    render(<SnapshotDump />, { wrapper: Wrapper });
    const calls = mockCall.mock.calls.map((call) => call[0] as string);
    for (const method of forbidden) {
      expect(calls).not.toContain(method);
    }
  });

  it('loads persisted latest scan after fresh application state', async () => {
    const persisted = {
      scan_id: 'h1',
      scan_type: 'full',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: 1200,
      cancelled: false,
      completed: true,
      error_count: 0,
      findings_count: 3,
      action_plan_id: 'plan-h1',
      actionable_count: 2,
      review_count: 0,
      blocked_count: 1,
      not_fixable_count: 0,
      statistics: { matches: 3, actionable: 2, blocked: 1 },
    };
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
        return Promise.resolve({ ok: true, latest: persisted });
      }
      return Promise.resolve({ ok: true, history: [] });
    });
    render(<DashboardScanStatusCard />, { wrapper: Wrapper });
    await vi.waitFor(() => {
      expect(screen.getByTestId('dashboard-scan-issues').textContent).toBe('3 issues');
    });
    expect(screen.getByTestId('dashboard-scan-action').textContent).toBe('Review Findings');
  });

  it('active in-memory session takes precedence over persisted history', () => {
    const persisted = {
      scan_id: 'h2',
      scan_type: 'full',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: 100,
      cancelled: false,
      completed: true,
      error_count: 0,
      findings_count: 9,
      action_plan_id: 'plan-h2',
      actionable_count: 9,
      review_count: 0,
      blocked_count: 0,
      not_fixable_count: 0,
      statistics: { matches: 9, actionable: 9 },
    };
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
        return Promise.resolve({ ok: true, latest: persisted });
      }
      return Promise.resolve({ ok: true, history: [] });
    });
    unifiedScanState.setLatest({
      sessionId: 's-active',
      module: 'optimize',
      mode: 'full',
      status: 'scanning',
      startedAt: new Date().toISOString(),
      remediationStatus: 'none',
      error: null,
    });
    render(<SnapshotDump />, { wrapper: Wrapper });
    expect(screen.getByTestId('dump-status').textContent).toBe('scanning');
  });

  it('does not start orchestrator.fullAsync or orchestrator.optimize from dashboard card', () => {
    render(<DashboardScanStatusCard />, { wrapper: Wrapper });
    const calls = mockCall.mock.calls.map((call) => call[0] as string);
    expect(calls).not.toContain(RPC_METHODS.ORCHESTRATOR_FULL_ASYNC);
    expect(calls).not.toContain(RPC_METHODS.ORCHESTRATOR_OPTIMIZE);
  });
});
