// @vitest-environment happy-dom
/**
 * Tests for the Boost Memory feature on the Dashboard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPageV2';

// Mock the performance service
const { mockOptimizeMemory } = vi.hoisted(() => ({ mockOptimizeMemory: vi.fn() }));
vi.mock('../../performance/performance.service', () => ({
  performanceService: {
    optimizeMemory: mockOptimizeMemory,
  },
}));

// Mock the junk monitor hook
vi.mock('../../scheduled-cleanup/useJunkMonitor', () => ({
  useJunkMonitor: () => ({ status: null, loading: false, error: null }),
}));

// Mock the dashboard scan hook
const mockUseDashboardScan = vi.fn();
vi.mock('../../scan/useDashboardScan', () => ({
  useDashboardScan: (...args: unknown[]) => mockUseDashboardScan(...args),
}));

// Mock the dashboard optimization plan hook
vi.mock('../../scan/useDashboardOptimizationPlan', () => ({
  useDashboardOptimizationPlan: () => ({
    planId: null,
    isCreating: false,
    error: null,
    createPlan: vi.fn(),
    reset: vi.fn(),
  }),
}));

// Mock the edition check — DashboardPageV2 imports useIsPro from syncStore
vi.mock('../../sync/syncStore', () => ({
  useIsPro: () => true,
}));

// Mock the view model
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

// Mock the dashboard view model
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

// Mock the dashboard service
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

describe('Boost Memory Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOptimizeMemory.mockReset();
    mockUseDashboardScan.mockReset();
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

  it('renders the Boost Memory card', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-boost-memory')).toBeInTheDocument();
    });
  });

  it('shows Boost Memory button', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-boost-memory-btn')).toBeInTheDocument();
    });
  });

  it('calls optimizeMemory when button is clicked', async () => {
    mockOptimizeMemory.mockResolvedValue({
      status: 'completed',
      memoryFreed: 524288000,
      optimizationTimeMs: 1200,
      processesOptimized: 25,
      errors: [],
      healthImprovement: 10.5,
      beforeMemory: null,
      afterMemory: null,
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-boost-memory-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('dashboard-boost-memory-btn'));

    await waitFor(() => {
      expect(mockOptimizeMemory).toHaveBeenCalled();
    });
  });

  it('shows freed memory after successful boost', async () => {
    mockOptimizeMemory.mockResolvedValue({
      status: 'completed',
      memoryFreed: 524288000, // 500 MB
      optimizationTimeMs: 1200,
      processesOptimized: 25,
      errors: [],
      healthImprovement: 10.5,
      beforeMemory: null,
      afterMemory: null,
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-boost-memory-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('dashboard-boost-memory-btn'));

    await waitFor(() => {
      const card = screen.getByTestId('dashboard-boost-memory');
      expect(card.textContent).toMatch(/Freed 500\.0 MB/);
    });
  });
});
