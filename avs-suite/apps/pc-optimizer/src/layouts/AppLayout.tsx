import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { TitleBar } from '../components/TitleBar';

/**
 * AppLayout — the persistent shell for every page.
 *
 * Grid:
 *   ┌──────────────────────────────────────────┐
 *   │            TitleBar (drag region)        │
 *   ├────────────┬─────────────────────────────┤
 *   │  Sidebar   │  Route <Outlet />           │
 *   │  (240 px)  │  (scrollable content)       │
 *   └────────────┴─────────────────────────────┘
 */
export function AppLayout() {
  return (
    <div className="flex h-full flex-col bg-bg text-text-primary">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main
          id="main-content"
          className="flex-1 min-w-0 overflow-y-auto px-8 py-6"
          data-testid="app-main-content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
