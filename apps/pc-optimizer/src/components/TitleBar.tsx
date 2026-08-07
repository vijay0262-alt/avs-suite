/**
 * TitleBar — the frameless-window drag region.
 *
 * Electron is configured with `titleBarStyle: 'hidden'` and a
 * `titleBarOverlay` (see main/index.ts). This component fills the space
 * left of the native window controls with the brand mark + app name.
 *
 * In Professional edition, shows "AVS Shield Pro" with a star badge
 * to reinforce ownership every time the application is open.
 */
import { useIsPro } from '../features/sync/syncStore';
import { StarIcon } from '@heroicons/react/24/outline';

export function TitleBar() {
  const isPro = useIsPro();

  return (
    <header
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="flex h-10 items-center justify-between border-b border-[color-mix(in_srgb,#0EA5E9_80%,black)] bg-[#0EA5E9] px-4 select-none"
      data-testid="app-title-bar"
    >
      <div className="flex items-center gap-2.5">
        <div
          className="h-6 w-6 rounded-[var(--avs-radius-sm)] flex items-center justify-center shadow-sm"
          style={{ background: 'var(--avs-gradient-brand)' }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15L15 9.75" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          </svg>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-small font-semibold tracking-[var(--avs-tracking-wide)] text-white">
            AVS Shield{isPro ? ' Pro' : ' Optimizer'}
          </span>
          {isPro && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-white/20 border border-white/30 px-1.5 py-0.5 text-micro font-bold text-white"
              data-testid="titlebar-pro-badge"
            >
              <StarIcon className="h-2.5 w-2.5" />
              PRO
            </span>
          )}
        </div>
      </div>
      <div className="text-caption text-white/80">Windows 10 / 11 · x64</div>
    </header>
  );
}
