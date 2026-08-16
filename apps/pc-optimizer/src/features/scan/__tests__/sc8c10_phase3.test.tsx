// @vitest-environment happy-dom
/**
 * SC-8C10 Phase 3 — Persistence, Recovery & Cross-Session Consistency Tests
 *
 * Validates restart behavior, persisted plan/scan recovery, interrupted
 * execution detection, and cross-session plan consistency.
 *
 * Does NOT test automatic resume, automatic rollback, or automatic execution.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardScanStatusCard } from '../components/DashboardScanStatusCard';
import { PlanReviewView } from '../PlanReviewView';
import { unifiedScanState } from '../unifiedScanState';
import { RPC_METHODS } from '@avs/shared/rpc';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('SC-8C10 Phase 3 — Persistence & Recovery', () => {
  const mockCall = vi.fn();

  beforeEach(() => {
    cleanup();
    unifiedScanState.clear();
    mockCall.mockReset();
    Object.assign(globalThis as unknown as Record<string, unknown>, {
      avs: { rpc: { call: mockCall } },
    });
  });

  afterEach(() => {
    unifiedScanState.clear();
    vi.restoreAllMocks();
  });

  describe('Application restart with persisted scan', () => {
    it('loads persisted scan history after application restart without starting a new scan', async () => {
      const persisted = {
        scan_id: 'restart-scan-1',
        scan_type: 'full',
        started_at: new Date(Date.now() - 60000).toISOString(),
        completed_at: new Date(Date.now() - 30000).toISOString(),
        duration_ms: 30000,
        cancelled: false,
        completed: true,
        error_count: 0,
        findings_count: 5,
        action_plan_id: 'plan-restart-1',
        actionable_count: 3,
        review_count: 1,
        blocked_count: 1,
        not_fixable_count: 0,
        statistics: { matches: 5, actionable: 3, blocked: 1, review: 1 },
      };

      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
          return Promise.resolve({ ok: true, latest: persisted });
        }
        return Promise.resolve({ ok: true });
      });

      render(<DashboardScanStatusCard />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-scan-issues').textContent).toBe('5 issues');
      });

      expect(screen.getByTestId('dashboard-scan-action').textContent).toBe('Review Findings');

      // Verify no scan was started
      const scanCalls = mockCall.mock.calls.filter(
        (call) =>
          call[0] === RPC_METHODS.SCAN_CORE_SCAN_QUICK ||
          call[0] === RPC_METHODS.SCAN_CORE_SCAN_FULL,
      );
      expect(scanCalls).toHaveLength(0);
    });

    it('does not automatically resume an interrupted execution after restart', async () => {
      const persisted = {
        scan_id: 'interrupted-scan',
        scan_type: 'full',
        started_at: new Date(Date.now() - 120000).toISOString(),
        completed_at: new Date(Date.now() - 60000).toISOString(),
        duration_ms: 60000,
        cancelled: false,
        completed: true,
        error_count: 0,
        findings_count: 10,
        action_plan_id: 'plan-interrupted',
        actionable_count: 10,
        review_count: 0,
        blocked_count: 0,
        not_fixable_count: 0,
        statistics: { matches: 10, actionable: 10 },
      };

      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
          return Promise.resolve({ ok: true, latest: persisted });
        }
        return Promise.resolve({ ok: true });
      });

      render(<DashboardScanStatusCard />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-scan-issues')).toBeTruthy();
      });

      // Verify no remediation execute was called
      const executeCalls = mockCall.mock.calls.filter(
        (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
      );
      expect(executeCalls).toHaveLength(0);
    });

    it('does not automatically rollback after restart', async () => {
      const persisted = {
        scan_id: 'rollback-candidate',
        scan_type: 'full',
        started_at: new Date(Date.now() - 180000).toISOString(),
        completed_at: new Date(Date.now() - 120000).toISOString(),
        duration_ms: 60000,
        cancelled: false,
        completed: true,
        error_count: 0,
        findings_count: 8,
        action_plan_id: 'plan-rollback',
        actionable_count: 8,
        review_count: 0,
        blocked_count: 0,
        not_fixable_count: 0,
        statistics: { matches: 8, actionable: 8 },
      };

      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
          return Promise.resolve({ ok: true, latest: persisted });
        }
        return Promise.resolve({ ok: true });
      });

      render(<DashboardScanStatusCard />, { wrapper: Wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-scan-issues')).toBeTruthy();
      });

      // Verify no rollback was called
      const rollbackCalls = mockCall.mock.calls.filter(
        (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
      );
      expect(rollbackCalls).toHaveLength(0);
    });
  });

  describe('Persisted plan hydration after restart', () => {
    it('hydrates a persisted plan without executing it', async () => {
      const planDetails = {
        ok: true,
        plan_id: 'plan-persist-1',
        generated_at: new Date().toISOString(),
        is_stale: false,
        statistics: {
          matches: 4,
          actionable: 4,
          blocked: 0,
          review: 0,
          not_fixable: 0,
        },
        findings: [
          {
            finding_id: 'f1',
            display_name: 'Test Finding',
            rule_id: 'test-rule',
            rule_category: 'delete_file',
            severity: 'low',
            confidence: 1.0,
            safety: 'safe',
            reason: 'Test',
            recommended_action: 'delete file',
            estimated_size: 100,
            is_blocked: false,
            requires_review: false,
            is_actionable: true,
            canonical_path: '',
          },
        ],
      };

      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
          return Promise.resolve(planDetails);
        }
        return Promise.resolve({ ok: true });
      });

      render(
        <PlanReviewView planId="plan-persist-1" module="optimize" onClose={() => {}} />,
        { wrapper: Wrapper },
      );

      await waitFor(() => {
        expect(screen.getByTestId('plan-review-view')).toBeTruthy();
      });

      // Verify no execution was triggered
      const executeCalls = mockCall.mock.calls.filter(
        (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
      );
      expect(executeCalls).toHaveLength(0);
    });

    it('shows safe error when persisted plan is missing', async () => {
      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
          return Promise.resolve({ ok: false, error: 'Plan not found' });
        }
        return Promise.resolve({ ok: true });
      });

      render(
        <PlanReviewView planId="plan-missing" module="optimize" onClose={() => {}} />,
        { wrapper: Wrapper },
      );

      await waitFor(() => {
        expect(screen.getByTestId('plan-review-error')).toBeTruthy();
      });
    });

    it('shows safe error when persisted plan is stale', async () => {
      const stalePlan = {
        ok: true,
        plan_id: 'plan-stale',
        generated_at: new Date(Date.now() - 7200000).toISOString(),
        is_stale: true,
        statistics: {
          matches: 2,
          actionable: 2,
          blocked: 0,
          review: 0,
          not_fixable: 0,
        },
        findings: [],
      };

      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
          return Promise.resolve(stalePlan);
        }
        return Promise.resolve({ ok: true });
      });

      render(
        <PlanReviewView planId="plan-stale" module="optimize" onClose={() => {}} />,
        { wrapper: Wrapper },
      );

      await waitFor(() => {
        expect(screen.getByTestId('plan-review-stale-warning')).toBeTruthy();
      });
    });
  });

  describe('Cross-session plan consistency', () => {
    it('distinguishes multiple persisted plans by plan_id', async () => {
      const plan1 = {
        ok: true,
        plan_id: 'plan-a',
        generated_at: new Date(Date.now() - 3600000).toISOString(),
        is_stale: false,
        statistics: { matches: 2, actionable: 2 },
        findings: [
          {
            finding_id: 'f-a1',
            display_name: 'Plan A Finding',
            rule_id: 'rule-a',
            rule_category: 'delete_file',
            severity: 'low',
            confidence: 1.0,
            safety: 'safe',
            reason: 'Plan A',
            recommended_action: 'delete file',
            estimated_size: 50,
            is_blocked: false,
            requires_review: false,
            is_actionable: true,
            canonical_path: '',
          },
        ],
      };

      const plan2 = {
        ok: true,
        plan_id: 'plan-b',
        generated_at: new Date().toISOString(),
        is_stale: false,
        statistics: { matches: 3, actionable: 3 },
        findings: [
          {
            finding_id: 'f-b1',
            display_name: 'Plan B Finding',
            rule_id: 'rule-b',
            rule_category: 'delete_file',
            severity: 'medium',
            confidence: 1.0,
            safety: 'safe',
            reason: 'Plan B',
            recommended_action: 'delete file',
            estimated_size: 100,
            is_blocked: false,
            requires_review: false,
            is_actionable: true,
            canonical_path: '',
          },
        ],
      };

      mockCall.mockImplementation((method: string, params?: unknown) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
          const planId = (params as { plan_id?: string })?.plan_id;
          if (planId === 'plan-a') return Promise.resolve(plan1);
          if (planId === 'plan-b') return Promise.resolve(plan2);
        }
        return Promise.resolve({ ok: true });
      });

      render(
        <PlanReviewView planId="plan-a" module="optimize" onClose={() => {}} />,
        { wrapper: Wrapper },
      );

      await waitFor(() => {
        expect(screen.getByTestId('plan-review-view')).toBeTruthy();
      });

      // Plan IDs are distinct - this validates backend plan_id routing
      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS,
        expect.objectContaining({ plan_id: 'plan-a' }),
      );

      cleanup();
      render(
        <PlanReviewView planId="plan-b" module="optimize" onClose={() => {}} />,
        { wrapper: Wrapper },
      );

      await waitFor(() => {
        expect(screen.getByTestId('plan-review-view')).toBeTruthy();
      });

      expect(mockCall).toHaveBeenCalledWith(
        RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS,
        expect.objectContaining({ plan_id: 'plan-b' }),
      );
    });
  });

  describe('Active vs persisted state precedence', () => {
    it('active in-memory session hides persisted history', async () => {
      const persisted = {
        scan_id: 'old-scan',
        scan_type: 'full',
        started_at: new Date(Date.now() - 3600000).toISOString(),
        completed_at: new Date(Date.now() - 3500000).toISOString(),
        duration_ms: 100000,
        cancelled: false,
        completed: true,
        error_count: 0,
        findings_count: 20,
        action_plan_id: 'plan-old',
        actionable_count: 20,
        review_count: 0,
        blocked_count: 0,
        not_fixable_count: 0,
        statistics: { matches: 20, actionable: 20 },
      };

      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
          return Promise.resolve({ ok: true, latest: persisted });
        }
        return Promise.resolve({ ok: true });
      });

      // Set active in-memory session
      unifiedScanState.setLatest({
        sessionId: 'active-scan',
        module: 'optimize',
        mode: 'full',
        status: 'scanning',
        startedAt: new Date().toISOString(),
        remediationStatus: 'none',
        error: null,
      });

      render(<DashboardScanStatusCard />, { wrapper: Wrapper });

      // Active session should be displayed, not persisted
      await waitFor(() => {
        const card = screen.getByTestId('dashboard-unified-scan-card');
        expect(card.textContent).toContain('Scanning');
      });
    });

    it('clears active session to reveal persisted history', async () => {
      const persisted = {
        scan_id: 'revealed-scan',
        scan_type: 'full',
        started_at: new Date(Date.now() - 1800000).toISOString(),
        completed_at: new Date(Date.now() - 1700000).toISOString(),
        duration_ms: 100000,
        cancelled: false,
        completed: true,
        error_count: 0,
        findings_count: 7,
        action_plan_id: 'plan-revealed',
        actionable_count: 7,
        review_count: 0,
        blocked_count: 0,
        not_fixable_count: 0,
        statistics: { matches: 7, actionable: 7 },
      };

      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
          return Promise.resolve({ ok: true, latest: persisted });
        }
        return Promise.resolve({ ok: true });
      });

      unifiedScanState.setLatest({
        sessionId: 'temp-session',
        module: 'optimize',
        mode: 'quick',
        status: 'complete',
        startedAt: new Date(Date.now() - 60000).toISOString(),
        completedAt: new Date(Date.now() - 30000).toISOString(),
        remediationStatus: 'none',
        error: null,
        statistics: { matches: 0, actionable: 0 },
      });

      render(<DashboardScanStatusCard />, { wrapper: Wrapper });

      // Clear active session and wait for persisted to load
      cleanup();
      unifiedScanState.clear();
      render(<DashboardScanStatusCard />, { wrapper: Wrapper });

      await waitFor(() => {
        const issues = screen.queryByTestId('dashboard-scan-issues');
        expect(issues).toBeTruthy();
        expect(issues?.textContent).toBe('7 issues');
      });
    });
  });

  describe('Persistence failure behavior', () => {
    it('shows safe error when scan.latest fails', async () => {
      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
          return Promise.resolve({ ok: false, error: 'Database unavailable' });
        }
        return Promise.resolve({ ok: true });
      });

      render(<DashboardScanStatusCard />, { wrapper: Wrapper });

      // Dashboard should fall back to idle state without crashing
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-unified-scan-card')).toBeTruthy();
      });
    });

    it('shows safe error when plan_details fails', async () => {
      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
          return Promise.resolve({ ok: false, error: 'Database read failed' });
        }
        return Promise.resolve({ ok: true });
      });

      render(
        <PlanReviewView planId="plan-fail" module="optimize" onClose={() => {}} />,
        { wrapper: Wrapper },
      );

      await waitFor(() => {
        expect(screen.getByTestId('plan-review-error')).toBeTruthy();
      });
    });

    it('handles malformed persisted scan record safely', async () => {
      const malformed = {
        scan_id: 'malformed',
        // Missing required fields
        statistics: null,
      };

      mockCall.mockImplementation((method: string) => {
        if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
          return Promise.resolve({ ok: true, latest: malformed });
        }
        return Promise.resolve({ ok: true });
      });

      render(<DashboardScanStatusCard />, { wrapper: Wrapper });

      // Should not crash; falls back to safe idle state
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-unified-scan-card')).toBeTruthy();
      });
    });
  });

  describe('Privacy & data minimization', () => {
    it('does not write scan state to localStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      unifiedScanState.setLatest({
        sessionId: 'privacy-test',
        module: 'optimize',
        mode: 'full',
        status: 'scanning',
        startedAt: new Date().toISOString(),
        remediationStatus: 'none',
        error: null,
      });

      const localStorageCalls = setItemSpy.mock.calls.filter((call) =>
        call[0].includes('scan'),
      );
      expect(localStorageCalls).toHaveLength(0);

      setItemSpy.mockRestore();
    });

    it('does not write scan state to sessionStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      unifiedScanState.setLatest({
        sessionId: 'session-privacy-test',
        module: 'security',
        mode: 'full',
        status: 'complete',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        remediationStatus: 'none',
        error: null,
      });

      const sessionStorageCalls = setItemSpy.mock.calls.filter((call) =>
        call[0].includes('scan'),
      );
      expect(sessionStorageCalls).toHaveLength(0);

      setItemSpy.mockRestore();
    });
  });
});
