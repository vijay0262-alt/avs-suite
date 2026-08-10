import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@avs/ui';
import { router } from './router';
import { initI18n } from './i18n';
import { dashboardRefreshManager, backgroundCleanupService } from './features/health';
import { registerAllModules, initializeAllModules } from './features/module-registry';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/index.css';

void initI18n();
dashboardRefreshManager.init();
registerAllModules();
void initializeAllModules();

// Start background deferred cleanup service — monitors for browser/app
// closures and automatically retries deferred cleanup items.
backgroundCleanupService.start();
// On startup, retry any deferred items whose blocking processes are no longer running.
void backgroundCleanupService.runStartupCleanup();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider initial="dark">
        <RouterProvider router={router} />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
