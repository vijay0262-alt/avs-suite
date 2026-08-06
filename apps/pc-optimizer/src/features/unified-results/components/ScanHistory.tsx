/**
 * ScanHistory — displays scan history entries with trend.
 *
 * Shows module, score, duration, issues, actions, date.
 * Free edition: last 10 scans. Pro: unlimited + trend/comparison.
 */
import {
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedScanHistoryEntry } from '../unifiedResultsTypes';
import { formatTimestamp, formatDuration } from '../unifiedResultsTypes';

export interface ScanHistoryProps {
  entries: UnifiedScanHistoryEntry[];
  maxEntries?: number;
  isPro?: boolean;
}

export function ScanHistory({ entries, maxEntries = 10, isPro = false }: ScanHistoryProps) {
  const visible = isPro ? entries : entries.slice(0, maxEntries);

  if (visible.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-text-muted" data-testid="scan-history-empty">
        No scan history yet.
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="scan-history">
      {visible.map((entry, i) => {
        const prev = visible[i + 1];
        const trend = prev ? entry.score - prev.score : 0;
        return (
          <HistoryRow key={entry.id} entry={entry} trend={trend} />
        );
      })}

      {!isPro && entries.length > maxEntries && (
        <div className="pt-2 text-center">
          <span className="text-xs text-text-muted">
            Showing last {maxEntries} scans.{' '}
            <span className="text-brand-primary font-medium">Upgrade to Pro for unlimited history + trend reports.</span>
          </span>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry, trend }: { entry: UnifiedScanHistoryEntry; trend: number }) {
  const trendIcon = trend > 0
    ? <ArrowTrendingUpIcon className="h-3.5 w-3.5 text-semantic-success" />
    : trend < 0
    ? <ArrowTrendingDownIcon className="h-3.5 w-3.5 text-semantic-danger" />
    : <MinusIcon className="h-3.5 w-3.5 text-text-muted" />;

  const trendColor = trend > 0
    ? 'text-semantic-success'
    : trend < 0
    ? 'text-semantic-danger'
    : 'text-text-muted';

  const scoreColor = entry.score >= 90 ? 'text-semantic-success' : entry.score >= 75 ? 'text-brand-primary' : entry.score >= 60 ? 'text-semantic-warning' : 'text-semantic-danger';

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2"
      data-testid={`history-${entry.id}`}
    >
      {/* Score */}
      <div className="shrink-0 text-center w-12">
        <div className={`text-lg font-bold tabular-nums ${scoreColor}`}>{entry.score}</div>
        <div className="text-[10px] text-text-muted">Score</div>
      </div>

      {/* Module + details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">{entry.moduleName}</span>
          {trend !== 0 && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
              {trendIcon}
              {trend > 0 ? '+' : ''}{trend}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <ClockIcon className="h-3 w-3" />
            {formatDuration(entry.durationMs)}
          </span>
          <span>{entry.issuesFound} issues</span>
          {entry.threatsFound !== undefined && entry.threatsFound > 0 && (
            <span className="text-semantic-danger">{entry.threatsFound} threats</span>
          )}
          <span>{formatTimestamp(entry.timestamp)}</span>
        </div>
      </div>

      {/* Actions taken */}
      {entry.actionsTaken.length > 0 && (
        <div className="shrink-0 text-right">
          <div className="text-xs text-text-muted">Actions</div>
          <div className="text-xs font-medium text-text-secondary">{entry.actionsTaken.length}</div>
        </div>
      )}
    </div>
  );
}
