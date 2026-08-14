// @vitest-environment happy-dom
/**
 * Unified Scan UI tests — covers ScanView for all three modules and the
 * scan-only backend contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ScanView } from '../ScanView';
import { orchestratorService } from '../../orchestrator/orchestrator.service';
import type { OrchestratorStatus } from '../../orchestrator/orchestrator.service';

describe('ScanView', () => {
  let currentStatus: OrchestratorStatus;

  const baseStatus: OrchestratorStatus = {
    sessionId: 'test-session',
    phase: 'preparing',
    progress: 10,
    currentModule: 'test',
    currentOperation: 'Scanning...',
    currentPath: null,
    itemsProcessed: 5,
    itemsRemaining: 100,
    bytesRecovered: 0,
    overallScoreBefore: 80,
    overallScoreAfter: 80,
    issuesBefore: 0,
    issuesAfter: 0,
    spaceRecovered: 0,
    completedAt: null,
    error: null,
    cancelled: false,
    profile: 'dashboard',
    counters: {
      itemsScanned: 5,
      itemsAnalyzed: 0,
      itemsOptimized: 0,
      itemsSkipped: 0,
      storageRecovered: 0,
      elapsedMs: 0,
    },
    moduleStatuses: {},
    activityLog: [],
  };

  beforeEach(() => {
    cleanup();
    currentStatus = { ...baseStatus };

    vi.spyOn(orchestratorService, 'fullAsync').mockResolvedValue({
      sessionId: 'test-session',
      startedAt: new Date().toISOString(),
    });
    vi.spyOn(orchestratorService, 'status').mockImplementation(() =>
      Promise.resolve(currentStatus),
    );
    vi.spyOn(orchestratorService, 'result').mockResolvedValue({
      totalIssues: 0,
      modules: {},
      sessionId: 'test-session',
    });
    vi.spyOn(orchestratorService, 'cancel').mockResolvedValue({
      sessionId: 'test-session',
      cancelled: true,
    });
    vi.spyOn(orchestratorService, 'optimize');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders ScanView for each of the three modules', () => {
    for (const module of ['protection', 'optimize', 'security'] as const) {
      const { unmount } = render(
        <ScanView
          module={module}
          mode={module === 'optimize' ? 'quick' : 'full'}
          onClose={() => {}}
        />,
      );
      expect(screen.getByTestId('scan-view-idle')).toBeDefined();
      unmount();
    }
  });

  it('clicking the start scan button calls orchestratorService.fullAsync with scanOnly=true', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    const startBtn = screen.getByTestId('scan-start-btn');
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(orchestratorService.fullAsync).toHaveBeenCalledWith('dashboard', true);
    });
  });

  it('shows scanning state after start', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(
      () => {
        expect(screen.queryByTestId('unified-scan-view-active')).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('shows completed/no issues state when result has 0 issues', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    currentStatus = { ...currentStatus, phase: 'complete', progress: 100 };

    await waitFor(
      () => {
        expect(screen.queryByTestId('unified-scan-view-complete')).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('shows issues found when result has >0 issues', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    (orchestratorService.result as ReturnType<typeof vi.spyOn>).mockResolvedValue({
      totalIssues: 5,
      modules: {},
      sessionId: 'test-session',
    });
    currentStatus = {
      ...currentStatus,
      phase: 'complete',
      progress: 100,
      issuesBefore: 5,
    };

    await waitFor(
      () => {
        expect(screen.getByText(/5 issues found/)).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('calls orchestratorService.cancel when cancel button is clicked', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(
      () => {
        expect(screen.queryByTestId('unified-scan-view-active')).toBeDefined();
      },
      { timeout: 5000 },
    );

    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Yes, Cancel'));

    await waitFor(() => {
      expect(orchestratorService.cancel).toHaveBeenCalled();
    });
  });

  it('shows error/retry state on error', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    currentStatus = { ...currentStatus, error: 'Disk full' };

    await waitFor(
      () => {
        expect(screen.getByText('Scan Failed')).toBeDefined();
        expect(screen.getByText('Disk full')).toBeDefined();
      },
      { timeout: 5000 },
    );
  });

  it('verifies no remediation buttons appear', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));

    currentStatus = { ...currentStatus, phase: 'complete', progress: 100 };

    await waitFor(
      () => {
        expect(screen.queryByTestId('unified-scan-view-complete')).toBeDefined();
      },
      { timeout: 5000 },
    );

    expect(screen.queryByText('Fix All')).toBeNull();
    expect(screen.queryByText('Optimize Now')).toBeNull();
    expect(screen.queryByText('Quarantine')).toBeNull();
  });

  it('verifies full scan mode uses protection profile and scanOnly=true', async () => {
    render(<ScanView module="protection" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(orchestratorService.fullAsync).toHaveBeenCalledWith('protection', true);
    });
  });

  it('double-clicking the start scan button only creates one session', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    const startBtn = screen.getByTestId('scan-start-btn');
    fireEvent.click(startBtn);
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(orchestratorService.fullAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('cancels the active session and never calls optimize', async () => {
    render(<ScanView module="optimize" mode="quick" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('unified-scan-view-active')).toBeDefined();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Yes, Cancel'));

    await waitFor(() => {
      expect(orchestratorService.cancel).toHaveBeenCalledWith('test-session');
    });
    expect(orchestratorService.optimize).not.toHaveBeenCalled();
  });

  it('retry after close/error starts exactly one new session', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('unified-scan-view-active')).toBeDefined();
    }, { timeout: 5000 });

    currentStatus = { ...currentStatus, error: 'Disk full' };
    await waitFor(() => {
      expect(screen.getByText('Scan Failed')).toBeDefined();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.getByTestId('scan-view-idle')).toBeDefined();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(orchestratorService.fullAsync).toHaveBeenCalledTimes(2);
    });
  });

  it('uses the same scan-start-btn for all three modules', () => {
    for (const module of ['protection', 'optimize', 'security'] as const) {
      const { unmount } = render(
        <ScanView
          module={module}
          mode={module === 'optimize' ? 'quick' : 'full'}
          onClose={() => {}}
        />,
      );
      expect(screen.getByTestId('scan-start-btn')).toBeDefined();
      unmount();
    }
  });

  it('always calls fullAsync with scanOnly=true and never optimize', async () => {
    render(<ScanView module="security" mode="full" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('scan-start-btn'));
    await waitFor(() => {
      expect(orchestratorService.fullAsync).toHaveBeenCalled();
    });
    orchestratorService.fullAsync.mock.calls.forEach((call) => {
      expect(call[1]).toBe(true);
    });
    expect(orchestratorService.optimize).not.toHaveBeenCalled();
  });
});
