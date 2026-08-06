import clsx from 'clsx';

export interface SkeletonProps {
  className?: string;
}

/** Animated shimmer placeholder used while data is loading. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={clsx(
        'shimmer rounded-[var(--avs-radius-md)]',
        className,
      )}
    />
  );
}
