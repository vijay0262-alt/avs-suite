import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PredictiveHealthEngine } from '../PredictiveHealthEngine';
import type { Prediction, Forecast, PredictionDashboardData, PredictionNotification, PredictionInput } from '../types';
import { DEFAULT_PREDICTION_CONFIG } from '../types';

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

    this.engine = new PredictiveHealthEngine(DEFAULT_PREDICTION_CONFIG);
  }

  async bootstrap(): Promise<void> {
    this.setState({ bootstrap: 'loading' });
    try {
      this.ingestMockData();
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
      this.ingestMockData();
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

  private ingestMockData(): void {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const healthScores = [];
    for (let i = 30; i >= 0; i--) {
      healthScores.push({
        timestamp: now - i * dayMs,
        healthScore: Math.max(50, 92 - i * 0.8 + (Math.random() - 0.5) * 5),
        source: 'health-engine',
      });
    }

    const storageData = [];
    for (let i = 30; i >= 0; i--) {
      const used = 350000 + i * 800;
      storageData.push({
        timestamp: now - i * dayMs,
        totalCapacityMB: 512000,
        usedSpaceMB: used,
        freeSpaceMB: 512000 - used,
        healthPercent: 100 - (used / 512000) * 100,
        drive: 'C:',
      });
    }

    const startupData = [];
    for (let i = 14; i >= 0; i--) {
      startupData.push({
        timestamp: now - i * dayMs,
        startupTimeSeconds: 18 + i * 0.5,
        startupItemCount: 12,
      });
    }

    const hardwareTrends = [
      {
        domain: 'cpu' as const,
        metric: 'temperature',
        unit: 'C',
        source: 'hardware-center',
        dataPoints: Array.from({ length: 30 }, (_, j) => ({
          timestamp: now - (29 - j) * dayMs,
          domain: 'cpu' as const,
          metric: 'temperature',
          value: 55 + j * 0.3,
          unit: 'C',
          source: 'hardware-center',
        })),
        firstTimestamp: now - 29 * dayMs,
        lastTimestamp: now,
        duration: 29 * dayMs,
        pointCount: 30,
      },
      {
        domain: 'ram' as const,
        metric: 'usage_percent',
        unit: '%',
        source: 'dashboard',
        dataPoints: Array.from({ length: 30 }, (_, j) => ({
          timestamp: now - (29 - j) * dayMs,
          domain: 'ram' as const,
          metric: 'usage_percent',
          value: 65 + j * 0.4,
          unit: '%',
          source: 'dashboard',
        })),
        firstTimestamp: now - 29 * dayMs,
        lastTimestamp: now,
        duration: 29 * dayMs,
        pointCount: 30,
      },
    ];

    const processTrends = [
      {
        domain: 'memory_pressure' as const,
        metric: 'committed_bytes',
        unit: 'MB',
        source: 'process-ai',
        dataPoints: Array.from({ length: 30 }, (_, j) => ({
          timestamp: now - (29 - j) * dayMs,
          domain: 'memory_pressure' as const,
          metric: 'committed_bytes',
          value: 8192 + j * 50,
          unit: 'MB',
          source: 'process-ai',
        })),
        firstTimestamp: now - 29 * dayMs,
        lastTimestamp: now,
        duration: 29 * dayMs,
        pointCount: 30,
      },
    ];

    const optimizationHistory = [];
    for (let i = 7; i >= 0; i--) {
      optimizationHistory.push({
        timestamp: now - i * dayMs,
        actionsPerformed: Math.floor(Math.random() * 5) + 1,
        healthScoreBefore: 85 - i * 2,
        healthScoreAfter: 88 - i * 1.5,
        storageRecoveredMB: Math.floor(Math.random() * 500),
        ramRecoveredMB: Math.floor(Math.random() * 200),
      });
    }

    const input: PredictionInput = {
      hardwareTrends,
      processTrends,
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
