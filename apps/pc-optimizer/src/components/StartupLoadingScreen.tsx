/**
 * Startup loading screen — shown while i18n and all optimizer/security
 * modules are being registered and initialized. This prevents the user
 * from seeing partial/preparing states while the engines spin up.
 */
export function StartupLoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--avs-surface-page)]"
      data-testid="startup-loading-screen"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--avs-border)] border-t-brand-primary" />
      <p className="mt-4 text-body font-medium text-text-primary">
        Configuring your application...
      </p>
      <p className="mt-1 text-center text-small text-text-secondary max-w-md px-6">
        Please wait while your security and optimization engines are prepared.
      </p>
    </div>
  );
}
