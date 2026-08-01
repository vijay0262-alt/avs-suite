/**
 * TrendCollector — collects historical data from existing modules
 * and converts it into the unified HistoricalDataPoint format.
 *
 * Never queries hardware directly. Only consumes data already
 * collected by HardwareTrendHistory, ProcessHistory, OptimizationHistory,
 * and other existing modules.
 */
import type {
  ForecastDomain,
  PredictionInput,
  OptimizationHistoryEntry,
  HealthScorePoint,
  StorageDataPoint,
  StartupDataPoint,
} from './types';
import type { TrendRepository } from './TrendRepository';

// Import types from existing modules for data conversion
import type { TrendDataPoint } from '../hardware-ai/types';
import type { HardwareCategory } from '../hardware-center/types';

const HARDWARE_CATEGORY_TO_DOMAIN: Record<HardwareCategory, ForecastDomain | null> = {
  cpu: 'cpu',
  gpu: 'gpu',
  ram: 'memory_pressure',
  motherboard: null,
  storage: 'storage',
  network: null,
  battery: 'battery',
  power_supply: null,
  cooling: 'thermal',
  operating_system: 'system_health',
  display: null,
  usb: null,
  pci: null,
  audio: null,
};

export interface HardwareTrendData {
  category: HardwareCategory;
  metric: string;
  points: TrendDataPoint[];
}

export interface ProcessTrendData {
  metric: string;
  points: { timestamp: number; value: number; unit: string }[];
}

export class TrendCollector {
  constructor(private repository: TrendRepository) {}

  /**
   * Collect hardware trend data from HardwareTrendHistory.
   * Converts TrendDataPoint[] to HistoricalDataPoint[].
   */
  collectHardwareTrends(trendData: HardwareTrendData[]): void {
    for (const { category, metric, points } of trendData) {
      const domain = HARDWARE_CATEGORY_TO_DOMAIN[category];
      if (!domain) continue;

      for (const point of points) {
        this.repository.record({
          timestamp: point.timestamp,
          domain,
          metric,
          value: point.value,
          unit: point.unit,
          source: point.source,
        });
      }
    }
  }

  /**
   * Collect process trend data from ProcessHistory.
   */
  collectProcessTrends(trendData: ProcessTrendData[]): void {
    for (const { metric, points } of trendData) {
      for (const point of points) {
        this.repository.record({
          timestamp: point.timestamp,
          domain: 'memory_pressure',
          metric,
          value: point.value,
          unit: point.unit,
          source: 'process-ai',
        });
      }
    }
  }

  /**
   * Collect optimization history data.
   */
  collectOptimizationHistory(entries: OptimizationHistoryEntry[]): void {
    for (const entry of entries) {
      this.repository.record({
        timestamp: entry.timestamp,
        domain: 'optimization_effectiveness',
        metric: 'health_score_gain',
        value: entry.healthScoreAfter - entry.healthScoreBefore,
        unit: 'points',
        source: 'smart-optimization-ai',
      });
      this.repository.record({
        timestamp: entry.timestamp,
        domain: 'optimization_effectiveness',
        metric: 'storage_recovered',
        value: entry.storageRecoveredMB,
        unit: 'MB',
        source: 'smart-optimization-ai',
      });
    }
  }

  /**
   * Collect health score history.
   */
  collectHealthScores(points: HealthScorePoint[]): void {
    for (const point of points) {
      this.repository.record({
        timestamp: point.timestamp,
        domain: 'system_health',
        metric: 'health_score',
        value: point.healthScore,
        unit: 'points',
        source: point.source,
      });
    }
  }

  /**
   * Collect storage data points.
   */
  collectStorageData(points: StorageDataPoint[]): void {
    for (const point of points) {
      this.repository.record({
        timestamp: point.timestamp,
        domain: 'storage',
        metric: `free_space:${point.drive}`,
        value: point.freeSpaceMB,
        unit: 'MB',
        source: 'storage-intelligence',
        metadata: { totalCapacity: point.totalCapacityMB, usedSpace: point.usedSpaceMB, healthPercent: point.healthPercent },
      });
      this.repository.record({
        timestamp: point.timestamp,
        domain: 'storage',
        metric: `health:${point.drive}`,
        value: point.healthPercent,
        unit: '%',
        source: 'storage-intelligence',
      });
    }
  }

  /**
   * Collect startup performance data.
   */
  collectStartupData(points: StartupDataPoint[]): void {
    for (const point of points) {
      this.repository.record({
        timestamp: point.timestamp,
        domain: 'startup_performance',
        metric: 'startup_time',
        value: point.startupTimeSeconds,
        unit: 's',
        source: 'startup-optimizer',
      });
      this.repository.record({
        timestamp: point.timestamp,
        domain: 'startup_performance',
        metric: 'startup_item_count',
        value: point.startupItemCount,
        unit: 'count',
        source: 'startup-optimizer',
      });
    }
  }

  /**
   * Collect all data from a PredictionInput bundle at once.
   */
  collectAll(input: PredictionInput): void {
    this.collectOptimizationHistory(input.optimizationHistory);
    this.collectHealthScores(input.healthScores);
    this.collectStorageData(input.storageData);
    this.collectStartupData(input.startupData);

    for (const series of input.hardwareTrends) {
      this.repository.recordMany(series.dataPoints);
    }
    for (const series of input.processTrends) {
      this.repository.recordMany(series.dataPoints);
    }
  }
}
