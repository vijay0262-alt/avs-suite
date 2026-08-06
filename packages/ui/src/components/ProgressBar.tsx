import clsx from 'clsx';
import { clamp } from '@avs/shared/utils';

export interface ProgressBarProps {
  value: number; // 0..100
  label?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
}

const tones: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  brand: 'bg-[var(--avs-brand-primary)]',
  success: 'bg-[var(--avs-success)]',
  warning: 'bg-[var(--avs-warning)]',
  danger: 'bg-[var(--avs-danger)]',
};

/** Linear progress indicator with an accessible label. */
export function ProgressBar({ value, label, tone = 'brand', className }: ProgressBarProps) {
  const pct = clamp(value, 0, 100);
  return (
    <div className={clsx('space-y-1.5', className)}>
      {label && (
        <div className="flex justify-between text-caption text-[var(--avs-text-secondary)]">
          <span>{label}</span>
          <span className="tabular-nums font-medium">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full rounded-full bg-[var(--avs-surface-muted)] overflow-hidden"
      >
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-[var(--avs-duration-slow)] ease-[var(--avs-easing)]',
            tones[tone],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
