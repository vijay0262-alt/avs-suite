import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@avs/ui';
import { router } from './router';
import { initI18n } from './i18n';
import { dashboardRefreshManager } from './features/health';
import './styles/index.css';

void initI18n();
dashboardRefreshManager.init();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider initial="dark">
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
);
