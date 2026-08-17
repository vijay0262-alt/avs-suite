// @vitest-environment happy-dom
/**
 * SC-8C13 Phase 3 — Dashboard Frontend Canonical Remediation Migration Tests
 *
 * Tests for:
 * - useDashboardOptimizationPlan hook (plan creation, concurrency, errors)
 * - Dashboard → PlanReviewView handoff
 * - RPC contract: scan_core.dashboard_optimization.plan
 * - No legacy execution service calls from production path
 * - Privacy: no sensitive data in RPC payload
 * - No auto-execution, no auto-rollback
 * - No localStorage/sessionStorage remediation state
 * - Serializer: preview action name → backend type mapping
 * - Unsupported actions (flush_dns, trim_memory) are NOT executable
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardOptimizationPlan } from '../useDashboardOptimizationPlan';
import { scanService } from '../scan.service';
import { RPC_METHODS } from '@avs/shared/rpc';
import {
  dashboardPreviewActionToRpcPayload,
  dashboardPreviewToRpcPayload,
  getDashboardActionType,
} from '../../dashboard/dashboardOptimizationSerializer';
import type { OptimizeAction } from '../../dashboard/dashboard.types';

// ── Mock Setup ───────────────────────────────────────────────────────────────

const mockCall = vi.fn();

beforeEach(() => {
  mockCall.mockReset();
  Object.assign(globalThis as unknown as Record<string, unknown>, {
    avs: { rpc: { call: mockCall } },
  });
});

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).avs;
  vi.restoreAllMocks();
});

// ── Test Data ────────────────────────────────────────────────────────────────

const sampleDashboardActions: Record<string, unknown>[] = [
  {
    id: 'dashboard_opt_clean_temp_files_0',
    type: 'clean_temp_files',
    title: 'Temporary Files',
    description: 'Windows and user temporary files',
    size: 123456789,
    rollbackAvailable: false,
  },
  {
    id: 'dashboard_opt_empty_recycle_bin_1',
    type: 'empty_recycle_bin',
    title: 'Recycle Bin',
    description: 'Files in Recycle Bin',
    size: 50000000,
    rollbackAvailable: false,
  },
  {
    id: 'dashboard_opt_clean_browser_cache_2',
    type: 'clean_browser_cache',
    title: 'Browser Cache',
    description: 'Browser temporary files and cache',
    size: 25000000,
    rollbackAvailable: false,
  },
  {
    id: 'dashboard_opt_clean_thumbnail_cache_3',
    type: 'clean_thumbnail_cache',
    title: 'Thumbnail Cache',
    description: 'Windows thumbnail and icon cache',
    size: 5000000,
    rollbackAvailable: false,
  },
  {
    id: 'dashboard_opt_clean_prefetch_4',
    type: 'clean_prefetch',
    title: 'Prefetch Files',
    description: 'Windows application prefetch files (auto-regenerated)',
    size: 3000000,
    rollbackAvailable: false,
  },
  {
    id: 'dashboard_opt_clean_windows_update_cache_5',
    type: 'clean_windows_update_cache',
    title: 'Windows Update Cache',
    description: 'Downloaded Windows Update packages retained after install',
    size: 10000000,
    rollbackAvailable: false,
  },
  {
    id: 'dashboard_opt_flush_dns_6',
    type: 'flush_dns',
    title: 'Flush DNS',
    description: 'Clear DNS resolver cache',
    size: 0,
    rollbackAvailable: false,
  },
];

const successResponse = {
  ok: true,
  plan_id: 'dash-plan-uuid-456',
  total_actions: 7,
  auto_fixable: 6,
  review_required: 0,
  not_fixable: 1,
  estimated_affected_size: 216456789,
  statistics: { converted: 6, unsupported: 1, errors: 0 },
};

const samplePreviewActions: OptimizeAction[] = [
  { name: 'Temporary Files', size: 123456789, description: 'Windows and user temporary files' },
  { name: 'Recycle Bin', size: 50000000, description: 'Files in Recycle Bin' },
  { name: 'Browser Cache', size: 25000000, description: 'Browser temporary files and cache' },
  { name: 'Thumbnail Cache', size: 5000000, description: 'Windows thumbnail and icon cache' },
  { name: 'Prefetch Files', size: 3000000, description: 'Windows application prefetch files (auto-regenerated)' },
  { name: 'Windows Update Cache', size: 10000000, description: 'Downloaded Windows Update packages retained after install' },
  { name: 'Flush DNS', size: 0, description: 'Clear DNS resolver cache' },
];

// ── useDashboardOptimizationPlan Hook Tests ──────────────────────────────────

describe('useDashboardOptimizationPlan', () => {
  it('creates a plan and returns plan_id on success', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    expect(result.current.planId).toBeNull();
    expect(result.current.isCreating).toBe(false);

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleDashboardActions);
    });

    expect(planId).toBe('dash-plan-uuid-456');
    expect(result.current.planId).toBe('dash-plan-uuid-456');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls the correct RPC method', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN,
      { actions: sampleDashboardActions },
    );
  });

  it('handles missing plan_id in response', async () => {
    mockCall.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleDashboardActions);
    });

    expect(planId).toBeNull();
    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBe('Failed to create dashboard optimization plan');
  });

  it('handles RPC failure (ok=false)', async () => {
    mockCall.mockResolvedValue({ ok: false, error: 'Missing or invalid parameter: actions' });

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleDashboardActions);
    });

    expect(planId).toBeNull();
    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBe('Missing or invalid parameter: actions');
    expect(result.current.isCreating).toBe(false);
  });

  it('handles network error', async () => {
    mockCall.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleDashboardActions);
    });

    expect(planId).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(result.current.isCreating).toBe(false);
  });

  it('rejects empty actions array', async () => {
    const { result } = renderHook(() => useDashboardOptimizationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan([]);
    });

    expect(planId).toBeNull();
    expect(result.current.error).toBe('No dashboard optimization actions to review.');
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('prevents duplicate plan creation (concurrency guard)', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    let firstPlanId: string | null = null;
    let secondPlanId: string | null = null;
    await act(async () => {
      const firstPromise = result.current.createPlan(sampleDashboardActions);
      secondPlanId = await result.current.createPlan(sampleDashboardActions);
      firstPlanId = await firstPromise;
    });

    await waitFor(() => expect(result.current.planId).toBe('dash-plan-uuid-456'));
    expect(firstPlanId).toBe('dash-plan-uuid-456');
    expect(secondPlanId).toBeNull();
  });

  it('reset clears planId and error', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.planId).toBe('dash-plan-uuid-456');

    act(() => {
      result.current.reset();
    });

    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.response).toBeNull();
  });

  it('exposes response with statistics', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.response).not.toBeNull();
    expect(result.current.response?.statistics).toEqual({ converted: 6, unsupported: 1, errors: 0 });
    expect(result.current.response?.total_actions).toBe(7);
  });
});

// ── Scan Service Test ────────────────────────────────────────────────────────

describe('scanService.dashboard_optimization_plan', () => {
  it('calls the correct RPC method with actions', async () => {
    mockCall.mockResolvedValue(successResponse);

    const result = await scanService.dashboard_optimization_plan(sampleDashboardActions);

    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN,
      { actions: sampleDashboardActions },
    );
    expect(result.ok).toBe(true);
    expect(result.plan_id).toBe('dash-plan-uuid-456');
  });
});

// ── RPC Constant Test ────────────────────────────────────────────────────────

describe('RPC constant', () => {
  it('SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN is defined', () => {
    expect(RPC_METHODS.SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN).toBe('scan_core.dashboard_optimization.plan');
  });
});

// ── Serializer Tests ─────────────────────────────────────────────────────────

describe('dashboardPreviewActionToRpcPayload', () => {
  it('maps "Temporary Files" to "clean_temp_files"', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Temporary Files', size: 100, description: 'temp' },
      0,
    );
    expect(payload['type']).toBe('clean_temp_files');
  });

  it('maps "Recycle Bin" to "empty_recycle_bin"', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Recycle Bin', size: 100, description: 'recycle' },
      0,
    );
    expect(payload['type']).toBe('empty_recycle_bin');
  });

  it('maps "Browser Cache" to "clean_browser_cache"', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Browser Cache', size: 100, description: 'browser' },
      0,
    );
    expect(payload['type']).toBe('clean_browser_cache');
  });

  it('maps "Thumbnail Cache" to "clean_thumbnail_cache"', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Thumbnail Cache', size: 100, description: 'thumbnail' },
      0,
    );
    expect(payload['type']).toBe('clean_thumbnail_cache');
  });

  it('maps "Prefetch Files" to "clean_prefetch"', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Prefetch Files', size: 100, description: 'prefetch' },
      0,
    );
    expect(payload['type']).toBe('clean_prefetch');
  });

  it('maps "Windows Update Cache" to "clean_windows_update_cache"', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Windows Update Cache', size: 100, description: 'update' },
      0,
    );
    expect(payload['type']).toBe('clean_windows_update_cache');
  });

  it('maps "Flush DNS" to "flush_dns" (unsupported)', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Flush DNS', size: 0, description: 'dns' },
      0,
    );
    expect(payload['type']).toBe('flush_dns');
  });

  it('maps unknown name to "unknown"', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Mystery Action', size: 100, description: 'mystery' },
      0,
    );
    expect(payload['type']).toBe('unknown');
  });

  it('generates stable action ID from type and index', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Temporary Files', size: 100, description: 'temp' },
      3,
    );
    expect(payload['id']).toBe('dashboard_opt_clean_temp_files_3');
  });

  it('includes title, description, and size', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Temporary Files', size: 999, description: 'Windows temp files' },
      0,
    );
    expect(payload['title']).toBe('Temporary Files');
    expect(payload['description']).toBe('Windows temp files');
    expect(payload['size']).toBe(999);
  });

  it('sets rollbackAvailable to false', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Temporary Files', size: 100, description: 'temp' },
      0,
    );
    expect(payload['rollbackAvailable']).toBe(false);
  });
});

describe('dashboardPreviewToRpcPayload', () => {
  it('converts all preview actions', () => {
    const payloads = dashboardPreviewToRpcPayload(samplePreviewActions);
    expect(payloads).toHaveLength(7);
    expect(payloads[0]['type']).toBe('clean_temp_files');
    expect(payloads[6]['type']).toBe('flush_dns');
  });

  it('preserves action order', () => {
    const payloads = dashboardPreviewToRpcPayload(samplePreviewActions);
    expect(payloads[0]['title']).toBe('Temporary Files');
    expect(payloads[1]['title']).toBe('Recycle Bin');
    expect(payloads[2]['title']).toBe('Browser Cache');
  });
});

// ── Privacy Tests ────────────────────────────────────────────────────────────

describe('privacy-safe RPC payload', () => {
  it('does not send canonical_path in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payload = callArgs[1] as { actions: Record<string, unknown>[] };
    for (const action of payload.actions) {
      expect(action['canonical_path']).toBeUndefined();
    }
  });

  it('does not send asset_id in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payload = callArgs[1] as { actions: Record<string, unknown>[] };
    for (const action of payload.actions) {
      expect(action['asset_id']).toBeUndefined();
    }
  });

  it('does not send backup_location in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payload = callArgs[1] as { actions: Record<string, unknown>[] };
    for (const action of payload.actions) {
      expect(action['backup_location']).toBeUndefined();
    }
  });

  it('does not send registry keys in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payloadStr = JSON.stringify(callArgs[1]);
    expect(payloadStr).not.toContain('HKCU');
    expect(payloadStr).not.toContain('HKLM');
    expect(payloadStr).not.toContain('registry_key');
  });

  it('does not send browser profile paths in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payloadStr = JSON.stringify(callArgs[1]);
    expect(payloadStr).not.toContain('browser_profile');
    expect(payloadStr).not.toContain('Chrome\\User Data');
    expect(payloadStr).not.toContain('AppData\\Local\\Google');
  });

  it('does not send executable commands or PowerShell in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payloadStr = JSON.stringify(callArgs[1]);
    expect(payloadStr).not.toContain('PowerShell');
    expect(payloadStr).not.toContain('reg.exe');
    expect(payloadStr).not.toContain('cmd.exe');
    expect(payloadStr).not.toContain('subprocess');
  });

  it('serializer does not include sensitive fields', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Temporary Files', size: 100, description: 'temp' },
      0,
    );
    expect(payload['canonical_path']).toBeUndefined();
    expect(payload['asset_id']).toBeUndefined();
    expect(payload['backup_location']).toBeUndefined();
    expect(payload['registry_key']).toBeUndefined();
    expect(payload['browser_profile']).toBeUndefined();
    expect(payload['quarantine_path']).toBeUndefined();
    expect(payload['executable']).toBeUndefined();
    expect(payload['command']).toBeUndefined();
  });

  it('response does not expose sensitive data', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const response = result.current.response;
    expect(response).not.toBeNull();
    const responseStr = JSON.stringify(response);
    expect(responseStr).not.toContain('canonical_path');
    expect(responseStr).not.toContain('asset_id');
    expect(responseStr).not.toContain('backup_location');
    expect(responseStr).not.toContain('registry_key');
  });
});

// ── No Legacy Execution Tests ────────────────────────────────────────────────

describe('no legacy execution calls', () => {
  it('hook does not call dashboard.optimize.execute', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const calledMethods = mockCall.mock.calls.map((c) => c[0]);
    expect(calledMethods).not.toContain('dashboard.optimize.execute');
  });

  it('hook does not call orchestrator.optimize', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const calledMethods = mockCall.mock.calls.map((c) => c[0]);
    expect(calledMethods).not.toContain('orchestrator.optimize');
    expect(calledMethods).not.toContain('orchestrator.fullAsync');
  });

  it('hook does not call scan_core.remediation.execute', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    const calledMethods = mockCall.mock.calls.map((c) => c[0]);
    expect(calledMethods).not.toContain(RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE);
    expect(calledMethods).not.toContain(RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE);
    expect(calledMethods).not.toContain(RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE);
    expect(calledMethods).not.toContain(RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK);
  });
});

// ── No Auto-Execution Tests ──────────────────────────────────────────────────

describe('no auto-execution', () => {
  it('hook only calls the plan RPC, never execution RPCs', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall.mock.calls[0][0]).toBe(RPC_METHODS.SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN);
  });

  it('hook does not auto-execute after plan creation', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(mockCall).toHaveBeenCalledTimes(1);
  });
});

// ── No localStorage/sessionStorage Tests ─────────────────────────────────────

describe('no browser storage remediation state', () => {
  it('hook does not use localStorage', async () => {
    const localStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(localStorageSetSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('plan'),
      expect.anything(),
    );
    localStorageSetSpy.mockRestore();
  });

  it('hook does not use sessionStorage', async () => {
    const sessionStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(sessionStorageSetSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('plan'),
      expect.anything(),
    );
    sessionStorageSetSpy.mockRestore();
  });
});

// ── Plan ID Handoff Tests ────────────────────────────────────────────────────

describe('planId handoff', () => {
  it('planId is null initially', () => {
    const { result } = renderHook(() => useDashboardOptimizationPlan());
    expect(result.current.planId).toBeNull();
  });

  it('planId is set after successful plan creation', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.planId).toBe('dash-plan-uuid-456');
  });

  it('planId is null after reset', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.planId).toBe('dash-plan-uuid-456');

    act(() => {
      result.current.reset();
    });

    expect(result.current.planId).toBeNull();
  });

  it('planId is null on failure', async () => {
    mockCall.mockResolvedValue({ ok: false, error: 'Failed' });

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.planId).toBeNull();
  });

  it('never fabricates a plan_id', async () => {
    mockCall.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.planId).toBeNull();
  });
});

// ── Error State Tests ────────────────────────────────────────────────────────

describe('error states', () => {
  it('error is null initially', () => {
    const { result } = renderHook(() => useDashboardOptimizationPlan());
    expect(result.current.error).toBeNull();
  });

  it('error is set on RPC failure', async () => {
    mockCall.mockResolvedValue({ ok: false, error: 'Database error' });

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.error).toBe('Database error');
  });

  it('error is cleared on successful retry', async () => {
    mockCall.mockResolvedValueOnce({ ok: false, error: 'Failed' });
    mockCall.mockResolvedValueOnce(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });
    expect(result.current.error).toBe('Failed');

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.planId).toBe('dash-plan-uuid-456');
  });

  it('error is cleared on reset', async () => {
    mockCall.mockResolvedValue({ ok: false, error: 'Failed' });

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.error).toBe('Failed');

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
  });
});

// ── Unsupported Action Tests ─────────────────────────────────────────────────

describe('unsupported actions', () => {
  it('flush_dns is included in payload but classified by backend as NOT_FIXABLE', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    const actionsWithType = [
      ...sampleDashboardActions,
      { id: 'trim_mem', type: 'trim_memory', title: 'Memory Trim', size: 0, rollbackAvailable: false },
    ];

    await act(async () => {
      await result.current.createPlan(actionsWithType);
    });

    const callArgs = mockCall.mock.calls[0];
    const payload = callArgs[1] as { actions: Record<string, unknown>[] };
    const flushDnsAction = payload.actions.find((a) => a['type'] === 'flush_dns');
    const trimMemoryAction = payload.actions.find((a) => a['type'] === 'trim_memory');
    expect(flushDnsAction).toBeDefined();
    expect(trimMemoryAction).toBeDefined();
  });

  it('response reports not_fixable count for unsupported actions', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.response?.not_fixable).toBe(1);
    expect(result.current.response?.auto_fixable).toBe(6);
  });

  it('serializer maps Flush DNS to flush_dns type', () => {
    const payload = dashboardPreviewActionToRpcPayload(
      { name: 'Flush DNS', size: 0, description: 'dns' },
      0,
    );
    expect(payload['type']).toBe('flush_dns');
  });

  it('getDashboardActionType returns undefined for unknown names', () => {
    expect(getDashboardActionType('Unknown Action')).toBeUndefined();
  });

  it('getDashboardActionType returns correct type for known names', () => {
    expect(getDashboardActionType('Temporary Files')).toBe('clean_temp_files');
    expect(getDashboardActionType('Recycle Bin')).toBe('empty_recycle_bin');
    expect(getDashboardActionType('Flush DNS')).toBe('flush_dns');
  });
});

// ── Returning from PlanReviewView Tests ──────────────────────────────────────

describe('returning from PlanReviewView restores safe state', () => {
  it('reset after plan creation returns to idle state', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });

    expect(result.current.planId).toBe('dash-plan-uuid-456');
    expect(result.current.isCreating).toBe(false);

    act(() => {
      result.current.reset();
    });

    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.response).toBeNull();
    expect(result.current.isCreating).toBe(false);
  });

  it('can create a new plan after reset', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useDashboardOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });
    expect(result.current.planId).toBe('dash-plan-uuid-456');

    act(() => {
      result.current.reset();
    });
    expect(result.current.planId).toBeNull();

    await act(async () => {
      await result.current.createPlan(sampleDashboardActions);
    });
    expect(result.current.planId).toBe('dash-plan-uuid-456');
  });
});
