import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Card } from './Card';

export interface TimelineCardProps {
  title: string;
  icon?: ReactNode;
  items: TimelineItem[];
  className?: string;
  'data-testid'?: string;
}

export interface TimelineItem {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  description: string;
  timestamp: string;
  severity?: 'success' | 'warning' | 'danger' | 'info';
}

const severityDot = {
  success: 'bg-[var(--avs-success)]',
  warning: 'bg-[var(--avs-warning)]',
  danger: 'bg-[var(--avs-danger)]',
  info: 'bg-[var(--avs-brand-primary)]',
};

/**
 * TimelineCard — vertical timeline of events with severity dots and timestamps.
 */
export function TimelineCard({
  title,
  icon,
  items,
  className,
  ...rest
}: TimelineCardProps) {
  return (
    <Card
      variant="gradient"
      className={clsx(className)}
      {...rest as Record<string, unknown>}
    >
      <div className="flex items-center gap-2 mb-4">
        {icon && <span className="text-[var(--avs-brand-primary)]">{icon}</span>}
        <h3 className="text-sm font-semibold tracking-tight text-[var(--avs-text-primary)]">{title}</h3>
      </div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  'mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--avs-surface)]',
                  severityDot[item.severity ?? 'info'],
                )}
              />
              {i < items.length - 1 && (
                <div className="w-px flex-1 bg-[var(--avs-border)] my-1" />
              )}
            </div>
            {/* Content */}
            <div className="flex-1 pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-[var(--avs-text-primary)]">{item.title}</div>
                <div className="text-xs text-[var(--avs-text-muted)] shrink-0">{item.timestamp}</div>
              </div>
              <div className="mt-0.5 text-xs text-[var(--avs-text-secondary)]">{item.description}</div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="py-6 text-center text-sm text-[var(--avs-text-muted)]">
            No recent events
          </div>
        )}
      </div>
    </Card>
  );
}
