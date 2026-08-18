import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@avs/ui';
import { router } from './router';
import { initI18n } from './i18n';
import { dashboardRefreshManager, backgroundCleanupService } from './features/health';
import { registerAllModules, initializeAllModules } from './features/module-registry';
import { ErrorBoundary } from './components/ErrorBoundary';
import { idbMigrateFromLocalStorage, idbCleanupAll } from './services/avsWithIDB';
import { initDeferredCleanupStore } from './features/health/DeferredCleanupStore';
import { executionHistoryRepository } from './features/maintenance-history/executionHistoryRepository';
import './styles/index.css';

// ── Initialize i18n BEFORE render ──────────────────────────────
// Components using useTranslation() crash if i18n isn't initialized,
// so we must await initI18n() before rendering the React tree.
initI18n().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider initial="dark">
          <RouterProvider router={router} />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );

  // ── Deferred init (after first paint) ───────────────────────────
  const deferInit = (fn: () => void) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => fn(), { timeout: 2000 });
    } else {
      setTimeout(fn, 100);
    }
  };

  deferInit(() => { registerAllModules(); void initializeAllModules(); });
  deferInit(() => dashboardRefreshManager.init());
  deferInit(() => {
    void idbMigrateFromLocalStorage().then(({ migrated }) => {
      if (migrated.length > 0) {
        console.info(`[IndexedDB] Migrated ${migrated.length} localStorage keys: ${migrated.join(', ')}`);
      }
      void idbCleanupAll();
      void initDeferredCleanupStore();
      void executionHistoryRepository.init();
    });
  });
  deferInit(() => {
    // SC-8C13 Phase 1: Background cleanup is detection/notification-only.
    // start() subscribes to process monitor events for detection.
    // checkStartupOpportunities() inspects existing deferred items and
    // sends a notification if cleanup opportunities exist — it does NOT
    // execute any destructive operations.
    backgroundCleanupService.start();
    backgroundCleanupService.checkStartupOpportunities();
  });
}).catch((err) => {
  console.error('[startup] i18n initialization failed:', err);
  // Render anyway so the user sees something
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider initial="dark">
          <RouterProvider router={router} />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
});
