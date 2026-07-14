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
      // The Electron drag region is enabled by `-webkit-app-region: drag`.
      // Interactive children must opt-out with `no-drag`.
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="flex h-10 items-center justify-between border-b border-border bg-surface px-4 select-none"
      data-testid="app-title-bar"
    >
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-sm bg-brand-primary" aria-hidden />
        <span className="text-xs font-semibold tracking-wide text-text-primary">
          AVS PC Optimizer
        </span>
      </div>
      <div className="text-xs text-text-muted">Windows 10 / 11 · x64</div>
    </header>
  );
}
