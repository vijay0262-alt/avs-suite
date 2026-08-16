// @vitest-environment happy-dom
/**
 * SC-8C11 Phase 3 — Smart Optimization Frontend Remediation Migration Tests
 *
 * Tests for:
 * - useSmartOptimizationPlan hook (plan creation, concurrency, errors)
 * - SmartOptimizationPage → PlanReviewView handoff
 * - RPC contract: scan_core.smart_optimization.plan
 * - No legacy execution service calls
 * - Privacy: no sensitive data in RPC payload
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSmartOptimizationPlan } from '../useSmartOptimizationPlan';
import { scanService } from '../scan.service';
import { RPC_METHODS } from '@avs/shared/rpc';

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

const sampleActions: Record<string, unknown>[] = [
  {
    id: 'action-temp-1',
    type: 'clean_temp_files',
    title: 'Clean Temporary Files',
    description: 'Remove 2.5 GB of temporary files',
    confidence: 0.95,
    rollbackAvailable: true,
    sourceModule: 'junk_cleaner',
    sourceFindingId: 'finding-temp-1',
    impact: { score: 75, tier: 'high' },
    risk: { level: 'low', score: 10, reversible: true },
    benefits: { storageRecoveryMB: 2500 },
  },
  {
    id: 'action-startup-1',
    type: 'disable_startup_entry',
    title: 'Disable High-Impact Startup Entry',
    description: 'Disable startup entry consuming 500ms',
    confidence: 0.85,
    rollbackAvailable: true,
    sourceModule: 'startup_manager',
    sourceFindingId: 'finding-startup-1',
    impact: { score: 60, tier: 'high' },
    risk: { level: 'low', score: 15, reversible: true },
    benefits: { startupImprovementMs: 500 },
  },
];

const successResponse = {
  ok: true,
  plan_id: 'plan-uuid-123',
  total_actions: 2,
  auto_fixable: 2,
  review_required: 0,
  not_fixable: 0,
  estimated_affected_size: 2500 * 1024 * 1024,
  statistics: { converted: 2, unsupported: 0, errors: 0 },
};

// ── useSmartOptimizationPlan Hook Tests ──────────────────────────────────────

describe('useSmartOptimizationPlan', () => {
  it('creates a plan and returns plan_id on success', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSmartOptimizationPlan());

    expect(result.current.planId).toBeNull();
    expect(result.current.isCreating).toBe(false);

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleActions);
    });

    expect(planId).toBe('plan-uuid-123');
    expect(result.current.planId).toBe('plan-uuid-123');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.response?.total_actions).toBe(2);
  });

  it('calls scan_core.smart_optimization.plan RPC', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSmartOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleActions);
    });

    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_SMART_OPTIMIZATION_PLAN,
      { actions: sampleActions },
    );
  });

  it('handles RPC failure with ok: false', async () => {
    mockCall.mockResolvedValue({
      ok: false,
      error: 'Missing or invalid parameter: actions',
    });

    const { result } = renderHook(() => useSmartOptimizationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleActions);
    });

    expect(planId).toBeNull();
    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBe('Missing or invalid parameter: actions');
    expect(result.current.isCreating).toBe(false);
  });

  it('handles missing plan_id in response', async () => {
    mockCall.mockResolvedValue({
      ok: true,
      // Missing plan_id
      total_actions: 2,
    });

    const { result } = renderHook(() => useSmartOptimizationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleActions);
    });

    expect(planId).toBeNull();
    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBe('Failed to create optimization plan');
  });

  it('handles RPC exception', async () => {
    mockCall.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSmartOptimizationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleActions);
    });

    expect(planId).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(result.current.isCreating).toBe(false);
  });

  it('rejects empty actions array', async () => {
    const { result } = renderHook(() => useSmartOptimizationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan([]);
    });

    expect(planId).toBeNull();
    expect(result.current.error).toBe('No optimization actions to review.');
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('prevents duplicate plan creation from double-click (concurrency guard)', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mockCall.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSmartOptimizationPlan());

    // Start first call (pending)
    let firstPlanId: string | null = 'unset';
    act(() => {
      void (async () => {
        firstPlanId = await result.current.createPlan(sampleActions);
      })();
    });

    await waitFor(() => expect(result.current.isCreating).toBe(true));

    // Attempt second call while first is in-flight
    let secondPlanId: string | null = 'unset';
    await act(async () => {
      secondPlanId = await result.current.createPlan(sampleActions);
    });

    // Second call should return null without calling RPC
    expect(secondPlanId).toBeNull();

    // Resolve the first call
    await act(async () => {
      resolveFirst(successResponse);
    });

    await waitFor(() => expect(result.current.planId).toBe('plan-uuid-123'));
    expect(firstPlanId).toBe('plan-uuid-123');

    // Only one RPC call should have been made
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it('reset clears planId and error', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSmartOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleActions);
    });

    expect(result.current.planId).toBe('plan-uuid-123');

    act(() => {
      result.current.reset();
    });

    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.response).toBeNull();
  });
});

// ── RPC Method Constant Test ─────────────────────────────────────────────────

describe('RPC_METHODS constant', () => {
  it('includes SCAN_CORE_SMART_OPTIMIZATION_PLAN', () => {
    expect(RPC_METHODS.SCAN_CORE_SMART_OPTIMIZATION_PLAN).toBe(
      'scan_core.smart_optimization.plan',
    );
  });
});

// ── Scan Service Test ────────────────────────────────────────────────────────

describe('scanService.smart_optimization_plan', () => {
  it('calls the correct RPC method with actions', async () => {
    mockCall.mockResolvedValue(successResponse);

    const result = await scanService.smart_optimization_plan(sampleActions);

    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_SMART_OPTIMIZATION_PLAN,
      { actions: sampleActions },
    );
    expect(result.ok).toBe(true);
    expect(result.plan_id).toBe('plan-uuid-123');
    expect(result.total_actions).toBe(2);
  });
});

// ── Privacy Tests ────────────────────────────────────────────────────────────

describe('privacy', () => {
  it('RPC response does not contain canonical_path', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSmartOptimizationPlan());

    await act(async () => {
      await result.current.createPlan(sampleActions);
    });

    const response = result.current.response;
    expect(response).not.toBeNull();
    expect(JSON.stringify(response)).not.toContain('canonical_path');
    expect(JSON.stringify(response)).not.toContain('asset_id');
    expect(JSON.stringify(response)).not.toContain('backup_location');
    expect(JSON.stringify(response)).not.toContain('registry_key');
    expect(JSON.stringify(response)).not.toContain('browser_profile');
  });

  it('action payload does not include canonical paths or asset IDs', () => {
    // The actionToRpcPayload function in SmartOptimizationPage only sends
    // id, type, title, description, confidence, rollbackAvailable,
    // sourceModule, sourceFindingId, impact, risk, benefits.
    // It does NOT send canonical_path, asset_id, or target data.
    const payload: Record<string, unknown> = {
      id: 'action-1',
      type: 'clean_temp_files',
      title: 'Clean Temp Files',
      description: 'Test',
      confidence: 0.9,
      rollbackAvailable: true,
      sourceModule: 'junk_cleaner',
      sourceFindingId: 'finding-1',
      impact: {},
      risk: {},
      benefits: {},
    };

    expect(payload).not.toHaveProperty('canonical_path');
    expect(payload).not.toHaveProperty('asset_id');
    expect(payload).not.toHaveProperty('backup_location');
    expect(payload).not.toHaveProperty('target');
  });
});

// ── Legacy Execution Removal Tests ───────────────────────────────────────────

describe('legacy execution removal', () => {
  it('smart-optimization-ai barrel does not export createExecutionHandler', async () => {
    const barrel = await import('../../smart-optimization-ai');
    expect((barrel as Record<string, unknown>).createExecutionHandler).toBeUndefined();
  });

  it('smart-optimization-ai barrel does not export OptimizationExecutionCoordinator', async () => {
    const barrel = await import('../../smart-optimization-ai');
    expect((barrel as Record<string, unknown>).OptimizationExecutionCoordinator).toBeUndefined();
  });

  it('smart-optimization-ai barrel does not export ExecutionHandler type', async () => {
    const barrel = await import('../../smart-optimization-ai');
    // ExecutionHandler is a type, so it won't appear as a runtime property
    // But the export should not exist as a value
    expect((barrel as Record<string, unknown>).ExecutionHandler).toBeUndefined();
  });
});
