/**
 * DashboardViewModel — MVVM state machine for System Health Dashboard.
 *
 * Responsibilities:
 *   - Poll dashboard metrics every 2 seconds
 *   - Calculate and display health score
 *   - Handle One Click Optimize flow
 *   - Manage quick actions navigation
 *   - Track optimization history
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type {
  DashboardMetrics,
  HealthScore,
  OptimizePreview,
  OptimizeExecuteResponse,
} from './dashboard.types';
import type { DashboardService } from './dashboard.service';
import { privacyService as defaultPrivacyService } from '../privacy/privacy.service';
import type { IPrivacyService } from '../privacy/privacy.service';
import type { NavigateFunction } from 'react-router-dom';
import { calculateHealthScore } from './dashboard.utils';

export type OptimizeStep = 'idle' | 'preview' | 'confirm' | 'optimizing' | 'complete';

export interface DashboardState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;

  // Real-time metrics
  metrics: DashboardMetrics | null;
  metricsLoading: boolean;
  metricsError: string | null;
  lastMetricsUpdate: number | null;

  // Health score
  healthScore: HealthScore | null;
  healthScoreLoading: boolean;
  healthScoreError: string | null;

  // Privacy risk count (loaded from privacy service)
  privacyRisks: number | null;
  privacyRisksLoading: boolean;
  privacyRisksError: string | null;

  // Optimization flow
  optimizeStep: OptimizeStep;
  optimizePreview: OptimizePreview | null;
  optimizePreviewLoading: boolean;
  optimizePreviewError: string | null;
  optimizeResult: OptimizeExecuteResponse | null;
  optimizeError: string | null;

  // Quick actions
  quickActionsOpen: boolean;
}

const METRICS_POLL_INTERVAL_MS = 2000;

export class DashboardViewModel extends ViewModel<DashboardState> {
  private metricsPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly service: DashboardService,
    private readonly privacyService: IPrivacyService = defaultPrivacyService
  ) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,

      metrics: null,
      metricsLoading: false,
      metricsError: null,
      lastMetricsUpdate: null,

      healthScore: null,
      healthScoreLoading: false,
      healthScoreError: null,

      privacyRisks: null,
      privacyRisksLoading: false,
      privacyRisksError: null,

      optimizeStep: 'idle',
      optimizePreview: null,
      optimizePreviewLoading: false,
      optimizePreviewError: null,
      optimizeResult: null,
      optimizeError: null,

      quickActionsOpen: false,
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  async bootstrap(): Promise<void> {
    if (this.state.bootstrap === 'ready') return;
    // Render the dashboard shell immediately; load data in the background.
    this.setState({
      bootstrap: 'ready',
      bootstrapError: null,
      metricsLoading: true,
      privacyRisksLoading: true,
      healthScoreLoading: true,
    });
    void this.bootstrapData();
  }

  private async bootstrapData(): Promise<void> {
    try {
      await Promise.all([this.loadMetrics(), this.loadPrivacyRisks()]);
    } catch (err) {
      console.error('Dashboard bootstrap failed:', err);
    }
    this.startMetricsPolling();
  }

  override dispose(): void {
    this.stopMetricsPolling();
    super.dispose();
  }

  // ------------------------------------------------------------------
  // Metrics
  // ------------------------------------------------------------------
  async loadMetrics(): Promise<void> {
    this.setState({ metricsLoading: true, metricsError: null });
    try {
      const metrics = await this.service.getMetrics();
      this.setState({
        metrics,
        metricsLoading: false,
        lastMetricsUpdate: Date.now(),
      });
      this.recalculateHealth(metrics, this.state.privacyRisks);
    } catch (err) {
      this.setState({
        metricsLoading: false,
        metricsError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async loadPrivacyRisks(): Promise<void> {
    this.setState({ privacyRisksLoading: true, privacyRisksError: null });
    try {
      const result = await this.privacyService.detectBrowsers();
      const risks = result.browsers.length;
      this.setState({ privacyRisks: risks, privacyRisksLoading: false });
      this.recalculateHealth(this.state.metrics, risks);
    } catch (err) {
      this.setState({
        privacyRisksLoading: false,
        privacyRisksError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private recalculateHealth(metrics = this.state.metrics, privacyRisks = this.state.privacyRisks): void {
    if (!metrics) return;
    this.setState({
      healthScore: calculateHealthScore(metrics, privacyRisks),
      healthScoreLoading: false,
    });
  }

  // ------------------------------------------------------------------
  // Optimization
  // ------------------------------------------------------------------
  async openOptimizePreview(): Promise<void> {
    this.setState({
      optimizeStep: 'preview',
      optimizePreview: null,
      optimizePreviewLoading: true,
      optimizePreviewError: null,
      optimizeError: null,
    });
    
    try {
      const preview = await this.service.getOptimizePreview();
      this.setState({
        optimizePreview: preview,
        optimizePreviewLoading: false,
      });
    } catch (err) {
      this.setState({
        optimizePreviewLoading: false,
        optimizePreviewError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  advanceToOptimizeConfirm(): void {
    if (!this.state.optimizePreview) return;
    void this.executeOptimize();
  }

  cancelOptimizeFlow(): void {
    this.setState({
      optimizeStep: 'idle',
      optimizePreview: null,
      optimizePreviewError: null,
      optimizeResult: null,
      optimizeError: null,
    });
  }

  async executeOptimize(): Promise<void> {
    this.setState({ optimizeStep: 'optimizing', optimizeError: null });
    
    try {
      const result = await this.service.executeOptimize();
      this.setState({
        optimizeResult: result,
        optimizeStep: 'complete',
      });
      // Refresh metrics after optimization; health score recomputed incrementally.
      await this.loadMetrics();
    } catch (err) {
      this.setState({
        optimizeStep: 'preview',
        optimizeError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  closeOptimizeResult(): void {
    this.setState({
      optimizeStep: 'idle',
      optimizePreview: null,
      optimizeResult: null,
      optimizeError: null,
    });
  }

  // ------------------------------------------------------------------
  // Quick Actions
  // ------------------------------------------------------------------
  toggleQuickActions(): void {
    this.setState({ quickActionsOpen: !this.state.quickActionsOpen });
  }

  async startQuickScan(navigate: NavigateFunction): Promise<void> {
    console.log('[DashboardViewModel] startQuickScan called');
    // Navigate to junk cleaner with auto-scan flag
    // This will be handled by the router and Junk Cleaner page
    navigate('/junk-cleaner?autoScan=true');
  }

  // ------------------------------------------------------------------
  // Polling
  // ------------------------------------------------------------------
  private startMetricsPolling(): void {
    this.stopMetricsPolling();
    void this.pollMetricsOnce();
    this.metricsPollTimer = setInterval(() => void this.pollMetricsOnce(), METRICS_POLL_INTERVAL_MS);
  }

  private stopMetricsPolling(): void {
    if (this.metricsPollTimer) {
      clearInterval(this.metricsPollTimer);
      this.metricsPollTimer = null;
    }
  }

  private async pollMetricsOnce(): Promise<void> {
    // Don't poll if optimization is running to avoid conflicts
    if (this.state.optimizeStep === 'optimizing') return;

    try {
      const metrics = await this.service.getMetrics();
      this.setState({
        metrics,
        lastMetricsUpdate: Date.now(),
      });
      this.recalculateHealth(metrics, this.state.privacyRisks);
    } catch (err) {
      // Silently fail on polling errors to avoid UI disruption
      console.warn('Metrics poll failed:', err);
    }
  }
}
