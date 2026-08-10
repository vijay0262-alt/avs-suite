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

// Defer background service startup to after first paint — prioritize main window visibility
const startBackgroundServices = () => {
  backgroundCleanupService.start();
  void backgroundCleanupService.runStartupCleanup();
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider initial="dark">
        <RouterProvider router={router} />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

// Start background services after the first paint completes
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(startBackgroundServices, { timeout: 3000 });
} else {
  setTimeout(startBackgroundServices, 1500);
}
