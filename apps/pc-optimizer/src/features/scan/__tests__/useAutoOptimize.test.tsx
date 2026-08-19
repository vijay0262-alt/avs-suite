// @vitest-environment happy-dom
/**
 * useAutoOptimize.test.tsx — tests for the one-click auto-optimization hook.
 *
 * Tests:
 * 1. Auto-optimization starts when planId is provided
 * 2. Status polling updates phase and counters
 * 3. Completion shows the final result
 * 4. Cancellation stops the optimization
 * 5. Error handling
 * 6. No fabrication of values
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAutoOptimize } from '../useAutoOptimize';
import { remediationService } from '../remediation.service';
import type { AutoOptimizeStatus } from '../types';

// Mock the remediation service
vi.mock('../remediation.service', () => ({
  remediationService: {
    autoOptimize: vi.fn(),
    autoOptimizeStatus: vi.fn(),
    autoOptimizeCancel: vi.fn(),
  },
}));

const mockRemediationService = remediationService as unknown as {
  autoOptimize: ReturnType<typeof vi.fn>;
  autoOptimizeStatus: ReturnType<typeof vi.fn>;
  autoOptimizeCancel: ReturnType<typeof vi.fn>;
};

function makeStatus(overrides: Partial<AutoOptimizeStatus>): AutoOptimizeStatus {
  return {
    ok: true,
    session_id: 'test-session',
    plan_id: 'test-plan',
    phase: 'preparing',
    message: 'Preparing...',
    preview: null,
    validation: null,
    result: null,
    completed: false,
    cancelled: false,
    error: null,
    total_actions: 10,
    safe_actions: 7,
    review_required: 2,
    blocked: 1,
    verification_status: null,
    ...overrides,
  };
}

describe('useAutoOptimize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemediationService.autoOptimize.mockResolvedValue({
      ok: true,
      session_id: 'test-session',
    });
    mockRemediationService.autoOptimizeCancel.mockResolvedValue({
      ok: true,
      cancelled: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts auto-optimization when startAutoOptimize is called', async () => {
    mockRemediationService.autoOptimizeStatus.mockResolvedValue(
      makeStatus({ phase: 'preparing', completed: true, result: {
        total: 10, completed: 7, failed: 0, rejected: 1, skipped: 0,
        requires_review: 2, cancelled: 0, space_recovered: 1024,
      } }),
    );

    const { result } = renderHook(() => useAutoOptimize());

    await act(async () => {
      await result.current.startAutoOptimize('test-plan');
    });

    expect(mockRemediationService.autoOptimize).toHaveBeenCalledWith('test-plan');
    expect(result.current.isRunning).toBe(false); // completed
    expect(result.current.phase).toBe('preparing');
  });

  it('polls status and updates phase', async () => {
    let pollCount = 0;
    mockRemediationService.autoOptimizeStatus.mockImplementation(() => {
      pollCount++;
      if (pollCount === 1) {
        return Promise.resolve(makeStatus({ phase: 'preparing', completed: false }));
      }
      if (pollCount === 2) {
        return Promise.resolve(makeStatus({ phase: 'executing', completed: false, message: 'Optimizing 7 safe actions...' }));
      }
      return Promise.resolve(makeStatus({
        phase: 'complete',
        completed: true,
        message: 'Optimization complete',
        result: {
          total: 10, completed: 7, failed: 0, rejected: 1, skipped: 0,
          requires_review: 2, cancelled: 0, space_recovered: 2048,
        },
        verification_status: 'passed',
      }));
    });

    const { result } = renderHook(() => useAutoOptimize());

    await act(async () => {
      await result.current.startAutoOptimize('test-plan');
    });

    // First poll is immediate
    expect(result.current.phase).toBe('preparing');

    // Wait for second poll
    await waitFor(() => expect(result.current.phase).toBe('executing'), { timeout: 2000 });

    // Wait for third poll (complete)
    await waitFor(() => {
      expect(result.current.phase).toBe('complete');
      expect(result.current.isRunning).toBe(false);
    }, { timeout: 2000 });

    expect(result.current.result?.completed).toBe(7);
    expect(result.current.result?.space_recovered).toBe(2048);
    expect(result.current.verificationStatus).toBe('passed');
  }, 15000);

  it('cancels optimization', async () => {
    mockRemediationService.autoOptimizeStatus.mockResolvedValue(
      makeStatus({ phase: 'executing', completed: false }),
    );

    const { result } = renderHook(() => useAutoOptimize());

    await act(async () => {
      await result.current.startAutoOptimize('test-plan');
    });

    expect(result.current.isRunning).toBe(true);

    act(() => {
      result.current.cancelAutoOptimize();
    });

    expect(mockRemediationService.autoOptimizeCancel).toHaveBeenCalledWith('test-session');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.phase).toBe('cancelled');
  });

  it('handles error from backend', async () => {
    mockRemediationService.autoOptimize.mockResolvedValue({
      ok: false,
      error: 'Plan not found',
    });

    const { result } = renderHook(() => useAutoOptimize());

    await act(async () => {
      await result.current.startAutoOptimize('bad-plan');
    });

    expect(result.current.error).toBe('Plan not found');
    expect(result.current.isRunning).toBe(false);
    expect(result.current.phase).toBe('error');
  });

  it('handles error during status polling', async () => {
    mockRemediationService.autoOptimizeStatus.mockResolvedValue(
      makeStatus({ phase: 'error', completed: true, error: 'Execution failed' }),
    );

    const { result } = renderHook(() => useAutoOptimize());

    await act(async () => {
      await result.current.startAutoOptimize('test-plan');
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.error).toBe('Execution failed');
    expect(result.current.isRunning).toBe(false);
  });

  it('does not fabricate values — all counters come from backend', async () => {
    mockRemediationService.autoOptimizeStatus.mockResolvedValue(
      makeStatus({
        phase: 'complete',
        completed: true,
        total_actions: 15,
        safe_actions: 10,
        review_required: 3,
        blocked: 2,
        result: {
          total: 15, completed: 10, failed: 1, rejected: 2, skipped: 0,
          requires_review: 3, cancelled: 0, space_recovered: 4096,
        },
        verification_status: 'partial',
      }),
    );

    const { result } = renderHook(() => useAutoOptimize());

    await act(async () => {
      await result.current.startAutoOptimize('test-plan');
    });

    // All values must match the backend response exactly
    expect(result.current.totalActions).toBe(15);
    expect(result.current.safeActions).toBe(10);
    expect(result.current.reviewRequired).toBe(3);
    expect(result.current.blocked).toBe(2);
    expect(result.current.result?.completed).toBe(10);
    expect(result.current.result?.failed).toBe(1);
    expect(result.current.result?.space_recovered).toBe(4096);
    expect(result.current.verificationStatus).toBe('partial');
  });

  it('reset clears all state', async () => {
    mockRemediationService.autoOptimizeStatus.mockResolvedValue(
      makeStatus({ phase: 'executing', completed: false }),
    );

    const { result } = renderHook(() => useAutoOptimize());

    await act(async () => {
      await result.current.startAutoOptimize('test-plan');
    });

    expect(result.current.isRunning).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.phase).toBe('idle');
    expect(result.current.totalActions).toBe(0);
    expect(result.current.result).toBeNull();
  });
});
