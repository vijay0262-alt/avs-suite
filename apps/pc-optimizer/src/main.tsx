import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@avs/ui';
import { router } from './router';
import { initI18n } from './i18n';
import { EditionManagerProvider } from './config/EditionManager';
import { UpgradeDialogProvider } from './components/UpgradeDialog';
import { LicenseProvider } from './features/licensing/LicenseContext';
import './styles/index.css';

void initI18n();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider initial="dark">
      <LicenseProvider>
        <EditionManagerProvider>
          <UpgradeDialogProvider>
            <RouterProvider router={router} />
          </UpgradeDialogProvider>
        </EditionManagerProvider>
      </LicenseProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
