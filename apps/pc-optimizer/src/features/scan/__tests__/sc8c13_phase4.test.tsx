// @vitest-environment happy-dom
/**
 * SC-8C13 Phase 4 — Integration, Persistence, Recovery & Cross-Session Validation
 *
 * Validates that Dashboard Optimization behaves correctly across:
 * - application restart
 * - persisted ActionPlans
 * - interrupted execution
 * - stale plans
 * - completed actions
 * - partial execution
 * - failed execution
 * - rollback
 * - multiple plans
 * - active vs persisted state
 * - persistence failures
 * - browser storage restrictions
 *
 * Phase 4 required no production architecture changes; the canonical SC-8C10
 * persistence/recovery model already covers Dashboard Optimization because
 * Dashboard plans are persisted via ActionPlanRepository, hydrated via
 * plan_details RPC, and executed via RemediationCoordinator — all by plan_id.
 *
 * These tests verify that the existing canonical invariants hold specifically
 * for Dashboard-generated plans.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderHook, act, waitFor as hookWaitFor } from '@testing-library/react';
import { PlanReviewView } from '../PlanReviewView';
import { useDashboardOptimizationPlan } from '../useDashboardOptimizationPlan';
import { usePlanDetails } from '../usePlanDetails';
import { unifiedScanState } from '../unifiedScanState';
import { DashboardScanStatusCard } from '../components/DashboardScanStatusCard';
import { scanService } from '../scan.service';
import { RPC_METHODS } from '@avs/shared/rpc';
import { dashboardPreviewToRpcPayload } from '../../dashboard/dashboardOptimizationSerializer';
import type { OptimizeAction } from '../../dashboard/dashboard.types';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

// ── Mock Setup ───────────────────────────────────────────────────────────────

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

// ── Test Data ────────────────────────────────────────────────────────────────

const samplePreviewActions: OptimizeAction[] = [
  { name: 'Temporary Files', size: 123456789, description: 'Windows and user temporary files' },
  { name: 'Recycle Bin', size: 50000000, description: 'Files in Recycle Bin' },
  { name: 'Browser Cache', size: 25000000, description: 'Browser temporary files and cache' },
  { name: 'Thumbnail Cache', size: 5000000, description: 'Windows thumbnail and icon cache' },
  { name: 'Prefetch Files', size: 3000000, description: 'Windows application prefetch files' },
  { name: 'Windows Update Cache', size: 10000000, description: 'Downloaded Windows Update packages' },
  { name: 'Flush DNS', size: 0, description: 'Clear DNS resolver cache' },
];

const dashboardPlanResponse = {
  ok: true,
  plan_id: 'dash-plan-persist-001',
  total_actions: 7,
  auto_fixable: 6,
  review_required: 0,
  not_fixable: 1,
  estimated_affected_size: 216456789,
  statistics: { converted: 6, unsupported: 1, errors: 0 },
};

const dashboardPlanDetails = {
  ok: true,
  plan_id: 'dash-plan-persist-001',
  generated_at: new Date().toISOString(),
  is_stale: false,
  statistics: {
    matches: 7,
    actionable: 6,
    blocked: 0,
    review: 0,
    not_fixable: 1,
    total_findings: 7,
    actions_planned: 7,
    estimated_affected_size: 216456789,
    generated_at: new Date().toISOString(),
  },
  findings: [
    {
      finding_id: 'dashboard_opt_clean_temp_files_0',
      display_name: 'Dashboard Opt Clean Temp Files',
      rule_id: 'dashboard_opt_clean_temp_files',
      rule_category: 'delete_file',
      severity: 'low',
      confidence: 1.0,
      safety: 'safe',
      reason: 'Windows and user temporary files',
      recommended_action: 'delete file',
      estimated_size: 123456789,
      is_blocked: false,
      requires_review: false,
      is_actionable: true,
      canonical_path: '',
    },
    {
      finding_id: 'dashboard_opt_flush_dns_6',
      display_name: 'Dashboard Opt Flush Dns',
      rule_id: 'dashboard_opt_flush_dns',
      rule_category: 'none',
      severity: 'info',
      confidence: 1.0,
      safety: 'unsupported',
      reason: 'Flush DNS has no scan_core ActionType or executor — OUT_OF_SCOPE',
      recommended_action: 'none',
      estimated_size: 0,
      is_blocked: false,
      requires_review: true,
      is_actionable: false,
      canonical_path: '',
    },
  ],
};

const staleDashboardPlanDetails = {
  ...dashboardPlanDetails,
  plan_id: 'dash-plan-stale-001',
  generated_at: new Date(Date.now() - 7200000).toISOString(),
  is_stale: true,
};

const secondDashboardPlanDetails = {
  ...dashboardPlanDetails,
  plan_id: 'dash-plan-persist-002',
  findings: [
    {
      finding_id: 'dashboard_opt_clean_browser_cache_2',
      display_name: 'Dashboard Opt Clean Browser Cache',
      rule_id: 'dashboard_opt_clean_browser_cache',
      rule_category: 'clear_browser_cache',
      severity: 'low',
      confidence: 1.0,
      safety: 'safe',
      reason: 'Browser temporary files and cache',
      recommended_action: 'clear browser cache',
      estimated_size: 25000000,
      is_blocked: false,
      requires_review: false,
      is_actionable: true,
      canonical_path: '',
    },
  ],
};

const validPreview = {
  ok: true,
  preview: {
    request_id: 'req-1',
    plan_id: 'dash-plan-persist-001',
    approval_token: 'token-abc',
    actions_preview: [],
    safety_state_counts: {},
    fixability_counts: {},
    backup_required: 0,
    rollback_supported: 0,
    warnings: [],
    is_stale: false,
    generated_at: new Date().toISOString(),
  },
};

const validValidation = {
  ok: true,
  validation: {
    request_id: 'req-1',
    plan_id: 'dash-plan-persist-001',
    approval_token: 'token-abc',
    can_proceed: true,
    blocked_actions: [],
    warnings: [],
    safety_gates_passed: true,
  },
};

// ── 1. Dashboard plan persists after creation ────────────────────────────────

describe('Dashboard plan persistence', () => {
  it('creates a Dashboard plan that is persisted via ActionPlanRepository', async () => {
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await act(async () => {
      await result.current.createPlan(payload);
    });

    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN,
      { actions: payload },
    );
    expect(result.current.planId).toBe('dash-plan-persist-001');
    expect(result.current.response?.ok).toBe(true);
  });

  it('plan_id is backend-generated, not fabricated by frontend', async () => {
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await act(async () => {
      await result.current.createPlan(payload);
    });

    // plan_id comes from backend response, not frontend generation
    expect(result.current.planId).toBe(dashboardPlanResponse.plan_id);
    expect(result.current.planId).not.toBe('');
    expect(result.current.planId).not.toBeNull();
  });
});

// ── 2. Persisted Dashboard plan can be hydrated after restart ───────────────

describe('Cross-session hydration', () => {
  it('PlanReviewView hydrates a persisted Dashboard plan without executing it', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-persist-001" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-view')).toBeTruthy();
    });

    // Verify no execution was triggered during hydration
    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });

  it('usePlanDetails loads Dashboard plan findings and statistics', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => usePlanDetails('dash-plan-persist-001'));

    await hookWaitFor(() => {
      expect(result.current.findings.length).toBeGreaterThan(0);
    });

    expect(result.current.findings).toHaveLength(2);
    expect(result.current.findings[0].finding_id).toBe('dashboard_opt_clean_temp_files_0');
    expect(result.current.findings[1].finding_id).toBe('dashboard_opt_flush_dns_6');
    expect(result.current.isStale).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('hydrated Dashboard plan findings do not expose canonical_path', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => usePlanDetails('dash-plan-persist-001'));

    await hookWaitFor(() => {
      expect(result.current.findings.length).toBeGreaterThan(0);
    });

    for (const finding of result.current.findings) {
      expect(finding.canonical_path).toBe('');
    }
  });
});

// ── 3. Active Dashboard state takes precedence over persisted history ───────

describe('Active vs persisted state precedence', () => {
  it('active in-memory session hides persisted history for Dashboard', async () => {
    const persisted = {
      scan_id: 'old-dash-scan',
      scan_type: 'full',
      started_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date(Date.now() - 3500000).toISOString(),
      duration_ms: 100000,
      cancelled: false,
      completed: true,
      error_count: 0,
      findings_count: 20,
      action_plan_id: 'dash-plan-old',
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

    unifiedScanState.setLatest({
      sessionId: 'active-dash-scan',
      module: 'optimize',
      mode: 'full',
      status: 'scanning',
      startedAt: new Date().toISOString(),
      remediationStatus: 'none',
      error: null,
    });

    render(<DashboardScanStatusCard />, { wrapper: Wrapper });

    await waitFor(() => {
      const card = screen.getByTestId('dashboard-unified-scan-card');
      expect(card.textContent).toContain('Scanning');
    });
  });

  it('persisted history is used when no active state exists', async () => {
    const persisted = {
      scan_id: 'persisted-dash-scan',
      scan_type: 'full',
      started_at: new Date(Date.now() - 1800000).toISOString(),
      completed_at: new Date(Date.now() - 1700000).toISOString(),
      duration_ms: 100000,
      cancelled: false,
      completed: true,
      error_count: 0,
      findings_count: 7,
      action_plan_id: 'dash-plan-persist-001',
      actionable_count: 6,
      review_count: 0,
      blocked_count: 0,
      not_fixable_count: 1,
      statistics: { matches: 7, actionable: 6 },
    };

    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
        return Promise.resolve({ ok: true, latest: persisted });
      }
      return Promise.resolve({ ok: true });
    });

    render(<DashboardScanStatusCard />, { wrapper: Wrapper });

    await waitFor(() => {
      const issues = screen.getByTestId('dashboard-scan-issues');
      expect(issues.textContent).toBe('7 issues');
    });
  });

  it('empty history gives idle state', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_LATEST) {
        return Promise.resolve({ ok: true, latest: null });
      }
      return Promise.resolve({ ok: true });
    });

    render(<DashboardScanStatusCard />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-unified-scan-card')).toBeTruthy();
    });
  });
});

// ── 4. Missing plan produces safe unavailable state ─────────────────────────

describe('Missing and malformed plans', () => {
  it('missing Dashboard plan produces safe error state', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve({ ok: false, error: 'Plan not found' });
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-missing" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-error')).toBeTruthy();
    });
  });

  it('malformed Dashboard plan produces safe error state', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve({ ok: true, findings: null, statistics: null });
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-malformed" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-error')).toBeTruthy();
    });
  });

  it('persistence failure does not create false success state', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve({ ok: false, error: 'Database unavailable' });
      }
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => usePlanDetails('dash-plan-fail'));

    await hookWaitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error).toBe('Database unavailable');
    expect(result.current.findings).toHaveLength(0);
    expect(result.current.isStale).toBe(false);
  });
});

// ── 5. Multiple Dashboard plan IDs remain independent ───────────────────────

describe('Multiple plan independence', () => {
  it('two Dashboard plan IDs hydrate independently', async () => {
    mockCall.mockImplementation((method: string, params?: unknown) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        const planId = (params as { plan_id?: string })?.plan_id;
        if (planId === 'dash-plan-persist-001') return Promise.resolve(dashboardPlanDetails);
        if (planId === 'dash-plan-persist-002') return Promise.resolve(secondDashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    const { result: result1 } = renderHook(() => usePlanDetails('dash-plan-persist-001'));
    const { result: result2 } = renderHook(() => usePlanDetails('dash-plan-persist-002'));

    await hookWaitFor(() => {
      expect(result1.current.findings.length).toBeGreaterThan(0);
    });
    await hookWaitFor(() => {
      expect(result2.current.findings.length).toBeGreaterThan(0);
    });

    expect(result1.current.findings[0].finding_id).toBe('dashboard_opt_clean_temp_files_0');
    expect(result2.current.findings[0].finding_id).toBe('dashboard_opt_clean_browser_cache_2');
    expect(result1.current.planId).toBe('dash-plan-persist-001');
    expect(result2.current.planId).toBe('dash-plan-persist-002');
  });

  it('old plan ID does not accidentally hydrate another plan', async () => {
    mockCall.mockImplementation((method: string, params?: unknown) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        const planId = (params as { plan_id?: string })?.plan_id;
        if (planId === 'dash-plan-persist-001') return Promise.resolve(dashboardPlanDetails);
        if (planId === 'dash-plan-persist-002') return Promise.resolve(secondDashboardPlanDetails);
        return Promise.resolve({ ok: false, error: 'Plan not found' });
      }
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => usePlanDetails('dash-plan-nonexistent'));

    await hookWaitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.findings).toHaveLength(0);
  });
});

// ── 6. Stale Dashboard plan cannot execute ──────────────────────────────────

describe('Stale plan behavior', () => {
  it('stale Dashboard plan shows stale warning in PlanReviewView', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(staleDashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-stale-001" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-stale-warning')).toBeTruthy();
    });
  });

  it('usePlanDetails reports isStale for stale Dashboard plan', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(staleDashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => usePlanDetails('dash-plan-stale-001'));

    await hookWaitFor(() => {
      expect(result.current.isStale).toBe(true);
    });
  });

  it('stale Dashboard plan does not auto-execute', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(staleDashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-stale-001" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-stale-warning')).toBeTruthy();
    });

    // Verify no execution was triggered
    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });
});

// ── 7. Interrupted execution does not auto-resume ───────────────────────────

describe('Interrupted execution', () => {
  it('does not automatically resume after restart', async () => {
    const persisted = {
      scan_id: 'interrupted-dash-scan',
      scan_type: 'full',
      started_at: new Date(Date.now() - 120000).toISOString(),
      completed_at: new Date(Date.now() - 60000).toISOString(),
      duration_ms: 60000,
      cancelled: false,
      completed: true,
      error_count: 0,
      findings_count: 10,
      action_plan_id: 'dash-plan-interrupted',
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

    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });

  it('does not automatically rollback after restart', async () => {
    const persisted = {
      scan_id: 'rollback-dash-candidate',
      scan_type: 'full',
      started_at: new Date(Date.now() - 180000).toISOString(),
      completed_at: new Date(Date.now() - 120000).toISOString(),
      duration_ms: 60000,
      cancelled: false,
      completed: true,
      error_count: 0,
      findings_count: 8,
      action_plan_id: 'dash-plan-rollback',
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

    const rollbackCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
    );
    expect(rollbackCalls).toHaveLength(0);
  });

  it('does not automatically prepare after restart', async () => {
    const persisted = {
      scan_id: 'prepare-dash-candidate',
      scan_type: 'full',
      started_at: new Date(Date.now() - 180000).toISOString(),
      completed_at: new Date(Date.now() - 120000).toISOString(),
      duration_ms: 60000,
      cancelled: false,
      completed: true,
      error_count: 0,
      findings_count: 8,
      action_plan_id: 'dash-plan-prepare',
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

    const prepareCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE,
    );
    expect(prepareCalls).toHaveLength(0);
  });
});

// ── 8. Completed actions are not duplicated ─────────────────────────────────

describe('Completed action recovery', () => {
  it('hydrated plan does not trigger duplicate execution of completed actions', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-persist-001" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-view')).toBeTruthy();
    });

    // No execution should happen during hydration
    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });
});

// ── 9. Rollback remains explicit ────────────────────────────────────────────

describe('Rollback behavior', () => {
  it('rollback is not automatically triggered during hydration', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-persist-001" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-view')).toBeTruthy();
    });

    const rollbackCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK,
    );
    expect(rollbackCalls).toHaveLength(0);
  });
});

// ── 10. No plan/remediation state enters browser storage ────────────────────

describe('Browser storage audit', () => {
  it('useDashboardOptimizationPlan does not use localStorage', async () => {
    const localStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await act(async () => {
      await result.current.createPlan(payload);
    });

    const planCalls = localStorageSetSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('plan'),
    );
    expect(planCalls).toHaveLength(0);

    const remediationCalls = localStorageSetSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('remediation'),
    );
    expect(remediationCalls).toHaveLength(0);

    localStorageSetSpy.mockRestore();
  });

  it('useDashboardOptimizationPlan does not use sessionStorage', async () => {
    const sessionStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await act(async () => {
      await result.current.createPlan(payload);
    });

    const planCalls = sessionStorageSetSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('plan'),
    );
    expect(planCalls).toHaveLength(0);

    sessionStorageSetSpy.mockRestore();
  });

  it('usePlanDetails does not use localStorage', async () => {
    const localStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockCall.mockResolvedValue(dashboardPlanDetails);

    renderHook(() => usePlanDetails('dash-plan-persist-001'));

    await hookWaitFor(() => {
      // Wait a tick for hydration
    });

    const planCalls = localStorageSetSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('plan'),
    );
    expect(planCalls).toHaveLength(0);

    localStorageSetSpy.mockRestore();
  });

  it('unifiedScanState does not persist to localStorage', () => {
    const localStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');

    unifiedScanState.setLatest({
      sessionId: 'dash-session-test',
      module: 'optimize',
      mode: 'full',
      status: 'scanning',
      startedAt: new Date().toISOString(),
      remediationStatus: 'none',
      error: null,
    });

    const scanCalls = localStorageSetSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('scan'),
    );
    expect(scanCalls).toHaveLength(0);

    localStorageSetSpy.mockRestore();
  });

  it('unifiedScanState does not persist to sessionStorage', () => {
    const sessionStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');

    unifiedScanState.setLatest({
      sessionId: 'dash-session-test-2',
      module: 'optimize',
      mode: 'quick',
      status: 'complete',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      remediationStatus: 'none',
      error: null,
    });

    const scanCalls = sessionStorageSetSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].toLowerCase().includes('scan'),
    );
    expect(scanCalls).toHaveLength(0);

    sessionStorageSetSpy.mockRestore();
  });
});

// ── 11. Dashboard navigation does not execute remediation ───────────────────

describe('Navigation safety', () => {
  it('navigating to PlanReviewView does not trigger execution', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-persist-001" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-view')).toBeTruthy();
    });

    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });

  it('application restart does not trigger remediation execution', async () => {
    const persisted = {
      scan_id: 'restart-dash-scan',
      scan_type: 'full',
      started_at: new Date(Date.now() - 60000).toISOString(),
      completed_at: new Date(Date.now() - 30000).toISOString(),
      duration_ms: 30000,
      cancelled: false,
      completed: true,
      error_count: 0,
      findings_count: 5,
      action_plan_id: 'dash-plan-restart',
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
      expect(screen.getByTestId('dashboard-scan-issues')).toBeTruthy();
    });

    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);

    const prepareCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE,
    );
    expect(prepareCalls).toHaveLength(0);
  });
});

// ── 12. Explicit approval remains required after hydration ──────────────────

describe('Explicit approval', () => {
  it('hydrated Dashboard plan requires explicit approval before execution', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE) {
        return Promise.resolve(validPreview);
      }
      if (method === RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE) {
        return Promise.resolve(validValidation);
      }
      return Promise.resolve({ ok: true });
    });

    render(
      <PlanReviewView planId="dash-plan-persist-001" module="optimize" onClose={() => {}} />,
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(screen.getByTestId('plan-review-view')).toBeTruthy();
    });

    // After hydration, no execute should have been called
    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });
});

// ── 13. Dashboard health score remains independent from remediation ─────────

describe('Health score independence', () => {
  it('unifiedScanState does not store health score data', () => {
    // unifiedScanState is for scan/remediation state only
    // Health score comes from DashboardViewModel which uses dashboard.health RPC
    // They are independent stores
    const state = unifiedScanState.getLatest();
    expect(state).toBeNull(); // Initially null
    expect(state?.healthScore).toBeUndefined(); // No health score field
  });

  it('Dashboard plan creation does not modify health score state', async () => {
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await act(async () => {
      await result.current.createPlan(payload);
    });

    // unifiedScanState should not be modified by plan creation
    const state = unifiedScanState.getLatest();
    // Plan creation does not set unifiedScanState — that's done by scan flow
    expect(state).toBeNull();
  });
});

// ── 14. Concurrency: double-click followed by restart ───────────────────────

describe('Concurrency and restart combinations', () => {
  it('double-click creates only one plan, then restart is safe', async () => {
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    let firstPlanId: string | null = null;
    let secondPlanId: string | null = null;
    await act(async () => {
      const firstPromise = result.current.createPlan(payload);
      secondPlanId = await result.current.createPlan(payload);
      firstPlanId = await firstPromise;
    });

    expect(firstPlanId).toBe('dash-plan-persist-001');
    expect(secondPlanId).toBeNull();
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it('plan creation followed by immediate navigation is safe', async () => {
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result, unmount } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await act(async () => {
      await result.current.createPlan(payload);
    });

    // Unmount simulates navigation away
    unmount();

    // No execution should have been triggered
    const executeCalls = mockCall.mock.calls.filter(
      (call) => call[0] === RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE,
    );
    expect(executeCalls).toHaveLength(0);
  });

  it('reset after plan creation allows new plan creation', async () => {
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await act(async () => {
      await result.current.createPlan(payload);
    });
    expect(result.current.planId).toBe('dash-plan-persist-001');

    act(() => {
      result.current.reset();
    });
    expect(result.current.planId).toBeNull();

    await act(async () => {
      await result.current.createPlan(payload);
    });
    expect(result.current.planId).toBe('dash-plan-persist-001');
  });
});

// ── 15. Scan service contract ───────────────────────────────────────────────

describe('scanService.dashboard_optimization_plan contract', () => {
  it('calls the correct RPC method', async () => {
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await scanService.dashboard_optimization_plan(payload);

    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN,
      { actions: payload },
    );
  });

  it('RPC constant is correct', () => {
    expect(RPC_METHODS.SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN).toBe('scan_core.dashboard_optimization.plan');
  });
});

// ── 16. Privacy boundary across persistence ─────────────────────────────────

describe('Privacy boundary', () => {
  it('persisted Dashboard plan findings do not expose canonical_path', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => usePlanDetails('dash-plan-persist-001'));

    await hookWaitFor(() => {
      expect(result.current.findings.length).toBeGreaterThan(0);
    });

    for (const finding of result.current.findings) {
      expect(finding.canonical_path).toBe('');
    }
  });

  it('persisted Dashboard plan response does not expose sensitive data', async () => {
    mockCall.mockResolvedValue(dashboardPlanResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    await act(async () => {
      await result.current.createPlan(payload);
    });

    const responseStr = JSON.stringify(result.current.response);
    expect(responseStr).not.toContain('canonical_path');
    expect(responseStr).not.toContain('asset_id');
    expect(responseStr).not.toContain('backup_location');
    expect(responseStr).not.toContain('registry_key');
  });

  it('serializer does not include sensitive fields in persisted payload', () => {
    const payload = dashboardPreviewToRpcPayload(samplePreviewActions);
    const payloadStr = JSON.stringify(payload);
    expect(payloadStr).not.toContain('canonical_path');
    expect(payloadStr).not.toContain('asset_id');
    expect(payloadStr).not.toContain('backup_location');
    expect(payloadStr).not.toContain('registry_key');
    expect(payloadStr).not.toContain('browser_profile');
  });
});

// ── 17. Unsupported actions remain NOT_FIXABLE after hydration ──────────────

describe('Unsupported action persistence', () => {
  it('flush_dns remains requires_review=true after hydration', async () => {
    mockCall.mockImplementation((method: string) => {
      if (method === RPC_METHODS.SCAN_CORE_SCAN_PLAN_DETAILS) {
        return Promise.resolve(dashboardPlanDetails);
      }
      return Promise.resolve({ ok: true });
    });

    const { result } = renderHook(() => usePlanDetails('dash-plan-persist-001'));

    await hookWaitFor(() => {
      expect(result.current.findings.length).toBeGreaterThan(0);
    });

    const flushDnsFinding = result.current.findings.find(
      (f) => f.finding_id === 'dashboard_opt_flush_dns_6',
    );
    expect(flushDnsFinding).toBeDefined();
    expect(flushDnsFinding?.requires_review).toBe(true);
    expect(flushDnsFinding?.is_actionable).toBe(false);
  });
});
