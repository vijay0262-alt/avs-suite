/**
 * StatusBadge — maps execution record status to a colored Badge.
 */
import { Badge } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import type { ExecutionRecordStatus } from '../../maintenance-history';

const STATUS_CONFIG: Record<ExecutionRecordStatus, { tone: BadgeTone; label: string }> = {
  succeeded: { tone: 'success', label: 'Succeeded' },
  partially_completed: { tone: 'warning', label: 'Partial' },
  failed: { tone: 'danger', label: 'Failed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
};

export function StatusBadge({ status }: { status: ExecutionRecordStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.cancelled;
  return (
    <Badge tone={config.tone} data-testid={`status-badge-${status}`}>
      {config.label}
    </Badge>
  );
}

/**
 * SourceBadge — maps execution source to a labeled badge.
 */
const SOURCE_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  manual: 'Manual',
  quick_scan: 'Quick Scan',
  ai_recommended: 'AI',
  startup: 'Startup',
  browser_cleanup: 'Browser',
  deep_clean: 'Deep Clean',
};

export function SourceBadge({ source }: { source: string }) {
  return (
    <Badge tone="brand" data-testid={`source-badge-${source}`}>
      {SOURCE_LABELS[source] ?? source}
    </Badge>
  );
}
