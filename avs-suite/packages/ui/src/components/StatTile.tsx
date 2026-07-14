import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * Dashboard statistic tile — used for CPU / RAM / Disk / Junk widgets.
 * Keeps a consistent height, spacing and iconography across the app.
 */
export function StatTile({ label, value, hint, icon, className }: StatTileProps) {
  return (
    <div
      className={clsx(
        'flex items-start gap-4 rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)]',
        'bg-[var(--avs-surface)] p-5 shadow-[var(--avs-shadow-sm)]',
        className,
      )}
    >
      {icon && (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--avs-radius-md)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_12%,transparent)] text-[var(--avs-brand-primary)]">
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--avs-text-muted)]">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold text-[var(--avs-text-primary)]">{value}</div>
        {hint && (
          <div className="mt-0.5 text-xs text-[var(--avs-text-secondary)]">{hint}</div>
        )}
      </div>
    </div>
  );
}
