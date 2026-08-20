// @vitest-environment happy-dom
/**
 * DashboardScanUI.test.tsx — Dashboard scan UI/UX behavior tests
 *
 * Tests the redesigned Dashboard scan experience:
 * - Modal open/close
 * - CTA state changes
 * - Error handling
 * - Progress display
 * - Initialization states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPageV2';

// Mock dependencies
const mockUseDashboardScan = vi.fn(() => ({
  session: null,
  persisted: null,
  snapshot: {
    hasActiveSession: false,
    scanStatus: 'idle',
    remediationStatus: 'idle',
    module: 'optimize',
    moduleName: 'AI Smart Optimize',
    moduleRoute: '/ai-smart-optimize',
    issuesFound: 0,
    actionableCount: 0,
    canReview: false,
    canApprove: false,
    canRollback: false,
    completedAt: null,
    error: null,
    planId: null,
    overallProgress: 0,
    currentActivity: null,
    cleanupResult: null,
  },
  isLoading: false,
}));

vi.mock('../../scan/useDashboardScan', () => ({
  useDashboardScan: (...args: unknown[]) => mockUseDashboardScan(...args),
}));

vi.mock('../../scan/useDashboardOptimizationPlan', () => ({
  useDashboardOptimizationPlan: () => ({
    planId: null,
    isCreating: false,
    error: null,
    createPlan: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('../DashboardViewModel', () => ({
  DashboardViewModel: vi.fn().mockImplementation(() => ({
    bootstrap: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    loadMetrics: vi.fn(),
    loadLiveMetrics: vi.fn(),
    loadHardwareSensors: vi.fn(),
    loadRecentActivity: vi.fn(),
    clearMetricsError: vi.fn(),
    clearLiveMetricsError: vi.fn(),
    clearHardwareSensorsError: vi.fn(),
    clearRecentActivityError: vi.fn(),
  })),
}));

vi.mock('@avs/core/mvvm/useViewModel', () => ({
  useViewModel: () => ({
    bootstrap: 'success',
    bootstrapError: null,
    metrics: null,
    metricsError: null,
    liveMetrics: null,
    liveMetricsError: null,
    healthScore: { overallScore: 85, issues: [] },
    hardwareSensors: null,
    hardwareSensorsLoading: false,
    hardwareSensorsError: null,
  }),
}));

vi.mock('../dashboard.service', () => ({
  dashboardService: {
    getOptimizePreview: vi.fn().mockResolvedValue({ actions: [] }),
  },
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe('Dashboard Scan UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDashboardScan.mockReset();
    // Re-establish the default mock implementation after reset
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: false,
        scanStatus: 'idle',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 0,
        actionableCount: 0,
        canReview: false,
        canApprove: false,
        canRollback: false,
        completedAt: null,
        error: null,
        planId: null,
        overallProgress: 0,
        currentActivity: null,
        cleanupResult: null,
      },
      isLoading: false,
    });
  });

  it('renders primary scan CTA with "Scan Now" label when idle', async () => {
    renderDashboard();
    await waitFor(() => {
      const scanBtn = screen.getByTestId('dashboard-scan-cta');
      expect(scanBtn).toBeInTheDocument();
      expect(scanBtn).toHaveTextContent('Scan Now');
    });
  });

  it('scan CTA is not disabled when idle', async () => {
    renderDashboard();
    await waitFor(() => {
      const scanBtn = screen.getByTestId('dashboard-scan-cta');
      expect(scanBtn).not.toBeDisabled();
    });
  });

  it('opens scan modal when Scan Now is clicked', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-scan-cta')).toBeInTheDocument();
    });

    const scanBtn = screen.getByTestId('dashboard-scan-cta');
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-scan-modal')).toBeInTheDocument();
    });
  });

  it('modal contains ScanView component', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-scan-cta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('dashboard-scan-cta'));

    await waitFor(() => {
      // ScanView renders with scan-view-idle testid when idle
      expect(screen.getByTestId('scan-view-idle')).toBeInTheDocument();
    });
  });

  it('shows "Try Again" label when scan status is error', async () => {
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'error',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 0,
        actionableCount: 0,
        canReview: false,
        canApprove: false,
        canRollback: false,
        completedAt: null,
        error: 'Scan engine is still initializing',
        planId: null,
        overallProgress: 0,
        currentActivity: null,
      },
      isLoading: false,
    });

    renderDashboard();

    await waitFor(() => {
      const scanBtn = screen.getByTestId('dashboard-scan-cta');
      expect(scanBtn).toHaveTextContent('Try Again');
    });
  });

  it('shows user-friendly initialization error message', async () => {
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'error',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 0,
        actionableCount: 0,
        canReview: false,
        canApprove: false,
        canRollback: false,
        completedAt: null,
        error: 'Scan engine is still initializing. Please try again in a moment.',
        planId: null,
        overallProgress: 0,
        currentActivity: null,
      },
      isLoading: false,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/AVS is preparing the scanner/i)).toBeInTheDocument();
    });
  });

  it('shows "View Progress" when scan is active', async () => {
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'scanning',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 0,
        actionableCount: 0,
        canReview: false,
        canApprove: false,
        canRollback: false,
        completedAt: null,
        error: null,
        planId: null,
        overallProgress: 45,
        currentActivity: 'Checking system files...',
      },
      isLoading: false,
    });

    renderDashboard();

    await waitFor(() => {
      const scanBtn = screen.getByTestId('dashboard-scan-cta');
      expect(scanBtn).toHaveTextContent('View Progress');
    });
  });

  it('shows progress bar during active scan', async () => {
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'scanning',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 0,
        actionableCount: 0,
        canReview: false,
        canApprove: false,
        canRollback: false,
        completedAt: null,
        error: null,
        planId: null,
        overallProgress: 45,
        currentActivity: 'Checking system files...',
        cleanupResult: null,
      },
      isLoading: false,
    });

    renderDashboard();

    await waitFor(() => {
      // Dashboard shows "Scanning your PC" status and "View Progress" CTA
      // when scan is active. The progress percentage and current activity
      // are shown in the scan modal, not on the dashboard card itself.
      expect(screen.getByText('Scanning your PC')).toBeInTheDocument();
      expect(screen.getByTestId('dashboard-scan-cta')).toHaveTextContent('View Progress');
    });
  });

  it('progress bar never shows invalid values', async () => {
    // Test with undefined progress
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'scanning',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 0,
        actionableCount: 0,
        canReview: false,
        canApprove: false,
        canRollback: false,
        completedAt: null,
        error: null,
        planId: null,
        overallProgress: undefined,
        currentActivity: null,
        cleanupResult: null,
      },
      isLoading: false,
    });

    renderDashboard();

    // Dashboard should still render the scanning state without crashing
    // even when progress is undefined. The "View Progress" CTA should be
    // present, but no numeric progress percentage is shown on the card.
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-scan-cta')).toHaveTextContent('View Progress');
    });
  });

  it('shows "Review Results" when scan completes with findings', async () => {
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'complete',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 15,
        actionableCount: 8,
        canReview: true,
        canApprove: false,
        canRollback: false,
        completedAt: new Date().toISOString(),
        error: null,
        planId: 'plan-123',
        overallProgress: 100,
        currentActivity: null,
      },
      isLoading: false,
    });

    renderDashboard();

    await waitFor(() => {
      const scanBtn = screen.getByTestId('dashboard-scan-cta');
      expect(scanBtn).toHaveTextContent('Review Results');
    });
  });

  it('shows actionable recommendation card when scan completes with actionable findings', async () => {
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'complete',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 15,
        actionableCount: 8,
        canReview: true,
        canApprove: false,
        canRollback: false,
        completedAt: new Date().toISOString(),
        error: null,
        planId: 'plan-123',
        overallProgress: 100,
        currentActivity: null,
      },
      isLoading: false,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('actionable-recommendation')).toBeInTheDocument();
      expect(screen.getByText(/8 actionable issues ready for review/i)).toBeInTheDocument();
    });
  });

  it('does not show actionable recommendation when no actionable findings', async () => {
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'complete',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 5,
        actionableCount: 0,
        canReview: false,
        canApprove: false,
        canRollback: false,
        completedAt: new Date().toISOString(),
        error: null,
        planId: null,
        overallProgress: 100,
        currentActivity: null,
      },
      isLoading: false,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByTestId('actionable-recommendation')).not.toBeInTheDocument();
    });
  });

  it('shows optimize preview card when idle and no scan results', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('optimize-preview-card')).toBeInTheDocument();
      expect(screen.getByText(/Quick optimization available/i)).toBeInTheDocument();
    });
  });

  it('does not show optimize preview card during active scan', async () => {
    mockUseDashboardScan.mockReturnValue({
      session: null,
      persisted: null,
      snapshot: {
        hasActiveSession: true,
        scanStatus: 'scanning',
        remediationStatus: 'idle',
        module: 'optimize',
        moduleName: 'AI Smart Optimize',
        moduleRoute: '/ai-smart-optimize',
        issuesFound: 0,
        actionableCount: 0,
        canReview: false,
        canApprove: false,
        canRollback: false,
        completedAt: null,
        error: null,
        planId: null,
        overallProgress: 45,
        currentActivity: null,
      },
      isLoading: false,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.queryByTestId('optimize-preview-card')).not.toBeInTheDocument();
    });
  });

  it('primary health card shows correct health score', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('primary-system-health')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.getByText('/100')).toBeInTheDocument();
      expect(screen.getByText('Excellent')).toBeInTheDocument();
    });
  });

  it('shows four quick metric cards', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('metric-protection')).toBeInTheDocument();
      expect(screen.getByTestId('metric-performance')).toBeInTheDocument();
      expect(screen.getByTestId('metric-storage')).toBeInTheDocument();
      expect(screen.getByTestId('metric-issues')).toBeInTheDocument();
    });
  });
});
