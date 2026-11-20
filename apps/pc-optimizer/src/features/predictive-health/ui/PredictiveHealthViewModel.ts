import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PredictiveHealthEngine } from '../PredictiveHealthEngine';
import type { Prediction, Forecast, PredictionDashboardData, PredictionNotification, PredictionInput, PredictionConfiguration, HealthScorePoint, StorageDataPoint, StartupDataPoint, OptimizationHistoryEntry, HistoricalSeries } from '../types';
import { DEFAULT_PREDICTION_CONFIG } from '../types';
import { getIsPro } from '../../sync/syncStore';
import { rpc } from '../../../services/rpc';

/** Forecast horizon (days) granted to the Free edition. */
const FREE_FORECAST_HORIZON_DAYS = 7;

export interface PredictiveHealthState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  predictions: Prediction[];
  forecasts: Forecast[];
  dashboard: PredictionDashboardData | null;
  notifications: PredictionNotification[];
  lastGeneratedAt: number | null;
}

export class PredictiveHealthViewModel extends ViewModel<PredictiveHealthState> {
  private engine: PredictiveHealthEngine;

  constructor() {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      predictions: [],
      forecasts: [],
      dashboard: null,
      notifications: [],
      lastGeneratedAt: null,
    });

    this.engine = this.buildEngine();
  }

  /**
   * Build the engine with the edition-appropriate forecast horizon.
   * Free users get a capped (7-day) forecast; Professional is unlimited.
   */
  private buildEngine(): PredictiveHealthEngine {
    const config: PredictionConfiguration = {
      ...DEFAULT_PREDICTION_CONFIG,
      forecastHorizonCapDays: getIsPro() ? null : FREE_FORECAST_HORIZON_DAYS,
    };
    return new PredictiveHealthEngine(config);
  }

  /** Recreate the engine so an edition change takes effect on next run. */
  private resetEngine(): void {
    this.engine.dispose();
    this.engine = this.buildEngine();
  }

  async bootstrap(): Promise<void> {
    this.setState({ bootstrap: 'loading' });
    try {
      this.resetEngine();
      await this.ingestRealData();
      this.engine.generateForecasts();
      const dashboard = this.engine.buildDashboard();
      const notifications = this.engine.getNotifications();
      const predictions = this.engine.getLastPredictions();
      const forecasts = this.engine.getLastForecasts();

      this.setState({
        bootstrap: 'ready',
        predictions,
        forecasts,
        dashboard,
        notifications,
        lastGeneratedAt: Date.now(),
      });
    } catch (e) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: e instanceof Error ? e.message : 'Failed to initialize predictive health',
      });
    }
  }

  async refresh(): Promise<void> {
    try {
      this.resetEngine();
      await this.ingestRealData();
      this.engine.generateForecasts();
      const dashboard = this.engine.buildDashboard();
      const notifications = this.engine.getNotifications();
      const predictions = this.engine.getLastPredictions();
      const forecasts = this.engine.getLastForecasts();

      this.setState({
        predictions,
        forecasts,
        dashboard,
        notifications,
        lastGeneratedAt: Date.now(),
      });
    } catch (e) {
      this.setState({
        bootstrapError: e instanceof Error ? e.message : 'Refresh failed',
      });
    }
  }

  dismissNotification(notificationId: string): void {
    this.engine.dismissNotification(notificationId);
    this.setState({ notifications: this.engine.getNotifications() });
  }

  /**
   * Ingest real backend telemetry — the page previously rendered entirely
   * fabricated 30-day trends. Only channels the backend actually provides
   * are populated; the engine shows an honest insufficient-data state for
   * the rest instead of synthetic confidence.
   */
  private async ingestRealData(): Promise<void> {
    const now = Date.now();
    const healthScores: HealthScorePoint[] = [];
    const storageData: StorageDataPoint[] = [];
    const startupData: StartupDataPoint[] = [];
    const optimizationHistory: OptimizationHistoryEntry[] = [];
    const hardwareTrends: HistoricalSeries[] = [];

    // Current health score.
    try {
      const h = await rpc.raw<{ score?: number; healthScore?: number; overall?: number } | number>('dashboard.health');
      const score = typeof h === 'number' ? h : (h?.score ?? h?.healthScore ?? h?.overall);
      if (typeof score === 'number') {
        healthScores.push({ timestamp: now, healthScore: score, source: 'dashboard.health' });
      }
    } catch { /* health service unavailable */ }

    // Drive usage — disk.listDrives returns a bare array.
    try {
      interface RawDrive { mountpoint: string; total: number; free: number }
      const res = await rpc.raw<RawDrive[] | { drives: RawDrive[] }>('disk.listDrives');
      const drives = Array.isArray(res) ? res : (res.drives || []);
      for (const d of drives) {
        storageData.push({
          timestamp: now,
          totalCapacityMB: d.total / 1_048_576,
          usedSpaceMB: (d.total - d.free) / 1_048_576,
          freeSpaceMB: d.free / 1_048_576,
          healthPercent: 100,
          drive: d.mountpoint,
        });
      }
    } catch { /* disk service unavailable */ }

    // Real metric snapshots — health.history returns recorded
    // healthScore/cpu/ram/disk/temperature/startup data points.
    try {
      interface Snapshot {
        capturedAt: string; healthScore: number; cpuUsage?: number;
        memoryUsage?: number; diskUsage?: number; temperature?: number;
        startupCount?: number;
      }
      const res = await rpc.raw<{ snapshots?: Snapshot[] }>(
        'health.history', { hours: 24 * 30, limit: 500 });
      const snaps = (res.snapshots || []).slice().reverse(); // oldest first
      const diskCapacityMB = storageData[0]?.totalCapacityMB ?? 0;
      for (const snap of snaps) {
        const ts = Date.parse(snap.capturedAt) || now;
        if (typeof snap.healthScore === 'number') {
          healthScores.push({ timestamp: ts, healthScore: snap.healthScore, source: 'health.history' });
        }
        if (typeof snap.diskUsage === 'number' && diskCapacityMB > 0) {
          const used = diskCapacityMB * (snap.diskUsage / 100);
          storageData.push({
            timestamp: ts, totalCapacityMB: diskCapacityMB,
            usedSpaceMB: used, freeSpaceMB: diskCapacityMB - used,
            healthPercent: 100, drive: 'system',
          });
        }
        if (typeof snap.cpuUsage === 'number' || typeof snap.memoryUsage === 'number' || typeof snap.temperature === 'number') {
          if (typeof snap.cpuUsage === 'number') {
            hardwareTrends.push({
              domain: 'cpu', metric: 'usage', unit: '%', source: 'health.history',
              dataPoints: [{ timestamp: ts, domain: 'cpu', metric: 'usage', value: snap.cpuUsage, unit: '%', source: 'health.history' }],
              firstTimestamp: ts, lastTimestamp: ts, duration: 0, pointCount: 1,
            });
          }
          if (typeof snap.memoryUsage === 'number') {
            hardwareTrends.push({
              domain: 'ram', metric: 'usage', unit: '%', source: 'health.history',
              dataPoints: [{ timestamp: ts, domain: 'ram', metric: 'usage', value: snap.memoryUsage, unit: '%', source: 'health.history' }],
              firstTimestamp: ts, lastTimestamp: ts, duration: 0, pointCount: 1,
            });
          }
        }
        if (typeof snap.startupCount === 'number') {
          startupData.push({ timestamp: ts, startupTimeSeconds: 0, startupItemCount: snap.startupCount });
        }
      }
    } catch { /* health history unavailable (Pro-gated or empty) */ }

    // Merge per-snapshot hardware points into consolidated series.
    const consolidated = new Map<string, HistoricalSeries['dataPoints']>();
    for (const s of hardwareTrends) {
      const arr = consolidated.get(s.domain) || [];
      arr.push(...s.dataPoints);
      consolidated.set(s.domain, arr);
    }
    hardwareTrends.length = 0;
    for (const [domain, points] of consolidated) {
      points.sort((a, b) => a.timestamp - b.timestamp);
      const first = points[0]!, last = points[points.length - 1]!;
      hardwareTrends.push({
        domain: domain as never, metric: 'usage', unit: '%', source: 'health.history',
        dataPoints: points, firstTimestamp: first.timestamp,
        lastTimestamp: last.timestamp, duration: last.timestamp - first.timestamp,
        pointCount: points.length,
      });
    }

    // Startup items count (real); boot duration isn't tracked yet.
    try {
      const res = await rpc.raw<{ entries?: unknown[] } | unknown[]>('startup.list');
      const count = Array.isArray(res) ? res.length : (res.entries || []).length;
      startupData.push({ timestamp: now, startupTimeSeconds: 0, startupItemCount: count });
    } catch { /* startup service unavailable */ }

    const input: PredictionInput = {
      // processTrends still has no real backend source — left empty
      // rather than fabricated.
      hardwareTrends,
      processTrends: [],
      optimizationHistory,
      healthScores,
      storageData,
      startupData,
      timestamp: now,
    };

    this.engine.ingestData(input);
  }


  override dispose(): void {
    this.engine.dispose();
    super.dispose();
  }
}
