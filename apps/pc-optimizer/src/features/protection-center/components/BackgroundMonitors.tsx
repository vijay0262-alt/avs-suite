import clsx from 'clsx';
import type { MonitorStatus } from '../protectionCenter.types';

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export interface BackgroundMonitorsProps {
  monitors: MonitorStatus[];
}

export function BackgroundMonitors({ monitors }: BackgroundMonitorsProps) {
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      role="region"
      aria-label="Background monitors"
    >
      {monitors.map((mon) => (
        <div
          key={mon.id}
          className={clsx(
            'rounded-[var(--avs-radius-md)] border p-3',
            'bg-gradient-surface border-[var(--avs-border)]',
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-[var(--avs-text-primary)]">{mon.name}</span>
            <div className="flex items-center gap-1.5">
              <span
                className={clsx(
                  'h-2 w-2 rounded-full',
                  mon.active
                    ? 'bg-[var(--avs-success)] animate-pulse'
                    : 'bg-[var(--avs-text-muted)]',
                )}
                aria-hidden="true"
              />
              <span
                className={clsx(
                  'text-xs font-medium',
                  mon.active ? 'text-[var(--avs-success)]' : 'text-[var(--avs-text-muted)]',
                )}
              >
                {mon.statusLabel}
              </span>
            </div>
          </div>
          {mon.detail && (
            <p className="text-xs text-[var(--avs-text-secondary)]">{mon.detail}</p>
          )}
          <p className="text-xs text-[var(--avs-text-muted)] mt-1">
            Last heartbeat: {timeAgo(mon.lastHeartbeat)}
          </p>
        </div>
      ))}
    </div>
  );
}
