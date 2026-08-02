/**
 * TitleBar — the frameless-window drag region.
 *
 * Electron is configured with `titleBarStyle: 'hidden'` and a
 * `titleBarOverlay` (see main/index.ts). This component fills the space
 * left of the native window controls with the brand mark + app name.
 */
export function TitleBar() {
  return (
    <header
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="flex h-10 items-center justify-between border-b border-[var(--avs-border)] bg-[var(--avs-surface)] px-4 select-none"
      data-testid="app-title-bar"
    >
      <div className="flex items-center gap-2.5">
        <div
          className="h-6 w-6 rounded-[var(--avs-radius-sm)] flex items-center justify-center"
          style={{ background: 'var(--avs-gradient-brand)' }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15L15 9.75" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          </svg>
        </div>
        <span className="text-xs font-semibold tracking-wide text-text-primary">
          AVS Shield Optimizer
        </span>
      </div>
      <div className="text-[11px] text-text-muted">Windows 10 / 11 · x64</div>
    </header>
  );
}
