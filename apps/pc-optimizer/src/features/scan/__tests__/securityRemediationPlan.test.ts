// @vitest-environment happy-dom
/**
 * SC-8C12 Phase 4 — Security Center Frontend Remediation Migration Tests
 *
 * Tests for:
 * - useSecurityRemediationPlan hook (plan creation, concurrency, errors)
 * - Security Center → PlanReviewView handoff
 * - RPC contract: scan_core.security_remediation.plan
 * - No legacy execution service calls from production path
 * - Privacy: no sensitive data in RPC payload
 * - No auto-execution, no auto-rollback
 * - No localStorage/sessionStorage remediation state
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSecurityRemediationPlan } from '../useSecurityRemediationPlan';
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

const sampleSecurityActions: Record<string, unknown>[] = [
  {
    id: 'action-quarantine-1',
    type: 'quarantine',
    threatId: 'threat-123',
    title: 'Quarantine Suspicious File',
    description: 'Move suspicious.exe to encrypted quarantine',
    reason: 'Detected spyware threat',
    confidence: 0.95,
    severity: 'high',
    category: 'spyware',
    sourceModule: 'security-center',
    sourceFindingId: 'finding-quarantine-1',
    rollbackAvailable: true,
    target: { type: 'file', path: 'C:\\Users\\Public\\suspicious.exe', name: 'suspicious.exe' },
  },
  {
    id: 'action-startup-1',
    type: 'disable_startup_entry',
    threatId: 'threat-789',
    title: 'Disable Malicious Startup Entry',
    description: 'Disable startup entry that runs malware at boot',
    reason: 'Startup entry persists malware across reboots',
    confidence: 0.90,
    severity: 'medium',
    category: 'suspicious_startup_entry',
    sourceModule: 'security-center',
    sourceFindingId: 'finding-startup-1',
    rollbackAvailable: true,
    target: {
      type: 'startup_entry',
      path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\MaliciousEntry',
      name: 'MaliciousEntry',
    },
  },
  {
    id: 'action-task-1',
    type: 'disable_scheduled_task',
    threatId: 'threat-task-1',
    title: 'Disable Suspicious Scheduled Task',
    description: 'Disable scheduled task that runs malware',
    reason: 'Scheduled task persists malware',
    confidence: 0.80,
    severity: 'medium',
    category: 'suspicious_scheduled_task',
    sourceModule: 'security-center',
    sourceFindingId: 'finding-task-1',
    rollbackAvailable: true,
    target: { type: 'scheduled_task', path: '\\Microsoft\\Windows\\MaliciousTask', name: 'MaliciousTask' },
  },
];

const successResponse = {
  ok: true,
  plan_id: 'sec-plan-uuid-123',
  total_actions: 3,
  auto_fixable: 2,
  review_required: 0,
  not_fixable: 1,
  estimated_affected_size: null,
  statistics: { converted: 2, unsupported: 1, errors: 0 },
};

// ── useSecurityRemediationPlan Hook Tests ────────────────────────────────────

describe('useSecurityRemediationPlan', () => {
  it('creates a plan and returns plan_id on success', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    expect(result.current.planId).toBeNull();
    expect(result.current.isCreating).toBe(false);

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleSecurityActions);
    });

    expect(planId).toBe('sec-plan-uuid-123');
    expect(result.current.planId).toBe('sec-plan-uuid-123');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('calls the correct RPC method', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_PLAN,
      { actions: sampleSecurityActions },
    );
  });

  it('handles missing plan_id in response', async () => {
    mockCall.mockResolvedValue({ ok: true });

    const { result } = renderHook(() => useSecurityRemediationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleSecurityActions);
    });

    expect(planId).toBeNull();
    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBe('Failed to create security remediation plan');
  });

  it('handles RPC failure (ok=false)', async () => {
    mockCall.mockResolvedValue({ ok: false, error: 'Missing or invalid parameter: actions' });

    const { result } = renderHook(() => useSecurityRemediationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleSecurityActions);
    });

    expect(planId).toBeNull();
    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBe('Missing or invalid parameter: actions');
    expect(result.current.isCreating).toBe(false);
  });

  it('handles network error', async () => {
    mockCall.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSecurityRemediationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan(sampleSecurityActions);
    });

    expect(planId).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(result.current.isCreating).toBe(false);
  });

  it('rejects empty actions array', async () => {
    const { result } = renderHook(() => useSecurityRemediationPlan());

    let planId: string | null = null;
    await act(async () => {
      planId = await result.current.createPlan([]);
    });

    expect(planId).toBeNull();
    expect(result.current.error).toBe('No security remediation actions to review.');
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('prevents duplicate plan creation (concurrency guard)', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    // Start first call (pending)
    let firstPlanId: string | null = null;
    let secondPlanId: string | null = null;
    await act(async () => {
      const firstPromise = result.current.createPlan(sampleSecurityActions);
      // Second call while first is pending should return null
      secondPlanId = await result.current.createPlan(sampleSecurityActions);
      firstPlanId = await firstPromise;
    });

    await waitFor(() => expect(result.current.planId).toBe('sec-plan-uuid-123'));
    expect(firstPlanId).toBe('sec-plan-uuid-123');
    expect(secondPlanId).toBeNull();
  });

  it('reset clears planId and error', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(result.current.planId).toBe('sec-plan-uuid-123');

    act(() => {
      result.current.reset();
    });

    expect(result.current.planId).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.response).toBeNull();
  });

  it('exposes response with statistics', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(result.current.response).not.toBeNull();
    expect(result.current.response?.statistics).toEqual({ converted: 2, unsupported: 1, errors: 0 });
    expect(result.current.response?.total_actions).toBe(3);
  });
});

// ── Scan Service Test ────────────────────────────────────────────────────────

describe('scanService.security_remediation_plan', () => {
  it('calls the correct RPC method with actions', async () => {
    mockCall.mockResolvedValue(successResponse);

    const result = await scanService.security_remediation_plan(sampleSecurityActions);

    expect(mockCall).toHaveBeenCalledWith(
      RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_PLAN,
      { actions: sampleSecurityActions },
    );
    expect(result.ok).toBe(true);
    expect(result.plan_id).toBe('sec-plan-uuid-123');
  });
});

// ── RPC Constant Test ────────────────────────────────────────────────────────

describe('RPC constant', () => {
  it('SCAN_CORE_SECURITY_REMEDIATION_PLAN is defined', () => {
    expect(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_PLAN).toBe('scan_core.security_remediation.plan');
  });
});

// ── Privacy Tests ────────────────────────────────────────────────────────────

describe('privacy-safe RPC payload', () => {
  it('does not send canonical_path in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payload = callArgs[1] as { actions: Record<string, unknown>[] };
    for (const action of payload.actions) {
      expect(action['canonical_path']).toBeUndefined();
    }
  });

  it('does not send asset_id in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payload = callArgs[1] as { actions: Record<string, unknown>[] };
    for (const action of payload.actions) {
      expect(action['asset_id']).toBeUndefined();
    }
  });

  it('does not send backup_location in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payload = callArgs[1] as { actions: Record<string, unknown>[] };
    for (const action of payload.actions) {
      expect(action['backup_location']).toBeUndefined();
    }
  });

  it('does not send quarantine_path in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payload = callArgs[1] as { actions: Record<string, unknown>[] };
    for (const action of payload.actions) {
      expect(action['quarantine_path']).toBeUndefined();
    }
  });

  it('does not send executable commands or PowerShell in payload', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    const callArgs = mockCall.mock.calls[0];
    const payloadStr = JSON.stringify(callArgs[1]);
    expect(payloadStr).not.toContain('PowerShell');
    expect(payloadStr).not.toContain('reg.exe');
    expect(payloadStr).not.toContain('cmd.exe');
    expect(payloadStr).not.toContain('subprocess');
  });

  it('response does not expose sensitive data', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    const response = result.current.response;
    expect(response).not.toBeNull();
    const responseStr = JSON.stringify(response);
    expect(responseStr).not.toContain('canonical_path');
    expect(responseStr).not.toContain('asset_id');
    expect(responseStr).not.toContain('backup_location');
    expect(responseStr).not.toContain('quarantine_path');
    expect(responseStr).not.toContain('registry_key');
  });
});

// ── No Legacy Execution Tests ────────────────────────────────────────────────

describe('no legacy execution calls', () => {
  it('hook does not call security.remediation.execute', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    const calledMethods = mockCall.mock.calls.map((c) => c[0]);
    expect(calledMethods).not.toContain('security.remediation.execute');
  });

  it('hook does not call security.quarantine.*', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    const calledMethods = mockCall.mock.calls.map((c) => c[0]);
    for (const method of calledMethods) {
      expect(method).not.toMatch(/^security\.quarantine/);
    }
  });

  it('hook does not call scan_core.remediation.execute', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
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

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall.mock.calls[0][0]).toBe(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_PLAN);
  });

  it('hook does not auto-execute after plan creation', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    // Wait a tick to see if any auto-execution happens
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    // Only the plan creation call should have been made
    expect(mockCall).toHaveBeenCalledTimes(1);
  });
});

// ── No localStorage/sessionStorage Tests ─────────────────────────────────────

describe('no browser storage remediation state', () => {
  it('hook does not use localStorage', async () => {
    const localStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
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

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
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
    const { result } = renderHook(() => useSecurityRemediationPlan());
    expect(result.current.planId).toBeNull();
  });

  it('planId is set after successful plan creation', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(result.current.planId).toBe('sec-plan-uuid-123');
  });

  it('planId is null after reset', async () => {
    mockCall.mockResolvedValue(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(result.current.planId).toBe('sec-plan-uuid-123');

    act(() => {
      result.current.reset();
    });

    expect(result.current.planId).toBeNull();
  });

  it('planId is null on failure', async () => {
    mockCall.mockResolvedValue({ ok: false, error: 'Failed' });

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(result.current.planId).toBeNull();
  });

  it('never fabricates a plan_id', async () => {
    mockCall.mockResolvedValue({ ok: true }); // No plan_id in response

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(result.current.planId).toBeNull();
  });
});

// ── Error State Tests ────────────────────────────────────────────────────────

describe('error states', () => {
  it('error is null initially', () => {
    const { result } = renderHook(() => useSecurityRemediationPlan());
    expect(result.current.error).toBeNull();
  });

  it('error is set on RPC failure', async () => {
    mockCall.mockResolvedValue({ ok: false, error: 'Database error' });

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });

    expect(result.current.error).toBe('Database error');
  });

  it('error is cleared on successful retry', async () => {
    mockCall.mockResolvedValueOnce({ ok: false, error: 'Failed' });
    mockCall.mockResolvedValueOnce(successResponse);

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });
    expect(result.current.error).toBe('Failed');

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.planId).toBe('sec-plan-uuid-123');
  });

  it('error is cleared on reset', async () => {
    mockCall.mockResolvedValue({ ok: false, error: 'Failed' });

    const { result } = renderHook(() => useSecurityRemediationPlan());

    await act(async () => {
      await result.current.createPlan(sampleSecurityActions);
    });
    expect(result.current.error).toBe('Failed');

    act(() => {
      result.current.reset();
    });
    expect(result.current.error).toBeNull();
  });
});

// ── Concurrency Tests ────────────────────────────────────────────────────────

describe('concurrency', () => {
  it('isCreating is true during plan creation', async () => {
    let resolveRpc: (value: unknown) => void = () => {};
    mockCall.mockReturnValue(new Promise((resolve) => { resolveRpc = resolve; }));

    const { result } = renderHook(() => useSecurityRemediationPlan());

    act(() => {
      result.current.createPlan(sampleSecurityActions);
    });

    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      resolveRpc(successResponse);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.isCreating).toBe(false);
  });

  it('reset is blocked during creation', async () => {
    let resolveRpc: (value: unknown) => void = () => {};
    mockCall.mockReturnValue(new Promise((resolve) => { resolveRpc = resolve; }));

    const { result } = renderHook(() => useSecurityRemediationPlan());

    act(() => {
      result.current.createPlan(sampleSecurityActions);
    });

    act(() => {
      result.current.reset();
    });

    // planId should still be null (not cleared by reset during creation)
    expect(result.current.planId).toBeNull();

    await act(async () => {
      resolveRpc(successResponse);
      await new Promise((r) => setTimeout(r, 0));
    });

    // Now planId should be set
    expect(result.current.planId).toBe('sec-plan-uuid-123');
  });
});
