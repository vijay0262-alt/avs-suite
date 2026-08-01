/**
 * TrendAnalyzer — analyzes trend history to detect direction and rate of change.
 *
 * Wraps HardwareTrendHistory and provides higher-level analysis including
 * rapid degradation detection and trend summaries.
 */
import type { HardwareAIConfiguration, TrendSummary, TrendDirection } from './types';
import type { HardwareSnapshot } from '../hardware-center/types';
import { HardwareTrendHistory } from './HardwareTrendHistory';

export class TrendAnalyzer {
  private history: HardwareTrendHistory;

  constructor(config: HardwareAIConfiguration) {
    this.history = new HardwareTrendHistory(config.trendHistorySize, config.trendMinDataPoints);
  }

  recordSnapshot(snapshot: HardwareSnapshot): void {
    this.history.recordSnapshot(snapshot);
  }

  getTrendSummaries(): TrendSummary[] {
    return this.history.getAllTrendSummaries();
  }

  getTrendDirection(category: string, metric: string): TrendDirection {
    return this.history.computeTrend(category as never, metric);
  }

  isRapidlyDegrading(category: string): boolean {
    const summaries = this.getTrendSummaries();
    const summary = summaries.find((s) => s.category === category);
    if (!summary) return false;
    return summary.overallTrend === 'rapid_degradation';
  }

  getHistory(): HardwareTrendHistory {
    return this.history;
  }

  clear(): void {
    this.history.clear();
  }
}
