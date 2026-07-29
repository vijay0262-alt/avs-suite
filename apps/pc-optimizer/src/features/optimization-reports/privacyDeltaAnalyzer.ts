/**
 * Privacy Delta Analyzer — analyzes privacy score changes.
 */
import type { DeltaMetric, DeltaContext } from './types';
import { formatDelta, determineTrend } from './types';

export class PrivacyDeltaAnalyzer {
  analyze(before: number | null, after: number | null, _context?: DeltaContext): DeltaMetric {
    const delta = before !== null && after !== null ? after - before : null;
    return {
      before,
      after,
      delta,
      formatted: formatDelta(before, after),
      trend: determineTrend(before, after),
    };
  }
}
