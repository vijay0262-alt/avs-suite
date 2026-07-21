/**
 * Performance Monitor ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { PerformanceMetrics, GraphHistory, ProcessInfo, Alert } from './performance.types';
import type { IPerformanceService, MemoryOptimizeResult } from './performance.service';
import { performanceService } from './performance.service';

export interface PerformanceState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  metrics: PerformanceMetrics | null;
  graphHistory: GraphHistory | null;
  topProcesses: ProcessInfo[];
  alerts: Alert[];
  loading: boolean;
  optimizing: boolean;
  optimizeResult: MemoryOptimizeResult | null;
  optimizeError: string | null;
}

const REFRESH_INTERVAL_MS = 3000; // Increased from 2000ms to reduce CPU usage

export class PerformanceViewModel extends ViewModel<PerformanceState> {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private service: IPerformanceService = performanceService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      metrics: null,
      graphHistory: null,
      topProcesses: [],
      alerts: [],
      loading: false,
      optimizing: false,
      optimizeResult: null,
      optimizeError: null,
    });
  }

  async bootstrap() {
    this.setState({ bootstrap: 'loading', bootstrapError: null });
    try {
      // Load the primary metric snapshot and graph history first so the UI
      // can render without waiting for the heavier process/alerts calls.
      await Promise.all([this.loadMetrics(), this.loadGraphHistory()]);
      this.setState({ bootstrap: 'ready' });
      this.startAutoRefresh();

      // Top processes and alerts can finish in the background
      void this.loadTopProcesses();
      void this.loadAlerts();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load performance metrics';
      this.setState({ bootstrap: 'error', bootstrapError: error });
      throw err;
    }
  }

  async loadMetrics(isAutoRefresh = false) {
    if (!isAutoRefresh) this.setState({ loading: true });
    try {
      const metrics = await this.service.getMetrics();
      this.setState({ metrics, loading: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load metrics';
      this.setState({ bootstrap: 'error', bootstrapError: error, loading: false });
      throw err;
    }
  }

  async loadGraphHistory() {
    try {
      const history = await this.service.getGraphHistory();
      this.setState({ graphHistory: history });
    } catch (err) {
      console.error('Failed to load graph history:', err);
    }
  }

  async loadTopProcesses(sortBy: string = 'cpu', limit: number = 10, search: string = '') {
    try {
      const result = await this.service.getTopProcesses(sortBy, limit, search);
      this.setState({ topProcesses: result.processes });
    } catch (err) {
      console.error('Failed to load top processes:', err);
    }
  }

  async loadAlerts() {
    try {
      const result = await this.service.getAlerts();
      this.setState({ alerts: result.alerts });
    } catch (err) {
      console.error('Failed to load alerts:', err);
    }
  }

  async clearGraphHistory() {
    try {
      await this.service.clearGraphHistory();
      await this.loadGraphHistory();
    } catch (err) {
      console.error('Failed to clear graph history:', err);
    }
  }

  async optimizeMemory() {
    this.setState({ optimizing: true, optimizeError: null, optimizeResult: null });
    try {
      const result = await this.service.optimizeMemory();
      this.setState({ optimizing: false, optimizeResult: result });
      await this.loadMetrics();
      void this.loadTopProcesses();
      // Invalidate the dashboard metrics cache so the Dashboard reflects
      // the reduced memory usage immediately.
      try {
        if (typeof window !== 'undefined' && window.avs) {
          void window.avs.rpc.call('dashboard.refreshCache');
        }
      } catch {
        // Best-effort.
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Optimization failed';
      this.setState({ optimizing: false, optimizeError: error });
    }
  }

  clearOptimizeResult() {
    this.setState({ optimizeResult: null, optimizeError: null });
  }

  private startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = setInterval(() => {
      if (this.state.bootstrap === 'ready') {
        void this.loadMetrics(true);
        void this.loadAlerts();
      }
    }, REFRESH_INTERVAL_MS);
  }

  private stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  formatFrequency(hz: number): string {
    if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GHz`;
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
    if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kHz`;
    return `${hz} Hz`;
  }

  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  override dispose() {
    this.stopAutoRefresh();
    super.dispose();
  }
}
