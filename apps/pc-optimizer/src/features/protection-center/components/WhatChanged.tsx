import clsx from 'clsx';
import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from '@heroicons/react/24/outline';
import type { ChangeEntry } from '../protectionCenter.types';

function formatDelta(delta: number, unit: ChangeEntry['unit']): string {
  if (unit === 'bytes') {
    if (Math.abs(delta) >= 1_000_000_000) return `${(delta / 1_000_000_000).toFixed(1)} GB`;
    if (Math.abs(delta) >= 1_000_000) return `${(delta / 1_000_000).toFixed(0)} MB`;
    if (Math.abs(delta) >= 1_000) return `${(delta / 1_000).toFixed(0)} KB`;
    return `${delta} B`;
  }
  if (unit === 'score') return `${delta > 0 ? '+' : ''}${delta}`;
  return `${delta > 0 ? '+' : ''}${delta}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

const directionConfig = {
  improved: { icon: ArrowUpIcon, color: 'text-[var(--avs-success)]' },
  degraded: { icon: ArrowDownIcon, color: 'text-[var(--avs-danger)]' },
  neutral: { icon: MinusIcon, color: 'text-[var(--avs-text-muted)]' },
};

export interface WhatChangedProps {
  changes: ChangeEntry[];
}

export function WhatChanged({ changes }: WhatChangedProps) {
  if (changes.length === 0 || (changes.length === 1 && changes[0]?.id === 'change-none')) {
    return (
      <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4 text-center">
        <p className="text-small text-[var(--avs-text-muted)]">
          No changes detected since the last optimization.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4"
      role="region"
      aria-label="Changes since last scan"
    >
      <ul className="space-y-2" role="list">
        {changes.map((change) => {
          const dc = directionConfig[change.direction];
          const Icon = dc.icon;
          return (
            <li key={change.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Icon className={clsx('h-4 w-4 shrink-0', dc.color)} />
                <span className="text-small text-[var(--avs-text-primary)] truncate">{change.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={clsx('text-small font-bold tabular-nums', dc.color)}>
                  {formatDelta(change.delta, change.unit)}
                </span>
                <span className="text-caption text-[var(--avs-text-muted)]">{timeAgo(change.timestamp)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
