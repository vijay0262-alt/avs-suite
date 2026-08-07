import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { TitleBar } from '../components/TitleBar';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useKeyboardShortcuts } from '../components/useKeyboardShortcuts';
import { ProSplashOverlay } from '../features/licensing/ProSplashOverlay';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ElevationBanner } from '../components/ElevationBanner';

/**
 * AppLayout — the persistent shell for every page.
 *
 * Grid:
 *   ┌──────────────────────────────────────────┐
 *   │            TitleBar (drag region)        │
 *   ├────────────┬─────────────────────────────┤
 *   │  Sidebar   │  Breadcrumbs                │
 *   │  (240 px)  │  Route <Outlet />           │
 *   │            │  (scrollable content)       │
 *   └────────────┴─────────────────────────────┘
 *
 * Includes:
 * - Skip-to-content link for screen readers
 * - Global keyboard shortcuts (Alt+Left/Right, Ctrl+D, Ctrl+,)
 * - Breadcrumb navigation trail
 */
export function AppLayout() {
  useKeyboardShortcuts();
  const location = useLocation();

  return (
    <div className="flex h-full flex-col bg-[var(--avs-bg)] text-text-primary">
      <ProSplashOverlay />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:rounded-[var(--avs-radius-md)] focus:bg-brand-primary focus:px-3 focus:py-1.5 focus:text-small focus:text-white focus:shadow-md"
        data-testid="skip-to-content"
      >
        Skip to content
      </a>
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          id="main-content"
          className="flex-1 min-w-0 overflow-y-auto"
          style={{ paddingLeft: 'var(--avs-space-page-x)', paddingRight: 'var(--avs-space-page-x)', paddingTop: 'var(--avs-space-page-y)', paddingBottom: 'var(--avs-space-page-y)' }}
          data-testid="app-main-content"
        >
          <Breadcrumbs />
          <ElevationBanner />
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
