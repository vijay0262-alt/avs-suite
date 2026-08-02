/**
 * ThreatTimelinePanel — visual threat activity timeline showing the full
 * lifecycle from detection through investigation, evidence, quarantine,
 * and resolution.
 */
import { useState } from 'react';
import { Card, Badge } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type { ThreatTimelineEntry } from './SecurityDashboardViewModel';
import type { ProtectionHistoryEntry } from '../realtime-protection';

interface ThreatTimelinePanelProps {
  timeline: ThreatTimelineEntry[];
  history: ProtectionHistoryEntry[];
}

const STAGE_ORDER: ThreatTimelineEntry['stage'][] = [
  'detection', 'investigation', 'evidence', 'correlation',
  'recommendation', 'decision', 'quarantine', 'rollback', 'resolution',
];

const STAGE_LABELS: Record<ThreatTimelineEntry['stage'], string> = {
  detection: 'Detection',
  investigation: 'Investigation',
  evidence: 'Evidence Collection',
  correlation: 'Correlation',
  recommendation: 'Recommendation',
  decision: 'User Decision',
  quarantine: 'Quarantine',
  rollback: 'Rollback',
  resolution: 'Resolution',
};

const STAGE_ICONS: Record<ThreatTimelineEntry['stage'], string> = {
  detection: '🔍',
  investigation: '🔬',
  evidence: '📋',
  correlation: '🔗',
  recommendation: '💡',
  decision: '👤',
  quarantine: '🔒',
  rollback: '↩️',
  resolution: '✅',
};

function stageTone(stage: ThreatTimelineEntry['stage']): BadgeTone {
  switch (stage) {
    case 'detection': return 'danger';
    case 'investigation': return 'warning';
    case 'evidence': return 'brand';
    case 'correlation': return 'brand';
    case 'recommendation': return 'warning';
    case 'decision': return 'warning';
    case 'quarantine': return 'danger';
    case 'rollback': return 'neutral';
    case 'resolution': return 'success';
    default: return 'neutral';
  }
}

function actorTone(actor: ThreatTimelineEntry['actor']): BadgeTone {
  switch (actor) {
    case 'system': return 'neutral';
    case 'ai': return 'brand';
    case 'user': return 'warning';
    default: return 'neutral';
  }
}

export function ThreatTimelinePanel({ timeline, history }: ThreatTimelinePanelProps) {
  const [filter, setFilter] = useState<'all' | ThreatTimelineEntry['stage']>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = timeline.filter((entry) => {
    if (filter !== 'all' && entry.stage !== filter) return false;
    if (searchQuery && !entry.threatName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Group by threat ID
  const grouped = new Map<string, ThreatTimelineEntry[]>();
  for (const entry of filtered) {
    const existing = grouped.get(entry.threatId) ?? [];
    existing.push(entry);
    grouped.set(entry.threatId, existing);
  }

  return (
    <div className="space-y-4" data-testid="threat-timeline-panel">
      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center" data-testid="timeline-filters">
        <div className="flex items-center gap-2">
          <MagnifyingGlassIcon className="h-4 w-4 text-text-muted" aria-hidden />
          <input
            type="text"
            placeholder="Search threats…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Search threats"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
          {STAGE_ORDER.map((stage) => (
            <FilterButton
              key={stage}
              active={filter === stage}
              onClick={() => setFilter(stage)}
              label={STAGE_LABELS[stage]}
            />
          ))}
        </div>
      </div>

      {/* Timeline */}
      {grouped.size === 0 ? (
        <Card data-testid="timeline-empty">
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircleIcon className="h-10 w-10 text-semantic-success" aria-hidden />
            <p className="mt-3 text-sm font-medium text-text-primary">No threats detected</p>
            <p className="mt-1 text-xs text-text-muted">Your system is clean. Threats will appear here when detected.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4" data-testid="timeline-entries">
          {[...grouped.entries()].map(([threatId, entries]) => (
            <Card key={threatId} data-testid={`timeline-threat-${threatId}`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning" aria-hidden />
                    <span className="text-sm font-semibold text-text-primary">{entries[0]?.threatName ?? threatId}</span>
                  </div>
                  <Badge tone="danger">{entries.length} stages</Badge>
                </div>

                {/* Timeline visualization */}
                <div className="relative pl-6" data-testid={`timeline-stages-${threatId}`}>
                  {/* Vertical line */}
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-border" aria-hidden />

                  {entries.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="relative pb-4 last:pb-0"
                      data-testid={`timeline-stage-${entry.id}`}
                    >
                      {/* Stage dot */}
                      <div className="absolute -left-4 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-border bg-surface">
                        <span className="text-[8px]">{STAGE_ICONS[entry.stage]}</span>
                      </div>

                      {/* Stage content */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-text-primary">{STAGE_LABELS[entry.stage]}</span>
                            <Badge tone={actorTone(entry.actor)}>{entry.actor}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-text-secondary">{entry.description}</p>
                          <span className="text-[10px] text-text-muted">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <Badge tone={stageTone(entry.stage)}>{entry.stage}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* History summary */}
      {history.length > 0 && (
        <Card title="Recent Protection History" data-testid="timeline-history">
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {history.slice(-20).reverse().map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-surface-muted"
                data-testid={`history-entry-${entry.id}`}
              >
                <span className="text-text-secondary truncate">{entry.target}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone={entry.threatDetected ? 'danger' : 'neutral'}>{entry.action}</Badge>
                  <span className="text-text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-brand-primary/10 px-2.5 py-1 text-xs font-medium text-brand-primary'
          : 'rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-muted'
      }
      data-testid={`timeline-filter-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {label}
    </button>
  );
}
