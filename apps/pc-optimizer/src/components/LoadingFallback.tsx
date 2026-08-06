import { Card } from '@avs/ui';

export function LoadingFallback() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      aria-live="polite"
      className="flex h-full min-h-[300px] flex-col items-center justify-center px-8 py-6"
      data-testid="loading-fallback"
    >
      <div className="mb-4 flex flex-col items-center gap-3">
        <svg
          className="h-8 w-8 animate-spin text-brand-primary"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-90"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
          />
        </svg>
        <p className="text-small text-text-secondary">Loading…</p>
      </div>
      <div className="w-full max-w-3xl animate-pulse">
        <div className="mb-6">
          <div className="h-8 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-md)] w-1/3 mb-2" />
          <div className="h-4 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-1/2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <div className="h-3 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-1/3 mb-3" />
              <div className="h-5 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-2/3 mb-2" />
              <div className="h-3 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-1/2" />
            </Card>
          ))}
        </div>
        <Card>
          <div className="h-3 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-1/4 mb-4" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-full" />
            ))}
          </div>
        </Card>
      </div>
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
        <div className="h-4 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-3/4" />
        <div className="h-4 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-1/2" />
        <div className="h-4 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-5/6" />
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center space-x-4 p-3">
            <div className="h-10 w-10 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-md)]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-3/4" />
              <div className="h-3 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default text skeleton
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-full" />
      <div className="h-4 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-5/6" />
      <div className="h-4 bg-[var(--avs-surface-muted)] rounded-[var(--avs-radius-sm)] w-4/6" />
    </div>
  );
}
