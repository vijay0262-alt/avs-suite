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
