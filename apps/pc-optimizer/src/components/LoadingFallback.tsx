export function LoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full min-h-[300px] items-center justify-center text-text-muted text-sm"
      data-testid="loading-fallback"
    >
      Loading…
    </div>
  );
}

/**
 * Skeleton loading component for better UX during async operations
 */
export function SkeletonLoader({ type = 'card' }: { type?: 'card' | 'list' | 'text' }) {
  if (type === 'card') {
    return (
      <div className="animate-pulse space-y-4 p-4">
        <div className="h-4 bg-bg-secondary rounded w-3/4" />
        <div className="h-4 bg-bg-secondary rounded w-1/2" />
        <div className="h-4 bg-bg-secondary rounded w-5/6" />
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center space-x-4 p-3">
            <div className="h-10 w-10 bg-bg-secondary rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-bg-secondary rounded w-3/4" />
              <div className="h-3 bg-bg-secondary rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default text skeleton
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 bg-bg-secondary rounded w-full" />
      <div className="h-4 bg-bg-secondary rounded w-5/6" />
      <div className="h-4 bg-bg-secondary rounded w-4/6" />
    </div>
  );
}
