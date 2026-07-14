import clsx from 'clsx';

export interface SkeletonProps {
  className?: string;
}

/** Animated placeholder used while data is loading. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={clsx(
        'animate-pulse rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)]',
        className,
      )}
    />
  );
}
