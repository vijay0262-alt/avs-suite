import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { TitleBar } from '../components/TitleBar';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useKeyboardShortcuts } from '../components/useKeyboardShortcuts';

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

  return (
    <div className="flex h-full flex-col bg-bg text-text-primary">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:rounded-md focus:bg-brand-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-white"
        data-testid="skip-to-content"
      >
        Skip to content
      </a>
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          id="main-content"
          className="flex-1 min-w-0 overflow-y-auto px-8 py-6"
          data-testid="app-main-content"
        >
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
