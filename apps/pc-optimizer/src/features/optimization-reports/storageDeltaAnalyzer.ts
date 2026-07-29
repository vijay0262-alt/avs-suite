/**
 * Storage Delta Analyzer — analyzes storage recovery.
 */
import type { DeltaMetric, DeltaContext } from './types';
import { formatBytes, determineTrend } from './types';

export class StorageDeltaAnalyzer {
  analyze(before: number | null, after: number | null, _context?: DeltaContext): DeltaMetric {
    const delta = before !== null && after !== null ? after - before : null;
    return {
      before,
      after,
      delta,
      formatted: delta !== null ? formatBytes(Math.abs(delta)) : 'N/A',
      trend: determineTrend(before, after),
    };
  }

  analyzeRecovered(bytesRecovered: number): DeltaMetric {
    return {
      before: null,
      after: null,
      delta: bytesRecovered,
      formatted: formatBytes(bytesRecovered),
      trend: bytesRecovered > 0 ? 'improved' : 'unchanged',
    };
  }
}
