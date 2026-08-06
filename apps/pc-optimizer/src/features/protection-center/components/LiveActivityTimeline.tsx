import clsx from 'clsx';
import {
  BoltIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  MagnifyingGlassIcon,
  HeartIcon,
} from '@heroicons/react/24/outline';
import type { ActivityEvent, ActivityKind } from '../protectionCenter.types';

const kindIcon: Record<ActivityKind, typeof BoltIcon> = {
  optimization: BoltIcon,
  security: ShieldCheckIcon,
  system: ComputerDesktopIcon,
  scan: MagnifyingGlassIcon,
  health: HeartIcon,
};

const kindColor: Record<ActivityKind, string> = {
  optimization: 'text-[var(--avs-brand-primary)]',
  security: 'text-[var(--avs-info)]',
  system: 'text-[var(--avs-text-muted)]',
  scan: 'text-[var(--avs-warning)]',
  health: 'text-[var(--avs-success)]',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export interface LiveActivityTimelineProps {
  activities: ActivityEvent[];
}

export function LiveActivityTimeline({ activities }: LiveActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-6 text-center">
        <p className="text-sm text-[var(--avs-text-muted)]">
          No recent activity. Run a scan or optimization to see events here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4"
      role="region"
      aria-label="Live activity timeline"
    >
      {/* Timeline line */}
      <div className="absolute left-7 top-4 bottom-4 w-px bg-[var(--avs-border)]" aria-hidden="true" />

      <ul className="space-y-3 max-h-[400px] overflow-y-auto" role="list">
        {activities.map((event) => {
          const Icon = kindIcon[event.kind] ?? BoltIcon;
          return (
            <li key={event.id} className="relative flex items-start gap-3 pl-1">
              <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--avs-surface)] border border-[var(--avs-border)]">
                <Icon className={clsx('h-3.5 w-3.5', kindColor[event.kind])} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--avs-text-primary)] truncate">
                    {event.title}
                  </span>
                  <span className="text-xs text-[var(--avs-text-muted)] shrink-0">
                    {timeAgo(event.timestamp)}
                  </span>
                </div>
                {event.metric && (
                  <p className="text-xs text-[var(--avs-text-secondary)] mt-0.5">{event.metric}</p>
                )}
                <p className="text-xs text-[var(--avs-text-muted)] mt-0.5">{event.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
