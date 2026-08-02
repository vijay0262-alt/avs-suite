import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface LoadingStateProps {
  message?: string;
  icon?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * LoadingState — premium loading state with animated spinner and message.
 */
export function LoadingState({ message = 'Loading...', icon, className, ...rest }: LoadingStateProps) {
  return (
    <div
      className={clsx('flex flex-col items-center justify-center py-12', className)}
      {...rest as Record<string, unknown>}
    >
      {icon ?? (
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--avs-surface-muted)]" />
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--avs-brand-primary)] animate-spin"
            style={{ animationDuration: '0.6s' }}
          />
        </div>
      )}
      <div className="mt-4 text-sm text-[var(--avs-text-muted)]">{message}</div>
    </div>
  );
}
