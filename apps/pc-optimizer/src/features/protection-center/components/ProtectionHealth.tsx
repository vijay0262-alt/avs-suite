import clsx from 'clsx';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import type { CoverageItem } from '../protectionCenter.types';

export interface ProtectionHealthProps {
  coverage: CoverageItem[];
}

export function ProtectionHealth({ coverage }: ProtectionHealthProps) {
  if (coverage.length === 0) {
    return (
      <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4 text-center">
        <p className="text-small text-[var(--avs-text-muted)]">Loading coverage data…</p>
      </div>
    );
  }

  const covered = coverage.filter((c) => c.covered).length;
  const total = coverage.length;
  const pct = Math.round((covered / total) * 100);

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4"
      role="region"
      aria-label="Protection coverage"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-small font-semibold text-[var(--avs-text-primary)]">
          {covered} of {total} layers covered
        </span>
        <span
          className={clsx(
            'text-small font-bold',
            pct === 100
              ? 'text-[var(--avs-success)]'
              : pct >= 50
                ? 'text-[var(--avs-warning)]'
                : 'text-[var(--avs-danger)]',
          )}
        >
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-[var(--avs-surface-muted)] overflow-hidden mb-4">
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-[var(--avs-duration-slow)]',
            pct === 100 ? 'bg-[var(--avs-success)]' : pct >= 50 ? 'bg-[var(--avs-warning)]' : 'bg-[var(--avs-danger)]',
          )}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>

      <ul className="space-y-2" role="list">
        {coverage.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            {item.covered ? (
              <CheckCircleIcon className="h-5 w-5 shrink-0 text-[var(--avs-success)]" />
            ) : (
              <XCircleIcon className="h-5 w-5 shrink-0 text-[var(--avs-danger)]" />
            )}
            <div className="flex-1 min-w-0">
              <span
                className={clsx(
                  'text-small',
                  item.covered ? 'text-[var(--avs-text-primary)]' : 'text-[var(--avs-text-primary)]',
                )}
              >
                {item.label}
              </span>
              {!item.covered && item.reason && (
                <p className="text-caption text-[var(--avs-text-muted)] mt-0.5">{item.reason}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
